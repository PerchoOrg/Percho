# Percho Release Notes

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — release notes
> are a record of what was shipped under the product's name at the time.

## v0.76.4 · Fullscreen photo review (2026-07-14)

- **Tap a POI photo to review it fullscreen.** The old tile approve/reject icons were tiny and hover-only — impossible to hit on mobile. Now a tap opens the photo full-screen with big Approve / Reject buttons and auto-advances to the next photo, so triaging 10+ POI photos takes seconds. Keyboard shortcuts (← → to browse, A / X to decide, Esc to close) and swipe-to-navigate on mobile.

## v0.76.3 · POI photo review tiles now load (2026-07-14)

**🐛 Bug Fixes**
- **POI review tiles now show the actual photos.** Follow-up to v0.76.2 — the imported photos were saved correctly, but the review grid pointed to the wrong storage location so tiles showed broken image icons. Fixed.

## v0.76.2 · Nearby POI photo import (2026-07-14)

**🐛 Bug Fixes**
- **Nearby POIs → Refresh now actually imports photos.** Previously every attempt reported "10 skipped" and no photos landed on the Media tab. Photos now load and appear in pending state for review.

## Phase 76 · POI content pipeline v1 — schema + Media tab UI (2026-07-14)

**What ships**
- Nearby POI section in the listing edit → Media tab. Click **Discover POIs** and the system pulls up to ~120 nearby places from Google (restaurants, parks, schools, grocery, cafes, gyms) inside a 5-mile radius, grouped into intent buckets (Walkable / Daily drive / Lifestyle).
- Per-POI approve / reject with an inline **Fetch photos** action that pulls up to 10 Google Places photos each, presented as a tile grid for approve / reject per photo (with attribution).
- All review actions land in a new `review_events` table together with any AI prediction that produced them — training data for future auto-approval.

**Why**
- POIs + photos are stored globally (deduped by Google's `place_id` / `photo_name`), so the same Publix used by 100 listings costs 1 Google Places fetch, not 100. Warm-cache spend per new listing ≈ **$2.65** vs cold **$4.42**.
- Review is intent-driven, not radius-driven: buyers care about "what can I walk to" and "what's a 5-min drive away", not "everything in a circle".

**Design doc**: `docs/poi-content-pipeline.md`

**Next phase (77)**: Directions API for real drive-time buckets + Claude Sonnet 4.5 vision tag + quality score, wired into `review_events.ai_prediction` so we can start comparing model output to human review.




Newest at the top. Each release covers a meaningful product change visible to users.

## v0.75.3 — 2026-07-11 — Housekeeping

### 🔧 Technical
- Retired the /demo/autofill pitch page and its 10 sample Atlanta listings — the product now runs entirely on real MLS data (or agent-uploaded listings). No user-facing change.
- Archived old HTML design mockups to internal docs. Cleaner repo.

### ⚠️ Known Issues
- None.

## v0.75.2 — 2026-07-11

🚀 Features
- **Rebrand to Percho — everything except infrastructure.** Legal terms, privacy policy, contact page, agents landing, marketing docs, design mocks, and all internal code comments now say Percho. Email addresses and web address will move once DNS is switched. Company name is now written as Percho, Inc. — the legal filing follows separately.

## v0.75.1 — 2026-07-11

🚀 Features
- **We're now Percho.** The app has been renamed from Vicinity to Percho. Same team, same product, new name. All UI, page titles, and footers now say Percho. Emails and web address haven't changed yet — those will move in the next couple of releases.

## v0.75.0 — 2026-07-06

### 🔧 Technical
- 视频渲染改为「一 listing 一个视频」:如果房源照片以横向为主,只生成横屏视频(feed 中带黑边显示,点全屏铺满);否则只生成竖屏视频(feed 中铺满,不再显示全屏按钮)。此前会同时生成两版,存储和编码成本翻倍。
- 清理了历史遗留的 3 条房源:删除多余的竖屏版本,只保留正在使用的横屏版本。用户看到的画面不变。

## v0.74.23 — 2026-07-06

### 🎬 全屏播放
- 点击全屏后不再出现中间的播放按键,视频会在全屏后自动开始播放,不需要再手动点第二下。
- 拆掉了上一版右下角的诊断信息条。

### ⚠️ Known Issues
- 若真机测试仍出现全屏后画面不动,下一版会切换到「不旋转、上下留黑边」的方案,以 iOS 系统级横屏为准。

## v0.74.22 — 2026-07-06

### 🔧 Technical
- 全屏播放画面冻结问题诊断中:强化了解冻手法(布局稳定后再做可见 seek + 兜底重启),并在全屏右下角加了一小块诊断信息(3 秒后消失),用于真机截屏收集数据。此版本本质是诊断版,若确认修复后会拆掉信息条再发正式版。

### ⚠️ Known Issues
- iOS Safari 全屏后仍可能出现「有声音无画面」;若遇到,截图右下角信息条发给团队。

## v0.74.21 — 2026-07-06

### 🐛 Bug Fixes
- 全屏播放:点击全屏进入横屏后,现在图像和声音一起流畅播放。之前会出现「声音在放画面冻住,需要点两下播放键才能全部恢复」,首次点还会误暂停。

## v0.74.20 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now plays the video on the first tap.** Previously, a native iOS Safari play button briefly appeared over the video after entering fullscreen (audio was already playing at that moment); tapping it paused the audio, and only a second tap resumed both audio and video. The native browser video-control chrome is now globally hidden so all pause/play UI is app-drawn and behaves consistently.

## v0.74.19 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen no longer flashes a play button that pauses the video when tapped.** After tapping fullscreen, iOS Safari transiently reported the video as paused during the style/rotation recalc, which briefly showed the center play button. Tapping it landed on the pause/play toggle after the video had already resumed, so it paused instead of playing. The play button is now suppressed for a short settle window right after entering fullscreen.

## v0.74.18 — 2026-07-06

### 🐛 Bug Fixes
- **Tapping fullscreen now auto-plays the video immediately.** Previously if the tapped card wasn't already playing, the center play button would appear on the fullscreen video and require a second tap. Now the fullscreen tap itself starts playback (with sound if the browser allows, muted otherwise).

## v0.74.17 — 2026-07-06

### 🐛 Bug Fixes
- **Landscape videos now play as landscape from the start of the feed, and tapping fullscreen no longer causes any flash or transition artifact.** Previously the feed played a portrait companion of the same video and swapped to the landscape source only when you tapped fullscreen — that source-swap window was the root cause of every 74.8-74.16 regression (black frame, "small video with play button", overlapping thumbnails, etc). This release lets a single landscape video handle both views: cards with a landscape source play landscape in the vertical feed with letterbox top/bottom (per the object-contain visual rule), and tapping fullscreen just rotates the same video element to fill the screen — no HLS re-attach, no black gap, no overlays. Portrait-only cards keep their existing behavior with no fullscreen button. All the 74.13-74.16 workarounds have been removed.

## v0.74.15 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen no longer shows a small landscape thumbnail overlapping the playing video.** 74.14's poster overlay was rendered unconditionally in fullscreen, assuming z-index would keep it hidden behind the `<video>`. In practice on iOS Safari the overlay peeked out from under the video as a small centered landscape image. Fixed by unmounting the overlay the moment the landscape video paints its first frame; it now only appears during the actual black-frame gap of the HLS source swap.

## v0.74.14 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer shows a "black → letterboxed thumbnail → full playback" sequence.** iOS Safari's native `<video poster>` does not respect CSS `object-fit`, so the poster was letterboxing to the rotated fullscreen box's aspect (owner: "黑屏 → 小图 → 大播放"). Fixed by replacing the native poster in fullscreen with a rotated `<img>` overlay that uses `object-fit: cover` and the correct landscape thumbnail. Also preloads the landscape thumbnail while the card is still in the vertical feed, so tapping fullscreen shows the poster instantly instead of waiting for a network round trip. The vertical feed's non-fullscreen behavior is untouched.

## v0.74.13 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video restored to its pre-74.7 clean transition.** Root-cause analysis of the "fullscreen flashes a mini window" regression traced back to v0.74.7 — where a fix for the vertical-feed first-swipe placeholder was accidentally extended to the fullscreen path, which never had that bug in the first place. Every subsequent 74.8-74.12 patch layered another workaround on top. This release removes the gate/overlay machinery from the fullscreen branch and restores the native `poster=` attribute, giving fullscreen the same seamless transition it had before 74.7. The vertical-feed first-swipe fix is preserved for the portrait tile branch where it belongs.

## v0.74.12 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer flickers "big → small → big" on tap.** The viewport size state had two competing writers: the tap handler wrote the correct fullscreen dimensions synchronously, but a follow-up effect immediately overwrote it with the underlying feed section's smaller size, then a resize observer eventually corrected it back. Consolidated to a single source of truth (`window.innerWidth`/`Height`) so the fullscreen video renders at the correct size on the very first paint.

## v0.74.11 — 2026-07-06

### 🐛 Bug Fixes
- **No more flash of the previous portrait frame when tapping fullscreen.** Follow-up to v0.74.10. Even after resetting the "first frame" flag synchronously, the video was still fading out over 150ms — during which its stale portrait-source frame was visible, stretched into the rotated landscape box. Fixed by making the fade asymmetric: video reveals with a smooth 150ms fade-in on the first frame, but hides instantly when the flag flips back off. Applied to all three vertical feeds.

## v0.74.10 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now shows the poster overlay from the first frame — no more flash of the old portrait video stretched into the landscape box.** Follow-up to v0.74.9. The rotated poster overlay was correctly sized but its visibility gate depended on a state flag that only reset in a post-render effect, so for one paint the fullscreen render still saw the old "already playing" flag and revealed the raw `<video>` element (still holding the portrait source's live frame). Fixed by resetting the flag synchronously in the tap handler, alongside the viewport measurement, so the overlay covers the swap from render 1.

## v0.74.9 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now transitions straight to the landscape video with no small-tile or black-screen intermediate.** Follow-up to v0.74.8. Two overlapping bugs: (1) the fullscreen video was rendering at intrinsic size for one paint because the viewport measurement lived in a post-render effect — fixed by measuring the viewport synchronously in the tap handler before flipping fullscreen state; (2) the black gap during the HLS source swap to the landscape uid was uncovered — fixed by adding a rotated poster overlay that mirrors the fullscreen video's transform, so the landscape thumbnail fills the screen until the first real frame paints.

## v0.74.8 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer flashes a portrait then landscape mini-tile before playing.** Regression from v0.74.7. Tapping the fullscreen button on a `/browse` card briefly showed a portrait-sized poster tile, then a landscape-sized poster tile, then finally the rotated fullscreen video. Cause: v0.74.7's poster overlay was pinned to the card's original bounding box, so it didn't follow the video's fullscreen rotate/resize transform. Fix: skip the poster overlay entirely in fullscreen — the video element still fades in cleanly on first frame, and the transition to landscape is now smooth.

## v0.74.7 — 2026-07-06

### 🐛 Bug Fixes
- **Vertical feeds no longer flash a black screen with a small video + play button on first swipe.** Affected all vertical-swipe feeds — the main `/browse` feed, community video feed (`/c/[slug]/feed`), and the community listings carousel. Symptom was most visible the first time a card came on-screen: a placeholder tile with the system play glyph would flicker for a fraction of a second, then a black screen briefly, then the video would start. Root cause was iOS Safari's default behavior for the video `poster` attribute — the browser overlays a big system play button on it and reveals the black background while the video decodes its first frame. Replaced the `poster` attribute across all vertical feeds with an image overlay that stays visible until the first real frame paints, mirroring the fix v0.74.3 shipped for the horizontal community carousel.

## v0.74.6 — 2026-07-06

### 🐛 Bug Fixes
- **Community video tap-to-pause (follow-up to 0.74.5).** 74.5 shipped a tap-to-pause button but taps didn't actually stop playback — HLS buffering silently resumed the video within ~200ms. Root cause: the pause state and the play retry listeners lived in separate effects, so pausing didn't tear down the retry chain. Rewrote as a single unified play/pause effect matching BrowseFeed's model. Tap-to-pause now works on the community carousel exactly like on `/browse`.

## v0.74.5 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe (follow-up to 0.74.4).** Fixed two issues: (1) around the 4th slide the audio would sometimes vanish and only come back after swiping back and forth — the `canplay` fallback was retrying with the video still muted from a previous fallback. (2) Community videos now support **tap-to-pause / tap-to-play** — before this release you couldn't stop a playing community video without leaving the carousel.

## v0.74.4 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe (follow-up to 0.74.3).** After swiping to the next community video, the video now actually plays and the previous slide's audio stops. Previously only the first slide played and its voice kept going.

## v0.74.3 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe.** Swiping between community videos on a listing no longer flashes the previous frame or shows a black gap before the new video starts — the neighborhood thumbnail now covers the transition until the first real frame is ready.

## v0.71.26 — 2026-07-06

71.25 rAF 用父组件 `setPaused` 通知,但 `paused` prop 在 effect closure 里是旧值,ping-pong 不收敛,播放键还是不消失。改成本地 `domPaused` state,rAF 直写本地,播放键绑本地。父级 `paused` prop 保留给外部逻辑(sound button、swipe 手势等)使用。

## v0.71.25 — 2026-07-06

71.24 拆过头了 —— 横屏全屏播放键回到"播了不消失"。71.15 media event listener 在非全屏够用,但全屏切 src 到 landscape uid 时 iOS Safari 有时不 fire `play` 事件。加回 rAF poll,但**只在 `isFullscreen` 时跑**,非全屏保持 event listener 单驱动。

## v0.71.24 — 2026-07-06

清理 71.16 → 71.22 三个星期堆积的诊断代码 —— 左上角 `vp/vid rect/reactPaused/domPaused/muted/vol` 半透明 pill、`videoDiag` 500ms interval poll、`domPaused` rAF poll 全部拆掉;`onTap` 里 71.21 试过没用的 `currentTime = currentTime` nudge 也删了。71.15 media event listener 已经把 `paused` React state 同步得足够准,rAF poll 是冗余兜底。行为一字未改,只是把排障脚手架卸了。

## v0.71.23 — 2026-07-06

暂停后声音停,再播放却哑巴 —— 71.22 核选项把当前视频 `muted=true, volume=0` 后没解绑。tap 播放分支加两行,`v.play()` 前恢复 `volume=1` + `muted=父级 prop`。

## v0.71.22 — 2026-07-06

暂停后声音继续 —— 诊断显示 `domPaused=true muted=true vol=1.00`,当前 video 已闭嘴,声源必然在别处(邻居预加载卡片或 HLS 残留 audio track)。核选项:tap 暂停时 `document.querySelectorAll('video')` 拿全部视频,每个都 `pause()` + `muted=true` + `volume=0`。

## v0.71.21 — 2026-07-06

播放键播放中不消失(React `paused` state 没跟 DOM 同步)+ 声音跟不上暂停。加 `domPaused` rAF poll 直读 `videoRef.current.paused` 作为播放键 truth,onTap pause 加 `currentTime = currentTime` nudge。诊断 pill 扩展 `reactPaused/domPaused/muted/vol`。(播放键 fix 有效;audio 问题实际由 71.22/71.23 解决。)

## v0.71.20 — 2026-07-06

全屏体验 3 个后遗症修好:X 关闭按钮从视频后面出来了(zIndex 10002 fixed)、
播放键跟着视频一起横躺(rotate 90 + fixed 10001)、点视频真的会暂停音画同步
(`<video>` 加 pointer-events:none 让 tap 穿透到父 div 的 onTap handler)。

## v0.71.19 — 2026-07-06

Fullscreen 视频黑边彻底解决。真凶是 Tailwind Preflight 的全局
`img, video { max-width: 100%; height: auto; }` 把我们 JS 测量的 rotate box
硬 clamp 到父容器宽度。inline style 加 `maxWidth/maxHeight: none` 压过
preflight,rotate 后视频精确铺满视口。

## v0.71.17 — 2026-07-06

Fullscreen sizing now measures the actual container rect (via
`getBoundingClientRect` + `ResizeObserver` + `visualViewport`) instead of
`window.innerWidth/innerHeight`. Fixes the ~30% black bar that appeared on
iPhone Plus/Pro Max (and any device where URL-bar collapse expands the
layout viewport past `innerHeight`). Also fixes tap-to-pause leaving audio
running: fullscreen play-retry effect now stops after playback starts and
respects a user-initiated pause.

## v0.71.15 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen fill: initialise viewport size on the first render pass so the rotate branch actually applies (previous version's initial 0/0 state let the video render before measurement finished, keeping it looking like the non-fullscreen view).
- Play/pause indicator now stays in sync with the real video state — if iOS Safari pauses the picture but keeps audio playing (buffer stall, src reload), the UI reflects that instead of getting stuck.

## v0.71.14 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen fill really works now: video is sized in raw pixels from the actual visual viewport (previous dvw/dvh attempt didn't take effect on iOS Safari — Tailwind arbitrary units either fell back to vw/vh or weren't emitted).
- Play button no longer sticks in the middle: the fullscreen player now retries `.play()` across multiple media events (loadedmetadata, canplay, loadeddata), covering iOS Safari's native HLS reload race.

## v0.71.13 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen horizontal video now truly fills the phone screen with no black bars on top or bottom (previous fix only covered the sides on iOS Safari).
- Video now auto-plays reliably when you tap the "Full screen" button — no more paused play button stuck in the middle.

## v0.71.12 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen horizontal video now truly fills the phone screen edge-to-edge (previously left thin black bars on tall phones).
- Removed the always-visible play button that was overlaying the fullscreen video — the play indicator now only appears when the video is paused, matching the rest of the feed.
- Property price / address / agent card no longer show over the video while in fullscreen; they reappear when you exit fullscreen.

## v0.71.11 — 2026-07-06

### ✨ Improvements
- The "Full screen" button now sits just below the horizontal photo frame inside the vertical video (at the black-bar boundary), instead of at the very bottom of the page.

## v0.71.10 — 2026-07-06

### ✨ Improvements
- Fullscreen button on the video feed now sits at the bottom of the vertical video with a "Full screen" label instead of a bare corner-arrows icon.
- The centered play/pause indicator is now visible at all times while a horizontal listing plays in fullscreen — no more guessing whether the video is playing.

### 🐛 Bug Fixes
- Removed the "please rotate your phone" Chinese hint that briefly appeared over horizontal videos in fullscreen.

## v0.71.9 — 2026-07-06

- **横版全屏真的横了**:owner "点击全屏 视频还是竖着播放 并且周围的按键都没有了"。71.7 全屏按钮虽然切到了横版 src,但手机竖屏视口把 16:9 视频塞在中间一小条,视觉上还是"竖屏播放上下留黑边"。这次改成:进全屏后视频转 90°、边到边填满整屏;顶部会短暂弹一个"请把手机横过来"提示。用户把手机横过来看画面立即变正、无黑边。iPad 横放 / desktop 视口自动免转,直接横放。周围的 like/save/share 按钮在全屏里被沉浸式覆盖是刻意的 —— 按 X 或 ESC 退出即可恢复。

## v0.71.8 — 2026-07-06

- **Media tab 里能看出哪些 listing 有横版**:owner "如果有横版 要标记一下 让agent知道"。之前 71.7 上线双方向视频后,agent 在 dashboard 看到的还是一个视频卡片,没法判断这个 listing 是不是已经生成了横版。现在:视频卡片标题旁边、Cover badge 旁边多一个蓝色的小标 **Landscape**(hover 有英文说明)。只有真的生成过横版才显示,老 listing / 竖片为主的 listing 不显示。轮询期间横版渲染完毕后,标签会自动出现,不需要刷新页面。

## v0.71.7 — 2026-07-06

- **横向照片 listing 出全屏横版视频**: owner "自动生成的视频是竖屏的 如果照片是横着 那结果上下就会空着 不好 有没有解决方案"。之前所有自动视频都渲染成竖屏 1080x1920,横向房源照片被 blur letterbox 塞进去,上下有一大片模糊留白,画面利用率低。现在:
  - 后台 render worker 会先看这批照片的方向。**当 ≥80% 是横向照片**时,除了原来的竖版还会额外渲染一份 **1920x1080 横版**视频(同一批照片 + 同一首 BGM,只是画布方向不同)。
  - Feed 默认还是竖版,但当这个 listing 有横版时,视频中间偏下(横向照片下缘位置)会出现一个**全屏按钮**。点它会把视频撑满整屏、切换成横版播放,画面完整无留白。
  - 全屏内右上角 ✕ 或按 ESC 退出。
  - 混合方向的 listing(横竖照片各半)不做双渲染 —— 竖版体验反而更连贯。
- 老 listing 不影响:数据库列可空,没有横版就仍然按原路径播竖版。想给某个老 listing 补横版,重跑一次 render job 就有了。

## v0.74.16 — 2026-07-05

- **点击 sheet 外的空白也能收起 More 详情框**: owner "点击 more 出来框框 点击 x 收起 也应该允许点击其他地方自动收起框框"。之前只能点右上角 ✕ 关,现在点上部视频区域(sheet 外的任何地方)也会关掉 sheet。视频不会因此暂停——sheet 关掉后视频保持当前播放状态。技术实现:sheet 外覆盖一层透明 tap catcher(z-40),点它触发关闭并阻止事件冒到视频层的 tap-to-pause。

## v0.74.15 — 2026-07-05

- **Feed 里 More 展开后视频不再被完全挡住**: owner "listing feed 里的 more 拉出来的框框太大遮住了视频全部 搞一半多一点 黄金分割线左右 留一部分视频还可以继续播放"。两处修:
  - **详情框收到黄金比例**:原本占屏 82%,现在 62%(≈黄金分割 0.618)。上部约 38% 让给视频。
  - **移除全屏半透明遮罩**:原本 More 展开后整块屏幕会盖一层半透明黑,视频虽然还在放但被罩得看不见。现在直接删掉遮罩,视频画面清清楚楚地继续播,详情框自己带上边缘阴影做视觉分层。要关闭详情走右上角 ✕。

## v0.74.14 — 2026-07-05

- **Public agent profile 大瘦身:hero 压缩 + grid 对齐全站 canonical**: owner "public profile 里的 grid view 也要改,并且 profile 第一部分的空白太多 减少 尽量多的展现房子内容"。
  - **Hero 压缩**(`app/(public)/a/[agentSlug]/page.tsx`):`py-20 md:py-28`(80/112px)→ `py-8 md:py-12`(32/48px);eyebrow `mb-8` → `mb-3`;头像 20×20 / 24×24 → 16×16 / 20×20;name `display-xl` → `display-md md:display-xl`(移动端不再顶天);内部 `gap-8` → `gap-4/5`;CTA button `px-6 py-3 12px` → `px-5 py-2.5 11px`;bio `mt-8 text-base` → `mt-4 text-[15px]`。整块空白约 **-40%**,portfolio 卡从"要滚半屏"变成上折内可见。
  - **Grid 对齐 canonical**:portfolio 之前跑独立 editorial `ListingCardView`(3-col × `aspect-[4/5]` × `font-serif 22/26 md` × gap-8),74.4 owner 特批的路线;现在 owner 明确要求"grid 也要改 保持统一",换成全站 `ListingGrid`(4-up × 15/11/11 × 更紧 gap)。同时废弃本地 `formatPrice`(K/M 缩写)—— 走 ListingGrid 内置 full-digit,守住 74.10 buyer-surface hard rule。地址走 `formatFullAddress` → `street, city, state`(no zip in dense grid,74.7 canonical)。
- **Editorial 22/26 特批取消**:74.4 那次 owner 想要的是"portfolio 要有编辑感",但 74.14 明确"尽量多展现房子内容"→ 密度优先。canonical 表现在只保留 CaptionCard 26/13/13/13(feed swipe)+ GridCard 15/11/11(其他所有 buyer surface,含 portfolio)。
- **构建**: tsc 无错,next build 干净。

## v0.74.13 — 2026-07-05

- **Dashboard "my listings" hub + community "Homes in XXX" sheet 补齐 audit**: owner "agent hub my listing grid view 需要改 / 截图里的 homes in xxx community 也要改"。74.10 miss 了两处:
  - `app/dashboard/page.tsx`:my listings grid 之前只喂 `address`(street-only),现在 select + 行类型 + mapper 都加 city/state/zip,走 `ListingGrid.formatFullAddress` → `street, city, state`。Draft 保持 `Untitled draft` fallback。
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`:74.10 只重排版没换 formatter,`$2.5M/$465K` 仍是 K/M 缩写 —— `formatPrice` 换成 `toLocaleString('en-US')`,和全站 full-digit 规则统一。

## v0.74.12 — 2026-07-05

- **Sheet 里 "Listed by <name>" 现在长得像可点**:agent 名字换成品牌 tan 色 + 下划线,尾巴挂了个 `›` 箭头(hover 时会往右挪一点)。之前纯灰字看起来像 label,不像链接。点进去还是 `/a/<slug>` agent 页。

## v0.74.11 — 2026-07-05

- **Dashboard "my listings" hub + community "Homes in XXX" sheet 补齐 audit**: owner "agent hub my listing grid view 需要改 / 截图里的 homes in xxx community 也要改"。74.10 miss 了两处:
  - `app/dashboard/page.tsx`:my listings grid 之前只喂 `address`(street-only),现在 select + 类型 + mapper 都加 city/state/zip,走 `ListingGrid` 的 `formatFullAddress` → `street, city, state`。Draft 保持 `Untitled draft` fallback(74.5 特例)。
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`:74.10 只改了排版没换 formatter,`$2.5M/$465K` 仍是 K/M 缩写 —— 现在 `formatPrice` 换成 `toLocaleString('en-US')`,和全站 full-digit 规则统一。

## v0.74.10 — 2026-07-05

- **全站 grid + feed 地址/字号统一 (audit)**: owner "扫描所有 grid view 和 feed view 的 listing 都按照这个格式更改 保持统一"。 aligned 3 遗留 surface:
  - `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx`(community 全屏 feed):去 gradient scrim + 去 K/M 缩写,price 26px bold + 单行 `street, city, state zip` + specs 13px,与主 browse feed CaptionCard 完全对称
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`(社区 listing 列表卡):去两行 address,合并成 `street, city, state`(sheet 密度紧,不带 zip);specs 移到 address 前面
  - `app/(public)/a/[agentSlug]/page.tsx`(agent portfolio editorial grid):address 单行拼 city/state/zip(editorial 22/26px 字号保留 —— owner 74.4 特批)
- Zip 字段一并加进 `CommunityListingItem` 类型 + `c/[slug]/feed/page.tsx` supabase select + row-typing + mapper,以及 `/a/[agentSlug]` 的 `ListingCard` type + select

## v0.74.9 — 2026-07-05

- **Bottom sheet(点 more 弹的浮层)排版清理**:第二行 specs 和第三行 address 现在字号/粗细一致(15px regular),不再一个 medium 一个更粗;底部 "Listed by" 从 avatar chip 改成右下角单行链接 `Listed by <name>`,占位小很多。

## v0.74.8 — 2026-07-05

- **Feed folded caption 第二/三行 15px → 13px**: owner "feed里除了价格粗体 其他都正常 第二和第三行字体可以再小点跟description一样"。specs / address 从 `text-[15px] font-medium` → `text-[13px]`(去 medium),与 description preview 完全对齐。价格 26px bold 保留。Bottom sheet 内不动(sheet 有背景对比,15/17px 保持可读)。

## v0.74.7 — 2026-07-05

- **Grid caption revert to 11px + drop zip**: owner reviewed 74.6 手机截图,决定 grid 4-up 卡不装 zip,第三行字号回到 11px,和第二行(specs)一致。Feed swipe 卡 + bottom sheet 保留 zip(有横向空间)。`app/_components/GridCard.tsx` sub2 → `text-[11px] tracking-wide opacity-95`。`ListingGrid.formatFullAddress()` 拆掉 zip 分支,输出 `street, city, state`。DB 已核 11 条 active listing 全 zip 有值,feed 的 `${zip ? ' '+zip : ''}` 逻辑无需改。

## v0.74.6 — 2026-07-05

Grid 卡第三行地址字体 11 → 10px + `leading-tight`,让 `{street}, {city}, {state} {zip}` 完整地址在一行内 truncate,不再折行截字。

## v0.74.5 — 2026-07-05

Grid 卡第三行地址对齐 swipe feed:`1619 Tide Mill Road, Cumming, GA 30040` —— street 后加逗号,city 后逗号,state 后 zip。之前 grid 只显示 street,city 前当然没有逗号可看,是根源。`/browse`、`/saved`、`/nearby`、`/c/[slug]`、`/search` 五个入口一并对齐。

## v0.74.4 — 2026-07-05

Caption 层次:只有价格粗体,specs / 地址改 medium。地址加逗号 + zipcode:`1619 Tide Mill Road, Cumming, GA 30040`。原本 DB 一直有 zip 字段,只是 feed 层没拉,现在补上。

## v0.74.3 — 2026-07-05

### 🐛 Bug Fixes
- 横滑时顶部的计数(如 `3 / 8`)和分段进度条不再延迟 — 现在跟着手指实时走。影响两处:listing 卡片里的照片横滑,以及 community 视频轮播。

## v0.74.2 — 2026-07-05

Caption 微调:price 从 30px 降到 26px(不晃眼);address 和 city/state 合并成一行 `7920 NE 26th St Medina, WA`;新增 description 前 40 字符 preview + `… more` toggle,展开走 bottom sheet。

## v0.74.1 — 2026-07-05

Feed 上的 caption 从毛玻璃卡换成沉浸式 pure-text — 不再有边框、背景、阴影卡。第一行 `$8,750,000` 完整数字加粗(不再 `$8.75M`);第二行 `bd · ba · sqft`;第三行街道;第四行 city/state。文本靠双层 shadow 保对比度。

点 More ↑ 才弹浅色 bottom sheet:price / specs / address / About this home / Nearby / Listed by(纯 agent 名,不再硬编码 brokerage)。

## v0.74.0 — 2026-07-05
The listing caption on both photo and video swipes was redesigned for readability. Price, address, specs and the listing agent now sit on a floating frosted-glass card with larger, higher-contrast text — no more thin white text getting lost on bright rooms. Tap "More ↑" to open a light-cream bottom sheet with the full description, nearby schools and points of interest, and the agent card. The sheet slides over the media instead of covering it inline, so you can always see the photo or video underneath while reading. All text meets accessibility standards for size and contrast.

## v0.73.4 — 2026-07-05
Header pills in the community-video and community-listing carousels are 4px shorter (44px → 40px), a lighter touch on the visual weight. Left and right pills remain aligned.

## v0.73.3 — 2026-07-05
Two fixes: (1) The top-right counter pill in the community-video and community-listing carousels is now the same height (44px) as the top-left Back button — the header reads as a single aligned row instead of two mismatched pills. (2) The community-listing carousel's video is now tap-to-pause: tap once to pause (a play indicator appears in the center), tap again to resume. Swiping to a new card always autoplays fresh.

## v0.73.2 — 2026-07-05
Back button in the community-video and community-listing carousels is now a single line — "Back · <address>" instead of stacked "Back" over the address. Cleaner header, less visual noise.

## v0.73.1 — 2026-07-05
Community-video swipe now uses the same native iOS momentum-scroll physics as the photo swipe. Both swipes feel identical: your finger drags the track directly, hard flicks carry through multiple slides, and there's no mid-swipe stutter. Videos still auto-play/pause as they become active, and only the neighbouring three ever mount.

## v0.73.0 — 2026-07-05
Photo swipe stays on native iOS momentum-scroll but the mid-swipe stutter is fixed. Swipe is now debounced to scroll-settle (React tree stays still while your finger is moving), neighbouring photos preload one further, decode runs off the main thread, and every slide is on its own GPU layer. Same physics as before, without the frame drops.

## v0.72.8 — 2026-07-05
Photo swipe header re-aligned to match the community-video swipe layout: Back button top-left, counter pill top-right on the same row, dashed segmented progress on a second row below. Progress is now cumulative (fills as you swipe through) instead of a single-tick indicator.

## v0.72.7 — Smoother photo swipe (2026-07-05)

### ✨ Improved
- **Photo swipe no longer stalls halfway.** After releasing your finger the swipe used to slow to a fixed speed for the second half of the animation — now it just uses your phone's native momentum from start to finish, and hard flicks can carry through multiple photos.

## v0.72.6 — Native photo swipe (2026-07-05)

### ✨ Improved
- **Photo swipe now feels native.** The custom drag animation from v0.72.5 was replaced with the browser's own scroll physics — same technique Instagram, Airbnb, and Zillow use for their photo galleries. Momentum, edge bounce, and rubber-band all come from iOS/Android directly, so the motion matches every other swipe on your phone. Fewer moving parts under the hood, better feel on top.

## v0.72.5 — Photo swipe polish (2026-07-05)

### 🐛 Bug Fixes
- **Photo listings opened from the grid now show the photo counter and swipe correctly.** Some photo-only listings (like the Cumming home) had no counter and swiping did nothing when opened from `/browse`. The same listing opened via a share link worked — two different loaders were producing different card shapes. Now consistent everywhere.

### ✨ Improved
- **Redesigned photo counter.** The old "4 / 9   ← SWIPE →" pill in the top-left is replaced by a slim segmented progress bar across the top of the photo (one dash per photo, current one lit) plus a compact `04 / 09` counter in the top-right. Reads at a glance and matches the community-videos carousel style.
- **Photo swipe now feels alive.** The photo follows your finger as you drag, with a light rubber-band on the edges. Release with any decent flick — or drag past a quarter of the screen — and it snaps to the next photo; otherwise it springs back. First time you open a multi-photo listing, the stack does a quick shake to hint that it swipes.

## v0.72.2 — Your drafts are yours only (2026-07-05)

### 🔒 Fixed
- **Inactive neighborhoods are now visible only to their owner.** Previously any agent could see every other agent's unfinished drafts in the dashboard grid and in search. Now the dashboard grid shows all active neighborhoods plus the viewing agent's own inactive drafts — nothing else. Buyer-facing surfaces (`/communities`, `/browse`, community detail pages) are unchanged: still active-only.

## v0.71.6 — Upbeat home-tour BGM (2026-07-04)

### 🎵 Improved
- **Background music refresh.** The old cinematic-ambient library felt too moody for a house tour. Swapped in 10 lighter, upbeat tracks — think HGTV / lifestyle vlog rather than documentary: *Carefree*, *Cheery Monday*, *Wallpaper*, *Life of Riley*, *Cool Vibes*, *Bright Wish*, *Amazing Plan*, *Wholesome*, *Daily Beetle*, *Perspectives*.
- Still Kevin MacLeod / incompetech.com / CC-BY 4.0. Attribution owed on `vicinities.cc/legal` when that page ships.

## v0.71.5 — Fully text-free videos (2026-07-04)

### 🎨 Improved
- **Home tour videos now have zero text overlays anywhere.** The photo speaks for itself — no price, address, or specs painted onto any frame. Same photos + same Ken Burns motion + same random BGM, just clean.

## v0.71.4 — Clean opener frame (2026-07-04)

### 🎨 Improved
- The **first photo of every home tour is now text-free** — no price, address, or specs overlaid on the opening shot. Overlays now start on photo 2 and continue on photo 3, so the video hooks the viewer with a clean visual before any listing info appears.

## v0.71.3 — Real-photo endings + random BGM library (2026-07-04)

### 🎨 Improved
- Home tour videos now **end on the last real listing photo** instead of a dark "V · Vicinity" ending card. Real photos in, real photos out — no synthetic frame at the tail.
- Every generated video is scored with a **randomly-selected background music track** from a 10-track library (Kevin MacLeod / incompetech.com, CC-BY 4.0). Two videos of the same listing will typically pick different tracks so a rapid-fire demo doesn't feel repetitive. If the BGM library is missing the worker still produces a valid silent video.

### 🧹 Chores
- Removed the "DEMO — NOT A REAL LISTING" banner code path from `generate.py`. The render worker never triggered it (mock listings were already deleted in v0.71.2), but the code and copy are now gone entirely.
- Added `scripts/render-worker/bgm/fetch.sh` — idempotent script to pull the 10-track library on any host; files are gitignored (~120MB total) and refetched on demand.
- BGM attribution ("Music by Kevin MacLeod, incompetech.com, CC-BY 4.0") to be added to `vicinities.cc/legal` in a follow-up.

## v0.71.2 — Ken Burns: full-photo composition, no more center-crop (2026-07-04)

### 🎨 Improved
- Home tour videos now show the **entire listing photo** instead of cropping the center 40%. Previously landscape source photos (1920×1280) were force-cropped to 1080×1920 and then zoomed in by 1.5×, leaving only the middle at low effective resolution — users complained the videos looked pixelated and zoomed-in.
- New composition: the source photo is placed inside a blurred, dimmed version of itself (TikTok/Reels style). The full photo is always visible; the blurred backdrop fills the vertical canvas without black bars. Ken Burns pan/zoom is retained but reduced from 1.5× to 1.10× so most of the photo stays in frame throughout each clip.
- Foreground has a 150px alpha fade at top and bottom so it blends into the blurred backdrop instead of showing a hard seam.

### 🧹 Chores
- Deleted the 10 `mock-atlanta-*` demo listings and their `pending://render` / `public/demo/*.mp4` walkthroughs. Meetup demos will use real listings only.

## v0.71.1 — Render worker hotfix + first live E2E (2026-07-04)

### 🔧 Fixed
- Render worker was passing `--input-dir` to the Ken Burns generator, which expects `--photos`. First real click failed with "arguments are required: --photos"; the fix and a requeue produced the first end-to-end job: 8 photos → 24s / 4.7 MB → Cloudflare Stream `884c7a5c…`, `listing_videos.status='ready'`.

## v0.71.0 — Agents can now generate a home tour video from listing photos (2026-07-05)

### 🚀 Features
- **Generate home tour video** button on the listing edit page (Media tab) is now live. One click turns the listing's photos into a 30-second Ken Burns walkthrough with price, beds/baths, and address overlays on the first three clips, plus the standard Vicinity ending card. Rendering runs off-page on the render box and takes about two minutes end-to-end; the button shows queued → rendering → done inline.
- Requires at least 3 photos on the listing. If a walkthrough was already generated, clicking again re-renders and replaces the previous version.

### 🔧 Under the hood
- New `render_jobs` queue table + Python render worker (`scripts/render-worker/worker.py`) that polls the queue, downloads photos from Supabase Storage, runs the Ken Burns generator, uploads the MP4 to Cloudflare Stream, and attaches it as a `listing_videos` walkthrough row. Ships with a systemd unit template for the EC2 render box.

## v0.70.7 — 10 mock listings now live in the buyer swipe feed (2026-07-04)

### ✨ Improvements
- **Buyer swipe feed**: the 10 Atlanta mock listings ($389k–$3.25M) can now be seeded into a logged-in agent's account with one click at `/internal/seed-mock-listings`. Buyers see them in `/browse` grid + `/browse/feed` swipe with real 24-second Ken Burns videos, all 10 photos, price/beds/baths, and address.
- **Video source flexibility**: `listing_videos` now supports either a Cloudflare Stream ID **or** an external mp4 URL, so the same swipe player works for both stock demo videos and future MLS-generated content.

### 🔧 Under the hood
- New migration `20260704120000_listing_video_external_url.sql`: `cf_video_id` nullable + `external_url text` + CHECK "at least one source".
- Player now branches on `externalUrl` — mp4 direct, no HLS.

## v0.70.6 — Every mock listing now has its own video + full 10-photo grid (2026-07-04)

### ✨ Improvements
- **Autofill demo**: all 10 mock listings now play their own 24-second Ken Burns video with the correct price, beds/baths, and address in the overlay. No more single-flagship placeholder — every listing plays.
- **Photo grid**: expanded from 5 photos to 9 (3×3). Combined with the hero photo above, agents see all 10 photos per listing.
- **Photo variety**: mock photos now drawn from six room-type Unsplash pools (exterior/living/kitchen/bedroom/bathroom/backyard) so each listing shows a plausible home tour instead of repeated stock shots.

## v0.70.5 — Per-listing video generation pipeline (2026-07-04)

### ✨ Improvements
- **Autofill demo**: the flagship Buckhead listing ($1,895,000 · 3520 Peachtree Rd NE) now shows a real 24-second Ken Burns video at the top of the result card — exterior → living → kitchen → bedroom → bathroom → backyard, with a subtle price/beds/baths overlay on the first 3 clips only.
- **Other 14 listings**: show a "Video generating…" placeholder over the first photo, so the demo honestly conveys "the pipeline is running, this listing's video is queued" instead of pretending every home has a finished reel.
- **Ken Burns generator**: extended with a `--listing-overlay` flag so future auto-generated videos can imprint listing metadata without touching the ending card.

## v0.70.4 — Demo video embedded on the meetup docs hub (2026-07-04)

### ✨ Improvements
- The 24-second Ken Burns slideshow now plays inline at the top of the internal docs hub. Tap to preview on any phone; there's a Download MP4 link right below.
- The video URL is public — anyone the link is shared with can view. That's called out on the page so nothing is hidden.

## v0.70.3 — Back link on the live demo page (2026-07-04)

### ✨ Improvements
- **Live autofill demo**: added a small "← Back to Vicinity for Agents" link at the top of the demo page. Agents who tap "See a demo" from the agent landing page (or land on the demo directly from a shared link) can now get back to the sign-up page without hitting browser-back.

## v0.70.2 — More Atlanta neighborhoods in the live demo (2026-07-04)

### ✨ Improvements
- **Live autofill demo**: added Old Fourth Ward, Grant Park, Inman Park, Decatur, and East Atlanta Village to the demo listings. Agents typing those neighborhood names on stage will now see relevant homes come up instead of an empty result.

## v0.70.1 — Small polish on the agent landing page (2026-07-04)

### ✨ Improvements
- **Agent landing page**: added a small "Curious first? See a demo →" link right under the main sign-up button. Agents scanning the QR at the meetup can now peek at the live autofill demo before deciding whether to join the waitlist.

## v0.70.0 — Agent waitlist, live autofill demo, and in-site doc reader (2026-07-04)

### 🚀 Features
- **Agent waitlist page** at `vicinities.cc/agents` — a landing page for real-estate agents to sign up. Explains what Vicinity does for agents and captures name/brokerage/email/phone/city into a waitlist. Prep for the Keller Williams Atlanta meetup this Tuesday — hand out the QR, agents scan, they're on the list.
- **Live autofill demo** at `vicinities.cc/demo/autofill` — type any Atlanta address and watch it auto-populate a listing card. Backed by 10 curated Atlanta listings across Buckhead, Midtown, West End and Sandy Springs. Marked with a DEMO banner so nobody mistakes it for a real MLS search.
- **In-site doc reader** at `vicinities.cc/internal/meetup` — the whole meetup packet (pitch scripts, Q&A playbook, discovery questions, one-pager) is now readable from a phone browser. Not indexed by search engines; the URL is unlisted and only shared with people who need it.

### ✨ Improvements
- **Behind the scenes**: pipeline for pulling real Atlanta listings from FMLS via Bridge is scaffolded. Waiting on brokerage paperwork; when that lands we flip a switch and `/demo/autofill` starts hitting real data.
- **Slideshow generator**: internal tool that turns 6–8 listing photos into a 24-second Ken Burns-style vertical video with music and an ending card. Used to make the demo we're bringing to Tuesday's meetup.

### 🐛 Bug Fixes
- Slideshow ending card no longer renders empty space where the wordmark and call-to-action should be.

### ⚠️ Known Issues
- The waitlist admin view under `/dashboard/agents/waitlist` is intentionally minimalist — it lists rows with links, no filtering. That's enough for meetup follow-up.
- `/demo/autofill` results are curated demo data, not live MLS. This is deliberate for the pitch and clearly labelled.

## v0.69.1 — Share button also moved on the neighborhood-videos carousel (2026-07-04)

### 🐛 Bug Fixes
- **Nearby-videos carousel** (opens when you tap the neighborhood button on a listing card in the browse feed): the Share button was still in the top-right corner. It's now at the bottom of the right-side action stack, matching every other feed on the site.

## v0.69.0 — Share button lives with the other rail buttons on every feed (2026-07-04)

### ✨ Improvements
- **Community feed** (`/c/[slug]`): the Share button in the top-right corner is gone. It now sits at the bottom of the right-side action stack, matching the browse feed. Outbound-social actions live in one column instead of scattered across two corners.
- **Every feed's action stack now hugs the bottom of the frame** at the same tight margin the browse feed has been using. The community feed and neighborhood-listing carousel used to float their action buttons about a thumb-length above the bottom edge; they now sit low, right above the phone's home indicator, matching the browse feed.
- No visual changes to the browse feed itself — it was already the reference design.

## v0.68.4b — All feed pages share the same right-rail design (2026-07-03)

### ✨ Improvements
- **Community feed** (`/c/[slug]`) now uses the same circular-button rail as the browse feed. The "🏠 Live here" pill in the top-left is replaced by a 🏠 button at the top of the right stack with a red count badge showing how many homes are in this neighborhood.
- **Listing feed** (`/v/[agent]/[listing]`) inherits the same design automatically.
- All three feed pages now speak with one visual voice — top of stack = "explore this collection", the rest = social actions.

## v0.68.4 — Neighborhood button matches the other rail buttons now (2026-07-03)

### ✨ Improvements
- **Neighborhood button is now a circle**, same size and style as Like/Save/Contact/Share, sitting at the top of the right-side action stack.
- 🏘️ icon with a **red count badge** — reads at a glance as "N videos of this neighborhood, tap to explore".
- No more text label on the pill; the whole right column reads as one clean icon stack.

## v0.68.3 — Fix: neighborhood pill was covering the Like button (2026-07-03)

### 🐛 Fixes
- **Neighborhood pill no longer overlaps the Like button** — the pill was sitting on top of the heart. Corrected the vertical offset so the pill floats cleanly above the four action buttons.
- **Full neighborhood names show** — no more "Peacht..." ellipsis. The pill now expands leftward to fit whatever the community is called.

## v0.68.2 — Neighborhood pill: two lines, tucked right above the buttons (2026-07-03)

### ✨ Improvements
- **Compact two-line pill** — 🏘️ + count on top, neighborhood name below. No more one-line-too-long overflow.
- **Sits directly on top of Like/Save/Contact/Share** — reads as one continuous vertical column on the right edge.
- Removed the animated dot; the red count badge is enough of a "there's more here" hook.

### 🎯 Why
Third pass on 笑云's testing — first two rounds found the button but "一行太长了". Two-line stack keeps the neighborhood name readable while shrinking the horizontal footprint.

## v0.68.1 — Right-side layout tuned: rail hugs the bottom, neighborhood chip sits mid-height (2026-07-03)

### ✨ Improvements
- **Like / Save / Contact / Share now sit at the bottom-right**, one continuous stack with the last button hugging the bottom edge — thumb-friendly and out of the way of the video.
- **Neighborhood pill moved to the right-middle**, slightly above center, with clear space between it and the buttons below. Its video count is now a **red badge** so it reads at a glance as "there's more here".

### 🎯 Why
Continued follow-up on 笑云's testing — position + color together should make the chip impossible to miss, and the right column now reads as one clean vertical: neighborhood → actions.

## v0.68.0 — Neighborhood button moved to the right side (2026-07-03)

### ✨ Improvements
- **Neighborhood button is now on the right**, above the Like / Save / Contact / Share column, so it sits with the other action buttons instead of tucked away in the top-left corner. It's the same neighborhood pill you'd expect — with the neighborhood name and a small number showing how many videos are one tap away.
- **Share moved into the right column too**, at the bottom, so social actions all live in one place.

### 🎯 Why
Buyers testing the app told us the old top-left neighborhood button was easy to miss. Right side + a video count makes it obvious that tapping it opens more videos of the same neighborhood.

## v0.67.0 — Me page collapsed to essentials (2026-07-03)

### ✨ Improvements
- **Me** page for signed-in buyers is now just profile photo, name, email — plus two buttons: **Change password** and **Sign out**. The redundant "Signed in" label, "Explore listings" button, and account settings info card are gone.
- **Me** page for signed-in agents shows two clean stacks: **Public profile** and **View analytics** on top; **Change password** and **Sign out** at the bottom. Same actions as before, just less clutter.
- **"Change avatar"** renamed to **"Change profile photo"** — clearer wording.
- The signed-out Me page is unchanged.

## v0.66.1 — Cleaner Me page (2026-07-02)

### ✨ Improvements
- Nearby radius preference removed from the **Me** page — it was left over from before Nearby was retired.
- **Sign out** is now visually separated from the other buttons (View public profile / Analytics / Explore) so it doesn't sit in the same stack as your primary actions.
- Password change copy on **Me** rewritten — instead of "Forgot password" (which reads oddly when you're already signed in), it now says "To change your password we'll email you a reset link · Send password reset email".

## v0.66.0 — Fewer distractions, "Neighborhood" everywhere (2026-07-02)

### ✨ Improvements
- **For You** and **Neighborhood** tabs no longer show the Nearby sub-tab — the top of the page is now just a clean "Explore" title, one less thing to think about.
- **"Community"** is renamed to **"Neighborhood"** across the whole app (bottom nav, buttons, page titles, empty states, favorites, agent hub, leads, upload flow). Same feature, name that reads better to buyers.
- **Analytics** moved out of the Agent Hub top tabs and onto the **Me** page — one less tab in the way while working on listings and neighborhoods. Same page and data underneath.

### ⚠️ Known Issues
- MLS auto-populate for listing details is coming next — right now agents still have to type listing fields manually.

## v0.72.2 — Explore community page back link (2026-06-27)

- The buyer-facing community page (`/c/<slug>`, reached from Explore → Community grid) now shows a top-left "← Back" chip in the hero, matching the dashboard style. Tapping it returns to the Explore community grid.

## v0.72.1 — Hero back link matches Preview style (2026-06-27)

- The hero "← Back" chip now uses the same chromeless / frosted-glass-on-hover style as the Preview link, so the top row reads as one consistent control bar.

## v0.72.0 — Hero "← Back" on listing/community detail (2026-06-27)

- The listing and community detail pages now show a "← Back" chip in the top-left of the hero image. Tapping it returns you to the grid view (My listings / My communities) so you can browse to the next item without using the browser back button.

## v0.71.2 — Lead detail back link is just "← Back" (2026-06-27)

- The lead detail back link now reads "← Back" everywhere instead of mirroring the destination ("← All leads" / "← Back to {address}"). Destination still follows where you came from — only the label changed.

## v0.71.1 — Lead detail back link follows where you came from (2026-06-27)

- **Back link** on a lead detail page now reflects the page you arrived from, not where the data lives. Open a lead from **My Leads** → "← All leads" sends you back to the inbox. Open a lead from a listing's **Leads** tab → "← Back to {address}" sends you back to that listing's Leads tab. Same lead, two paths, two correct destinations.

## v0.71.0 — Lead detail goes back to where you came from (2026-06-27)

- **Back link on a lead detail page** is now source-aware. A listing lead sends you back to *that listing's* edit hub, not the global inbox. A community lead sends you back to *that community*. No more losing your place when you triage one lead and want to handle the next on the same listing.
- **Per-listing leads panel** (inside the listing edit hub) drops the "See all leads →" cross-link — the panel scope is the listing, and the global inbox is one nav-rail click away.

## v0.70.0 — Clickable lead rows + listing-level inbox parity (2026-06-27)

- **Click anywhere on a lead row** to open it — not just the name. Email / SMS icons and the ✓ Mark toggle still do their own thing without navigating away. Cmd-click / middle-click still open in a new tab.
- **Source column** is now a clean type enum: **Listing** or **Community**. The community name moved into the Listing column for community leads, so a single glance tells you both *what kind* of lead and *which* listing or community it came from.
- **Per-listing leads panel** (inside the listing edit hub) now uses the same table pattern as the main inbox — column headers, clickable rows, Email/SMS icon buttons. No more dual UIs to learn.

## v0.69.0 — Lead inbox table + dual contact fields (2026-06-27)

- **My Leads is now a real table**: column headers (Name · Listing · Contact · Source · Received), per-row listing address, per-row source — community leads show the community name instead of the literal "community-feed" tag.
- **Contact column** has separate Email and SMS icons; each lights up only if the lead actually shared that channel. Both auto-mark the row as followed-up when clicked.
- **Buyer contact form** now has two fields (Email / Phone) instead of one combined textbox. Either alone is fine; both together is fine; the form makes that explicit.
- **CSV export** adds `kind` (listing/community) and `community` columns.

## v0.68.0 — "Mark as followed up" actually sticks (2026-06-27)

### 🐛 Bug Fixes
- On **My Leads**, clicking the ✓ "Mark as followed up" icon (or the
  toggle on the lead detail page) used to flip the row briefly and then
  snap back to unfollowed-up — the change never actually saved. It now
  saves and stays followed up across reloads.
- Also fixes the same revert when using the Email or Text icons, which
  auto-mark a lead as followed up after you contact the buyer.

## v0.67.0 — Videos always show the full picture (letterbox over crop) (2026-06-26)

### 🛠 Fixes
- All listing/community video feeds now show the **complete picture** of
  every video. Landscape walkthroughs play landscape with thin black
  bars on top/bottom rather than getting cropped to fit the portrait
  frame. Portrait videos still fill the screen as before.
- This is a project-wide principle now, not just one feed: For You,
  community video feed, and the Live-here listing carousel all behave
  the same way.

## v0.66.0 — Listing carousel videos fill the frame on mobile (no more letterbox) (2026-06-26)

### 🛠 Fixes
- The Live-here listing carousel was showing landscape walkthrough
  videos with black bars on top and bottom, making them look smaller /
  cropped than the same video in the community feed. Mobile now fills
  the 9:16 frame edge-to-edge (same behavior as the community video
  feed). Desktop keeps the full aspect inside the bordered viewport.

## v0.65.0 — Share button on the L3 listing carousel; horizontal-pager bar removed (2026-06-26)

### ✨ Improvements
- The listing-by-listing view you reach from a community's **Live here**
  chip now has a **Share** button on the right rail. Tap it to send a
  link straight to a friend (uses your phone's native share sheet on
  iOS / Android, falls back to copying the link to your clipboard on
  desktop). Hidden on the rare community where the listing's owner
  can't be resolved.
- Removed the segmented progress bar across the top. Those ticks are
  the convention for left/right swiping; this surface scrolls up/down
  now, so the bar was misleading. The "i / N" counter at the top
  still tells you where you are in the stack.

### 🛠 Fixes
- (No bug fixes in this release.)

## v0.64.0 — Listings from a community now swipe up/down with Like / Save / Contact (2026-06-26)

### ✨ Improvements
- Tap **Live here** on a community feed and the listings now swipe up and down
  (vertical) instead of left/right — same gesture as the rest of the app.
- Right-side buttons (**Like**, **Save**, **Contact**) now show on every
  listing in this view too, matching the For You feed and the community
  video feed. Like/Save remember your taps across sessions; Contact opens
  a lead form addressed to the community's agent.

## v0.63.0 — Listing description "more" can actually expand now (2026-06-26)

### 🐛 Bug Fixes
- On the buyer feed, the description at the bottom of each listing card now
  expands when you tap "more". Before, "more" was visible but tapping it
  did nothing — the button was being hidden behind the same two-line clip
  that hid the rest of the description.

## v0.62.0 — Photo cover on a video listing now shows up in the grid (2026-06-26)

### 🐛 Bug Fixes
- If your listing has both photos and a video, picking a *photo* as the
  cover now actually shows that photo on the For You grid, Saved, Nearby,
  Search, and community pages. Before, video listings always showed the
  first video's still as the thumbnail, no matter which photo you set as
  cover. Tapping the card still enters the video swipe — only the
  thumbnail switches.

## v0.61.0 — Set Cover now shows up everywhere (2026-06-26)

### 🐛 Bug Fixes
- Picking a cover photo or cover video on a listing now actually changes
  the cover that buyers see on the home grid, the swipe feed, and the
  saved-listings page — not just the agent's own dashboard. Before, the
  cover only updated for you; buyers kept seeing whatever was uploaded
  first.

## v0.60.1 — Reverted: community State/City/County dropdowns (2026-06-26)

### 🔧 Technical
- Reverted v0.60.0. The dropdown suggestion lists (especially for City)
  were too long to be useful — picking out one community from a 1500+
  row list is slower than just typing it. Back to the free-text inputs.

## v0.59.3 — Buyer empty-state copy: passive voice (2026-06-26)

### ✨ Improvements
- Reworded the For You and Communities empty states to avoid mentioning
  agents directly: "New tours will be uploaded soon — check back later."
  and "New neighborhoods will be added soon — check back later."

## v0.59.2 — Friendlier empty states on For You and Communities (2026-06-26)

### ✨ Improvements
- The buyer-side "No listings yet" (For You) and "No communities yet"
  (Communities) pages now use the same icon-disc + headline + subhead
  card as the agent-side My Listing and My Community empty states, so
  all four list surfaces feel consistent. No CTA on the buyer side —
  buyers don't create listings or communities — but the page no longer
  reads as a stray sentence on a blank background.

## v0.59.1 — Friendlier empty states for My Listing and My Community (2026-06-26)

### ✨ Improvements
- The "No listings yet" and "No communities yet" pages now share the same
  visual treatment: a small icon, a one-line headline, a one-line subhead,
  and a single primary "+ New listing" / "+ New community" pill button so
  the agent has a clear next step without hunting for the floating ➕.
  Previously the two pages used different copy, different layouts, and
  My Listing had no in-page CTA at all.

## v0.59.0 — Listings with leads can now be deleted (2026-06-26)

### 🐛 Bug Fixes
- Fixed a server error that prevented deleting any listing that had ever
  received a buyer lead. The Danger zone "Delete this listing" button now
  works for listings with leads — leads attached to the deleted listing
  are removed alongside it, matching what the confirmation copy already
  promised.

## v0.58.0 — Real listings show real media (2026-06-24)

### 🔧 Technical
- Removed the pre-launch curated-stock media override. Listings now show
  the agent's actual photos and videos exclusively — no more substitution
  with luxury stock imagery. The "Stock" badge that flagged stock-overridden
  cards is gone (no cards show stock anymore). Internal: deletes
  `NEXT_PUBLIC_DEMO_MEDIA` flag and the Unsplash/Pexels remote-image
  allow-list.

## v0.57.2 — Site-wide responsiveness boost (2026-06-24)

**✨ Improvements**

- Every page across the site (dashboard, public, auth) now loads roughly
  150–300ms faster. The auth check on each render no longer makes a network
  round-trip to validate your session — it reads the local cookie instead.
  Most noticeable on the dashboard, where every navigation previously did
  this twice (once for the page, once for the nav chrome).

## v0.57.1 — Communities loads instantly on repeat visits (2026-06-24)

**✨ Improvements**

- The dashboard Communities page now loads in milliseconds on repeat visits
  (within a 60-second window). The first visit after a change is still fast
  (~270ms server time, down from ~420ms). The cache automatically refreshes
  whenever you create, edit, publish, or archive a community or listing —
  you'll never see stale data after your own actions.

## v0.57.0 — Faster Communities navigation (2026-06-24)

**✨ Improvements**

- Clicking **Communities** from the dashboard now feels instant. A skeleton
  grid appears immediately on click instead of the page freezing while data
  loads.
- The communities grid itself loads faster — the underlying data fetches
  now run in parallel waves instead of one after another, cutting the
  server-side wait roughly in half.

**🔧 Technical**

- Added `loading.tsx` for `/dashboard/communities` so navigation paints a
  skeleton in <100ms.
- Reworked `fetchCommunityListCards` from 5 sequential Supabase round-trips
  into 2 parallel waves.

**Known limits.** Other surfaces (listings dashboard, public communities,
browse) still use the old pattern — they'll be addressed in a follow-up if
the change here is confirmed to feel right.

## v0.56.1 — Save button always enabled; dead upload-prefill code removed (2026-06-24)

**UX fix.** The Save button on listing edit and community edit was disabled
whenever the form was "clean" (no unsaved changes), which read as broken
to agents. Save now stays enabled at all times — clicking it always flushes
the current state to the server, even if there's nothing pending. Auto-save
behaviour is unchanged.

**Cleanup.** With the FAB → ?prefill=… upload handoff gone (Phase 52 removed
that entry path), the supporting plumbing was dead weight. Pruned in this
release:

- `app/_components/upload-prefill-store.ts` (whole file)
- `app/_components/upload-status-store.ts` (whole file)
- `app/dashboard/communities/[id]/PrefillUploadBanner.tsx` (whole file)
- The `prefillFiles` / `onUploadResolved` props on `PhotoPanel` and
  `CommunityPhotoPanel`, plus the `prefillId` option on `createCommunity`
- The prefill consumer block in `CommunityMediaPanel` (the `?prefill=…`
  query-string + `useSearchParams` glue)

No user-visible change beyond the Save-button behaviour above; the upload
button on each Media tab is the only remaining entry.

## v0.56.0 — One-tap listing/community create; address moves into the edit page (2026-06-24)

**Faster create flow for selling agents.** The FAB now stubs a listing or
community immediately and drops you on its edit page — no separate "new"
form to fill out before you can see anything. Pick **Listing** or
**Community** and you land on the hub with every field laid out: address,
photos, video, price, beds/baths, description, marketing, leads. Fill
them in any order; auto-save handles persistence.

**What's new on the edit page**

- New listings open with a **Set the address** card on the Details tab.
  Pick an address from the Google Places autocomplete and the slug
  (the public `/v/<agent>/<slug>` URL) gets generated from the real
  address — no more pre-committing to address + price before you've
  even seen the editor.
- Until the address is set, the listing is marked **Draft** in your
  dashboard grid and the Media / Marketing / Leads / Analytics tabs
  show a "Set an address to unlock" notice. This avoids accidentally
  loading photos against a placeholder URL.
- Publishing is gated as before — address, price, beds, baths, and at
  least one ready photo or video are still required to flip the listing
  to Active. Draft listings cannot be published until an address is set.

**What's gone**

- The dedicated `/dashboard/listings/new` page (address + price + beds +
  baths + sqft up front) has been retired. Those fields all live on the
  edit page now.
- The FAB no longer asks for "from album" vs "from camera" before
  starting. Just pick what you're creating; upload media on the Media
  tab when you're ready.

## v0.55.2 — Auto-save now silent; Save button feedback only on click (2026-06-24)

### 🛠 Behavior change
- **Auto-save no longer flashes "Saving… / ✓ Saved" while you type.** It still runs in the background every 600ms after your last edit — your work is still being persisted continuously — but the inline status text only appears when you explicitly click the Save button. Applies to both the listing editor and the community editor. (qiaoxux: "auto save doesn't need to click the save button effect and show the saved hint, only users click the save button, then do that".)
- **Save button enable rule unchanged in spirit:** disabled when there are no unsaved edits, enabled the moment you change anything, disabled again once a save (auto or explicit) finishes successfully.

## v0.55.1 — Listing Save button moved to bottom (2026-06-24)

### ✨ Improvements
- **Save button on the listing editor moved from the top to the bottom of the form**, matching the community editor layout. After hitting Save you'll see a "✓ Saved" confirmation appear next to the button. (qiaoxux: "move the save button to the end of the inputs. Similar to my community page!")

## v0.55.0 — Save button on the listing editor + auto-save on community editor (2026-06-24)

**For listing agents who edit listings or communities from the hub:**

### ✨ Improvements
- **The listing editor now has a Save button.** Edits still save automatically as you type (no change there) — but the new Save button gives you an instant "save right now" option whenever you want explicit confirmation, instead of waiting for the auto-save to round-trip. (qiaoxux: "my listing details page should have a save button similar to my community page".)
- **The community editor now auto-saves as you type.** Same 600ms debounce as the listing editor — start typing, see "Saving… → ✓ Saved" feedback in line. The Save button is still there as an explicit "save right now" escape hatch; it's no longer the only way to persist your edits.
- **Cleaner status row on the community editor.** Removed the "No unsaved changes" text label — the Save button greying out is enough signal, the extra phrase was clutter.
- **Renamed "Save changes" → "Save"** on the community editor for parity with the new listing button.

## v0.54.20 — Hotfix: community stub creation + Danger zone color (2026-06-24)

**For agents creating a new community / staring at "Could not create — please retry.":**

### 🐛 Fixes
- **"Upload as Community" no longer fails with `Could not create — please retry.`** Phase 50.17's stub insert tried to set `status='draft'`, but the `communities.status` CHECK constraint added in migration 0030 only allows `active`/`inactive` — so every stub creation got rejected by the database, which in turn broke video prefill and photo uploads (the whole flow chain depended on the stub row existing). Stubs now insert with `status='inactive'` (still hidden from the public grid, since that filters on `status='active'`), and the agent can flip the InstantStatusToggle to active once the metadata is filled in. (qiaoxux: "video upload is not prefilled" / "photos can not be uploaded" — same root cause.)
- **Danger zone now actually looks dangerous.** The "Delete this community" / "Delete this listing" warning blocks were drawn with `bg-rose-50/40` (40% opacity over the cream surface) and `border-rose-300/60`, which faded out into the background. Bumped to a fully opaque `bg-rose-50` and a stronger `border-rose-400` on both surfaces so destructive intent reads at a glance. (qiaoxux: "danger zone color is fainted".)

## v0.54.19 — Folded "New community" into the community hub (2026-06-23)

**For agents creating a new community:**

### ✨ Improvements
- **One-step community creation from the home upload button.** Tapping the upload FAB → picking a video/photo → "Upload as Community" used to land you on a separate `/communities/new` form first. Now it lands you directly on the new community's Hub at the **Details** tab, with the queued media auto-uploading in the background. A blue progress banner at the top of Details tells you "Uploading your N files…", flipping to "Uploaded N files to your Media tab" when done.
- **Empty-state "Create one" button.** The `/dashboard/communities` empty page link is now a real button that creates a stub community in one click and drops you in the hub — same flow as the FAB so there's only one mental model.
- **Renaming is now the first thing.** You land on Details with the community sitting at "Untitled community" — type the real name, save, and the URL slug auto-rewrites. Until you save a name, the community stays as a hidden draft (not visible on the public communities grid).

### 🧹 Cleanup
- Removed the standalone `/dashboard/communities/new` page and its dedicated form. Two creation paths collapsed into one (Hub Details + auto-upload Media).

### 🐛 Fixes folded in
- The "first click on Create doesn't navigate" bug from the old `/new` form is gone — there's no form to submit. Click → stub created → navigate, every time.
- The video prefill that broke twice this week is now structurally impossible: the Media tab is mounted alongside Details from the moment the page renders (display:none toggling), so the queued File[] gets consumed on mount no matter which tab you're looking at.

## v0.54.18 — Community hub: solid Danger Zone + working video prefill (2026-06-23)

**For agents managing their communities:**

### 🐛 Bug Fixes
- **Danger Zone (community Details tab) is now actually red.** Previously the box used a faded translucent red on a translucent border — it read as decorative, not destructive. Now it matches the listing Danger Zone: solid rose card with a solid rose-600 "Delete this community" button, so accidentally clicking it requires intent.
- **Video files queued from the home upload button now prefill into the community Media tab.** Picking a video → "Upload as Community" → creating a community used to land on the Media tab with the file silently dropped (only photos prefilled). Videos now show up as a pending uploader the moment the page lands, same as on the listing side.

## v0.54.17 — Community marketing: drop redundant panel title (2026-06-23)

### ✨ Improvements
- The community marketing copy panel no longer shows a "Community marketing copy" heading — the surrounding context already makes it clear, the heading was redundant chrome.

## v0.54.16 — Community upload: prune the dead /upload page (2026-06-23)

**For anyone uploading media to a community:**

### 🧹 Cleanup
- **Deleted the standalone "Upload media" page.** Everything lives on the community Media tab now — picking the category and dropping files into one Click-to-upload happens in the same card. Old `/upload`, `/photos`, `/videos` URLs still work; they redirect to `?tab=media` so any bookmarked link or link from a chat agent still lands on the right place.
- **Internal:** removed `CommunityUploadShell`, `CommunityUploadPrefillBridge`, and `CommunityVideoPanel` — all unreferenced after Phase 50.12.

## v0.54.15 — Login wordmark: ink, not gold (2026-06-23)

**For anyone visiting the login / signup / forgot-password pages (and the dashboard top-bar):**

### ✨ Improvements
- **Top-left "VICINITY" wordmark switched from gold to ink.** Auth and dashboard surfaces don't use any other gold accent — every other text, button, and link on the page is the same ink color — so the gold corner mark stuck out. Now matches the `Login` heading, the `Continue` button, and the `Sign up` link. Landing-page hero eyebrow keeps its gold (different surface, dark video background — that's where the gold actually earns its keep).

## v0.54.14 — Login page wordmark: cleaner corner mark (2026-06-23)

**For anyone visiting the login / signup / forgot-password pages:**

### ✨ Improvements
- **Top-left "VICINITY" wordmark no longer hovers into a tiny gold-bordered button.** It's now flat tracked caps — same look as the hero eyebrow on the landing page — and the link behavior is unchanged (still routes to home). Hover dims slightly; focus draws a subtle underline for keyboard users. No more CTA-style box in the auth-page corner.

## v0.54.13 — Community upload polish: lighter buttons, no more legacy page (2026-06-23)

**For agents uploading videos to a community:**

### 🐞 Fixes
- **Start upload / Upload another buttons no longer turn near-black** in the cream theme. They now use the same outlined cream-and-ink style as the rest of the dashboard, matching the `Click to upload` button visually.
- **The upload FAB and the community Media tab now land on the same screen.** Picking files from the bottom-sheet FAB → "Upload as Community" → New community used to drop you onto the legacy `/upload` page (Address field, separate Category callout). Now it lands directly on the new hub **Media** tab — same one-card layout your listings already use, queued files auto-flow into the single Click-to-upload path.
- **Old `/upload` and `/photos` and `/videos` URLs still work** — they redirect to `?tab=media` so any saved bookmarks, agent crash-recovery URLs, or in-flight FAB redirects keep landing on the right screen.

## v0.54.12 — Community Media: trim category card to one line (2026-06-23)

**For agents on `/dashboard/communities/[id]` → Media tab:**

### ✨ Improvements
- **Category card stripped to just the description** — dropped the redundant label (already shown in the dropdown), the "Must include" rule line, and the "Applies to videos and photos uploaded next" help paragraph. Now it's a single short line of guidance under the dropdown.

## v0.54.11 — Community Media: dropdown + Upload truly side by side (2026-06-23)

**For agents on `/dashboard/communities/[id]` → Media tab:**

### 🐛 Bug Fixes
- **Side-by-side row was visually still stacked** in v0.54.10: the Category column included the tall "spec card" (label + blurb + must-include rule), so it towered over the small Upload button. Now only the dropdown sits on the row with Upload — the spec card moves to a separate full-width band below.

## v0.54.10 — Community Media: side-by-side controls + video descriptions (2026-06-23)

**For agents on `/dashboard/communities/[id]` → Media tab:**

### ✨ Improvements
- **Category and Upload sit side by side** at the top of the Media tab — no more vertical hop between picking a tag and picking a file.
- **Video descriptions**: each video row now has a free-text caption you can click to add or edit (Enter to save, Esc to cancel). Up to 280 characters. Useful for context like "filmed at golden hour from the corner of Main & 3rd."

### ✂️ Removed
- **Yellow "needs review" pill** on video rows. The flag's still tracked under the hood, but the manage UI doesn't surface it — re-tagging an existing video would need its own control to come back, and the description editor is more useful in that slot.

## v0.54.9 — Community editor cleanup: simpler form, official property types (2026-06-23)

**For agents on `/dashboard/communities/[id]`:**

- **The form is flatter.** "Identity / Location / Pitch / Property /
  Contact" section headings are gone. Just fields, top to bottom.
- **City and ZIP are now required.** A community without a ZIP can't be
  placed on a map; the form will block save until both are filled.
- **Year built is two dropdowns.** Pick a start year, optionally pick an
  end year for phased deliveries. The "Type a year…" escape hatch and
  the "+ Add end year" toggle are gone — both are just dropdowns now.
- **Price is two inputs.** From / To, both optional, both with `$`
  prefix. The "+ Add max price" toggle is gone.
- **Tagline removed.** It overlapped with Highlights and Description.
  Saved tagline values are dropped from the database (migration 0039).
- **Property types refreshed.** New consumer-facing list: Single Family,
  Townhouse, Condo, Co-op, Multi-Family, Manufactured, Land. Removed
  "Active Adult 55+" (jargon for age-restricted communities), and
  removed "New Construction" / "Resale" / "Custom Build" — those are
  sale-stage tags, not building types, and belong on individual
  listings.

If your community had `tagline` saved, that text is gone. Move anything
worth keeping to Highlights or Description.

---

## v0.54.8 — Community Media: cover inline, video rows simplified (2026-06-23)

✨ **Improvements**
- **Set as cover, inline.** Each video row in My Community → Media now
  has a "Set as cover" button; each photo card shows a ⭐ button on
  hover. Whichever item you pick becomes the community hero on `/c/<slug>`
  and on every community card across the app. The current cover gets a
  "Cover" badge so you can see at a glance which one is showing.
- **Video rows match the listing layout.** Flat row: thumbnail, title,
  category tag, Set-as-cover, Delete. The information panel now reads
  the same as your listing media — no more bouncing between two
  different mental models.
- **Upload first, Category second.** The upload button is now the first
  thing in the Media card with the Category picker right under it, so
  the flow reads top-to-bottom: pick what to upload → tag it → drop
  files.

✂️ **Removed**
- The standalone "Cover" panel under Media is gone — cover lives inline now.
- Per-video visibility / archive / restore / private buttons. **Delete is
  now the only way to take a video off your buyer-facing community
  page.** Existing private/archived videos stay in your list but can't
  be flipped back to public from the dashboard.
- Per-video category edit. Categories are set at upload time; mistakes
  mean delete-and-reupload for now.

**Why**: agents asked for the listing Media tab's UX in their community
tab. Photo grid + flat video rows + inline cover selection now read
identically to what you already use on listings — community keeps the
category tag (it's the one thing communities need that listings don't).

## v0.54.7 — Category picker is a labeled dropdown (2026-06-23)

✨ **Improvements**
- **Category picker** in the My Community Media tab (and the upload page,
  and the video edit sheet) is now a labeled dropdown instead of a row of
  chips. The short explanation (what to shoot, hard rule) still appears
  underneath as soon as you pick a category — same content, less screen
  space, easier to scan on a phone.

**Why**: a 12-chip cloud took a chunk of the Media tab on mobile and made
it harder to spot the currently-selected category at a glance. A
dropdown collapses the choice to one line and uses the OS's native
picker.

## v0.54.6 — Community Media tab matches Listing Media tab (2026-06-23)

✨ **Improvements**
- **My Community → Media tab** now uses the same one-card layout as
  My Listings: a single "Click to upload" button accepts both photos
  and videos in one pick. They fan out automatically by file type.
- **Shared category picker** at the top tags both the video and the
  photo batch with the same community category — no more bouncing to a
  separate upload page just to pick a tag.
- **Stacked Videos / Photos** sub-sections in one card, with the existing
  visibility / archive / delete controls preserved on the videos list.

**Why**: V1 had the Media tab split into two cards plus a "+ Upload
video" link that bounced agents off the page. Listing's media tab
already merged them; community now matches. The category picker is
lifted to the top so a typical session ("walk-the-block clip + a few
photos of the entrance") tags everything in one go.

## v0.54.5 — Less friction for ranges in My Community (2026-06-22)

✨ **Improvements**
- **Year built** now starts as a single picker. If the community
  delivered in phases (e.g. 2019–2024), tap **+ Add end year** to
  reveal a second input. Tap **− Remove end year** to go back.
- **Price** now starts as a single "starting at $X" input. Tap **+ Add
  max price** to turn it into a From / To range. Tap **− Remove max
  price** to drop the upper bound.
- **HOA** stays as one number — community-wide HOA ranges are rare
  enough that an extra toggle would be noise.

**Why**: 50.5 always showed two inputs for year and two for price, even
for the 80% case where only one value is meaningful. Empty boxes ask
"should I fill this in?" every visit. Now agents see fewer fields by
default; the second one is one click away when they need it.

🛡️ **Validation**
- End year must be >= start year when both filled (DB CHECK + form
  validation). Same min ≤ max rule for price already enforced in 50.5.

## v0.54.4 — Community editor matches the listing editor (2026-06-22)

✨ **Improvements**
- Community detail page: **Year built**, **HOA fee**, and **Price range**
  now use the same input style as the listing editor. Year built is a
  dropdown of recent years with a "Type a year…" escape hatch. HOA shows
  a `$` prefix and `/month` suffix. Price is two `$`-prefixed boxes for
  the low end and high end of the range — no more wrestling with dash
  characters or "k" abbreviations.
- Removed the small grey hint lines under each form field. Clear labels
  and example placeholders inside the boxes carry the same information
  with less visual noise.

🔧 **Technical**
- Numeric fields are stored as integers in the database with sanity
  checks (year between 1800 and 2100, prices non-negative, low price
  ≤ high price). This prep work also unlocks a future buyer-side
  "filter communities by price range" search.

## v0.54.3 — Richer community profiles (2026-06-22)

### ✨ New fields on the Community editor

The community detail page's **Details** tab now lets you capture much more
of what buyers actually ask about — without forcing rigid formats. All
fields are optional; existing communities stay valid until you fill them
in.

**New fields:**

- **Tagline** — one-line pitch shown on the community card.
- **ZIP** and **County** — useful for tax and school-zone lookups.
- **Highlights** — up to 8 short phrases (e.g. *Top-rated schools*,
  *Walk to MARTA*, *New construction*). Click ✕ to remove, press Enter or
  comma to add.
- **Property types** — multi-select chips: Single Family, Townhome, Condo,
  Active Adult 55+, New Construction, Resale, Custom Build.
- **Builder** — e.g. Pulte, Toll Brothers.
- **Year built** — accepts a single year or a range like *2018–2024*.
- **Price range** — type whatever format you prefer: *$450k – $1.2M*.
- **HOA fee** — type whatever's accurate: *$220/mo + one-time initiation*.
- **Website** — optional link to the builder or HOA site.

### 🎨 Form ergonomics

- Fields are now grouped into **Identity / Location / Pitch / Property /
  Contact** so the form reads as a story instead of a flat wall.
- Every field has a **real example** in the placeholder so you can start
  typing without thinking about format.
- The **Save changes** button stays disabled until you've actually
  changed something, with a small "No unsaved changes" hint when idle.

### 🔜 Coming next

The buyer-facing public community page will start surfacing these fields
in the next release (tagline near the hero, highlights as a chip strip,
property facts as a panel, etc.). Filling them in now means they'll show
up automatically when that lands.

## v0.54.2 — Community hub: matching hero + cleaner Details panel (2026-06-22)

### ✨ Improvements

- The community detail page now has the same hero controls as the listing
  edit page: a **Preview ↗** link to your buyer-facing community page, plus
  the same one-click Active / Inactive toggle. Both reuse the chromeless
  pill style that blends into the cover image.
- The **Details** tab no longer shows a "box inside a box" — the inner
  framing card with the duplicate "Community details" heading is gone, so
  the form now sits directly on the panel like the listing form does.
- The **Delete community** button moved from inside the form to its own
  section at the bottom of Details, matching where the listing delete
  button lives. No behavior change — still requires confirmation.

## v0.54.1 — Community hub: Marketing/Analytics now visible on legacy communities (2026-06-22)

### 🐛 Fix

- v0.54.0 hid the new **Marketing** and **Analytics** tabs on community
  pages whose creator wasn't recorded (legacy data — most communities
  created before authorship was tracked). The tabs are now visible to
  anyone who can edit the community, matching the existing edit
  permission.

## v0.54.0 — Community hub gets Marketing & Analytics tabs (2026-06-22)

### ✨ Improvements

- The **community detail page** in your dashboard now reads the same way
  as the listing edit hub — four icon shortcuts across the top:
  **Details · Media · Marketing · Analytics**.
- **Media** combines Videos + Photos in one tab (and the Cover picker
  is folded in beneath them for the community creator), so you don't
  have to bounce between three sub-tabs to manage media.
- **Marketing (new)** — generate a community marketing body in any of
  five buyer languages (English / 简体中文 / Español / Tiếng Việt /
  한국어), grounded in your videos, schools, and nearby points of
  interest. Edit inline, save per language, copy with one click.
  Regenerate refines from your edited draft instead of starting fresh.
- **Analytics (new)** — same KPIs and engagement funnel as the listing
  Analytics tab (Page views → Card views → Video completes → Leads),
  scoped to this community. Numbers update live from `/c/<slug>`.

### 🧱 Under the hood

- Analytics machinery was generalized so listings and communities share
  the same code path; the listing Analytics tab is unchanged.
- `events` and `saved_social_drafts` now carry an optional
  `community_id` alongside `listing_id` (XOR-enforced).

## v0.53.3 — My-listing tabs got icons (2026-06-22)

### ✨ Improvements

- The 5 sub-tabs on a listing's hub page (Details · Media · Marketing ·
  My Leads · Analytics) now read as **circular icon shortcuts** with a
  label underneath, instead of flat text pills. Each tab has its own
  symbol, so the row reads at a glance and stands apart from the text
  tabs elsewhere on the page.
- Layout is now the **same on phone and desktop** — horizontal across
  the top. On phone you can swipe sideways to reach Leads / Analytics;
  a soft fade on the right edge hints there's more.

## v0.53.2 — My Leads inbox + sharper Analytics (2026-06-22)

### ✨ Improvements

- The agent-hub **Leads tab is now "My Leads"** — clearer label, and
  signals it's the agent's own pipeline rather than a generic list.
- **My Leads** got an inbox redesign:
  - The 4-stat strip across the top (Total / This week / Pending email
    / Awaiting follow-up) is gone — the filter chips below already
    scope to the same buckets.
  - Filter chips lost their parenthesized counts — pills only. Less
    visual noise; the chip itself is the filter.
  - Each lead is a single line now: a sage dot for "needs follow-up",
    name, message preview, time ago, and one-tap **Email** / **Text** /
    **Mark done** icon buttons. Email/Text auto-mark the lead as
    followed-up so you don't have to do it twice.
  - Followed-up leads fade slightly so your eye goes to what still
    needs attention.
- **Analytics** is now an at-a-glance performance view:
  - **Views** is the cover number with the 7-day trend sparkline next
    to it; "unique sessions" sits underneath as a sub-line instead of
    being its own card.
  - **Leads** card shows the conversion % only when you have at least
    one lead (no more "0%" when you just have no traffic yet).
  - **Watch-through** ring (video completes ÷ page views) replaces the
    Likes card — it's a much better signal of engagement.
  - A 4-step **Drop-off funnel** (Page views → Card views → Video
    completes → Leads) shows where viewers fall off, with the
    step-over-step % to the right.

## v0.53.0 — Cleaner Leads + Analytics tabs (2026-06-22)

### ✨ Improvements

- **Leads tab** got a quieter look:
  - The "· N" count is gone from the tab label itself (it was double
    information — the section header already says "N total · M awaiting
    follow-up").
  - A small sage bar on the left of each lead now marks who you still
    need to follow up with — replaces the old "New" pill. Followed-up
    leads get a muted bar so they fade into the background.
  - Each lead is one line tighter: contact info collapsed to a single
    muted line, the "via …" source label dropped, message preview
    trimmed to one line.
- **Analytics tab** is now focused on the three numbers that actually
  matter:
  - **Views · Leads · Conv. %** — three big cards instead of six.
  - Conversion rate hides itself until you have at least one lead, so
    you don't stare at a "0%" that just means "no leads yet".
  - The engagement funnel is unchanged — still the place to see where
    viewers drop off. Top-cards table removed (rarely useful at the
    per-listing level).

## v0.52.5 — Cleaner Marketing tab (2026-06-22)

### 🧹 Polish

- Removed the green "cached" badge — irrelevant to your workflow.
- Saved drafts now show **Platform · Language** as the default
  heading (e.g. "Facebook · English") so every row reads cleanly out
  of the box. **Rename** still lets you replace it with your own
  label.
- Dropped the duplicate platform/language line below the heading.

## v0.52.4 — Skip the AI when you've already got the answer (2026-06-22)

### 🚀 Features

- **Token cache.** When you hit **Generate** with the exact same
  platform + language + selling points as a saved draft on this
  listing, we now return that draft instantly — no AI call. A green
  **cached** badge lets you know. Edit the saved draft (or click
  **Refine**) any time you want a fresh take.
- **Name your saved drafts.** Each saved draft now has an optional
  title — click **Title** (or **Rename**) to label it ("Open house —
  front yard angle", "Spanish version for Carla"). Up to 120
  characters. Title shows as the row heading.

### 🧹 Polish

- Tour-video panel now ends with "— coming soon." so the disabled
  button is clearly intentional.

## v0.52.3 — Edit drafts + refine from your edits (2026-06-22)

### 🚀 Features

- **Edit saved drafts in place.** Each saved draft now has an **Edit**
  button — tweak wording, fix typos, keep the same row. Rows show
  "(edited)" once you save changes.
- **Refine from your edits.** The output textarea on the Marketing
  tab is now editable. The moment you start typing, the **Regenerate**
  button becomes **Refine from edits** — clicking it sends your
  current text to the AI as a seed instead of starting over. Your
  voice, your phrasing, your local references survive the regen.
- **Refine button on saved drafts.** Pull a saved draft back into the
  editor with one click and refine from there.

### 🧹 Polish

- Dropped the redundant section title on the Media-tab tour video
  panel (the button label is the title).

## v0.52.2 — Save your social drafts (2026-06-22)

### 🚀 Features

- **Save generated copy.** Hit **Save** next to Copy on the output
  card and your post is persisted to this listing. Saved drafts show
  up below the editor with copy + delete buttons — no more losing
  good copy to a refresh.
- Per-listing cap of 50 drafts; oldest are not auto-evicted. If you
  hit the cap you'll see a clear message and can delete to make room.

### ✨ Improvements

- **Tour panel cleaned up.** Dropped the speculative "Q4 2026" date
  and the provider-eval paragraph. Button is now just "Create a home
  tour video" — same as the section title.
- **Selling points hint is a word counter.** "Up to 50 words (N/50)";
  turns red over the cap. Cleaner than the previous paragraph blurb.
- **Platform and Language dropdowns are quieter** — hint text removed.

### 🛡️ Security

- Saved drafts are RLS-scoped: agents only see and write drafts for
  their own listings. Save endpoint shares the existing 10/min
  per-agent rate limit, body length is capped at 8 KB, and a database
  trigger enforces the per-listing draft cap (defense in depth).

## v0.52.1 — Marketing tab layout cleanup (2026-06-22)

### ✨ Improvements

- **Marketing tab is calmer.** The social-copy generator now uses a
  simple left/right split: pick selling points, platform, and language
  on the left; output appears on the right. Pick one platform and one
  language at a time — Regenerate to iterate, switch platform when
  you're happy.
- **Home tour generator moved to the Media tab.** Renamed
  "AI tour video" → "Create a home tour video from photos" and parked
  it as a standalone section at the bottom of Media, since it operates
  on the photos you've uploaded. Marketing tab is now just copy.
- **Less visual chrome.** Dropped the "Facebook + Instagram drafts"
  header — the panel speaks for itself now.

## v0.52.0 — Marketing tab: more platforms, more languages (2026-06-22)

### 🚀 Features

- **Pick the platforms you want.** The Marketing tab's social-copy
  generator now supports nine platforms instead of three: Facebook,
  Instagram, Email, TikTok, X, LinkedIn, Threads, Rednote (小红书), and
  WeChat Moments. Toggle the ones you want with pill buttons.
- **Generate in multiple languages.** Reach the multilingual US homebuyer
  pool: English, 简体中文, Español, Tiếng Việt, and 한국어. Each post is
  written natively for that language, not translated word-for-word.
- **Smarter copy from your listing.** The generator now reads your
  listing's description, photo captions, and video titles before drafting,
  so the posts reference real content instead of just the address and
  price. Add optional selling points to nudge the angle.

### ✨ Improvements

- The Marketing tab's old three-tab strip is gone — it didn't scale past
  3 platforms. New layout: Platforms and Languages selectors on top, then
  one card per platform with a language sub-tab strip and a per-cell Copy
  button.
- One click generates every platform × language combination in a single
  pass (cap: 6 platforms × 4 languages per click).

## v0.51.8 — Drop "Content" title from Media tab (2026-06-22)

### ✨ Improvements

- Listing /edit **Media** tab: removed the redundant "Content" card title.
  The tab name already says it; the helper line ("Photos and videos · drag
  to reorder · use ⓒ to set cover") stays.

## v0.51.7 — Agent hub Details panel cleanup (2026-06-22)

### ✨ Improvements

- Listing /edit **Details** panel: removed redundant helper text from
  Bedrooms, Bathrooms, HOA, Community, and Description — every input now
  speaks for itself. The "* = required to publish" line and the always-on
  "Auto-save on" pill are gone too; the save indicator now only shows when
  there's something to say (Editing… / Saving… / ✓ Saved / Save failed).
- **Square feet** field gained a clear `sq ft` suffix inside the input.
- **HOA** is now a number field with a `$` prefix and a `/month` suffix,
  so agents type `120` instead of `$120/mo`.
- **Year built** is now a dropdown listing current year → 1900, with a
  "Type a year…" option for older homes (mirrors how Beds/Baths work).

## v0.51.6 — One upload button for photos and videos (2026-06-21)

### ✨ Improvements

- Listing /edit Media tab: the separate "Videos" and "Photos" cards are
  merged into a single **Content** card with one **Click to upload** button.
  The button accepts photos *and* videos in the same pick — files are
  routed automatically by type. Reorder, cover toggle, and delete still
  live with each media type below.

## v0.51.5 — Delete lives in Details tab on both pages (2026-06-21)

### ✨ Improvements

- My listing & my community detail pages: the Delete control now appears in
  exactly one place — the bottom of the **Details** tab, as a clear rose-bordered
  "Danger zone" block with a solid red "Delete this listing/community" button.
  Same look, same place, on both pages.
- Removed the three-dot ⋯ menu from the community hero. The Active/Inactive
  pill is the only top-right control again, matching the listing hero.

### 🐛 Bug Fixes

- Fixes the report that Delete only showed at the bottom of the Details tab on
  community pages — now that's the *intended* place on both listings and
  communities, with identical styling.

## v0.51.4 — Portfolio internal rhythm (2026-06-21)

- Agent portfolio (`/a/[agentSlug]`): overlay typography enlarged to match
  the page's larger 4:5 cards — serif 22–26px price, 13–14px specs/address,
  20px interior inset.
- Agent portfolio: unified vertical/horizontal spacing to a single 8px
  rhythm — hero & listings `py-20 md:py-28`, headers `mb-8`, hero flex
  `gap-8`, grid `gap-8`, bio `mt-8`, footer `py-8`.
- `GridCard`: new optional `captionInsetClass` prop (default unchanged) so
  pages with larger cards can scale interior padding to match.
- No changes to `/browse`, `/communities`, `/dashboard`, `/saved`,
  `/search`, `/nearby`, `/c/[slug]`.
Format matches the standard release template (Features / Improvements / Bug Fixes / Technical / Known Issues / Metrics).

## v0.51.3 — 2026-06-21 — Portfolio text matches every other grid

### ✨ Improvements

- Agent portfolio (`/a/[agentSlug]`) cards now use the same caption
  format as every other grid in the app: price (serif, bold) →
  specs (bd / ba / sqft) → address, all overlaid on the bottom-left
  of the cover image with the shared dark gradient. Editorial 4:5
  aspect and the 1 / 2 / 3-column wide-gap layout are preserved.
- The old "No. 01" eyebrow and post-image text block are gone — the
  card visually reads like /browse, /communities, /dashboard, etc.,
  just at a larger scale.

### 🛠️ Technical

- `GridCard` now accepts an optional `aspectClass` prop so the
  portfolio card can specify `aspect-[4/5]` while still reusing the
  shared overlay caption + gradient + hover.
- Inline `ListingCardView` markup in `/a/[agentSlug]/page.tsx`
  collapsed onto `<GridCard>` + `<GridCardCaption>` (≈40 lines of
  duplicate markup removed).
## v0.51.2 — 2026-06-21 — Edge-to-edge grid rhythm

### ✨ Improvements

- Page-level left/right padding on grid pages reduced to match the
  inter-card gap (4px mobile / 6px desktop), so the visual rhythm of
  the grid extends all the way to the screen edges with no asymmetric
  outer margin.
- Six more grid surfaces (`/saved`, `/search`, `/nearby`, `/c/[slug]`
  videos + listings) now use the same shared GridPageShell /
  GridFrame / GridCard primitives as `/browse`, `/communities`,
  `/dashboard`, `/dashboard/communities` — identical card aspect,
  caption styling, and badge placement.
- `/nearby` distance pill now uses the shared GridCard top-left slot;
  `/search` "Stock" demo badge uses the shared top-right slot.
- 5 loading skeletons updated to match the unified grid spacing so
  the loading state visually matches what gets rendered.

### 🛠️ Technical

- `ListingGridItem` extended with optional `distanceMi` — renders
  automatically as a top-left badge.
- `GridPageShell` padding changed from `px-3 sm:px-6` to
  `px-1 md:px-1.5` (equal to grid gap).
- Inline `ListingCard` helpers in /search and /nearby deleted —
  ~110 lines of duplicate card markup removed.
- `tsc`, `biome`, `next build` all clean.

### Known Issues

- `/a/[agentSlug]` agent portfolio page is intentionally NOT in this
  unification — it's an editorial 1/2/3-column layout, different
  visual family. Will revisit if visual consistency there is wanted.

## v0.51.1 — 2026-06-21 — Even grid spacing

### ✨ Improvements

- **Grid spacing is now even.** Horizontal and vertical gaps between cards match, so the grid reads as a uniform mesh instead of horizontal rows. Applies to For You, Communities, My Listings, and My Communities.

## v0.51.0 — 2026-06-21 — Unified grid layout

### ✨ Improvements

- **My Listings and My Communities now look the same as For You and Communities.** All four grid pages share the same card style, spacing, and column layout, so switching between them feels seamless.

### 🔧 Technical

- Extracted shared grid primitives (page shell, frame, card) so future visual tweaks happen in one file instead of four.

## v0.50.1 — 2026-06-21 — Agent hub follow-up

### 🎨 Improvements

- **Community Photos tab now inline**: clicking the Photos tab inside a
  community's detail page now shows the full photo manager (category
  picker + dropzone + gallery) right there. No more bouncing to /upload
  to add a photo.

### 🛠️ Technical

- Buyer surfaces (`/communities`, `/browse?tab=communities`,
  `/c/<slug>`, listing-feed community sheet) gate communities on
  `status='active'`. Inactive communities now 404 for buyers; the
  creating agent still sees them in /dashboard/communities so they can
  reactivate.
- `fetchCommunityListCards({ includeInactive })` opt-in so dashboard
  keeps full visibility.

## v0.50.0 — 2026-06-21 — Agent hub rebuild

### ✨ Features

- **Unified agent hub detail shell**: clicking a listing or community now
  opens a hero-cover layout with sticky sub-tabs underneath. Switch tabs
  inline (URL `?tab=…` deep-links and shares cleanly); edits auto-save.
  Replaces the prior long-scroll edit pages.
- **Status simplified to Active / Inactive**: no more draft / published /
  archived. Listings now have a single Active ↔ Inactive toggle in the
  hero top-right. Activating still runs the readiness gate (address,
  price, beds/baths, ≥1 ready media); deactivate is one click.
  Communities gained the same toggle.
- **Three-dot menu with Delete**: archive removed entirely. Permanent
  delete is the sole destructive action, behind ⋮ in the hero.

### 🎨 Improvements

- **My-listings grid**: removed the empty padding wrapper and matched
  `/browse` exactly — 2-up on mobile, 4-up on desktop, 3:4 cards with
  bottom-gradient legibility overlay. Inactive cards de-emphasized
  with reduced opacity + small Inactive pill.
- **My-communities grid**: same padding tightened to match `/communities`.
- **Detail hero ratio**: dashboard hero uses the same `aspect-[5/2]
  md:aspect-[5/1]` as the public community page, so what you see while
  editing matches what buyers see live.
- **Listing detail Media tab**: videos and photos panels stacked together
  on one tab — fewer hops to swap a cover image.

### 🛠️ Technical

- DB migration 0030 collapses `listings.status` enum + adds
  `communities.status`. Backfill: `published → active`, `draft|archived
  → inactive`. Buyer-side reads gated on `status='active'`.
- New shared components: `HubDetailShell`, `HubTabs`, `StatusPill`,
  `ListingDetailMenu`, `CommunityDetailMenu`.
- PublishPanel deleted; archive helpers replaced by deactivate.
- Stacking-context guard: pill-error popover and detail menus portalled
  to `document.body` so BottomNav z-40 doesn't clip them on mobile.

### 🐛 Known Issues / Follow-ups

- Community photos tab currently shows a "Manage photos →" link to the
  existing photos page rather than inlining the panel — keeps phase 46
  bounded; inlining is straightforward in a follow-up.
- Buyer-facing `/c/<slug>` visibility still ignores
  `communities.status` this phase; will gate in a follow-up if owner
  wants inactive communities hidden from buyers.

## v0.49.5 — 2026-06-21

### 🐛 Bug Fixes

- **Upload sheet now properly cancels on outside tap.** Previously, tapping outside the upload sheet on the listings page would not only fail to close the sheet — it would also navigate to whatever listing card you tapped on. Fixed: the sheet now renders at the document root (above all page content) so tapping outside reliably dismisses it without triggering anything underneath.

### ✨ Improvements

- **Upload sheet redesigned.** Replaced the three flat buttons (Album / Camera / Cancel) with two large icon tiles for **Album** and **Camera**, plus a subtle "Tap outside to cancel" hint. Smoother slide-in animation, deeper scrim, no need for a Cancel button — just tap anywhere off the sheet.

## v0.49.4 — 2026-06-21

### ✨ Improvements

- **Upload menu simplified.** Tapping the center "+" button now opens a clean bottom sheet with three choices: **Choose from album**, **Camera**, **Cancel**. Photo and Video are merged into a single Camera option (your phone lets you pick which to capture). Tapping anywhere outside the sheet closes it without activating whatever was behind — your tap won't accidentally open a listing or play a video.

## v0.49.3 — 2026-06-21

### ✨ Improvements

- **Upload menu redesigned.** Tapping the center "+" button on the bottom bar now fans out three round buttons (Album / Photo / Video) in a soft arc above it, with the "+" rotating into an ✕ to cancel. Tap any empty space to close — no more dedicated Cancel button. Replaces the old stacked sheet that several agents flagged as flat-looking and hard to dismiss.

## v0.49.2 — 2026-06-21

### ✨ Improvements

- **Left-corner chip refined and repositioned.** The "Live here" / community-name chip on video feeds now uses a soft squircle with a small green status dot before the icon + text, and sits about a quarter of the way down the screen instead of tucked under the top bar — easier to read against the video and clearer space from the top chrome.

## v0.49.1 — 2026-06-21

### ✨ Improvements

- **Cleaner left-corner chip on community videos.** The top-left button on a community video feed is now a banner-cut tag reading "🏠 Live here" — opens the homes-for-sale sheet in place. Replaces the older "🏠 N homes here ›" pill. The same shape is reused on the listing feed's community chip (single-line community name), so both surfaces look like one product.

## v0.49.0 — 2026-06-21

### ✨ Improvements

- **Community pages are more immersive.** The hero photo at the top of a community page is shorter so the videos start higher up the screen, and the two pill buttons that used to sit between the hero and the videos ("Community Videos" / "Active Listings") are gone — videos now show by default the moment the page opens.
- **"Live here →" — one tap from a community to its homes for sale.** Right next to the city name on the community hero ("Atlanta, GA · **Live here →**"), an inline link swaps the videos for the active listings inside that community, then flips to "← Walk through" to send you back. Reads as part of the sentence, not as page chrome — and no detour through the global browse page.

## v0.48.2 — 2026-06-21

### 🐛 Bug Fixes

- **Nearby now tells you what went wrong with location.** If location fails — because the browser timed out, your device couldn't get a fix, or you'd previously blocked the site — the empty state now explains which one and shows a **Try again** button (except for "blocked", where the only fix is to open the browser's site settings). Before this, every failure landed on the same generic "enable location access in your browser" message even after you clicked Enable, so there was no way to tell whether retrying would help.
- **Longer wait on first location lookup.** The Nearby page used to give up after 8 seconds, which was too short — by the time the OS permission dialog appeared and you tapped Allow, we'd often already moved on. Bumped to 30 seconds, and we'll reuse a recent fix for up to a minute so back-and-forth between Nearby and other pages doesn't keep re-asking the OS.

## v0.48.1 — 2026-06-21

### ✨ Improvements

- **Nearby page asks before asking.** The first time you open Nearby, you'll see a small explanation of why we want your location and what we do with it ("only used to filter what you see, stays on your device") with an "Enable location" button. Tapping that button is what triggers the browser's native location permission prompt — so the OS dialog now arrives with context instead of out of nowhere. After the first visit, Nearby goes straight to results.

## v0.48.0 — 2026-06-21

### ✨ Improvements

- **All grid pages now feel like a TikTok feed.** The cover photo / video thumbnail takes up the entire card, and the price, beds/baths/sqft, and address sit on a soft dark gradient at the bottom of the cover instead of in a separate row underneath. The empty space between cards has been tightened to almost nothing (a 4-pixel gap between columns, an 8-pixel gap between rows on phones), so just over two rows of listings are visible on screen at once — your eye picks up that there's more to scroll to without anyone having to tell you. This applies everywhere a grid shows up: Explore, Nearby, Saved, Search results, an individual community's videos and listings tabs, and the agent dashboard listings view.
- **Specs now read as one line.** "3 bd · 2 ba · 1,820 sqft" sits below the price as a single sentence instead of three side-by-side spans. If a listing is missing one of the three (some homes don't list square footage), the dot separators stay clean and the line just shows what's known.

## v0.47.2 — 2026-06-21

### ✨ Improvements

- **Cleaner Nearby experience when location is blocked.** If you've denied your browser location to Vicinity, the Nearby tab and the Communities → Nearby tab now show a single-line message asking you to enable location access — instead of asking you to type your latitude and longitude into two input boxes, which nobody knows off the top of their head.

## v0.47.1 — 2026-06-21

### ✨ Improvements

- **Feeds now use the full screen on phones.** Previously a thin strip at the bottom of the feed (the price + caption area) was hidden behind Safari's URL bar on iPhone. The feed now resizes itself to whatever the browser is showing, so the listing photo or video, the caption, and the right-rail buttons all sit inside the visible area no matter whether the URL bar is up or hidden.
- **Removed the "Swipe up for more" hint** on the listing video / explore feed and the **"← swipe →" hint** on the community-videos carousels. The gesture is self-evident on a TikTok-style feed and the labels were just visual noise crowding the bottom edge.

## v0.47.0 — 2026-06-21

### ✨ Improvements

- **All three feed surfaces now look and behave the same.** The Community-tab carousel (For You → listing → "Videos in this community") now uses the same right-rail style as the listing feed and the community video feed: circle button with a label underneath (Like / Save / Contact). Previously it was bare unlabeled circles. Same pixel position, same safe-area handling — so the iOS home indicator no longer crowds the rail on any of the three feeds.

### 🔧 Technical

- Phase 45.23 architectural cleanup: introduced `FeedShell` page primitive and shared layout constants (`FEED_FRAME_CLASS`, `FEED_RAIL_BOTTOM`, `FEED_Z`). Migrated `BrowseFeed`, `CommunityVideoFeed`, and `CommunityCarousel` onto the shared primitives — z-stack, safe-area math, and the 9:16 desktop frame are now defined once instead of three drifting copies. The recurring class of bugs from phases 45.19–45.22 (overlay buttons disappearing, modal hidden behind carousel, rail too close to home indicator) had a single root cause: three near-identical rail/frame implementations diverging independently. That's now fixed at the source. CommunityCarousel's local icon SVGs (`Heart` viewBox 24/size 24, `Bookmark`/`Share`/`Comment` size 22) were replaced with the shared icon set (`size 26`, identical paths to BrowseFeed) — the carousel rail icons are now slightly larger and pixel-identical to the listing feed.

## v0.46.0 — 2026-06-21

### 🐛 Bug Fixes

- **Community video feed buttons now have labels.** When tapping into a community video (Community tab → community → Videos → click a video), the three right-rail buttons (Like / Save / Contact) now show their names underneath each circle — same as the listing feed (For You). Previously they were bare circles, which made it hard to tell which button does what. The buttons themselves and their positions are unchanged.

### 🔧 Technical

- Extracted shared feed primitives — icons (`Heart`, `Bookmark`, `Share`, `Comment`, `BackArrow`, `Nearby`, `Play`, `House`) and `ActionButton` — into `app/(public)/_components/feed/`. BrowseFeed and CommunityVideoFeed now consume the same components. Pixel-identical to the previous BrowseFeed look. CommunityCarousel kept its local icon set this release (icon SVGs differ subtly; unifying needs owner pixel sign-off).

## v0.45.5 — 2026-06-20

### ✨ Improvements

- **Listing feed right-rail buttons (Like / Save / Contact) moved back up** to thumb height. They had been lowered to sit at the very bottom edge in v0.45.x; reverted per owner feedback — they now float ~5rem above the safe area where they're easier to reach.

## v0.45.4 — 2026-06-20

### 🐛 Bug Fixes

- **Contact button now opens the form when tapping it from inside a community-video carousel** (For You → listing → community videos → Contact). Previously the button looked like a dead click — the form was actually opening, but stacking order put it behind the carousel so you couldn't see or interact with it. Fixed.
- **Contact button now appears on legacy community feeds** (Community tab → Peachtree Corners → Videos, and other communities created before owner-tracking shipped). When a community doesn't have a registered owner, the Contact button now routes to the agent who posted listings into that community — so buyers always have a way to reach somebody. Communities with no owner *and* no listings still hide the button (nobody to route to).

## v0.45.3 — 2026-06-20

### 🐛 Bug Fixes

- **Community video feed buttons no longer disappear.** When tapping into a video from the Community tab, the top header (back, community name, share) and the side rail (Like, Save, Contact) plus the "homes here" chip now stay pinned to the screen as you swipe. Previously they shifted off-screen after the first video.

## v0.45.2 — 2026-06-20

### 🐛 Bug Fixes

- **Liking a community video now sticks.** Previously the heart would light up briefly and then snap back — the save was failing in the background. Fixed.

### ✨ Improvements

- **Contact button added to the community video feed.** When you're browsing a community's videos directly (not coming in from a specific listing), the right-side rail now has a Contact button that lets you reach out to the community's owner. Communities without a registered owner won't show the button.

## v0.45.1 — 2026-06-20

### 🐛 Bug Fixes

- **Community videos viewed from a listing** now show in the same phone-shape column as everything else on desktop, instead of stretching to fill the whole screen. Share, Like, Save, and Contact buttons now appear in the side rail — same shape and behaviour as the listing feed itself, so you can save the listing or contact the agent without leaving the video.

## v0.45.0 — 2026-06-20

### 🚀 Features

- **New top navigation** — every page now has a unified top bar with search, section tabs, and your avatar in the top right. On larger screens you also get a left sidebar for one-tap jumps between surfaces.
- **"New" is a primary tab** for agents — creating a listing or community no longer lives only behind the floating button.

### ✨ Improvements

- **Browse** brings back **Explore | Nearby** as sub-tabs.
- **Communities → Nearby** now shows community-mapped video tiles instead of a flat list.
- **Favorites** tab restored to the bottom nav, with cleaner "Saved" labels.
- **Search results** now use a 4-column grid on wider screens.
- **Agent Hub** dropped the duplicate avatar, simplified labels (singular "Listing" / "Community"), and removed status pills that weren't earning their space.
- **My Community** tap now jumps you straight into the editor.
- **Community feed** uses a phone-shaped frame with video captions for a more native feel.
- **Floating create button** is centered and consistent across surfaces.
- **Listings and communities** now have **delete** actions in the dashboard (videos already had this — bringing the rest to parity).
- **Sidebar** has more breathing room and tighter visual rhythm.
- **Auto-cover, grid meta, and like interactions** were polished across the home and feed grids.

### 🐛 Bug Fixes

- **Upload from the floating button → New community → no longer drops your files.** Previously, picking files and creating a new community would silently lose everything you'd queued. We now carry your selection through to the upload screen, split videos and photos into the right panels, and show a "N files queued" banner so you can confirm before submitting.
- **Like state** correctly persists after publish.
- **Publish redirect** now lands you on the right destination instead of the editor.

### ⚠️ Known Issues

- None reported. Owner verification of the community upload fix is pending.

## v0.42.0 — 2026-06-20

### 🚀 Features

- **Center upload button on the agent home** — pick from album, take a photo, or record a video, and we'll prefill the listing or community editor for you.
- **Global search** across listings and communities — tap the magnifier in the top right.
- **Agent analytics dashboard** — page views, unique sessions, likes, and leads, plus a 7-day trend.
- **Likes are now their own action**, separate from saves. The Favorites tab keeps both side by side.

### ✨ Improvements

- Landing page is cleaner: just the wordmark and a single tagline, with Explore and Sign In as the only buttons.
- Sign-in page now has a clickable Vicinity wordmark to bounce back home.
- Browse and Community grids now show two cards per row at every screen size.
- Bottom navigation is role-aware: buyers see For You / Community / Favorites / Me; agents see Agent Hub / For You / + / Community / Me; signed-out visitors get a Sign in shortcut.
- Agent Hub has a new Analytics tab next to Listings, Communities, and Leads.
- Listings and Communities in Agent Hub show as cards instead of a list.

## v0.41.0 — 2026-06-20

### 🔧 Technical

- Removed the "Share as poster" feature from the listing editor. After several rounds of design iteration the format wasn't earning its keep, so we pulled it to focus on the actual sharing path (Public URL ↗). The public listing page itself is unchanged.

## v0.40.0 — 2026-06-20

### ✨ Improvements

- **Editorial showcase reworked into "Listing Dossier"** — the default showcase style (Style 1) now reads like an information-dense single-page dossier with five numbered panels: ① The Home (with hero video + about), ② Inside (interior photo grid + specs), ③ The Neighborhood (community photo + landmarks), ④ The Numbers (price / $/sqft / HOA / status), ⑤ Represented by (agent + tour CTA). Top band masthead, footer band, burgundy-on-paper accent on the price chip. Designed for agents who want a "fact sheet" feel that differentiates from typical Zillow-style platforms.
- **Matching dossier poster** — the downloadable poster for Style 1 mirrors the same identity (top band → masthead → numbered photo panels → agent footer), so the poster you download visually matches the page you share.

### 🐛 Bug Fixes

- The three downloadable posters (Editorial / Cinematic / Luxury) were too visually similar at thumbnail size — Style 1's Dossier rework restores a clear at-a-glance distinction between all three.

### 🔧 Technical

- Added an internal `dossier` design token (burgundy `#8a2a23`) scoped strictly to Style 1's price chip — does not bleed into other surfaces.
- Two static prototype HTML files live under `public/prototypes/dossier.html` and `public/prototypes/spec-sheet.html` — used for visual sign-off; they are not wired into the app router.

## v0.39.0 — 2026-06-19

### 🚀 Features

- **Download poster images** — every showcase style now has a matching downloadable poster (vertical, designed for phone screens). Open the listing edit page → "Share as poster" → click "Download poster" on the style you want. Save it and post directly to WeChat moments, Instagram, or any image-friendly channel.

### ✨ Improvements

- Showcase pages now show more about each home: a short description, community details with nearby landmarks (school / grocery / transit), and an agent contact card.
- Editorial and Luxury showcase layouts now use a two-column reading flow on tablet and desktop. Phones still see a single clean column.

### 🐛 Bug Fixes

- Fixed a missing photo slot in the Editorial showcase gallery.

### 🔧 Technical

- Retired the Minimal Poster style; its "share as image" use case is better served by the new poster downloads. Editorial / Cinematic / Luxury Brochure remain.

## v0.38.0 — 2026-06-19

### 🚀 Features

- **Share as poster** — every listing now has a shareable showcase page in 4 visual styles (Editorial Magazine, Cinematic Story, Minimal Poster, Luxury Brochure). Find it on the listing edit page; copy a link to drop into a message, post, or email.
- **Beautiful link previews** — when you share a showcase link, the preview card automatically shows the home's photo, address, and price.

## v0.37.0 — 2026-06-18

### ✨ Improvements

- **Bottom bar is now a clean 4-icon strip: Community · Explore · {Saved | Workspace} · Me.** The standalone "Nearby" slot is gone, and the gold raised "Explore" button in the middle is flat now too — every tab gets equal visual weight. The bar feels less busy and the four icons line up.
- **Nearby moved inside Explore as a sub-tab.** Open Explore and you'll see two sub-tabs at the top: **Recommended** (default) and **Nearby**. Both show the same listing-grid layout; tap any card and you land in the same vertical swipe feed. Recommended shows everything, Nearby filters to your radius — same model 抖音 uses for 推荐/同城.
- **Old `/nearby` link still works.** If you've bookmarked Nearby or have an old tab open, it now redirects to Explore with the Nearby sub-tab pre-selected. Your saved radius preference (set in Profile) carries over unchanged.

### 🔧 Technical

- Sub-tabs are URL-driven (`?tab=recommended` / `?tab=nearby`), so they're shareable, back-button-friendly, and SSR-rendered.
- The community-scoped Explore view (`/browse?community=<slug>`) hides the sub-nav — that surface is already location-anchored to one community, so "Nearby" has no meaning there.

## v0.36.4 — 2026-06-18

### ✨ Improvements

- **Workspace creation buttons are unified — one gold pill per sub-nav page.** Each Workspace surface now has exactly one creation action in the same place and style — sitting in the chips row right next to the active sub-nav chip: **+ New listing** on Listings, **+ New community** on Communities. Inside a community, the existing **+ Upload video** stays in the page header. Leads has none — it's an inbox, not somewhere you create things. Before, the same actions were scattered across big "Add a property" cards, a floating gold "+" button on the bottom-right, an in-row "+ Upload" shortcut on each community, and a small "+ Add" text-link on the community page — all pointing at the same places, just stylistically inconsistent.

### 🐛 Bug Fixes

- **Removed the floating "+" button on Workspace pages.** It tried to be a single shortcut to "List a property" or "Add a community video," but each Workspace page already has its own button for the same thing in a more obvious spot. The floating button was visually competing with the gold Explore tab in the bottom bar too.
- **Removed the three "Add a property / Pick a community / View leads" cards from the new-agent dashboard.** They duplicated the chips row right above them and disappeared as soon as you published a single listing — confusing on the way in, and gone before you'd built any habit. The empty-state inside the listings list now points at the new header button: "No listings yet — tap + New listing above to add one."
- **The community page no longer shows two buttons that do the same thing.** Header had **+ Upload** and the videos section had **+ Add** — both opened the upload page. Kept just the header button (renamed to **+ Upload video** for clarity) and dropped the duplicate.

## v0.36.3 — 2026-06-18

### 🐛 Bug Fixes

- **Workspace now has chips for Listings · Communities · Leads.** After yesterday's "Workspace" rename, the tab landed on listings but there was no in-app way back to community management or the leads list once you had any listings — the empty-state CTA cards for those surfaces stop showing as soon as you publish your first property. Added a chips row right under the Workspace heading on all three pages so you can hop between Listings, Communities, and Leads without using browser back. The chip for the page you're on is gold-highlighted; the other two are tappable.

## v0.36.2 — 2026-06-18

### ✨ Improvements

- **Bottom-nav "Leads" is now "Workspace" — one tap to your full agent surface.** The slot-4 tab on the bottom bar (and its desktop equivalent) used to send you to the leads list only, while the rest of your tools (listings management, community-video upload, lead pipeline) lived behind a separate "Open dashboard" button on your profile. Two doors to overlapping content. Now the tab is **Workspace** and lands directly on the full surface — leads, listings, and community uploads all in one place.

### 🐛 Bug Fixes

- **Removed the duplicate "Open dashboard" button on Profile.** It pointed at the same place the new Workspace tab now opens. Profile actions are now: edit identity, view your public profile, sign out — nothing redundant.

## v0.36.1 — 2026-06-18

### 🐛 Bug Fixes

- **The community page in your dashboard now only lists *your* videos.** Previously you'd see every agent's videos for a community you also uploaded to — but you couldn't play, hide, or delete the ones that weren't yours, so they were just clutter. The list is now scoped to videos you uploaded; tap **View public page →** in the header to browse the whole community the way buyers do.

## v0.36.0 — 2026-06-18

### ✨ Improvements

- **One nav for everyone — agents and buyers see the same primary tabs.** The bottom bar (and the desktop top bar) is now a single 5-slot layout: **Community · Nearby · Explore · Saved/Leads · Me**, with Explore as the gold center button for both roles. Agents see "Leads" in slot 4 where buyers see "Saved" — that's the only difference. No more "preview as buyer" toggle, no more separate agent IA — the agent experience *is* the buyer experience, plus tools.
- **"+ New listing" moved to a floating button on the bottom-right.** When you're an agent on Dashboard, Profile, or Communities, you'll see a gold "+" floating in the corner — tap it for the same "List a Property / Add Community Video" sheet you had before. The center of the nav bar is now Explore for everyone, so the visual midline is back where it should be. Desktop agents can still use the "+ New" button in the top bar, and there's now a "Dashboard / New listing" shortcut inside the avatar dropdown for quick access from anywhere.

### 🐛 Bug Fixes

- **Bottom navigation is symmetric again.** The agent bar had grown to six items, pushing the gold action button off-center. It's back to five slots with the FAB on the midline, matching the buyer view.

### ⚙️ Technical

- Removed the "preview as buyer" mode and its supporting infrastructure (`vicinity_preview_as_buyer` cookie, `<PreviewBanner>`, dashboard preview redirect, profile-page toggle button). Agents now just *use* the buyer surface — no role-impersonation cookie needed. The cookie, if a browser still holds it, is harmless and will expire on next browser close.
- Collapsed `BUYER_TABS` / `AGENT_LEFT_TABS` / `AGENT_RIGHT_TABS` in `nav-config.ts` into a single `getPrimaryTabs(role)` helper — one source of truth for both `<BottomNav>` and `<SiteHeader>`.

## v0.35.5 — 2026-06-18

### 🐛 Bug Fixes

- **Dashboard top section no longer changes when you flip the listing filter.** Switching between Draft / Published / Archived used to swap the cards above — sometimes showing quick actions, sometimes empty stats. The filter now only affects the listings list below it; the top section stays consistent. New agents who land on the Draft tab will also see the "Add a property" shortcut, instead of an empty stats row.

## v0.35.4 — 2026-06-18

### ✨ Improvements

- **Photo listings now show up in the Explore swipe feed.** Previously the swipe stream skipped any listing that didn't have a video. From now on, photo and video listings flow through the same feed — buyers see one continuous stream, no matter how each listing was uploaded. The full action rail (Like / Save / Share / Contact) is identical on photo cards.

## v0.35.3 — 2026-06-17

### ✨ Features
- **Vertical swipe between listings.** Open a listing from a shared link and the swipe-up gesture now carries you on to the next listing in your area, just like the explore feed does. The page you land on is no longer a dead end.
- **Owner-only edits on community videos.** When several agents share a community, each agent can only edit, hide, or delete the videos they uploaded themselves. Other agents' work shows up in your dashboard with a "by @uploader" tag and read-only thumbnails — no more accidental deletes of someone else's video.

### 🛠 Improvements
- **Cleaner category picker on upload.** Replaced the 12-card grid with a tight chip cloud — fits the whole list on one phone screen instead of forcing you to scroll past category cards. Faster to skim, faster to pick.
- **Less clutter on the upload screen.** Removed the multi-community toggle and the meta block from the upload flow — cross-community uploading was a power-user feature most agents didn't use, and it was crowding the page.
- **Smarter Back on the listing page.** The Back arrow now returns to the explore grid where you left off, scroll position and all, instead of jumping you to the top.
- **Stats stay put when you switch tabs.** Flipping Draft / Published / Archived on the dashboard no longer flashes the stats block. The numbers up top stay rendered while only the list below changes.

### 🐛 Bug Fixes
- Removed a non-functional Search button from the listing detail header — it was a placeholder that pointed at the same place as Back, which was confusing.

## v0.35.2 — 2026-06-17

### ✨ Features
- **Hide a community video without deleting it.** Each video on the community editor now has *Mark private* and *Archive* — they're pulled off the buyer-facing experience but stay in your dashboard. Use *Private* for "drafts I'm not happy with yet", *Archive* for "park it, I might bring it back later". Tap *Make public* to flip it back. Buyers only ever see the live ones.

### 🛠 Improvements
- **Manage your videos directly on the community editor.** Open any community and you'll land on a video-first view: thumbnail, current category, status, and visibility — grouped into Live / Private / Archived. Re-categorize, hide, archive, or delete inline. No more bouncing into the upload page just to fix a typo on a video category.
- **Re-categorize without the create-flow walkthrough.** First-time uploads still walk you through the "Only on Vicinity" vs "Real look at the data" buckets on mobile (so you don't get a 12-card list on a small phone). When you're editing an existing video the picker drops the bucket step and lays the 12 categories out flat — you already know the taxonomy by then.
- **Mobile-friendly category picker on upload.** The 12 categories are now a 2-step pick on phones (bucket → category) instead of a wall of cards. The bucket step doubles as a quick reminder of *why* each kind of video matters on Vicinity.
- **Community list rows are tap-anywhere now.** Tap any row to open the community. The *+ Upload* shortcut still sits on the right (on tablet/desktop) for when you just want to drop a new clip in.

### 🐛 Bug Fixes
- **Hidden community videos no longer leak.** Tightened the buyer-facing queries so private and archived videos can't show up in the feed, on a community page, on a listing's community sheet, or in saved communities.

## v0.35.0 — 2026-06-17

### 🐛 Bug Fixes
- **Your dashboard now shows only your own listings.** A new agent with no listings was seeing other agents' published homes on her dashboard, which made the "Published" tab look populated and led to broken links when she tapped through. Each agent's dashboard is now scoped to her own portfolio — counts, the listing grid, and the cards all reflect what she actually owns.

### 🛠 Improvements
- **Community editor now shows the videos already on it.** Open any community and you'll see a roster of thumbnails right under the details, plus a one-tap "Manage" link to upload more. No more tapping into the upload page just to see what's there.
- **Community list shows video counts.** Each row in your community list now carries a small "N videos" pill so you can tell at a glance which communities already have content.
- **"Add Community Video" picks a community first.** The center "+" button used to send you to the community list page. Now it opens a quick picker — tap the community you want and you're straight on the upload screen for it. New community? "Create one" is right there too.
- **Dashboard header is leaner.** The "View public profile" pill at the top of the dashboard is gone — it's already on the Me tab, one tap away. One way to do each thing.

## v0.34.2 — 2026-06-17

### 🐛 Bug Fixes
- **Community videos opened from a listing now play with sound.** Tapping a listing's community badge and then a video used to open the carousel silent. Now it plays with sound by default — same as the main feeds. Volume is on your device's volume keys.

### 🛠 Improvements
- **"Nearby" is back in the bottom nav.** It got dropped in v0.34.1 by mistake — the radius-search Nearby tab is its own thing and stays.
- **Right-side rail on the listing feed dropped its "Nearby" button.** The community badge in the top-left already opens the same set of videos in a quick sheet without leaving the listing. One way to do each thing.

## v0.34.1 — 2026-06-17

### 🛠 Improvements
- **Cleaner bottom nav.** "Nearby" is gone — the community badge on every listing already takes you straight to a neighborhood, and the Community tab is right there for picking an area first. One way to do each thing.
- **The center button now says "Explore."** Big gold compass in the middle of the nav was unlabeled; now it carries its name like every other tab.
- **Explore stops duplicating Community.** The "Homes / Communities" toggle on top of Explore is removed — the Community tab already shows the same grid one tap away.
- **Homes chip moved to the top.** On any community video feed, the "🏠 N homes here" chip now sits in the top-left corner, matching the community badge on listing cards. Same place, same job — fewer rules to remember.

## v0.34.0 — 2026-06-17

### ✨ Features
- **Tap a community badge on any listing → see the neighborhood without leaving the swipe feed.** A new bottom sheet rises with the community's name, location, description, and a row of preview videos you can scroll horizontally. Tap any video and you're in a fullscreen left-right swipe through that whole community. Hit Back and you're right back on the listing you started from — the sheet was a quick look, not a detour.
- **Tap "🏠 N homes here" on any community feed → see every home for sale in that neighborhood without leaving.** A chip in the bottom-left corner of every community video opens a list of all the homes for sale in that community, sorted newest-first, with price, address, beds/baths, and square footage. Tap a row and you're in a fullscreen left-right swipe through those homes — videos play automatically, photos cover when there's no video. Hit Back and you're back on the community feed.
- **Both new flows use the same shape.** Tap a chip → bottom sheet for context → fullscreen swipe for browsing → Back to where you started. Same gesture in two places — buyers learn it once.

### 🔧 Technical
- **Real data only.** Stat rows and "host" cards that previously rendered with hardcoded ratings, school scores, commute times, and median-price placeholders have been removed. Where the database doesn't have a value yet, the surface stays clean instead of showing fake numbers. As the data fills in over time, those fields will appear automatically — no more stale placeholders to update.
- **Homes without any video or photo don't appear in the new community swipe.** They remain reachable through their direct listing link; they're just hidden from the visual browse loop until media is uploaded.

## v0.33.0 — 2026-06-17

### ✨ Improvements
- **Sound is on by default; the in-app mute button is gone.** Videos now autoplay with sound the moment you tap into a feed. The mute toggle that used to live on the right side of every video has been removed — use your phone's volume keys (or the side switch) to control audio. One control instead of two, and the right rail stays focused on the things you actually do (Like, Save, Listings).
- **Buttons feel right under your thumb everywhere.** Every tappable control in the top bars, the sign-in / sign-up pills, the avatar menu, the create-new sheet's close button, and the share / back / search buttons inside the swipe feeds is now a comfortable 44×44 — the size Apple and Google recommend for touch. Smaller targets that were hard to hit on a phone are gone.

### 🔧 Technical
- Foundation pass for upcoming community-discovery features. No new feature surface in this release; the changes below the line clean up sizing tokens, default media behaviour, and navigation invariants so the next release can move faster.

## v0.32.12 — 2026-06-17

### 🐛 Bug Fixes
- **Tapping a tab in the nav now feels instant.** Previously the first tap
  on Communities, Leads, Me, or any other tab from the bottom nav or top
  header had a 1-3 second pause before anything happened. The app now
  prepares the next page's content in the background as you browse and
  paints a placeholder layout the moment you tap — every tab change reads
  as immediate, even on slower networks.

## v0.32.11 — 2026-06-17

### 🐛 Bug Fixes
- **Tapping a community card now responds instantly.** Previously the
  first click on a community in the grid had a noticeable 1-3 second
  pause before the community page started rendering. The grid now
  prepares the next page in the background while you browse, runs the
  page's data lookups in parallel, and paints a placeholder layout the
  moment you click — so the page feels alive immediately even on slower
  networks.

## v0.32.10 — 2026-06-17

### 🐛 Bug Fixes
- **Listing edit page no longer feels laggy while typing.** The form was
  doing a full server-data sync after every autosave, which on slower
  connections caused noticeable keystroke→display delay. Autosave still
  runs (and your edits are still saved 600ms after you stop typing); it
  just no longer drags the rest of the page along with it. Other
  dashboard pages (publish, cover upload, community editor) are unchanged.

## v0.32.9 — 2026-06-17

### ✨ Improvements
- **Drafts and archived listings are now previewable from the dashboard.**
  Tapping a draft's cover (or the new "Preview" button) opens the same
  full-screen video feed buyers see, with a banner at the top reminding
  you it's a draft and only you can see it. Archived listings open the
  same preview with a muted banner explaining the public link is
