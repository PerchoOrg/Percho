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
   (打标签是上传时 fire-and-forget 触发,`apps/web/lib/poi/vision-tagger.ts`,~$0.005/photo)
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
     --bgm <随机 mp3>
   ```
   **`--captions` 自 2026-08-01 起不再传**(worker 不写 captions.json)。
10. **渲染 (`kenburns_filter_v2`)**: 单层 fill-crop(`force_original_aspect_ratio=increase, crop`)
    + zoompan;支持 `push_in / pull_back / pan_lr / pan_rl / tilt_td / pan_to_subject / static`;
    zoom 1.00 → 1.15;`pan_to_subject` 用 subject_bbox 中心
11. **字幕: 无**(2026-08-01)。见下方「二、字幕已下线」
12. **拼接**: `concat_with_crossfade` xfade 0.5s,ffprobe 每段实际时长
13. **BGM 混音**: 拼接后 mux
14. **上传**: `cf_upload()` → Cloudflare Stream 拿 uid
15. **回写**: `sb_patch('listing_videos', {cf_video_id[_landscape], status:'ready'})`

**Fail-open 铁律**: vision/planner 任一环节抛异常 → 打日志 `shot plan disabled`
→ 退回不带 `--shot-plan` 的全长 legacy 渲染。**视频必发**。

---

## 二、字幕已下线(2026-08-01)

**Listing walkthrough 现在零字幕。** Owner:「去掉所有的字幕 ... 不够沉浸」。
视频是纯视觉对象;文字全部移到 app 的 Explore 相册,由买家主动点进去看。

### 关闭方式:靠「不给输入」,不是加 flag

两条 caption 路径各有一个输入,worker 两个都不再产出:

| 路径 | 输入 | 现状 |
|---|---|---|
| HTML→PNG `LISTING` band | `captions.json`(`--captions`) | worker 不写、不传 → `caption_png=None` |
| ffmpeg drawtext fallback | `shot["caption"]` → `v2_cap` | worker 不设 → `generate.py:426` 的 `if v2_caption and not caption_png` 不成立 |

好处是回滚 = 恢复那两个赋值,`generate.py` / `overlay.html` / `render.py`
一行都没改,`.LIST-band` 版式和 `v2_caption_filter()` 都原样留着。

⚠ **验证时不要只看 worker 日志有没有报错** — 两条路径都是「静默不渲染」。
看 `[ken-burns] (n/N) rendering ... → mode` 那行有没有 `+cap[LISTING]` 后缀;
有就说明 captions.json 又被写出来了。再抽帧做视觉确认。

### 文字去了哪(app 侧,勿在渲染器重建)

`apps/mobile/lib/listing/gallery.ts` + `components/listing/PhotoGallery.tsx`,
从 explore hero 的「All N photos」进入:

- 展示 **全部** `listing_photos`,不是 shot plan 挑的 8–14 张(owner:「包括视频里没有的」)
- 每张配 `ai_tags.caption` 作正文 + room kicker;**未打标的照片不显示字幕条**,
  不用兜底文案(feed 在服的 104 条 fmls-import listing 的 `ai_tags` 全是 null,
  兜底等于对绝大多数房源说假话)
- caption 在这里可以比视频上长(`numberOfLines={4}`)——这正是「详细解读」的意思

### 历史版式(保留未删,供回滚参考)

以下是 v97.0 曾经在用的数据管线与 CSS,**当前不生效**:

```
listing_photos.ai_tags.caption          (vision tagger, ≤15 词事实句)
  ↓ photo_selector.py:356
shot_plan.json  → clip.ai_caption
  ↓ worker.py(已删除这段)
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
