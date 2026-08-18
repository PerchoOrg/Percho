# Percho iOS — UX Design Spec v3 · 00 Overview & System

> Source: percho-prototypes/ios-ux-design/spec/index.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

Buyer-facing iOS app。Chrome direction: **02 Warm Editorial**(暖纸色 + serif 数字);feed 卡片面保持沉浸式全出血(深色,不随主题)。v2 核心变化:feed 前置阶段化漏斗(先懂 buyer 再荐房)、feed chrome 极简化、listing/community 各自独立详设页、Search 与 Map 合并为单一 Search tab(搜索框 + 地图 + 伸缩列表)、You tab 增加 Area Familiarity。

v3 · 2026-07-26 · Canon 依据: docs/design/discovery-feed.md + docs/design/listing-explore.md · v3:Search + Map 合并为一个 tab(5→4);v2.1:预告 listing 可 like、四柱贯穿

## 0.1 Information Architecture

4 个 tab。Feed 是唯一主消费面;Search(v3 合并原 Search + Map)= 显式意图直达 + 空间浏览 + 库存清单一体面;Saved / You 是 feed 的出口与回路。

主流程:▶︎ Feed(默认落地 · swipe 主面 · 阶段化漏斗)→ Listing / Community Explore(tap Explore 或 data face 数据点进入)→ Schedule tour / Ask AI

其余入口:🔍 Search — 搜索框 + 地图 + 伸缩列表(直达 / 空间浏览 / 库存清单 / journey 图层)· ♡ Saved · 👤 You — persona/evidence/familiarity

| 路由 (expo-router) | 页面 | 入口 | Spec 页 |
|---|---|---|---|
| `/(tabs)/feed` | Discovery Feed(默认落地) | app 启动 | 01 |
| `/listing/[id]` | Listing Explore(guided tour → free explore) | 卡片 Explore / data face 数据点 / Saved / Map / Search | 02 |
| `/community/[slug]` | Community Explore(subdivision) | community 卡 Explore / listing 页 community 区 / Map / Search | 03 |
| `/(tabs)/search` | Search — 地图 + 伸缩列表 + journey 图层 | tabbar / overflow banner / milestone 卡 / familiarity 区块 | 04 |
| `/(tabs)/saved` | Saved | tabbar | 05 |
| `/(tabs)/you` | You(persona + evidence + familiarity + settings) | tabbar / persona toast | 05 |
| `/onboarding` | 2 屏首启 → 直接落 feed | 首次启动 | 05 |

> **注:无 modal 导航栈规则:**Explore 是 push(back 回 feed 原位),hotspot/pin 动作是 bottom sheet,不引入 fullScreenModal。feed 位置 (activeIndex) 在 push 返回后必须保留。

## 0.2 发现漏斗(v2 核心模型 — 全 app 的骨架)

Owner 定案:前期不上 listing feed,先充分了解 buyer,地理上从大到小收窄,收窄到 community 级后才开始精准 listing 推荐。这个五阶段漏斗同时驱动:feed 节奏引擎(01)、Search 的 journey 图层(04)、You tab familiarity(05)。工程侧是一个全局 `funnelStage` 状态机。

| Stage | 名称 | 内容 | 晋级条件 |
|---|---|---|---|
| STAGE 0 | Intent & Life | 买房目的、家庭/生活形态、预算带。纯 ask/trade-off 卡,零房源。 | intent + 预算带 + ≥2 生活信号 |
| STAGE 1 | Area → City | metro 内大区/城市取向。area 氛围卡(照片/视频)+ 地理 ask 卡 + 1/10 预告 listing(可 like,弱信号)。 | ≥1 city 聚焦(yes 密度) |
| STAGE 2 | Zip / 片区 | city 内片区对比:通勤/学区/价位 trade-off + 片区氛围卡 + 1/10 预告 listing。 | 2–4 个 zip 在池 |
| STAGE 3 | Community | subdivision 卡为主。community like 是最强信号。 | ≥2 community like |
| STAGE 4 | Precision Listings | listing 卡解锁,锚定已 like 的 community 池,match 分数可信。 | 终态:纯内容流 + insight |

| 规则 | 规格 |
|---|---|
| 晋级判定 | 每次 swipe 后重估。条件见各 stage 框(具体阈值 01 §1.6)。晋级瞬间 feed 插入 **milestone 卡**(01 §1.5)— 这是漏斗进度对用户的唯一呈现,feed 上无常驻进度 chrome。 |
| 降级/回退 | 用户在 You tab 移除某层 scope,或 Search 直接跳到更具体层(如直接搜 community)= stage 快进。stage 永不自动回退;回退只由用户显式操作触发。 |
| Listing 硬门槛 | Stage 0–2 **不出 listing 卡**(唯一例外:Search 直达和深链 — 显式意图不受漏斗限制)。Stage 3 出 community + 少量该 community 在售预览。Stage 4 全解锁。 |
| 冷启动时长预期 | Stage 0→4 目标 2–4 个 session(每 session 20–40 swipe)。单 session 内狂 swipe 也可到 Stage 3 — 门槛是信号量不是时间。 |

## 0.3 Design Tokens

工程直接抄这张表(= _spec.css :root)。所有色值经过 WCAG AA 校验(ink on bg = 12.9:1,ink-2 on bg = 4.6:1)。

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | #FAF6F0 | App 背景(暖纸色)— chrome 主底 |
| `--surface` | #FFFFFF | 卡片、sheet、stat tile |
| `--surface-2` | #F3EDE4 | 凹陷底、输入框、次级 well |
| `--border` | #EADFD0 | hairline 分隔 |
| `--ink` / `--ink-2` / `--ink-3` | #2B2116 / #8A7358 / #B9A88F | 主文 / 次文 / 占位 |
| `--accent` / `--accent-deep` | #B45309 / #7C3A05 | 品牌琥珀 — section head、active、链接 / pressed |
| `--pos` / `--neg` | #1B7A4D / #B3402A | match·yes / no·destructive |
| `--cta` | #2B2116 | 主 CTA 填充 = 墨块(不是琥珀 — 琥珀只做点缀) |
| `--glass` | rgba(250,246,240,0.92) | 叠在照片上的浅色 chip/badge/按钮 |
| `--font-display` | New York(serif), fallback Georgia | 价格、问题、页面标题、sheet 标题 |
| `--font-ui` | SF Pro Text | 其余全部 |
| `--r-card/-sheet/-tile/-btn/-pill` | 28 / 24 / 14 / 16 / 999 px | 圆角体系(只有这 5 档) |

> **注:沉浸面不变量:**feed 卡片面(照片/视频全出血 + 底部黑渐变 `--card-grad`)在任何主题下都是深的。深色只存在于卡片内;卡片外 chrome 一律暖纸色。工程侧禁止给卡片面做 light variant。

## 0.4 Typography Scale

| Style | Font / size / weight | 用途 |
|---|---|---|
| Display | New York 34 / bold, tracking −1 | ask 问题(卡上) |
| Title 1 | New York 28 / bold | 页面标题、detail 价格 |
| Title 2 | New York 22 / bold | sheet 标题、卡上价格 |
| Headline | SF Pro 15 / semibold | 行标题、按钮 |
| Body | SF Pro 15 / regular | 正文 |
| Footnote | SF Pro 13 / regular | 地址、说明 |
| Caption | SF Pro 11 / semibold, tracking +1.2, uppercase | SECTION HEAD、kind chip、tag |

> **注:Serif 只用于"值得慢慢看"的内容:**价格、ask 问题、页面/sheet 标题。规格数据(bd/ba/sqft)、按钮、导航一律 SF Pro。这是 Warm Editorial 的核心手法 — serif 是重点照明,不是墙面漆。

## 0.5 手势契约总表(全 app 唯一权威)

> **2026-07-30 变更 — flip 已移除。** 卡片曾经是双面的:tap 卡身翻到 data
> face,底栏有 "Flip back"。owner 砍掉了这个机制("砍掉flip back的功能"),
> 卡片现在只有一面,进详情统一走卡上的 `Explore →` 按钮。代码里 flip 的每一
> 处(`flipProgress` / `faceOpacity` / `canFlipCard` / `renderBack`)都已删除,
> 不是禁用 — 见 `apps/mobile/lib/gesture/capability.ts` 顶部注释。本页及
> 01/02/03 页凡提到 data face / Flip back 的段落均已按此更新。

Canon §2.5。任何新卡型/新面必须先对照此表 — 尤其"垂直手势永不承载语义"(canon §9.7:swipe-up 与 swipe-right 在手指上冲突)。v2:deep peek 移出 P0,long-press 全卡型 no-op(手势位保留,不复用作其他语义)。

| 手势 | Feed 上语义 | 参数 |
|---|---|---|
| 横滑 right / left | 按卡型:yes/no · like/pass · 二选一 · agree/disagree(见 01 页卡型表) | 阈值 = 卡宽 35%;速度 > 800pt/s 直接判定;跟手旋转 ±8° |
| Tap 卡身 | **全卡型 no-op**(2026-07-30 起 — flip 机制已砍) | 卡片只有一面。进详情走卡上的 `Explore →` 按钮,不是手势 |
| Long-press | **全卡型 no-op(v2 — deep peek 移出 P0)**。手势位保留,未来不得挪作 like/pass 之外语义 | — |
| Tap 按钮(Explore / Skip / milestone CTA) | 显式导航/状态变更 — 永远是按钮,不是手势 | hit target ≥ 44pt |
| 垂直滑动 | **feed 卡面上:无语义。**data face / sheet / detail 内 = 正常滚动 | pan 手势限 ±30° 扇区起判横滑,余下交给 ScrollView |

| Haptics(expo-haptics) | 触发 |
|---|---|
| `selectionAsync` | swipe 过阈值瞬间(方向判定) |
| `impactAsync(light)` | 卡片飞出落定、sheet 弹出 |
| `notificationAsync(success)` | milestone 卡出现、insight 达成、persona 变化 toast、save feature |
| 无 haptic | pass(左滑)不震 — 负反馈不奖励 |

## 0.6 组件库(核心 8 件)

v2 基准屏:feed chrome 极简 — 卡外只有 sound toggle 和 tab bar,无 scope strip、无 persona chip(persona/scope 全部移入 You tab,漏斗进度用 milestone 卡在流内呈现)。

*[图:基准屏 mockup — listing 卡(92% match badge、$685,000、Waterside、3 pills、Explore 按钮)+ 4-tab tabbar,组件标注见下列表]*

1. **Feed chrome = 只有 sound toggle** — 状态栏行右端 30pt --glass 圆钮(与 notch 同排,不与卡上 badge 抢位),z-100。卡外没有任何其他常驻元素(v2 极简铁律)。persona 变化仍有 1.6s toast(z-95),但 toast 是瞬时不是 chrome。
2. **Kind chip** — 左上。LISTING / COMMUNITY / AREA / 卡型 tag。Caption style,--glass 底 + --accent 字。
3. **Match badge** — 右上。仅 Stage 4 listing 卡显示(漏斗未走完时分数不可信,不显示)。≥85% 时替换为 FOMO 态:"🎯 92% MATCH · See why →"(可点,翻 data face)。<60% 不显示。
4. **Card foot** — 价格 = New York serif 25 bold。价格/地址/规格/pills(≤3)/Explore 按钮。全部压在 --card-grad 渐变上。pills 超 3 个截断 — 前 3 个信号最强的。
5. **Explore 按钮** — --glass 底墨字 pill。feed→detail 的显式入口(另一入口 = data face 数据点 tap)。
6. **Tab bar(4 tab)** — 62pt + home indicator。暖纸底 + hairline。active = ink 全彩,inactive = 50% 棕。切 tab 保留各自导航栈。
7. **Swipe stack** — 当前卡后渲染 2 张:next = scale 0.94 / opacity 0.5,after = 0.88 / 0.25。只 top 卡有手势和视频播放。
8. **Bottom sheet** — --surface 底,radius 24 顶角,grabber。detents: medium(50%)/ large(90%)。用于 hotspot 动作、tour 停靠点;Search tab 的库存列表 sheet 是它的三档变体(04 §4.1)。

## 0.7 视频规则(expo-video)

| 规则 | 值 |
|---|---|
| 挂载属性 | `muted loop playsinline`,poster = 首帧图,preload metadata-only |
| 播放权 | 仅 top 卡播放;换卡时全体 pause + mute,top 卡 `currentTime=0` 后 play |
| 声音 | 全局 soundOn 状态(Zustand),持久;右上固定 🔇/🔊 toggle;play() reject → mute-and-retry |
| 82% CTA | 播放进度 82–99% 时卡面淡入 "See all 8 videos →" 呼吸 CTA;换卡必须 reset;无视频卡不伪造 |
| 无视频降级 | 静态 hero 照片是一等状态,无占位/无缺失提示 |
