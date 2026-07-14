# Content Pipeline v1 — Listing tours + Community batch

**Status**: Design doc (P0 scope). Written 2026-07-12.
**Owner decision captured**: 竖屏为主,横屏为辅;P0 二选一 = 全自动生成 or agent 上传替换/补充;
agent 编排 UI 推到 P1;GA-only, selling-only;预算 OK,列 API 明细.

**Companion docs** (read first if you touch this area):
- [`cost-model.md`](./cost-model.md) — per-reel cost已有测算 ($0.04–$0.14/reel variable)
- [`neighborhood-content-sources.md`](./neighborhood-content-sources.md) — 合规红线 (Zillow ✗ / Google Street View ✗ 离线合成 / Wikimedia+Unsplash ✓)
- [`content-taxonomy.md`](./content-taxonomy.md) + `../community-video-categories.md` — 12 类社区视频 taxonomy
- [`architecture-v2.md`](./architecture-v2.md) — POC → 多社区 config 的重构方向
- [`schema.sql`](./schema.sql) — `content_items`, `community_videos`, listings, publishes

本 doc 只加两块**新增内容**,不覆盖已有决策。

---

## 0. 两条 pipeline 的角色分工

| Pipeline | 输入 | 输出 | 卡点 | P0 |
|---|---|---|---|---|
| **Listing Tour** (新) | Agent 上传的房子照片 (Supabase Storage) | 60s 竖屏房子导览视频 | 照片分类 + narrative template | 全自动出片,agent 可上传自拍 video 整条替换 |
| **Community Batch** (扩展) | Per-neighborhood: Wikimedia/Unsplash + APIs (GreatSchools/Yelp/Mapbox/Census) | 每小区 5-7 条视频,挂给 N 个 listing | 冷启动照片缺口 + 自动 vs 需 agent 拍 的分层 | 系统默认生成 5 类;agent 可上传替换或补第 6/7 条 |

**共享层**(已有 POC 里跑通,不重复造):
- `fetch_wikimedia.py` → `tag_rules.py` → `compose.py` (ffmpeg Ken Burns) → CF Stream 上传
- `content_items.hash` UNIQUE 缓存
- `percho-render-worker` systemd unit

---

## 1. Listing Tour pipeline

### 1.1 Canonical narrative template (硬编码,不让 LLM 现编)

四套 template,选一套:`single_family` / `condo` / `townhouse` / `luxury`.
默认 `single_family`,agent 可在 listing 表单选。

`single_family` 序列(每 slot 时长预算):

```
1. exterior_front   6s   opening establishing shot (must-have; 缺则报错)
2. entry_foyer      4s   optional; 缺则跳
3. living_room      8s   2 张 (wide → detail)
4. kitchen         10s   2-3 张,hero_score 最高的开场
5. dining          5s    optional
6. primary_bedroom  6s
7. primary_bath     5s
8. secondary_rooms  6s   最多 2 房间,每 3s
9. secondary_baths  3s   optional
10. bonus/basement  4s   optional
11. backyard/outdoor 6s
12. exterior_back   3s   closing
                   ═══
                  ~60s
```

`condo` template 删 `backyard`/`exterior_back`,加 `amenities`(gym/pool/lobby).
`luxury` template 允许 90s,加 `feature_details` slot (酒窖/影音室/景观).

**缺失 slot 处理**(见 §5 gap detection):
- **must-have 缺**(`exterior_front`): 报错到 agent dashboard,拒绝生成
- **optional 缺**: 静默跳过,自动重新分配相邻 slot 时长
- **>3 个 optional 缺**: dashboard 提示 "consider uploading X, Y, Z for a fuller tour"

### 1.2 Photo tagging schema (每张照片)

新增 `listing_photos` 表(schema.sql 现有 `content_items` 不适合房源单张照片元数据的粒度):

```sql
create table listing_photos (
  id                   uuid primary key,
  listing_id           uuid references listings(id) on delete cascade,
  storage_path         text not null,        -- Supabase Storage key
  hash                 text unique not null, -- dedup on re-upload

  -- Vision-classification output (Claude Sonnet 4.5 vision, one call per photo)
  room_type            text not null,        -- enum, see §1.3
  shot_type            text not null,        -- 'wide' | 'detail' | 'feature'
  hero_score           real not null,        -- 0..1, LLM-emitted
  selling_features     text[] default '{}',  -- ['granite_counter', 'vaulted_ceiling', 'view']
  quality              text not null,        -- 'good' | 'dim' | 'blurry' | 'people_visible' | 'staged'
  aspect_hint          text,                 -- 'portrait_safe' | 'needs_crop' | 'edge_important'

  classification_confidence real,            -- LLM self-report
  needs_review          boolean default false, -- confidence < 0.6 → agent dashboard queue

  uploaded_at           timestamptz default now(),
  classified_at         timestamptz
);
create index on listing_photos (listing_id, room_type);
```

### 1.3 `room_type` enum (18 值)

```
exterior_front, exterior_back, exterior_side, aerial,
entry_foyer, living_room, family_room, dining_room, kitchen, kitchen_pantry,
primary_bedroom, secondary_bedroom, primary_bath, secondary_bath, powder_room,
laundry, garage, bonus_room, basement,
backyard, front_yard, patio_deck, pool, view,
floor_plan, unclassified
```

`unclassified` 是 LLM 拒答的兜底; UI 里进 agent review 队列.

### 1.4 Tagging cost

Sonnet 4.5 vision, 每张照片一次调用:
- Input: 1 张图 (~1600 tok vision tokens) + ~200 tok prompt = **1,800 tok**
- Output: 结构化 JSON ~120 tok
- Per-photo: `1800×3e-6 + 120×15e-6` = **$0.0072**
- 平均 listing 25 张 → **$0.18/listing** 一次性 tagging 成本

比社区视频 (§1.2 cost-model.md 里的 $0.036/reel) 贵 5×,但**一次 tag,多次 render**(retag 只在 agent 重上传时).

### 1.5 Composition

复用 `compose.py`(POC 里跑通),接口只加两个 kwargs:
- `template_name: str` (`single_family` 等)
- `photos: list[TaggedPhoto]`

排序策略:
1. 按 template slot 顺序枚举 → 从 `listing_photos` 拉 `room_type` 匹配的所有照片
2. 每 slot 内按 `hero_score` DESC 挑 1-3 张(slot 预算决定张数)
3. `quality != 'good'` 一律降权 0.3
4. Ken Burns 参数按 `shot_type` 走:`wide` = 弱缩放/水平推,`detail` = 中缩放,`feature` = 强 zoom-in

竖屏 1080×1920 是默认输出;横屏 1920×1080 output profile 存在但**只用于 community 长视频**(§2).

### 1.6 Voiceover (P0.5, 不 blocker)

从 listing 结构化字段生成短句 → ElevenLabs 或 OpenAI TTS.
初版**跳过 voiceover**,只做 BGM + text overlay(price / bed/bath / 上市天数). 上线看反馈再加.

---

## 2. Community Batch pipeline (自动化分层)

### 2.1 三层策略

| 层 | 类型 | 数据源 | 自动化度 | P0 |
|---|---|---|---|---|
| 🟢 **Full auto** | schools / dining / commute / parks / demographics | GreatSchools + Yelp + Mapbox + OSM + Census | 90%+ | 5 类默认生成 |
| 🟡 **Auto with degraded quality** | vibe / seasonal | Mapbox Satellite Ken Burns + POI dots + Wikimedia backfill | 60% | 1-2 类兜底生成,标 "data view" |
| 🔴 **Requires human** | walk_the_block / listen_here / morning_rush / after_dark (Bucket A 里的稀缺类) | Agent 拍 / vlogger 授权 | 0% | 空槽位;agent 可上传补 |

**映射到已有 12 类 taxonomy** (`community-video-categories.md`):
- 🟢 Bucket B 全部 (school_run, daily_errands, the_park, eating_out, get_active, transit_reality) → 自动
- 🟡 walk_the_block 的**数据视图变体** = "walk_data_view" (地图+POI 动画)
- 🔴 Bucket A 剩下 5 类必须 agent 拍

### 2.2 每 neighborhood 默认输出

- 5 条 🟢 全自动视频
- 1 条 🟡 walk_data_view(兜底 vibe)
- 空 5 槽 🔴 让 agent 上传

冷启动:20 个热门 GA neighborhood × 6 条 = **120 条视频**,一晚上跑完.

### 2.3 与 listing 的挂接

现有 `listing_community_pair` (references/listing-community-pair-drift.md) 已定义关系.
Listing 详情页 "Community" tab 显示该 neighborhood 全部 7-12 条视频.
Agent 上传的视频 `owner_id = agent_id`,只挂在该 agent 的 listing 上(不污染其他 agent 的 listing).

---

## 3. API 成本表(你要的那个)

**前 20 个 GA neighborhood 全量铺一次 + 稳态月费**:

| API | 单价 | 前期 setup (20 nbhd) | 月度稳态 (20 nbhd, 季度 refresh) | 备注 |
|---|---|---|---|---|
| **GreatSchools** | 商用需签合同,通常 $99–$500/mo tier | $0 一次性 | **$99/mo**(最低档 5K calls/mo, 20 nbhd × 平均 8 校 = 160 calls) | 前期用免费 dev key POC,上量前签合同 |
| **Yelp Fusion** | 免费 500/day, 商用 tier 起 | $0 | $0(20 nbhd × 20 POI × 4次/月 = 1,600 calls,远低于 free tier) | Terms 允许展示 rating/photos with attribution |
| **Google Places** (autocomplete 已用) | $17 / 1000 session | ~$3.4 (200 sessions) | 已在 cost-model.md §1.1 里核算 | **不用来生成视频**,只 agent 输入地址 |
| **Mapbox Static Images + Directions** | Static: $1/1000, Directions: $2/1000 | 20 nbhd × ~40 tiles = 800 imgs → **$0.8** | 3K imgs/mo → $3/mo, 500 directions/mo → $1/mo → **$4/mo** | 用来做 satellite Ken Burns + commute 路线动画 |
| **Mapbox Search Box API** | $1/1000 | ~$0.5 | $1/mo | POI 查询 |
| **US Census ACS** | 免费,注册 API key | $0 | $0 | demographics 视频源 |
| **OSM Overpass** | 免费,自愿限速 | $0 | $0 | 公园/POI geometry |
| **Wikimedia Commons** | 免费 | $0 | $0 | 已在用 |
| **Unsplash API** | 免费 dev 50/hr, prod 5000/hr | $0 | $0 | 已在用 |
| **CF Stream 存储** | $5/1000 min | 120 reel × 60s = 120 min → **$0.6/mo** | 稳态 ~$5/mo (retention 12 mo) | 已在 cost-model.md |
| **CF Stream 交付** | $1/1000 min | — | 假设 100 views/reel × 120 reel = 12K min → **$12/mo** | 已在 cost-model.md |
| **Anthropic Sonnet 4.5** (照片 tagging + 视频脚本) | vision $3/M in, $15/M out | listing photo tag: 100 listing × $0.18 = **$18** 一次性;社区脚本 120 reel × $0.036 = **$4.4** | 稳态: 新 listing 20/mo × $0.18 = $3.6/mo + 新社区脚本可忽略 = **$4/mo** | 已在 cost-model.md |
| **ElevenLabs TTS**(P0.5,voiceover) | $22/mo Creator, 100K chars | — | $22/mo(启用后) | P0 不上,先跳过 |

**汇总**:

| 阶段 | 一次性 | 月度稳态 |
|---|---|---|
| P0 前期 (20 nbhd bootstrap) | **~$27** setup | **~$125/mo**(GreatSchools 占大头) |
| P0 稳态 (100 listing/mo, 20 nbhd 季度 refresh) | — | **~$135/mo**(加 listing tagging) |
| P0.5 (加 voiceover) | — | **~$157/mo** |

**加上 cost-model.md 里的固定平台费 $65/mo(EC2/Supabase/CF Workers/域名),P0 全月运营 ~$200/mo**.

**风险点**:
1. **GreatSchools 是唯一有 minimum tier 的**($99/mo).可以先跑 12 个月 dev key(免费,rate-limited 但够 POC),等真的有 agent 客户再签合同.
2. **Yelp/Mapbox 涨量**:100 nbhd 后,Mapbox 可能上到 $20-30/mo,Yelp 仍在 free tier.线性,可控.
3. **CF Stream 交付**是唯一可能失控的项(见 cost-model.md §4).circuit-breaker 已在 §5 里.

---

## 4. 视频规格(统一)

| 属性 | 竖屏(主) | 横屏(辅) |
|---|---|---|
| 分辨率 | 1080×1920 | 1920×1080 |
| 时长 | 45-60s (listing tour); 30-45s (community 短) | 60-90s (community 长/深度) |
| 帧率 | 30fps | 30fps |
| 音频 | BGM + optional TTS voiceover, -14 LUFS | 同左 |
| 片头 | 0.8s Percho brandmark | 1.2s |
| 片尾 | 1.5s CTA + agent handle | 2s |
| 字幕 | 底部 25% 安全区,white on 40% black scrim | 底部 15% |

**竖屏是默认输出;横屏 profile 只在**:
- Community 深度视频(Bucket A 里 agent 上传的 walk_the_block 等)
- 未来 embed 到房源详情页大图区

---

## 5. Photo gap detection (Listing pipeline 的必备)

Agent 上传照片后,后端立即跑 gap check:

```
required_rooms = template.must_have_slots  # ['exterior_front']
recommended    = template.optional_slots   # ['kitchen', 'primary_bedroom', 'backyard', ...]

detected = { p.room_type for p in listing_photos }

missing_required    = required_rooms - detected
missing_recommended = recommended - detected

if missing_required:
    return { status: 'blocked', missing: missing_required, action: 'must_upload' }
elif len(missing_recommended) > 3:
    return { status: 'warn', missing: missing_recommended, action: 'strongly_recommend' }
else:
    return { status: 'ready' }
```

Dashboard UI 显示"检测到缺:主卫、后院、餐厅. 建议补充以获得完整 tour."

---

## 6. Rights & compliance recap (硬红线,不能碰)

已在 `neighborhood-content-sources.md` 详细论述,这里只列 P0 必守:

1. **Zillow / Redfin / Realtor 照片一律不进管线**——只用 agent 明确授权上传的照片
2. **Google Street View 静态图片可以查看,但不下载合成到视频里**——ToS §3.2.4
3. **Instagram / TikTok 素材不下载**——即便走 apify 抓下来也不用
4. **MLS 照片有 IDX 分发限制**——listing 下架时自动撤下所有 derived videos(见 §7 lifecycle)
5. **YouTube vlogger 素材**需要显式书面授权,不走 yt-dlp

Percho 品牌视频对外分发(TikTok/IG,P1)需要:
- 授权链在 `publishes` 表留档
- 每条视频 `source_licenses` 字段记录所有素材来源
- CC BY 素材保留 attribution overlay(片尾 3s)

---

## 7. Listing lifecycle 与视频撤下

Listing `status` 变化触发:

| status 变 | 动作 |
|---|---|
| `active` → `pending` | 视频保留,加 "Under Contract" 水印 |
| `active` → `sold` | 视频保留 7 天后转 archive,不再公开分发 |
| `active` → `withdrawn` | CF Stream `requireSignedURLs=true` 立即,7 天内软删 |
| `active` → `expired` | 同 `withdrawn` |

Agent 手动删 listing → 联级软删所有 derived videos.
Cron 每天扫一次 `listings.status` + `videos.created_at`.

---

## 8. 阶段路线图 (P0 → P1)

### Phase G (P0,~2 周)

- G1: schema 加 `listing_photos` + `photo_templates` (硬编码 4 套)
- G2: Vision tagger endpoint(单张照片 → 结构化 tag)
- G3: Gap-detection API + agent dashboard 警告 UI
- G4: `compose.py` 扩展支持 `template_name` + `photos: TaggedPhoto[]`
- G5: Agent 上传自拍 video 替换整条 tour 的 UI(P0 二选一的另一半)
- G6: Community batch: 加 5 类 🟢 自动生成器(schools/dining/commute/parks/demographics)

### Phase H (P0.5,可选)

- H1: TTS voiceover(BGM ducking)
- H2: 🟡 vibe 兜底视频(Mapbox satellite Ken Burns)

### Phase I (P1,不在 P0 承诺内)

- I1: Agent 编排 UI(拖排序 / 选 hero / 微调 script)
- I2: Bucket A 上传引导(walk_the_block guidance / recording tips)
- I3: 跨 neighborhood LLM tag 缓存(cost-model.md §7 Q3)

---

## 9. 决策记录

| # | 决策 | 备选 | 选择理由 |
|---|---|---|---|
| D1 | Listing tour 用**硬编码 template**,不让 LLM 现编 narrative | 每次 LLM 重新排序 | 太贵(每 render 一次都调 LLM) + 不稳定(顺序漂移) |
| D2 | Photo tagging 用 **vision LLM**,不用专门 CV 模型(YOLO/CLIP) | 自训 CNN | LLM 一次搞定 room_type + hero_score + selling_features,前 100 listing 成本 $18 |
| D3 | 竖屏默认,横屏只用于社区深度视频 | 一律竖屏 | 用户 preference + Bucket A 类 walk_the_block 横屏更有质感 |
| D4 | Community 5 类 🟢 全自动为 P0 起点 | 从 vibe 类做起 | Bucket B 数据类冷启动最容易,agent 时间省下来去拍 Bucket A |
| D5 | Agent 上传 video 走"整条替换"或"追加",不做"编排编辑" | 编排 UI | 编排 UI 是黑洞;P0 明确二选一 |
| D6 | GreatSchools 前期用 dev key,签合同延后 | 立刻签 | 无客户前 $99/mo 是浪费 |

---

## 10. Open questions (P1 前需回答)

- **Q1** 视频 refresh 策略:community 视频季度重刷 vs listing 视频只在照片变化时重刷——两个策略够不够?
- **Q2** Agent 上传的 raw video 要不要过一层"结构化"?(比如 agent 上传一段 90s walk_the_block,系统要不要自动打章节标记?)—— P1 讨论
- **Q3** Multi-language caption(memory: buyer-facing 允许多语,schema 只英文)—— 从 caption overlay 层生成,不从 template 层
- **Q4** 房源换 agent(listing transfer)时,derived videos 归属怎么处理?—— 现有 `owner_id` 已定义,但需要一条 UI 流程

---

## 11. Memory alignment

- **GA-only + selling only**:pipeline 输入(agent-uploaded listings + GA neighborhoods)已封住范围
- **No bilingual schema**:所有 photo tag / template 字段英文
- **No videos in git**:测试样片走 Supabase/CF,不 commit(memory 07-11 规则)
- **No mock/test data**:template 4 套是真实产品配置,不是 demo(memory 07-11)
- **DEVLOG.md 保留 vicinity 字样**:本 doc 用 "Percho" 因为是 2026-07-11 之后的新增
