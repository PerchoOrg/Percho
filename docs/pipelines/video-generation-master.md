# Percho 视频自动生成总纲

**核心资产 · 内容生成基准**
最后更新: 2026-07-16

代码位置: `scripts/render-worker/worker.py` + `scripts/ken-burns/generate.py`
(单一渲染器,双业务线复用)。运行:EC2 systemd unit `percho-render-worker`,
代码从 `~/Percho` 加载,日志 `/var/log/percho-render-worker.log`。

---

## 一、公共基础设施

| 组件 | 作用 |
|---|---|
| `worker.py` | 长轮询 Supabase → 认领 job → 下载素材 → 编排渲染 → 上传 CF Stream → patch 状态 |
| `photo_tagger.py` | Claude Sonnet 4.5 视觉打标签(room_type / subject_bbox / hero_score / quality / ai_tags) |
| `photo_selector.py` | 去重(dHash) → 配额 → 叙事排序 → 时长曲线 → 运镜分配,产出 `shot_plan.json` |
| `generate.py` | ffmpeg zoompan/xfade 渲染器,支持 `--shot-plan`、`--listing-overlay`、`--captions`、`--bgm` |
| `caption-render/render.py` | Playwright 把 `overlay.html` 6 种 archetype 版式渲染成透明 PNG 序列(bucket 视频用) |
| BGM | `bgm/<style-bucket>/*.mp3` × 5 桶(warm-acoustic / modern-corporate / luxury-ambient / cinematic / chill-electronic),`random.choice` 挑一首 |
| CF Stream | 输出上传,存 `cf_video_id`(portrait)或 `cf_video_id_landscape` 到对应 videos 表 |

**统一节奏参数**: `TOTAL_CAP=60s`,`MIN_PER_PHOTO=2.5s`,`MAX_PER_PHOTO=6s`,
`XFADE=0.5s`,`STATIC_RATIO=10%`,top-3 hero_score 每张 +0.5s。

---

## 二、Listing Video(房源本身)—— 15 步

**触发**: `listing_videos.status='queued'` 或 `render_jobs` 表插入新 job。

1. **认领**: `claim_job()` @ worker.py:178 拉一行 queued
2. **加载 listing**: `sb_get('listings')` — 拿 address/city/state/neighborhood/price/beds/baths/sqft
3. **加载照片**: `sb_get('listing_photos')` → `storage_download('listing-photos')` 到临时目录
4. **等打标签**: gate 检查所有照片 `tagged_at IS NOT NULL`,否则退回队列 backoff
   (打标签是上传时 fire-and-forget 触发,`lib/listings/vision-tagger.ts`,~$0.005/photo)
5. **方向决策**: `photos_are_mostly_landscape()`(≥80% landscape → 只渲 landscape,
   反之只渲 portrait,Phase 75 单方向策略)
6. **build_plan** (`photo_selector.py`):
   - dHash 去重(Hamming ≤10 视为近似)
   - 按 room_type 配额挑选(exterior/living/kitchen/bedroom/bath/outdoor 各有上限)
   - 叙事排序: exterior → living → kitchen → bed → bath → outdoor
   - 时长曲线: `(cap + (n-1)*xfade)/n` clamp 到 [2.5, 6] + hero boost + static 10%
   - 每个 slot 指定 motion mode(exterior=push_in,kitchen=pan_lr,master_bed=zoom_in,quiet 房间=static,等)
   - 输出 `shot_plan.json`,含 subject_bbox 供 `pan_to_subject` 用
7. **文件命名**: 照片按 `{sort_order:03d}_{id}.jpg` 落盘(供 generate.py 匹配 plan)
8. **构建 overlay**: `build_overlay()` @ worker.py:239 生成 price/specs/address/neighborhood JSON
9. **调用 generate.py**:
   ```
   python generate.py --photos <dir> --out <mp4>
     --orientation vertical|landscape
     --shot-plan shot_plan.json
     --listing-overlay overlay.json
     --bgm <随机 mp3>
   ```
10. **渲染 (`kenburns_filter_v2`)**: 单层 fill-crop(`force_original_aspect_ratio=increase, crop`)
    + zoompan;支持 `push_in / pull_back / pan_lr / pan_rl / tilt_td / pan_to_subject / static`;
    zoom 1.00 → 1.15;`pan_to_subject` 用 subject_bbox 中心
11. **字幕(v97.0 起,2026-07-16)**: **Per-photo AI caption**,底部锚定 · **V3-5 Local blur band** archetype = `LISTING`
    - **管线**: `photo_selector.py` 把 `ai_tags.caption`(vision tagger 出的 ≤15 词事实句)透传到 shot plan 的 `ai_caption` → `worker.py` 用 `caption_for_shot()` 生成 uppercase kicker(如 `KITCHEN ISLAND`)+ `ai_caption` 作 txt → 落 `captions.json {archetype:"LISTING", clips:[{clip,kicker,txt}]}` → `generate.py --captions` 触发 `caption-render/render.py`(Playwright)按 `overlay.html` 的 `LISTING` 分支为每个 clip 截**透明 PNG** → ffmpeg overlay 到 zoompan 层上。空 `txt` → 空透明 PNG → overlay no-op(安全 skip)。
    - **样式(定案,`overlay.html .LIST-band`)**:
      - 位置:`position:absolute; left:0; right:0; bottom:0`,portrait padding `120px 60px 90px`,landscape `70px 70px 50px`
      - 底色:`linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.72) 35%, rgba(0,0,0,.35) 75%, transparent 100%)` — 全宽底部 scrim,顶边天然羽化
      - 排版:kicker(Charter italic 34px portrait / 22px landscape,letter-spacing .24em,`#facc15`) + body(Charter 500 62px/1.24 portrait / 42px landscape,白,`text-shadow: 0 2px 6px rgba(0,0,0,.45)`) + `84×3px`(portrait)/ `60×2px`(landscape)金色 rule
      - LISTING archetype 不渲染 progress bar(12+ 张照片视觉过挤 + bucket 语义无关)
      - VO headroom:caption 只占底部 ~30%,VO 字幕层叠在其上方或替换该带
    - **⚠ 透明底 + backdrop-filter 陷阱(务必读)**: 早期 V3-5 原型用 `backdrop-filter: blur(22px) brightness(.72)`。但 render.py 输出的是**透明 PNG**再由 ffmpeg 复合到 kenburns 视频上,DOM 底下没有像素——blur 出的是**空气**,视觉等同没效果。决议改用 `linear-gradient` 近似(上面样式段),视觉近似 `blur+brightness(.72)`(后者本质就是暗化 scrim),零流程改动。
    - **Fallback / 旧版**: `v2_caption_filter()`(ffmpeg drawtext,`generate.py:365`,150px 底部黑条 + 房间标签)保留但被 `generate.py:426` 用 `if v2_caption and not caption_png` gate 关掉——只有 captions.json 缺失时才会走(避免双字幕)。左价格/右地址覆盖层由 `--listing-overlay` 单独处理,与本 caption 层无关。
    - **原型 / 预览**: https://percho-captions.surge.sh(index V1–V5)· `/v3.html`(V3-1..V3-5 底部变体)· `/listing.html`(生产 CSS 完整复刻,真实照片 + 真实 vision caption)

12. **拼接**: `concat_with_crossfade` xfade 0.5s,ffprobe 每段实际时长
13. **BGM 混音**: 拼接后 mux
14. **上传**: `cf_upload()` → Cloudflare Stream 拿 uid
15. **回写**: `sb_patch('listing_videos', {cf_video_id[_landscape], status:'ready'})`

**Fail-open 铁律**: vision/planner 任一环节抛异常 → 打日志 `shot plan disabled`
→ 退回不带 `--shot-plan` 的全长 legacy 渲染。**视频必发**。

---

## 三、Nearby / Bucket Video(14 类周边)—— 与 Listing 差异点

**触发**: `listing_videos` 或 `community_videos` 中带 `intent_bucket` /
`community_intent_bucket` 的 job。

### POI 数据底座(视频输入的上游)

先跑一次 POI Pipeline,数据一次采集、多 listing 复用:

- **anchor**: 社区用 subdivision(如 Waterside)质心 + 3km,不用 city
- **Places Nearby / Text Search** → 落 `pois` 全局表(唯一 by `google_place_id`)
- **Places Photos** → 落 `poi_photos`(每 POI 硬上限 10 张,`poi/{poi_id}/{sha1(name)}.jpg`)
- **`listing_pois`/`listing_poi_photos` join 表** 存 per-listing 状态:
  `intent_bucket`、`distance_m`、`drive_time_s`、`status`(candidate/approved/rejected)
- **POI 视觉打标** (`lib/poi/vision-tagger.ts`) — 幂等,`tagged_at` 判重
- **人工 review** 结构化落 `review_events`(带 AI 预测快照 → 训练数据)
- 只有 `approved` 的 POI + 照片进入视频输入 `input_photo_ids`

### 14 → 6 Archetype 映射

14 个 intent buckets(见 `lib/poi/types.ts:23`)按 `BUCKET_ARCHETYPE`
@ worker.py:427 映射到 6 个视觉模板:

| Archetype | 覆盖 buckets |
|---|---|
| **TRUST** | schools, healthcare, faith |
| **LIFESTYLE** | dining, nightlife, fitness |
| **UTILITY** | daily_errands, shopping, transit |
| **NARRATIVE** | outdoor, kids, pets |
| **MAGAZINE** | asian_community, work_hubs |
| **MAP** | 通吃地图型场景 |

### Bucket Job 渲染流程(与 Listing 的差异)

1. `claim_bucket_job()` @ worker.py:518 — `scope in ('intent_bucket','community_intent_bucket')`
2. `process_bucket_job()` @ 550 — `is_community` 决定 owner column(`listing_id` vs `community_id`)
3. 照片源 = `input_photo_ids`(POI 照片,**不是** listing_photos)
4. 每个 POI 算 `_fmt_distance_mi()` / `_fmt_drive_min()` 填入 overlay
5. **字幕换系统 — HTML → PNG**:
   - 按 archetype 生成 `captions.json`
   - `caption-render/render.py` Playwright 打开 `overlay.html`,给每个 clip 截
     1080×1920(或 1920×1080)透明 PNG
   - 支持真字体(Charter/Georgia 衬线)、mini-map、chapter card、backdrop-blur pill
     — drawtext 干不了的都靠这条
6. **运镜换 v1 filter**(`kenburns_filter`,blur-letterbox): POI 缩略图取景不可控,
   用**静态模糊底 + 动画前景 overlay** 避免拉伸/裁剪;motion 只允许 `zoom_in`/`zoom_out`
   (pan 会带出 fg/bg 缝隙)
7. `generate.py` 调用形状一致,`--listing-overlay` 换成 archetype 数据
   + `--captions captions.json`(会 overlay PNG 到 zoompan 层上)
8. Landscape 画布必须走 `cover=True` 分支,不复用 portrait 的 fit-inside
   (否则左右两侧烧出模糊竖条)

---

## 四、两条线的对称性 & 关键差异

| 维度 | Listing | Nearby/Bucket |
|---|---|---|
| 输入源 | `listing_photos` | POI `input_photo_ids` |
| 打标签 | listing 照片(ai_tags: room_type/hero) | POI 照片(scene/mood/usable) |
| Filter | `kenburns_filter_v2` fill-crop | `kenburns_filter` blur-letterbox |
| 运镜词表 | 全套 8 种(含 pan/tilt/pan_to_subject) | 只 zoom in/out |
| 字幕系统 | ffmpeg drawtext(1 种硬编码样式) | HTML→PNG(6 种 archetype 版式) |
| Overlay 数据 | 房源 price/specs/address | Archetype-specific + POI distance/drive_time |
| 方向策略 | 单方向(依据照片主体方向) | 同左 |
| BGM | 5 桶随机 | 5 桶随机(archetype 可 hint bucket) |
| 输出表 | `listing_videos.cf_video_id[_landscape]` | 同表(带 `intent_bucket` scope)或 `community_videos` |

---

## 五、可追溯性

`pick_bgm()` 是 `random.choice`,DB **不存**具体 BGM 曲名。要复盘任意一条视频
用了什么 BGM / shot plan / motion:

```
sudo grep "uploaded landscape to CF: <cf_id>" /var/log/percho-render-worker.log
sudo grep "job <job-uuid>" /var/log/percho-render-worker.log | grep -E "running \(|bgm|shot-plan"
```

日志轮转就找不回来了,不要瞎猜。

---

## 六、成本参考(每 listing 冷缓存 ~$4.4,热缓存 ~$2.6)

主要开销:Places Photos($1.75)+ Vision LLM($2.00)+ Directions($0.44),
硬预算 $3/listing/30 天。

---

## 七、基准铁律(任何改动必须满足)

1. **Vision 层 fail-open**:tagger/planner 抛任何异常都必须落回 legacy 全长渲染,
   视频必发。
2. **双业务线共用 `generate.py`**:不 fork CLI,overlay JSON 是共享形状。
3. **照片输入 = UI 展示输入**:同一份 photo URL 源。视频里出现的房子必须等于
   spec 页展示的房子。
4. **Composition 策略是 (source aspect × canvas aspect) 的函数**:不是单变量。
   任何 filter 跨画布复用都要重新推导前提是否成立。
5. **真实照片,禁 mock stock**:24s 视频对同一栋房子的容忍度远低于快速滑动的
   照片网格。宁可缩短到 3-4 clip,不假造。
