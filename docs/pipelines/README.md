# Percho 视频自动生成 — 总纲

**核心资产 · 内容生成基准**
最后更新: 2026-07-16

代码位置: `scripts/render-worker/worker.py` + `scripts/ken-burns/generate.py`
(单一渲染器,双业务线复用)。运行:EC2 systemd unit `percho-render-worker`,
代码从 `~/Percho` 加载,日志 `/var/log/percho-render-worker.log`。

**改任何视频/照片生成前,先读这份 README 及对应子文档;改完同步更新。**

---

## 一、7 份子文档索引

| 文档 | 覆盖内容 |
|---|---|
| [`video-listing.md`](./video-listing.md) | **Listing walkthrough**(房源本身)15 步 + `LISTING` archetype per-photo AI caption |
| [`video-nearby-trust.md`](./video-nearby-trust.md) | `TRUST` archetype — schools, healthcare |
| [`video-nearby-lifestyle.md`](./video-nearby-lifestyle.md) | `LIFESTYLE` archetype — dining, fitness |
| [`video-nearby-utility.md`](./video-nearby-utility.md) | `UTILITY` archetype — shopping, daily_errands, pets |
| [`video-nearby-narrative.md`](./video-nearby-narrative.md) | `NARRATIVE` archetype — nightlife |
| [`video-nearby-magazine.md`](./video-nearby-magazine.md) | `MAGAZINE` archetype — kids, asian_community, faith |
| [`video-nearby-map.md`](./video-nearby-map.md) | `MAP` archetype — outdoor, transit, work_hubs |

`video-generation-master.md` 是历史别名,内容已迁入本 README + `video-listing.md`,保留为跳转 stub。

---

## 二、公共基础设施

| 组件 | 作用 |
|---|---|
| `worker.py` | 长轮询 Supabase → 认领 job → 下载素材 → 编排渲染 → 上传 CF Stream → patch 状态 |
| `photo_tagger.py` | Claude Sonnet 4.5 视觉打标签(room_type / subject_bbox / hero_score / quality / ai_tags) |
| `photo_selector.py` | 去重(dHash) → 配额 → 叙事排序 → 时长曲线 → 运镜分配,产出 `shot_plan.json` |
| `generate.py` | ffmpeg zoompan/xfade 渲染器,支持 `--shot-plan` / `--listing-overlay` / `--captions` / `--bgm` |
| `caption-render/render.py` | Playwright 把 `overlay.html` 的 7 种 archetype 版式渲染成透明 PNG 序列 |
| BGM | `bgm/<style-bucket>/*.mp3` × 5 桶(warm-acoustic / modern-corporate / luxury-ambient / cinematic / chill-electronic),`random.choice` 挑一首 |
| CF Stream | 输出上传,存 `cf_video_id`(portrait)或 `cf_video_id_landscape` 到对应 videos 表 |

**统一节奏参数**: `TOTAL_CAP=60s`,`MIN_PER_PHOTO=2.5s`,`MAX_PER_PHOTO=6s`,
`XFADE=0.5s`,`STATIC_RATIO=10%`,top-3 hero_score 每张 +0.5s。

**7 archetypes 总览** (`overlay.html`):

| Archetype | 用途 | 分支起始 |
|---|---|---|
| `LISTING` | Listing walkthrough per-photo caption(v97.0) | overlay.html:315 |
| `TRUST` | 权威型 POI(学校/医疗) | overlay.html:246 |
| `LIFESTYLE` | 生活方式 POI(餐饮/健身) | overlay.html:255 |
| `UTILITY` | 便利型 POI(购物/日常/宠物) | overlay.html:276 |
| `NARRATIVE` | 场景/氛围型 POI(夜生活) | overlay.html:286 |
| `MAGAZINE` | 编辑刊型 POI(儿童/亚裔/信仰) | overlay.html:291 |
| `MAP` | 地图定位型 POI(户外/交通/工作) | overlay.html:304 |

---

## 三、POI 数据底座(所有 nearby 视频的上游)

先跑一次 POI Pipeline,数据一次采集、多 listing 复用:

- **anchor**: 社区用 subdivision(如 Waterside)质心 + 3km,不用 city
- **Places Nearby / Text Search** → 落 `pois` 全局表(唯一 by `google_place_id`)
- **Places Photos** → 落 `poi_photos`(每 POI 硬上限 10 张,`poi/{poi_id}/{sha1(name)}.jpg`)
- **`listing_pois` / `listing_poi_photos` join 表** 存 per-listing 状态:
  `intent_bucket`、`distance_m`、`drive_time_s`、`status`(candidate/approved/rejected)
- **POI 视觉打标** (`lib/poi/vision-tagger.ts`) — 幂等,`tagged_at` 判重
- **人工 review** 结构化落 `review_events`(带 AI 预测快照 → 训练数据)
- 只有 `approved` 的 POI + 照片进入视频输入 `input_photo_ids`

---

## 四、14 buckets → 6 archetypes 映射(**以 `worker.py:679` 为准**)

| Bucket | Archetype | 子文档 |
|---|---|---|
| schools | `TRUST` | [trust](./video-nearby-trust.md) |
| healthcare | `TRUST` | [trust](./video-nearby-trust.md) |
| dining | `LIFESTYLE` | [lifestyle](./video-nearby-lifestyle.md) |
| fitness | `LIFESTYLE` | [lifestyle](./video-nearby-lifestyle.md) |
| shopping | `UTILITY` | [utility](./video-nearby-utility.md) |
| daily_errands | `UTILITY` | [utility](./video-nearby-utility.md) |
| pets | `UTILITY` | [utility](./video-nearby-utility.md) |
| nightlife | `NARRATIVE` | [narrative](./video-nearby-narrative.md) |
| outdoor | `MAP` | [map](./video-nearby-map.md) |
| transit | `MAP` | [map](./video-nearby-map.md) |
| work_hubs | `MAP` | [map](./video-nearby-map.md) |
| kids | `MAGAZINE` | [magazine](./video-nearby-magazine.md) |
| asian_community | `MAGAZINE` | [magazine](./video-nearby-magazine.md) |
| faith | `MAGAZINE` | [magazine](./video-nearby-magazine.md) |

> `CAPTION_ARCHETYPE_MAP` 是 archetype 的唯一权威。变更时同步本表和相应子文档,不要只改代码。

---

## 五、Listing 与 Nearby 两条线的对称性

| 维度 | Listing | Nearby / Bucket |
|---|---|---|
| 输入源 | `listing_photos` | POI `input_photo_ids` |
| 打标签 | listing 照片(room_type/hero) | POI 照片(scene/mood/usable) |
| Filter | `kenburns_filter_v2` fill-crop | `kenburns_filter` blur-letterbox |
| 运镜词表 | 全套 8 种(含 pan/tilt/pan_to_subject) | 只 `zoom_in` / `zoom_out` |
| 字幕系统 | HTML→PNG `LISTING` archetype(v97.0)· drawtext 为 gated fallback | HTML→PNG(6 种 archetype 版式) |
| Overlay 数据 | 房源 price/specs/address | Archetype 特定 + POI distance / drive_time |
| 方向策略 | 单方向(依据照片主体方向) | 同左 |
| BGM | 5 桶随机 | 5 桶随机(archetype 可 hint bucket) |
| 输出表 | `listing_videos.cf_video_id[_landscape]` | 同表(带 `intent_bucket` scope)或 `community_videos` |

---

## 六、可追溯性

`pick_bgm()` 是 `random.choice`,DB **不存**具体 BGM 曲名。要复盘任意一条视频
用了什么 BGM / shot plan / motion:

```
sudo grep "uploaded landscape to CF: <cf_id>" /var/log/percho-render-worker.log
sudo grep "job <job-uuid>" /var/log/percho-render-worker.log | grep -E "running \(|bgm|shot-plan"
```

日志轮转就找不回来了,不要瞎猜。

---

## 七、成本参考(每 listing 冷缓存 ~$4.4,热缓存 ~$2.6)

主要开销:Places Photos($1.75)+ Vision LLM($2.00)+ Directions($0.44),
硬预算 $3/listing/30 天。

---

## 八、基准铁律(任何改动必须满足)

1. **Vision 层 fail-open**:tagger/planner 抛任何异常都必须落回 legacy 全长渲染,视频必发。
2. **双业务线共用 `generate.py`**:不 fork CLI,overlay JSON 是共享形状。
3. **照片输入 = UI 展示输入**:同一份 photo URL 源。视频里出现的房子必须等于 spec 页展示的房子。
4. **Composition 策略是 (source aspect × canvas aspect) 的函数**:不是单变量。任何 filter 跨画布复用都要重新推导前提是否成立。
5. **真实照片,禁 mock stock**:24s 视频对同一栋房子的容忍度远低于快速滑动的照片网格。宁可缩短到 3-4 clip,不假造。
6. **7 archetypes 是硬编码上限**:新 bucket 只能 map 到现有 archetype 之一,不要盲目加第 8 种模板。
