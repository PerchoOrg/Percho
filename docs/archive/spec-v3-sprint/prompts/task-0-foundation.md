# Task 0 — 地基:tokens + 核心组件 + 手势/haptics/视频封装

(先读 `prompts/_MASTER.md` 并遵守其全部规则。本任务 spec 依据 = `00-overview.md` 全文。)

## 目标

建立全 app 唯一权威的地基层。后续 5 个任务全部只引用这一层,不允许各自重新实现。

## 范围

1. `theme/tokens.ts` — 00 §0.3 design tokens 表 + §0.4 typography scale,逐行照抄成 TS 常量(色值、字体、字号、5 档圆角)。导出类型化对象,不导出裸字符串。
2. `theme/typography.ts`(可并入 tokens)— 7 档 text style(Display/Title1/Title2/Headline/Body/Footnote/Caption),含 New York serif + SF Pro 映射和 fallback。
3. 手势层 — `hooks/useSwipeCard.ts`(或等价):实现 00 §0.5 契约的横滑判定(35% 阈值、>800pt/s 速度判定、±8° 跟手旋转、±30° 扇区起判)。判定逻辑抽 pure function(输入 translation/velocity/卡宽 → 输出 none|left|right)+ unit test。
4. `lib/haptics.ts` — 封装 00 §0.5 haptics 表的 4 种语义(swipeThreshold / cardSettle / milestone / 以及显式的 "pass = 无"),组件只准调语义名,不准直接调 expo-haptics。
5. `components/CardVideo.tsx` — expo-video 封装:muted/loop/poster/metadata-only preload;`isTop` prop 控制播放权;82% 进度回调(供 CTA 淡入);play() reject → mute-and-retry;全局 soundOn(Zustand)。
6. 核心组件 8 件(00 §0.6):SwipeStack(top+2 张,scale/opacity 按表)、KindChip、MatchBadge(含 ≥85% FOMO 态、<60% 隐藏、非 Stage 4 隐藏)、CardFoot(价格 serif 25 bold、pills ≤3 截断)、ExploreButton、TabBar(4 tab,62pt)、BottomSheet(medium 50% / large 90%)、SoundToggle(30pt --glass,状态栏行右端)。
7. `state/funnel.ts` — 全局 `funnelStage` 状态机骨架(Zustand):stage 0–4、晋级判定接口(阈值实现留给 task-1,这里只定接口和"永不自动回退"约束)、持久化。

## 明确不做

- 任何页面/路由(feed/listing/community/search 都不做);组件用 Storybook 式的开发预览屏或最小 demo 屏验收即可,demo 屏不进 main 导航。
- 漏斗晋级具体阈值(01 §1.6,归 task-1)。

## 验收标准(simulator 逐项截图/测试)

- [ ] 全 repo grep 无组件内 hex 色值(除 tokens.ts)、无字面量 borderRadius
- [ ] 手势 pure function unit test 过:35% 阈值边界、799 vs 801 pt/s、±30° 扇区内外
- [ ] SwipeStack:top 卡跟手 ±8° 旋转,next/after 缩放透明度符合表
- [ ] 左滑无震动,右滑过阈值 selectionAsync(真机或说明 simulator 限制)
- [ ] CardVideo:两卡 demo 中切卡后旧卡 pause+mute,新 top 卡从 0 播;82% 回调触发
- [ ] MatchBadge 三态:<60 隐藏 / 60–84 普通 / ≥85 FOMO 态
- [ ] BottomSheet 两档 detent + grabber;TabBar 4 tab active/inactive 态
