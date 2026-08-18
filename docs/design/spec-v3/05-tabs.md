> Source: percho-prototypes/ios-ux-design/spec/tabs.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

# 05 · Tabs, Onboarding & System States

Saved、You(Area Familiarity)、首启 onboarding、推送策略、可达性、工程移交清单。Search tab(搜索 + 地图 + 列表)整体见 04 页。设计原则不变:每个面都有一条明确路径回到 swipe 主循环。

v3:原本页的 Search 设计已并入 04(Search + Map 合并,owner 2026-07-25 定案)。禁 filter 表单的铁律仍在,规格见 04 §4.4。

## 5.1 Onboarding(2 屏,15 秒内进 feed)

*Phone mockup:屏 1 — 价值主张。全出血房源图片 + 底部渐变遮罩,大标题 "Find where you belong.",副文案 "Answer a few swipes about your life — Percho narrows the map until the right homes find you.",主 CTA "Start swiping",下方下划线小字 "I already have an account"。*

标注说明:

1. **屏 1:价值主张** — 全出血房源视频(muted 自动播)+ 一句话(文案点明"先问后荐"的漏斗价值,管理预期:开头没有房)。单 CTA "Start swiping"。**无注册墙** — 匿名即可 swipe,scope 存本地,注册在第一次 Save/Schedule 时才要求。
2. **屏 2:手势教学** — 一张演示卡自动播 swipe 动画(右滑→绿 YES,左滑→红 NO,tap→翻面),文案 "Swipe right if it feels right"。教学卡本身可 swipe,swipe 即落 feed。
3. **落地 = Stage 0 feed** — 前几张 intent/life ask 卡就是问卷(01 §1.7)。**权限时机:**定位 — 永不在启动时要(v1 甚至可不用定位);通知 — 第一次 Save 后问;ATT — 不接广告 SDK,不弹。

## 5.2 Saved tab

*Phone mockup:Saved — Homes 段。页首标题 "Saved",段控 chips:Homes · 5(on)/ Communities · 2 / Must-haves · 4。列表两行:$685,000 · 92% · 1204 Copper Leaf Ct · Waterside · "Price unchanged · 12 DOM"(绿);$612,000 · 88% · 88 Millbrook Ln · Briar Chapel · "↓ $13K price cut Tue"(红)。下方 COMPARE 区:"Select 2–3 homes → side-by-side on the dims you care about (from your trade-offs)."。Tab bar:Feed / Search / Saved(on)/ You。*

标注说明:

1. **三段:Homes / Communities / Must-haves** — Must-haves = Explore 里 save 的 feature/POI("open kitchen"、"near trailhead")。tap must-have = feed 按该项临时加权并跳回 feed。这是 saved_features 的用户可见面。
2. **行内状态徽** — 价格变动(降价用 --neg 红显眼提醒 act fast,文案 "price cut" 本身是机会信号)、DOM、已下市置灰 + "Sold" 徽。变动是推送触发源(5.5)。
3. **Compare** — 选 2–3 个 → 并排对比表,对比维度顺序 = 用户 trade-off 答出来的 dim 优先级(个性化列序,不是固定 spec 表)。v1.1 范围,先出灰态入口。

## 5.3 You tab(persona + area familiarity + evidence)

*Phone mockup:You — familiarity + evidence。页首标题 "You"。persona 卡:YOUR PERSONA / "Trail-Runner Suburbanite" / "Shaped by 12 likes · 3 trade-offs · Stage 3 of 5"。区块 "HOW WELL YOU KNOW EACH AREA (tap → map)":Decatur 78%(三段堆叠条,"31 cards · 2 communities liked · 安 ✓ 学 ✓ 便 ✓ 潜 ✓")、Brookhaven 45%("14 cards · potential ✓ · safety & schools still unknown")、Chamblee "not yet · Explore →"。区块 "WHAT PERCHO KNOWS (tap to correct)":Open floor plans(强度条 85%,7 likes)、Trail access(75%,6 likes)。Tab bar:Feed / Search / Saved / You(on)。*

标注说明:

1. **Area Familiarity(v2 新 section)** — journey 内每个地理单元一行:名称 + 熟悉度 % + 三段堆叠条 + 一句"已知/未知"摘要。**计算(familiarity score 0–100):**覆盖 40 分(该区已见卡数/该区可问信号数,饱和于 25 张)+ 决断 30 分(like/pass 率偏离 50% 的程度 — 犹豫=不熟)+ 维度 30 分(与 community 四柱同一套维度:安 safety / 学 schools / 便 convenience / 潜 potential 各 7.5,该维有 ≥2 信号记 ✓ — 命名与 03 页四柱严格一致,一套心智模型两处复用)。行 tap → 04 Search tab journey 图层聚焦该区。与 journey 热力层同一数据源(`areaFamiliarity[]`),两面必须一致。
2. **缺口即行动** — 摘要句点名未知维度("safety & schools still unknown")。tap 未知维度词 = 回 feed 注入该区该维度的 ask/challenge 卡。"not yet" 区显示 "Explore this area →" 同理。familiarity 是发现引擎的用户可见面,不是成就系统 — **无徽章、无满分奖励、无 streak**。
3. **Evidence 列表(可纠错)** — 每条 = 观察 + 强度条 + 来源计数。tap 行 = "Still true? [Yes / No, remove]",No = 降权该 evidence 链(等价 insight disagree)。persona 卡 tap = trait 详情。scope 管理(地理 chip ×)也在本 tab(v2 从 feed 移入):STAGE 区块列当前漏斗层的已确认 scope,× 移除 = 该层重新可问。
4. **Settings(列表底部,本图略)** — Account / Notifications / Sound autoplay / Sign out / Delete account。标准 iOS 分组列表。匿名用户显示 "Create account to sync"。

## 5.4 推送策略(克制)

| 触发 | 文案骨架 | 上限 |
|---|---|---|
| Saved listing 价格变动 / 下市 | "88 Millbrook Ln dropped $13K" | 即时,无上限(用户显式关注) |
| Journey 内 community 新上市且 match ≥85% | "A 91% match just listed in Waterside" | ≤1/天,合并同批;仅 Stage 4 用户 |
| 回流(7 天未开) | "3 new homes fit your Trail-Runner profile" | ≤1/周,persona 未成型不发 |
| 禁止 | 无 streak、无 "complete your profile"、无 "your familiarity dropped"、无营销 blast。推送全部 deep link 到具体 listing/feed 位置。 | |

## 5.5 全局系统状态 & 可达性

| 项 | 规格 |
|---|---|
| 空态 — Saved | "Homes you like will live here" + [Back to feed]。Search tab 空态见 04 §4.4/§4.5。永远给回主循环的按钮。 |
| 错误 — API 失败 | toast "Something's off — retrying…" 自动重试;3 次失败出全屏轻量错误卡 + Retry。不用 alert 弹窗。 |
| Dynamic Type | 正文跟随系统缩放至 XL;卡上 serif 展示字号锁定(照片上文字缩放破坏排版,以 44pt hit target 和 VoiceOver 完整标签补偿)。 |
| VoiceOver | 卡片 = 单可访问元素,label 汇总("Listing, $685,000, 4 bed, Waterside, 92% match");custom actions = like/pass/explore(flip 已移除)。swipe 全部有按钮等价物。Search 图层 chips = toggle button 原生可达;热力区块有 label("Decatur, 78 percent explored")。 |
| Reduce Motion | 关闭卡片旋转/呼吸/milestone 动画;flyout 改 crossfade;haptics 保留。 |
| 深链 | `percho://listing/[id]`、`percho://community/[slug]`、`percho://search?focus=<geo>`、universal links percho.co/l/… — 冷启动直达,back 落 feed 首位。 |

## 5.6 工程移交清单

| # | 项 |
|---|---|
| 1 | Tokens/type/radius 直接取 00 页 §0.3–0.4(= _spec.css :root)。 |
| 2 | 手势契约以 00 §0.5 为唯一权威;每个 handler 对 8 卡型判空(01 §1.1 红线);long-press 全卡型 no-op。 |
| 3 | 已有 Expo 骨架(apps/mobile)可复用但卡型集变了:删 deep peek/scope strip 代码路径,新增 area/milestone 卡型 + funnelStage 状态机。API_BASE 改回 percho.co 生产 + /api/mobile/feed 生产化是前置工程项。 |
| 4 | 新增服务端:generateDiscoveryFeed(funnelStage 感知)/ evaluateStageAdvance / generateGuidedTour / searchEntities / areaFamiliarity 聚合。新表:buyer_scope_events + listing_hotspots + listing_explore_events + community_explore_events + saved_features + map_events + search_events。 |
| 5 | 地理数据前置:Atlanta metro 地理单元编辑集(~40 个 area/city/zip 片区,含氛围文案+代表 community)+ city/zip 简化边界 geojson + subdivision 边界(已有)。这是 Stage 1–2 有卡可发的前提,**工程开工前先做数据**。 |
| 6 | 实现顺序:① feed 皮肤 + funnelStage 引擎 + ask/area/milestone 卡 → ② listing/community data face + explore 两面 → ③ Search tab(地图 + 伸缩列表 + journey 图层)+ You familiarity(同一数据源,一起做)→ ④ 推送。每阶段 exit criteria 对照 canon doc §6 + 本 spec 埋点健康指标。 |

Spec 完 · 回到 00 Overview
