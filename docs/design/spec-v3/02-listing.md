# 02 · Listing — Data Face & Explore Page

> Source: percho-prototypes/ios-ux-design/spec/listing.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

Listing 的三面模型:front(feed 卡,00 §0.6)→ **data face**(tap 翻面,"is it real" 检查)→ **explore page**(guided tour → free explore,深度承诺面)。本页把后两面做到工程可直接实现:每个 section 的内容、数据源、交互、深链落点。

Canon: listing-explore.md 全文 · 铁律:Stop.why 必填 + evidence 非空(类型级强制)· 数据面每个数据点可点且落点明确

## 2.1 Data Face(tap 翻面)— 完整图纸

*Mockup:Listing data face — 深色数据面卡:头部 "$685,000 92% match",副行 "1204 Copper Leaf Ct · Waterside · listed 12 days ago",提示 "✨ tap any row to jump to that section";"Why 92%" 进度条行("3 reasons ›");数据行:Price / sqft "$241 · Waterside median $228"、Days on market "12 · metro median 21"、HOA · Tax (2025) "$85/mo · $6,120"、Est. monthly (20% down) "$3,890";"Waterside price distribution — this home" 7 桶直方图(本房桶高亮);POI 行 "🥾 American Tobacco Trail 4 min"、"🏫 Creekside Elem — 9/10 7 min";sticky 底栏 "Explore →";底部 tabbar(Feed/Search/Saved/You)。*

> **2026-07-30:** 此页原为 tap 卡身翻出的 data face,底栏有 "Flip back"。flip 已移除 —
> 现在是 `Explore →` 推入的详情页,退出走导航返回。见 00-overview 顶部说明。

标注说明:

1. **面属性** — 底 #14100B(沉浸家族深暖色,非纯黑)。350ms opacity crossfade 翻面(禁 3D rotateY)。翻面状态**禁用 swipe**(用户在读,防误 pass)。内容超屏可竖向滚动(`overflow-y`,iOS momentum)。match 徽仅 Stage 4 显示(同 front 规则)。
2. **行 = 深链(核心机制)** — 每行 tap = push `/listing/[id]?focus=<key>` 直达 explore 对应 section 并高亮 2s。focus key:price / market / hoa / monthly / comps / poi:&lt;id&gt; / school:&lt;id&gt;。行内 onclick 必须 stopPropagation(否则同时触发翻回)。
3. **Why 92% 行(v2 新)** — match 分解入口:tap 展开 3 条 profile 关联理由(行内 accordion,不跳页):"backs onto greenway — you liked 6 trail homes"。理由必须引用 evidence 数字,模板同 insight 卡。分数不可信阶段(Stage&lt;4)整行不出。
4. **Est. monthly 行** — 默认 20% down / 当周利率(数据源标注 tap 后展开)。这是买家最常心算的数字,放 data face 省一次跳页。tap → explore 的 monthly 计算 section(可调 down/rate)。
5. **价格分布 mini chart** — Waterside(所属 subdivision)在售+近 12 月成交价直方图 7 桶,本房桶 --accent 高亮。tap → explore Comps section。数据不足 5 个样本时降级为 "median $612K · 30 sales" 单行,不出假直方图。
6. **Sticky 底栏** — 渐变遮底。Explore(实底)。滚到任何位置都可退出;返回走导航返回,不再有 Flip back。
7. (—)**内容优先级(装不下时从下砍)** — 价格 context → match 分解 → monthly → 分布图 → POI ×2。POI 最多 2 行(完整列表在 explore)。data face 是 30 秒判断面,不是 mini explore。

## 2.2 Explore Page — 整体流程

流程图:

1. Feed 卡 Explore tap —(→ push)→
2. Guided Tour(3–5 stops · 顺序 · 可 X 跳出)—(→ 最后一停)→
3. Transition 卡("看完亮点" + profile 回显)—(→ Continue)→
4. Free Explore(同 URL 同滚动 · 非模式切换)

> **注:** **Deep link 规则:**`/listing/[id]` 默认进 guided tour;`?focus=<key>`(来自 data face 行 tap)跳过 tour 直达 free explore 对应 section 并高亮 2s。tour X 关闭 = 直接进 free explore(不惩罚)。二次访问同 listing 默认 free explore(tour 只做一次,顶栏留 "Replay tour" 文字链)。空 profile 用户 = 通用 3 停 fallback(Hero·Kitchen·Neighborhood),WHY 文案不假装个性化。

## 2.3 Guided Tour Stop

*Mockup:Tour stop(4 停之 2)— 顶部 "STOP 2 OF 4" + ✕ 关闭,4 段分段进度条(前 2 段琥珀);220pt 媒体区(厨房照片,左下 🎯 hotspot pin 脉冲);WHY 块:"WHY WE'RE SHOWING YOU THIS" / "You've consistently liked open kitchens over formal dining — this one puts the island where you cook." / "Based on **7 likes** with open-plan kitchens · tap to see them";动作行:💡 Why this matters ›、⚖️ Compare with similar homes ›、♡ Save this feature ›;底部 "← Prev" / "Next stop →"。*

标注说明:

1. **进度** — "STOP 2 OF 4" + 分段进度条(琥珀已完成/border 未完成)。✕ = 跳出到 free explore(记 tour_abandoned at stop N)。
2. **媒体区 220pt** — 该停靠点的视频/照片(hotspot 对应 media_ref),视频自动播(muted,同 feed 规则)。hotspot pin 脉冲提示可点。
3. **WHY 块(必填)** — serif 17.5。文案模式:"You've [evidence]. [Feature] is why this might fit."。evidence 引用具体数字且可点(展开引用的 like 缩略图横条)。**无 evidence 的停靠点不允许生成** — 类型强制 Stop.evidence 非空。
4. **动作列表(≥3)** — 5 选 3–5:Why / Compare / Renovate(仅 dated feature)/ Save / Ask AI。tap 开 bottom sheet(见 2.5)。每个 tap 都是 profile 信号。
5. **Prev / Next** — Next = 实底主按钮;最后一停变 "Finish tour →" 进 transition 卡。横滑手势也可翻停(本页无 swipe 语义冲突),但按钮常驻 — 手势只是加速器。

## 2.4 Transition 卡 & Free Explore

*Mockup 1:Transition(单卡,非模式切换)— 🌿 图标,serif 大标题 "You've seen the highlights. Explore the rest freely.",分隔线,正文 "We've learned you care about **outdoor space** and **open floor plans**.","Continue" 按钮。*

*Mockup 2:Free Explore — hero 图 190pt(← 返回,hotspot pins 🍳/🌳/🛁,🛁 脉冲);section 导航条 chip:Overview(选中)· Kitchen · Yard · Monthly · Community · Comps;正文 "$685,000 92% match" / "1204 Copper Leaf Ct · Waterside, Chapel Hill NC";stat 行:4 beds · 3 baths · 2,840 sqft · 12 DOM;section 头 "KITCHEN 🎯";hotspot 行 "🍳 Open island kitchen / Why · Compare · Save · Ask AI / 4 actions";吸底 CTA "Schedule a tour"。*

标注说明:

1. **Hero + hotspot pins** — 全 hotspot 上 pin(--glass 圆点 + emoji)。tap pin = 开该 hotspot 的动作 sheet。未访问的 pin 脉冲,访问过的静止。视频 hero 时 pin 叠视频上,时间轴关键帧对应处出现。
2. **Section 导航条** — 横滚 chip,tap 滚动到对应 section(非 tab 切换 — 单页长滚)。Overview·Kitchen·Yard·Monthly·Community·Schools·Comps(实际 section 由 hotspot 数据生成)。当前区高亮跟随滚动。`?focus=` 深链落点在这里。右缘 mask 渐隐提示可滚。
3. **Section = hotspot 容器** — 每 section:媒体 + hotspot 行(feature 名 + 动作数)。tap 行开动作 sheet。beds/baths/sqft 只是 stat 行摘要,**不做 spec-sheet 布局**(canon §9.3)。Monthly section = 可调计算器(down %、rate,滑杆);Comps section = data face 直方图的全尺寸版 + 成交列表。Community section 内嵌 subdivision 卡 → push community explore(03 页)。
4. **CTA 栏常驻** — "Schedule a tour" 墨块按钮,滚动中吸底。全 app 的商业转化终点,任何滚动位置可达。
5. (—)**Transition 卡** — tour 最后一停 Next 后出现,回显 profile 学到的 2 个信号(加粗)。Continue 单按钮。同 URL 同滚动位置继续 — 不是新页面。

## 2.5 Hotspot 动作 sheet

*Mockup:动作 sheet(medium detent)— 背景 hero + 变暗遮罩;sheet 标题 "🍳 Open island kitchen",副行 "Kitchen · updated 2021";动作行:💡 Why this matters(Connects to your open-plan signal (7 likes))›、⚖️ Compare with similar homes(Island kitchens in Waterside: 8 of 24 active)›、🔨 Renovation estimate(Quartz upgrade: $4–8K rule-of-thumb)›、♡ Save this feature(Adds "open kitchen" to your profile)›、✨ Ask AI("Is the island plumbed?")›。*

标注说明:

1. (—)**5 个动作的展开行为** — **Why**:sheet 内展开 profile-connected 段落 + evidence 缩略图。**Compare**:sheet 升到 large detent,同 subdivision 同 feature 分布图 + 3 个对比 listing 卡(tap = push)。**Renovate**:区间估价 + 说明(v1 rule-of-thumb,不接 partner)。仅 dated feature 有此行。**Save**:即时反馈 — 行变 "♥ Saved to your profile" + success haptic,写 saved_features,sheet 不关闭。**Ask AI**:输入框 + prompt seed 预填,范围限 listing+community(v1 Phase D 前显示 "coming soon" 灰态)。
2. (—)**规则** — 每个 hotspot 3–5 个动作,少于 3 不上线。每行副文案必须带具体数据(数字/对比),空泛文案 = 砍。全部 tap 记 listing_explore_events(action_tap, hotspot_id, kind)。

## 2.6 信号采集(本面是高密度学习面)

| 事件 → listing_explore_events | 信号语义 |
|---|---|
| `tour_stop_view / tour_complete / tour_abandoned(stop_n)` | tour 完成率(canon §7 核心指标) |
| `hotspot_open(hotspot_id, dwell_ms)` | time-on-hotspot 是排序信号 |
| `action_tap(kind)` | 5 动作分布;单动作 >70% 份额 = 其余动作 fail 30-Second Rule,重审 |
| `save_feature(feature)` | 直接进 profile,下次 feed 排序生效 |
| `datapoint_focus(key)` | data face 哪些行被 tap — 决定 data face 行序个性化(v1.1) |
| `evidence_cited(stop_id, evidence_ids)` | 哪些 profile 信号真正被引用 — 找出没用的信号 |

> **注:** **静默学习原则(canon §9.7):**永远不告诉用户"你的回答训练了 AI"。Explore 静默学习;唯一的回显是 transition 卡和 insight 卡的自然语言观察。

下一页:03 Community — data face + explore page 详设 →
