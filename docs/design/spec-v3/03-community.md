# 03 · Community — Data Face & Explore Page

> Source: percho-prototypes/ios-ux-design/spec/community.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

Community(= subdivision,如 Waterside)是 Percho 的差异化实体,漏斗 Stage 3 的主角。三面模型同 listing:front(feed 卡)→ **data face**(社区是否值得深看)→ **explore page**(深挖)。信息骨架 = **四柱:安(safety)· 学(schools)· 便(convenience)· 潜(potential)** — 每一面都按四柱组织。锚定铁律:社区 = subdivision 非 city,POI 3km 从入口切。

Canon: discovery-feed.md §1.4(subdivision 锚定)· community like 是漏斗最强信号 · 四柱 = owner 2026-07-26 定案

## 3.1 Community Front Face(feed 卡)

*Mockup:Community front face — 全出血社区照片卡,"COMMUNITY" kind chip;底部:名称 "Waterside"(serif 23),定位行 "Subdivision · Decatur GA · 214 homes",市场行 "Median $612K · 7 for sale · built 2015–2022",pills:🛡 Safety A− / 🏫 9/10 elementary / 🥾 Trail at entrance,"Explore →" 按钮;底部 tabbar(Feed/Search/Saved/You)。*

标注说明:

1. **Front 内容** — 名称(serif 23)· "Subdivision · city" 定位行 · 市场行(median/在售/建造年代)· pills ≤3 = 该社区**最强的柱证据**(四柱里等级最高的 2 柱各出 1 条 + 1 条设施/POI 信号)。媒体 = 社区入口/街道/设施视频优先,无视频用最佳街景照。match badge 规则同 listing(仅 Stage 4)。
2. (—)**Swipe 语义** — 右滑 like = 漏斗最强信号(权重 2× listing like):直接推动 Stage 3→4 晋级 + 该社区在售房进入 listing 池顶部。左滑 pass = 降权该社区及相似 trait 社区(-0.5×)。

## 3.2 Community Data Face(tap 翻面)— 完整图纸

*Mockup:Community data face — 深色数据面:头部 "Waterside",副行 "Subdivision · Decatur GA · 214 homes · HOA $85/mo";数据行:Median (12 mo) "$612K · +3.2% YoY"、For sale now "7 homes · $540K–$780K";提示 "The four things that matter";四柱 2×2 scorecard:🛡 安 Safety A−(Crime 62% below metro · well-lit streets)、🎓 学 Schools A(Oak Grove Elem 9/10 · assigned)、🛒 便 Convenience B+(Grocery 8 min · downtown 22 min)、📈 潜 Potential A−(+3.2% YoY vs metro +1.8% · new transit 2027);提示 "How Waterside fits you";trait 契合条:Trail access(88%,strong)、Yard size(74%,strong);sticky 底栏 "Explore →";底部 tabbar。*

> **2026-07-30:** 同 02 页 — 此面原由 tap 卡身翻出,flip 已移除,现在由 `Explore →` 推入。

标注说明:

1. **结构:市场 → 四柱 → 契合** — 三段固定序。面属性同 listing data face(#14100B、350ms crossfade、翻面禁 swipe、可滚动、行/柱 tap stopPropagation)。深链落点:`/community/[slug]?focus=<key>`(market / forsale / safety / schools / convenience / potential / trait:&lt;t&gt;)。
2. **For sale 行** — 数量 + 价格区间。tap → explore 的 Homes section。这是 community→listing 的最短路径,Stage 3 用户从这里第一次接触具体房源。
3. **四柱 scorecard(data face 的心脏)** — 安/学/便/潜 2×2,每柱 = 等级(A–D,serif 琥珀)+ 一行最硬的证据(不是形容词)。等级算法见 §3.4。tap 任一柱 = 深链 explore 对应 section。四柱缺数据的柱显示 "–" + "not enough data"(禁止编造,canon 真实性铁律)。这四柱同时是 explore 的 section 骨架和 You tab familiarity 的维度(prices → 潜,统一命名见 05 页)。
4. **Trait 契合条** — 社区 trait vs 你的 profile:绿条 = 你在意且它强的维度,只显示 top 2 交集(四柱占了版面,从 3 减到 2)。Stage &lt;3(profile 太薄)时该段隐藏。

## 3.3 Community Explore Page(/community/[slug])

*Mockup:Community explore — hero 图 170pt(← 返回,底部渐变上 "Waterside" / "Subdivision · Decatur GA · 214 homes");section 导航条 chip:Vibe(选中)· 🛡 安 · 🎓 学 · 🛒 便 · 📈 潜 · Homes · 7;life radius mini map(⌂ Entrance 墨底 pin、🥾 4 min、🛒 8 min、🏫 7 min);stat 行:$612K median · +3.2% YoY · 7 for sale · $85 HOA/mo;section 头 "HOMES FOR SALE HERE";房源行 "🏠 $685K · 4bd · Copper Leaf Ct / 92%";吸底 CTA "Swipe homes in Waterside →"。*

标注说明:

1. **Section 结构 = Vibe + 四柱 + Homes(单页长滚 + chip 导航)** — **Vibe**:媒体轮播(街道/设施/入口视频)+ 编辑一段话 + trait 条全列表。**🛡 安 Safety**:crime 指数 vs metro 基线(柱状对比)+ 分项(violent/property)+ 街灯/巡逻等实勘信号 + 数据来源行。**🎓 学 Schools**:分配学校 ×3(elem/middle/high,评分、距离、assigned vs nearby 必须区分)+ 学区边界提示 + tap 开 school detail sheet。**🛒 便 Convenience**:life radius mini map(见 2)+ POI 全列表(grocery/coffee/medical/trail,车程 min 从入口算)+ 通勤矩阵(downtown/airport/用户自定义 workplace)。**📈 潜 Potential**:价格分布直方图 + 12 月成交趋势 vs metro + DOM 对比 + 规划利好列表(新交通/商业开发,必须给来源和年份)。**Homes**:在售 listing 行(tap = push listing explore,02 页)。每个柱 section 头部重复该柱等级徽章,与 data face 一致。chip 行右缘 mask 渐隐。
2. **Life radius mini map(便柱的核心)** — 静态渲染小图:社区边界多边形 + 入口点(墨底 pin)+ 3km 内 POI pin(时间 = 车程 min,从**入口**算,非质心 — 锚定铁律)。tap 任意 pin = POI detail sheet(距离/评分/为什么与你相关)。tap 图身 = 跳 04 Search tab 并聚焦该社区(全屏可平移)。POI 类目每类最近 1 个,用户 evidence 相关类目排前。
3. **Homes section** — 在售房源行:价格 + bd + 街名 + match %(Stage 4)。行 tap = push listing explore。超过 5 个显示 "See all 7 →"。无在售时显示近 3 个月成交 + "Get notified" 行(通知权限的第二触发点)。
4. **底部 CTA = 回 feed** — "Swipe homes in Waterside →" 把该 subdivision 临时置顶 scope,返回 feed。detail 是 feed 的支路,出口永远指回主循环。无在售时 CTA 变 "Swipe similar communities →"。
5. (—)**无 guided tour** — community explore 不做 tour(tour 是 listing 的 profile 关联叙事;社区的叙事就是 Vibe section 本身)。深链 `?focus=` 规则同 listing。

## 3.4 四柱等级 — 数据与算法

安/学/便/潜是 Percho 对"这个社区值不值得住"的回答骨架。等级 A–D(带 +/−),全 metro 内分位数定级(top 10% = A,10–30% = A−/B+,以此类推),缺数据显示 "–" 不编造。

| 柱 | 输入数据 | 等级依据 | 证据行模板(data face) |
|---|---|---|---|
| **🛡 安 Safety** | county/city crime 数据(violent + property 分开)按社区半径切;街景实勘信号(街灯、维护) | 加权 crime 指数 vs metro 分位;violent 权重 2× | "Crime 62% below metro"(方向 + 幅度,禁用裸分数) |
| **🎓 学 Schools** | assigned 学校三级(GreatSchools 等评分)+ 学区边界 | 三级加权:elem 40 / middle 30 / high 30;非 assigned 不计入 | "Oak Grove Elem 9/10 · assigned"(点名最强一级) |
| **🛒 便 Convenience** | 3km POI 密度(grocery/medical/coffee)+ 通勤(downtown + 用户 workplace)+ 交通接入 | POI 可达性 50 + 通勤 50;用户设了 workplace 则通勤按其算(等级因人而异,标 "for you") | "Grocery 8 min · downtown 22 min"(两个最常用可达) |
| **📈 潜 Potential** | 12 月价格趋势 vs metro、DOM 对比、库存吸收、规划利好(交通/商业,须有来源+年份) | 量化趋势 70 + 规划事件加分 30(每条利好 +半级,封顶 A) | "+3.2% YoY vs metro +1.8%"(永远带 metro 基线) |

> **注:** **真实性铁律在四柱上的落法:**每柱 explore section 底部必须有数据来源行(来源名 + 数据时点)。等级是分位数不是绝对分 — 文案永远相对表达("below metro" / "vs metro"),避免"安全分 87"这种无锚定数字。潜柱的规划利好只收有公开来源的(新闻/政府文件),listing agent 的说法不算。

## 3.5 POI detail sheet

| 元素 | 规格 |
|---|---|
| 标题行 | POI 名 + 类目 emoji + 距离("4 min drive from entrance") |
| 相关性行(有 evidence 时) | "You've liked 6 trail-access homes — this is the trailhead." 模板同 insight,引用具体数字 |
| 事实行 | 评分(Google)/ 营业状态 / 类型说明。school 版:评分来源 + 分配说明(assigned vs nearby,必须区分) |
| 动作 | [See on map →](跳 04 Search tab 聚焦)· [♡ Save as a must-have](写 saved_features,如 "near trailhead") |
| medium detent | 单 POI 单 sheet,不做多 POI 轮播 |

## 3.6 信号采集

| 事件 → community_explore_events | 信号语义 |
|---|---|
| `section_view(section, dwell_ms)` | 四柱停留分布 = 该用户的柱权重(学柱看 3 次 = 学区型买家),直接进 evidence,驱动后续卡文案与四柱排序(强柱排前) |
| `poi_open(poi_id, category)` | POI 类目偏好直接进 evidence(开 3 次 school = 学区权重升) |
| `homes_row_tap / see_all_homes` | community→listing 转化(Stage 3 健康指标) |
| `swipe_here_cta` | explore→feed 回流率;社区置顶 scope 生效 |
| `save_must_have(feature)` | POI sheet 的 save,同 saved_features 表 |

下一页:04 Search — 地图 + 伸缩列表 →
