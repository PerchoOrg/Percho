> Source: percho-prototypes/ios-ux-design/spec/feed.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

# 01 · Discovery Feed

唯一主消费面。单列 swipe(横滑作答),卡型由**阶段化漏斗节奏引擎**驱动:先懂人、再收窄地理(area → city → zip → community)、最后才荐房。本页:卡型总表、每种卡型图纸、漏斗引擎参数、swipe 状态机、系统状态、埋点。

Canon: discovery-feed.md §1–§4(节奏引擎按 owner 2026-07-25 修订升级为漏斗制)· 铁律:所有偏好输入 = 一卡一问 swipe,禁 picker/多选/bottom-sheet 表单

## 1.1 卡型总表 & swipe 语义

| 卡型 | 目的 | ← 左滑 | 右滑 → | tap | 出现阶段 |
|---|---|---|---|---|---|
| **Ask**(preference) | 学偏好 · 收窄地理 | No | Yes | no-op | 全阶段(密度递减) |
| **Area**(v2 新) | 大区/城市/zip 氛围试探 | not for me | tell me more | flip → area data face | Stage 1–2 主力 |
| **Community** | 推荐 subdivision | pass | like(漏斗最强信号) | flip → data face(03 页详设) | Stage 3 主力,4 延续 |
| **Listing** | 精准荐房 | pass | like | flip → data face(02 页详设) | **Stage 1–2 预告(1/10,可 like)· Stage 3 预览 · Stage 4 主力** |
| **Trade-off** ★ | 逼出优先级 | 选左 | 选右(**永不 yes/no**) | no-op | Stage 0 起,全程 |
| **Challenge** | 市场教育 · 好玩 | 二选一;swipe 后卡面 reveal 真答案 | ← 同左 | no-op | Stage 2+,≤10% |
| **Insight** | AI 观察确认 | disagree(降权 evidence) | agree | "not sure" 按钮 | evidence 过阈值即出 |
| **Milestone**(v2 新) | 漏斗晋级仪式 | 不可 swipe — 单 CTA "Keep going →" | ← 同左 | CTA only | stage 晋级瞬间,每级一张 |

> **注:** **工程红线(canon §11 已知 bug 教训):**每个手势 handler 必须对全部 8 种卡型判空 — ask/milestone 卡没有 data face,milestone 卡没有 swipe。handler 假设存在会 throw 并丢失 touch 绑定。新增卡型时 review 所有碰卡的 handler。

> **注:** **v2 删除项:**① deep peek(long-press)移出 P0 — 全卡型 long-press no-op;② scope strip 移除 — 卡外零常驻 chrome,scope 管理全部在 You tab;③ persona chip 移除 — persona 变化只保留 1.6s toast。理由:主 feed 沉浸感优先(owner 2026-07-25)。

## 1.2 Ask 卡(preference)

*[图:Ask 卡 — yes/no 形态 phone mockup(layer tag "🎯 YOUR PURPOSE"、问题 "Research Triangle, NC?"、副文案 "Raleigh · Durham · Chapel Hill. Universities, biotech, top schools."、map thumb、swipe hints "← No / Yes →"、"Skip this topic" 链接),标注见下列表]*

1. **Layer tag** — Caption style,#FFD9A8。按漏斗阶段:🎯 YOUR PURPOSE / 🌱 YOUR LIFE / 🧭 AREA / 🌆 CITY / 📮 ZIP / 🏘 COMMUNITY / 🎭 LIFESTYLE。
2. **Map thumb 58×58** — 仅地理层(area/city/zip)显示,静态图高亮当前问题的地理范围(区级 vs 市级视觉可分)。intent/life/lifestyle 层不显示。
3. **Swipe hints** — 红绿分置 + text-shadow(亮照片上必须)。二选一形态(如 "Modern ← → Classic")时两侧改为选项名,禁 ✓/✗。首张 ask 卡首次进入时 hints 做一次 1.2s 轻摆教学,之后不再。
4. **Skip this topic** — 低强调 underline link(非按钮),唯一允许的卡上 chrome 例外(canon §1.7)。点击 = 本 session 弃掉当前层剩余 ask 卡,记 `scopeSkipped[layer]=true`。hit target 垂直扩到 44pt。
5. **背景图** — 专业街景/天际线/航拍 stock(v1 不用 UGC,canon §4.1)。无 back face。

## 1.3 Area 卡(v2 新)— Stage 1–2 的地理试探主力

*[图:Area 卡 — city 级示例 phone mockup(kind chip "AREA · CITY"、map thumb、标题 "Decatur, GA"、副行 "City · east of Atlanta · ~25 min to Midtown"、规格行 "Median $520K · walkable square · top schools"、pills "🚶 Walkable core / 🏫 Schools 8/10"、swipe hints "← Not for me / Tell me more →"),标注见下列表]*

1. **三个粒度共用一个卡型** — AREA(metro 大区,如 "North Fulton")/ CITY / ZIP(呈现为片区名不是数字,"East Decatur · 30030")。kind chip 标粒度。媒体 = 该地标志性街景/航拍视频(muted 自动播,同全局视频规则)。
2. **Swipe 语义 = 兴趣不是 like** — 右滑 "Tell me more" = 该地理单元加权 + 后续注入其下一级卡;左滑 "Not for me" = 降权(软信号,非拉黑)。连续右滑同 city 两次 = 该 city 视为聚焦,晋级判定输入。
3. **Tap → area data face** — 深底数据面(同 listing data face 家族):median、库存、价格趋势 mini chart、通勤锚点(到 metro 核心 min)、学区带、3 个代表 community 名。底部双钮 Flip back / See on map →(跳 04 Search tab 并聚焦该区)。每个数据点可点 — 落点是 Search 地图对应图层,不是 listing。
4. **数据源** — area 级统计从 listing 库聚合(median/库存)+ 静态编辑内容(氛围文案、代表 community)。v1 Atlanta metro 手工编辑 ~40 个地理单元(区/市/zip 片区)足够。

## 1.4 Listing / Community 卡 front face

Front face 图纸见 00 §0.6 基准屏(listing)。tap 翻 data face — **data face 与 explore page 的完整详设:listing 见 02 页,community 见 03 页**(v2 各自独立成页)。front 规则:价格/名称、地址、规格行、pills ≤3、Explore 按钮;match badge 仅 Stage 4 显示。

## 1.5 Milestone 卡(v2 新)— 漏斗晋级仪式

*[图:Milestone — Stage 2→3 示例 phone mockup(深色仪式卡:"STAGE UNLOCKED" / 大标题 "You've narrowed it to Decatur & Brookhaven." / 副文案 "Next: we'll show you the communities inside them — pockets with their own vibe, HOA and price band." / chips "🌆 Decatur"、"🌆 Brookhaven"、"budget $450–650K" / CTA "Keep going →" / 副链 "See my journey on the map"),标注见下列表]*

1. **唯一的漏斗进度呈现** — feed 上无常驻进度条(沉浸铁律),晋级瞬间在流内插一张 milestone 卡替代。内容 = 已确认的 scope 回显(chip 罗列)+ 下一阶段预告。success haptic。每级一张,不重复。
2. **不可 swipe** — 左右滑 spring 回位(30% 位移封顶)— 仪式卡必须显式确认。主 CTA "Keep going →" 继续 feed;副链 "See my journey on the map" 跳 04 Search tab + journey 图层 on。这是 journey 图层的主要发现入口。
3. **Stage 3→4 特例** — 文案 "Now we know enough to show you homes." — listing 解锁的仪式感是漏斗制的回报时刻,预告文案点明 match 分数从此可信。

## 1.6 Trade-off ★ / Challenge / Insight 卡

*[图:三张 phone mockup — ① Trade-off「视觉中分」:左半 "Bigger yard(← swipe left)" / 右半 "Shorter commute(swipe right →)",kind chip "TRADE-OFF";② Challenge「reveal-after-swipe」:kind chip "CHALLENGE",tag "🎲 GUESS THE PRICE",问题 "This kitchen belongs to a…",副行 "Waterside · 4 bd · built 2021",hints "← Under $650K / Over $650K →";③ Insight「agree/disagree」:kind chip "💡 INSIGHT",tag "PERCHO NOTICED",问题 "You gravitate toward trail-access homes.",副行 "6 of your last 8 likes back onto a greenway. We'll rank trail access higher.",hints "← Not really / That's me →",描边按钮 "Not sure"]*

| 细则 | 规格 |
|---|---|
| Trade-off 中分 | 1.5px 虚线分界;两半各自渐变压暗;swipe 时被选半边亮起(opacity 1)、弃半边压暗(0.4)跟手反馈。记 `(dim_left, dim_right, chosen)`。**永不出现 ✓/✗ 或 yes/no 文案。**Stage 0–2 的 trade-off 偏地理/生活(yard vs commute);Stage 3+ 偏房源属性(new build vs character)。 |
| Challenge 选择 | **答案用按钮选,不用 swipe**(owner 2026-07-27 改版)。卡面给两个 ≥44pt 的选项按钮;tap 之后原地揭晓:正确项描边绿、选错的那项描边红,显示真价("$712,000")+ 教学文案 + 一个 `Explore →` 进一步了解该房源。swipe 在这张卡上**只表示"下一张",不记任何信号**、无方向标签、无停留。Stage 2 起才出(需要地理上下文才有梗)。<br>**旧设计(已废弃)**:swipe 判定 + 停 900ms 再飞出。失败原因:swipe 是"离开卡片"的手势,拿它当答题手段意味着答案只能在卡片正飞出去的过程中被阅读 —— 实机上连续被读成三种故障(卡在半屏、回中像撤销、然后又莫名自己滑走)。 |
| Insight 触发 | 仅当 evidence 过阈值(如同类 like ≥6/8)才生成,无固定节奏。文案模板必须引用具体 evidence 数字。左滑 disagree = 降权该 evidence 链。 |
| "Not sure" 按钮 | insight 独有第三选项(描边 pill,bottom-center)。tap = 跳过不记信号。hit ≥44pt。 |

## 1.7 阶段化节奏引擎(generateFeed v2)

纯函数 (funnelStage, state, N) → Card[]。每个 stage 有独立的卡型配比;晋级判定在每次 swipe 后运行。典型冷启动前 30 张(跨 Stage 0→2):

*[图:节奏可视化条 — 依次为:ask intent、ask life、trade、ask budget、mile 0→1;area、area、ask geo、city、tease、trade、city、mile 1→2;zip、zip、chall、zip、tease、trade、insight、zip]*

▲ = milestone(晋级仪式)· ⌂ tease = 预告 listing(1/10,可 like,弱信号)· Stage 3 起才出现 community 卡,Stage 4 起 listing 成为主力

| Stage | 卡型配比(每 10 张) | 晋级条件(swipe 后重估) |
|---|---|---|
| **0 · Intent & Life** | ask ×7 · trade-off ×3。零地理、零房源、零 challenge。[^s0chall] | intent 确认 + 预算带 + ≥2 生活信号(通常 8–12 张) |
| **1 · Area → City** | area/city 卡 ×5 · ask(geo)×2 · trade-off ×2 · **listing 预告 ×1** | ≥1 city 达到聚焦(该 city 及其下级右滑 ≥3 且右滑率 >50%) |
| **2 · Zip / 片区** | zip 卡 ×4 · trade-off ×2 · ask ×1 · challenge ×1 · **listing 预告 ×1** · insight(条件)×1 | 2–4 个 zip 在池(右滑 ≥2 各) |
| **3 · Community** | community ×6 · listing 预览 ×2(限已 like community 内,match badge 不显)· trade-off ×1 · insight ×1 | ≥2 community like |
| **4 · Precision** | listing ×5 · community ×2 · insight/challenge ×2 · ask(补漏)×1 | 终态。持续学习,match badge 解锁。 |

[^s0chall]: Stage 0 原本写 `ask ×6 · trade-off ×3 · challenge ×1`,与 §1.6
"challenge 卡 Stage 2+ 才出(需要地理上下文才有梗)"直接矛盾。§1.6 是本意,
这一行是笔误 —— challenge 槽位移除,补成第 7 张 ask。
(task-1 修订,owner 2026-07-26 批准;引擎侧见 `apps/mobile/lib/feed/ratios.ts`。)

| 规则 | 参数 |
|---|---|
| **Listing 预告卡(Stage 1–2)** | 每 10 张混 1 张,选当前正在试探的 area/city/zip 内的代表性房源(有视频优先)。**可 like**:右滑 = 弱 listing 信号 + 对所在 zip/community 的地理正信号(0.5× 权重,计入晋级判定);左滑 = 同权重弱负。match badge 不显(分数尚不可信),data face 可翻。作用:保住"这是看房 app"的预期 + 提前采地理信号,不改变漏斗节奏。 |
| Stage 快进 | Search 直达 / 深链 / 二手用户(已有 scope)按信号完备度直接落对应 stage。漏斗管的是**推荐流**,不拦显式意图。 |
| 层疲劳 | 任一层 15 swipe 零正信号 = 标记 not-interested,该层 ask/area 卡停发,靠 trade-off 侧写补偿。 |
| 排序 | scope = 软排序信号,**非过滤**。mismatch 降权不隐藏(硬过滤在 swipe 节奏下产出空 feed)。 |
| 分页 | 首包 12 张;activeIndex 距尾 5 张时取下页(offset 分页 + seenIds 去重);API 返回不足 limit → exhausted → 才允许循环。 |
| 回退 | You tab × 掉某地理 scope = 该层重新可问,stage 不自动降(引擎按剩余 scope 出卡,信号不足时自然多问)。 |

> **注:** **为什么 Stage 0–2 不上正式 listing 流(工程和运营都会想提前发):**没有地理收窄的 listing like 信号极稀(Atlanta metro 上万在售),match 分数不可信,且教会用户"这是刷房 app"之后再问地理问题会被讨厌。漏斗制的成本是首 session 房很少,回报是 Stage 4 的推荐命中率和 "it gets me" 时刻。两个对冲:Milestone 卡把收窄过程变成仪式感;Stage 1–2 的 1/10 预告 listing(可 like,上表)保住看房预期。

## 1.8 Swipe 状态机 & 动效参数

*[图:状态机流程 — idle →(pan >4pt)→ dragging(跟手 ±8° 旋转 · 方向色显现)→(位移>35% 或速度>800)→ committed(selectionAsync haptic · 方向标签满强度)→(松手)→ flyout 260ms(spring(damping 26) · 下一张升为 top)→ settle(impact(light) · 新 top 卡视频 play)]*

| 参数 | 值 |
|---|---|
| 判定阈值 | 水平位移 > 卡宽 35%,或松手速度 > 800 pt/s |
| 方向标签 | 拖动中显示右/左角标(文案按卡型:LIKE/PASS、YES/NO、TELL ME MORE/NOT FOR ME),opacity = 位移比例;z-20 |
| 未过阈值 | spring 回位 180ms,无 haptic。milestone 卡位移封顶 30% 永远回位。 |
| Undo | flyout 后 3s 内 toast "Passed · Undo" 可撤回上一张(仅 listing/community/area;ask/tradeoff 不可撤 — 信号已入 scope)。 |
| Reanimated | worklet 内完成 transform;JS 线程只收 onEnd 判定回调。stack 三层 scale/opacity 插值跟随手势进度。 |

## 1.9 系统状态

| 状态 | 呈现 |
|---|---|
| 首载 | 卡形 skeleton(--surface-2 呼吸),不出 spinner。首包目标 <800ms 可交互。 |
| 分页加载中 | 无 UI — 距尾 5 张预取,用户无感。取失败静默重试 ×2,再失败视为 exhausted。 |
| Feed exhausted | 终卡:"You've seen everything in your area — widen it?" + [去 You tab 调 scope] + [Browse map]。之后允许循环旧卡(循环卡右上加 "seen" 微标)。 |
| 离线 | 顶部细条 "Offline — showing cached homes";swipe 信号本地排队,恢复后上报 buyer_scope_events。 |
| 视频加载失败 | 降级 poster 静态图,无错误提示(照片是一等状态)。 |

## 1.10 埋点(buyer_scope_events)

| 事件 | 字段 |
|---|---|
| `swipe` | card_id, card_type, geo_level?, verdict(L/R), funnel_stage, dt_since_prev_swipe, active_index |
| `flip` / `explore_tap` / `datapoint_tap` | card_id + 来源手势;datapoint_tap 带 focus key |
| `stage_advance` / `milestone_cta` / `milestone_map_link` | from_stage, to_stage, swipes_in_stage, session_n |
| `skip_layer` / `persona_change` | layer / old→new persona |
| 健康指标 | stage 晋级漏斗(0→1→…→4 转化率 + 每级 swipe 数分布)· Stage 4 listing like 率 vs 旧无漏斗基线 · milestone→map 点击率 |

下一页:02 Listing — data face + explore page 详设 →
