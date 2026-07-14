# landing-v2 手动 QA (Tick A4)

**日期**: 2026-07-11 15:53 UTC
**视口**: 1280x800 (desktop),浏览器 headless
**页面总高**: 6031px
**Hero 视频**: `hero.mp4` 已加载,playing (rs=4, 1080x1920, 60s, autoplay muted loop) ✅
**截图**: `qa-desktop-1280.png` (同目录)
**Feature cards**: querySelectorAll('.card') = 7 → 6 个 feature + 1 个 pricing 命中同 class,需在组件抽取阶段(B1)区分 class 名(`.feature-card` vs `.tier-card`)
**Neighborhood 图**: Peachtree Corners ✅ / Decatur ❌ naturalWidth=0 (Unsplash id `1596644462291-...` 404) / Alpharetta ✅

---

## Top 5 Issues (优先级排序)

### 🔴 P0 — Decatur Square 图 404
- **现象**: 中间 neighborhood card 图片加载失败,`naturalWidth=0`,浏览器 fallback 显示 alt text,破坏 3 列视觉节奏
- **根因**: `images.unsplash.com/photo-1596644462291-3d3ef5216d7e` 该 Unsplash asset id 已下架 / 无效
- **修**: 换成有效 GA-flavored Unsplash id(walkable downtown / brick main street 类)。原型阶段直接换 URL,生产阶段应本地化 → Supabase Storage `neighborhoods/decatur/hero.jpg`
- **文件**: `index.html` (搜 `1596644462291`)

### 🟡 P1 — Feature grid `.card` class 与 pricing tier 命名撞车
- **现象**: `document.querySelectorAll('.card').length === 7`,但 feature grid 只有 6 卡 → pricing tier 也叫 `.card`,组件抽取(B1)会歧义
- **修**: 拆成 `.feature-card` + `.tier-card` 两套 class,tailwind class 保持不变
- **备注**: 不在本 tick 修,留给 B1 组件抽取

### 🟡 P1 — Footer 对比度低于 WCAG AA(视觉判读)
- **现象**: 视觉 QA 报告 footer 灰字在 cream 背景上对比 borderline,legal/counties 列小字 <4.5:1 风险
- **修**: footer 文字色由当前 muted grey 调深一档(如 #6b6156 → #4a4139),保持暖大地色调不违反 memory 视觉规则
- **文件**: `index.html` `<style>` 中 footer color token

### 🟢 P2 — Hero metrics row 末列文案过挤
- **现象**: "5 languages (EN·ES·ZH·VI·KO)" 相比前 4 列 stat 明显更长,视觉节奏被打断
- **修**: 缩为 "5 langs" + tooltip / 或改成 "EN/ES/ZH +2" 短形。**注意**:memory 说 selling-only + GA-only,多语言只作为 buyer 触达渠道(小红书/微信 marketing copy),不是核心卖点 → 建议把这个 stat 换成更符合 GA-agent 卖点的数字,如 "48h avg reel turnaround" 或 "$0 filming cost"
- **positioning note**: 与 CLAUDE.md §1 "buyer-facing marketing copy generators MAY emit multiple languages" 一致,但 hero metric 位置暗示 langs 是 core value,建议下调重要性

### 🟢 P2 — Pipeline 5-step 视觉断层
- **现象**: 5 列步骤 (Source→Tag→Rank→Compose→Publish) 桌面横排偏挤,step 之间无连接线/箭头,"pipeline" 隐喻被削弱
- **修**: 在 step 之间加 `→` 或水平细线(cream 背景上的 sage/moss 色 1px),或把 5 步改成 3 步(Source → Compose → Publish,tag/rank 折进 compose 副标)
- **文件**: `index.html` `.pipe` section

---

## 未在本 tick 覆盖
- Mobile (<768px) 视口未再验(A1 已验过,视频加入后未重验) → 建议 C 阶段之前抽 1 tick 复验
- Lighthouse 分数未跑(headless CLI Lighthouse 未装,本 tick 用视觉 QA 代替)
- Keyboard tab 顺序 / a11y focus ring 未审
- Reduced-motion:hero 视频未做 `prefers-reduced-motion` fallback → 生产必须加

---

## 冲突记录(不改代码,只登记)
- **CLAUDE.md §1** 允许 marketing copy 多语言 + Rednote/WeChat
- **memory 口径** GA-only selling-only
- 本页 hero "5 languages" stat 位置偏重要,与 memory selling-only 卖点稍偏,建议由 owner 决定是否降级(见 P2)
