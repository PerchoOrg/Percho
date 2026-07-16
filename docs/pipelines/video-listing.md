# Listing Video — 房源本身 walkthrough

**父文档**: [README.md](./README.md) — 先读公共基础设施与铁律
**Archetype**: `LISTING`(第 7 种,v97.0 起,2026-07-16)
**代码**: `worker.py` + `photo_selector.py` + `generate.py` + `caption-render/overlay.html`

---

## 一、15 步流水线

**触发**: `listing_videos.status='queued'` 或 `render_jobs` 表插入新 job。

1. **认领**: `claim_job()` @ `worker.py:178` 拉一行 queued
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
   - `photo_selector.py:356` 把 `ai_tags.caption` 透传为 `ai_caption` — LISTING caption 数据源
7. **文件命名**: 照片按 `{sort_order:03d}_{id}.jpg` 落盘(供 generate.py 匹配 plan)
8. **构建 overlay**: `build_overlay()` @ `worker.py:239` 生成 price/specs/address/neighborhood JSON
9. **调用 generate.py**:
   ```
   python generate.py --photos <dir> --out <mp4>
     --orientation vertical|landscape
     --shot-plan shot_plan.json
     --listing-overlay overlay.json
     --captions captions.json           # v97.0
     --bgm <随机 mp3>
   ```
10. **渲染 (`kenburns_filter_v2`)**: 单层 fill-crop(`force_original_aspect_ratio=increase, crop`)
    + zoompan;支持 `push_in / pull_back / pan_lr / pan_rl / tilt_td / pan_to_subject / static`;
    zoom 1.00 → 1.15;`pan_to_subject` 用 subject_bbox 中心
11. **字幕(v97.0)**: 见下方「二、LISTING archetype 字幕系统」
12. **拼接**: `concat_with_crossfade` xfade 0.5s,ffprobe 每段实际时长
13. **BGM 混音**: 拼接后 mux
14. **上传**: `cf_upload()` → Cloudflare Stream 拿 uid
15. **回写**: `sb_patch('listing_videos', {cf_video_id[_landscape], status:'ready'})`

**Fail-open 铁律**: vision/planner 任一环节抛异常 → 打日志 `shot plan disabled`
→ 退回不带 `--shot-plan` 的全长 legacy 渲染。**视频必发**。

---

## 二、LISTING archetype 字幕系统(v97.0)

**Per-photo AI caption**,底部锚定 · **V3-5 Local blur band**。

### 数据管线

```
listing_photos.ai_tags.caption          (vision tagger, ≤15 词事实句)
  ↓ photo_selector.py:356
shot_plan.json  → clip.ai_caption
  ↓ worker.py:461–491
captions.json  { archetype:"LISTING", clips:[{clip, kicker, txt}] }
  ↓ generate.py --captions
caption-render/render.py (Playwright)
  ↓ overlay.html arch==='LISTING' 分支(:315)
每 clip 一张透明 PNG
  ↓ ffmpeg overlay
zoompan 层之上
```

- `kicker` = `caption_for_shot()` 生成的 uppercase room label(如 `KITCHEN ISLAND`)
- `txt` = `ai_tags.caption` vision 输出
- 空 `txt` → 空透明 PNG → ffmpeg overlay 变 no-op(安全 skip)

### 样式(定案,`overlay.html .LIST-band`,portrait 1080×1920)

```css
.LIST-band {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 12;
  padding: 120px 60px 90px;
  background: linear-gradient(to top,
    rgba(0,0,0,0.85) 0%,
    rgba(0,0,0,0.72) 35%,
    rgba(0,0,0,0.35) 75%,
    rgba(0,0,0,0)  100%);
  color: #fff;
}
.LIST-band .kicker {
  font: italic 34px "Charter","Georgia",serif;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: #facc15; opacity: 0.95;
}
.LIST-band .txt {
  margin-top: 18px;
  font: 500 62px/1.24 "Charter","Georgia",serif;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.45);
  max-width: 92%;
}
.LIST-band .rule { width: 84px; height: 3px; background: #facc15; opacity: 0.85; margin-top: 30px; }
```

Landscape (1920×1080): padding `70px 70px 50px`, kicker 22px, txt 42px, rule 60×2。

### 决策要点

- **LISTING archetype 不渲染 progress bar**(12+ 张照片视觉过挤;bucket-video 的进度语义对 tour 不适用)
- **VO headroom**:caption 只占底部 ~30%,预留给 voice-over 字幕层叠加或替换
- **不用 `backdrop-filter`**(见下)

### ⚠ 透明底 + backdrop-filter 陷阱(务必读)

早期 V3-5 原型用 `backdrop-filter: blur(22px) brightness(.72)`。但 `render.py` 输出的是**透明 PNG**再由 ffmpeg 复合到 kenburns 视频上,DOM 底下没有像素——blur 出的是**空气**,视觉等同没效果。改用 `linear-gradient` 近似(上面样式段),视觉近似 `blur + brightness(.72)`(后者本质就是暗化 scrim),零流程改动。

### Fallback / 旧版

`v2_caption_filter()`(ffmpeg drawtext,`generate.py:365`,150px 底部黑条 + 房间标签)保留但被 `generate.py:426` 用 `if v2_caption and not caption_png` gate 关掉——只有 `captions.json` 缺失时才走(避免双字幕)。左价格 / 右地址覆盖层由 `--listing-overlay` 单独处理,与本 caption 层无关。

### 原型 / 预览

- <https://percho-captions.surge.sh>(index V1–V5)
- `/v3.html`(V3-1..V3-5 底部变体)
- `/listing.html`(生产 CSS 完整复刻,真实照片 + 真实 vision caption)

---

## 三、验证 · 上一次 batch regen

2026-07-16 全量 regen:10 eligible listings 全 done,0 failed,平均 ~2 min/listing,总 ~21.6 min。2 张 photo-starved listings(`96402546` 0 photos,`903de519` 1 photo)未生成 walkthrough。测试锚点:listing `f0857cec-be11-417a-81c4-be5b3440fd99` (1619 Tide Mill Road, Cumming GA 30040)。
