# 架构：Source → Fetcher → Tagger → Ranker → Composer → Publisher

六层流水线。每层单向依赖下游，可独立部署 / 重跑 / mock。

---

## 1. Source（配置层）

- **职责**：声明"从哪些数据源、按什么关键词、拉多少素材"。纯 config，无逻辑。
- **输入**：`config/neighborhoods/*.yaml`（每邻里一个文件）。
- **输出**：结构化配置对象。
- **关键决策**：**新增社区 = 加一个 YAML**，不改代码。示例：
  ```yaml
  slug: peachtree-corners
  display_name: Peachtree Corners
  geo: { lat: 33.9698, lng: -84.2216, radius_km: 5 }
  sources:
    - kind: wikimedia
      queries: ["Peachtree Corners Georgia", "Gwinnett County Georgia"]
      min_assets: 20
    - kind: percho_listings
      filter: { neighborhood_slug: peachtree-corners, status: active }
  ```

## 2. Fetcher

- **职责**：按 Source 配置调用外部 API，下载素材+元数据到 blob 存储（Supabase Storage），写 `content_items` 行。
- **输入**：Source 配置。
- **输出**：本地/远程文件 + `content_items` 表行（含 license、attribution、source_url）。
- **关键决策**：
  - 每个 `kind` 一个 adapter（`wikimedia.py`、`unsplash.py`、`percho_listings.py`）。加新源 = 加 adapter + config 里声明。
  - 幂等：以 `source_url` 作 unique key，重跑不重复下载。
  - 合规守门：任何 adapter 都必须能返回 license 字符串，否则 raise。

## 3. Tagger

- **职责**：给每个 `content_item` 打 L1/L2 标签。
- **输入**：`content_items` 里 `tags IS NULL` 的行。
- **输出**：`tags` 表行 + `content_items.tagged_at`。
- **关键决策**：
  - 策略可插拔：`rule_based`（POC 快跑）、`gpt4o`（生产）、`clip_local`（成本敏感）。
  - 只打 L1/L2；L3 由 Ranker 计算。

## 4. Ranker

- **职责**：按邻里 slug 筛选素材，计算 L3（geo、price band），按 Composer 需要的段位（hook / vibe / listing / school-park / cta）打分排序，选 top-N。
- **输入**：`content_items` + `tags` + `listings`。
- **输出**：`composition_plan`（JSON：每段 slot 的选中 asset 列表）。
- **关键决策**：**打分公式**：`quality_score × recency_decay × slot_match × license_priority`。CC-BY-SA 排在 CC-BY 后面（前者要求 share-alike 条款，营销视频不适合）。

## 5. Composer

- **职责**：调 ffmpeg 按模板（`video-composition.md`）生成 1080×1920 MP4。
- **输入**：`composition_plan` JSON + 素材本地路径。
- **输出**：`compositions.output_url`（Supabase Storage）+ 缩略图。
- **关键决策**：
  - **object-contain 强制**：所有 scale filter 必须 `force_original_aspect_ratio=decrease + pad`，禁止 `crop` / `cover`。
  - 单条视频 ≤ 5 min build，超时自动降级到 storyboard PNG。

## 6. Publisher

- **职责**：把成品视频推给消费端：Percho listing page 嵌入、社交渠道（TikTok/Reels/Rednote）通过官方 upload API。
- **输入**：`compositions.output_url` + 每渠道 credentials。
- **输出**：外部 post URL 回写 `compositions.published_urls JSONB`。
- **关键决策**：MVP 阶段只做 Percho 站内嵌入，社交推送人工下载 + 手动发（合规、避免账号封禁）。Phase 3 再自动化。

---

## Supabase Schema

```sql
-- 邻里字典（也可放 config，DB 副本便于 join）
create table neighborhoods (
  slug         text primary key,           -- 'peachtree-corners'
  display_name text not null,
  city         text not null,              -- 'Peachtree Corners'
  state        text not null default 'GA',
  lat          double precision,
  lng          double precision,
  radius_km    numeric default 5,
  created_at   timestamptz default now()
);

-- 每一个原始素材（图片/视频片段）
create table content_items (
  id                uuid primary key default gen_random_uuid(),
  neighborhood_slug text references neighborhoods(slug),
  source_kind       text not null,        -- 'wikimedia' | 'unsplash' | 'percho_listing'
  source_url        text not null unique,
  storage_path      text not null,        -- 'assets/ptc/xxx.jpg'
  media_type        text not null,        -- 'image' | 'video'
  width             int,
  height            int,
  duration_s        numeric,              -- null for image
  license           text not null,        -- 'CC BY-SA 4.0' 等
  attribution       text not null,        -- '© Author Name via Wikimedia Commons'
  caption           text,
  tagged_at         timestamptz,
  created_at        timestamptz default now()
);

-- 标签（一 asset 多 tag）
create table tags (
  id              bigserial primary key,
  content_item_id uuid references content_items(id) on delete cascade,
  level           text not null check (level in ('L1','L2','L3')),
  key             text not null,          -- 'streetscape' | 'quiet-suburban' | 'nearest_listing'
  value           text,                   -- L3 的 value（listing_id / distance / price_band）
  confidence      numeric,                -- 0-1，来自 tagger
  created_at      timestamptz default now(),
  unique (content_item_id, level, key)
);

-- 每一次视频合成任务
create table compositions (
  id                uuid primary key default gen_random_uuid(),
  neighborhood_slug text references neighborhoods(slug),
  template_version  text not null,        -- 'v1-60s-9x16'
  plan_json         jsonb not null,       -- Ranker 输出
  output_url        text,                 -- Storage URL
  duration_s        numeric,
  status            text not null default 'pending',  -- pending|building|ready|failed
  error             text,
  published_urls    jsonb default '{}'::jsonb,
  created_at        timestamptz default now(),
  built_at          timestamptz
);
```

---

## 验证走查：新增 Alpharetta 只改 config 不改 code

1. 新建 `config/neighborhoods/alpharetta.yaml`（复制 PTC 那份，改 slug / geo / queries）。
2. 跑 seed：`insert into neighborhoods ...` （由 config 自动同步脚本处理）。
3. 触发 `fetcher run --slug alpharetta` → wikimedia adapter 用新 queries 拉素材 → 写 `content_items`。
4. 触发 `tagger run --slug alpharetta` → 打 L1/L2。
5. 触发 `composer run --slug alpharetta --template v1-60s-9x16` → 出 MP4。
6. **未触碰任何 .py / .ts 文件**。Adapter、Tagger 策略、Composer 模板都从 config 里按名字装配。

如果第 3-5 步任一层需要改代码，架构有漏，回炉重设。
