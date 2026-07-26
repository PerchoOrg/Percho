> Source: percho-prototypes/ios-ux-design/spec/map.html (v3, 2026-07-26). 图示已转文字标注,视觉细节以 HTML 原稿为准。

# 04 · Search — Map + Discovery List

v3:原 Search tab 与 Map tab **合并为一个 Search tab**(owner 2026-07-25 定案),tab 总数 5 → 4。结构:顶部搜索框 → 地图主体 → 底部可伸缩 sheet(scope 内 Community + Listing 混合列表,Newest / Popular 排序)。这一个面同时承担:显式意图直达(搜)、空间浏览(图)、库存清单(列)、看房 journey 呈现(图层)。

原则修订:v2 的"地图只回答你的问题、不回答市场的问题"作废 — 合并后此面同时回答两者。但铁律不变:**无 filter 表单**(无价格滑杆/bd·ba 下拉),偏好学习仍归 feed swipe;此处的收窄手段只有三个 — 搜索词、地图 viewport、图层。

## 4.1 结构总览(三层 + 一开关)

| 层 | 职责 | 规格 |
|---|---|---|
| **搜索框**(顶部常驻) | 显式意图直达 | --glass pill,浮于地图。tap = 键盘升起 + 全屏结果 overlay(4 类实体:city / zip / community / address,规则见 §4.4)。未聚焦时显示当前 scope 摘要占位("Decatur · 30030 · …")。 |
| **地图**(主体) | 空间浏览 + journey 呈现 | Apple Maps muted 样式。默认图层 = scope 内在售:community pin(琥珀描边 + 在售数)+ listing 价格 pin(zoom ≥14 展开)。"Your journey" 图层 chip 开关熟悉度热力 + 足迹染色(§4.3)。 |
| **底部 sheet**(可伸缩) | 库存清单 | 三档 detent:peek(~96pt,只露 header+首行)/ half(50%,默认)/ full(92%,地图退为顶部条)。内容 = 当前 viewport 内 community + listing 混合列表。拖拽 grabber 或列表边缘切档;full 档内列表原生滚动。 |
| **图层 chips** | 模式切换的残余 | 搜索框下方左侧:`For sale`(默认 on)/ `Your journey`。替代 v2 的 Journey/Places/Explored 三模式 — Places 并入 For sale(liked 项加 ♥ 徽),Explored 并入 Your journey 图层。 |

> **注:** **联动契约:**地图平移/缩放 → 列表 debounce 600ms 自动刷新(无 "Search this area" 按钮 — 多余的确认步)。pin tap → sheet 升到 half 并滚动到对应行(行高亮 1.2s);行 tap → 对应 explore push;行出现在屏内 → 对应 pin 轻微放大。搜索命中 → 相机飞到目标 + sheet 刷新为目标 scope。三者(搜索词、viewport、列表)永远一致,单一 `searchScope` 状态。

## 4.2 默认态 — 图 + 伸缩列表

*Phone mockup:Search 默认态 — half detent。顶部搜索框("City, zip, community or address…"),下方图层 chips(For sale on / Your journey),地图上 community pin(Waterside · 7)与价格 pin($685K 高亮、$612K),底部 sheet(约 46% 高)含 header "23 in this area" + Newest/Popular 排序段控,列表两行:HOME 行($685,000 · 1204 Copper Leaf Ct · Waterside · 4bd 3ba · NEW · 2d,选中高亮)与 COMM. 行(Waterside ♥ · Subdivision · 7 for sale · 安A 学A 便B 潜B)。Tab bar:Feed / Search(on)/ Saved / You。*

标注说明:

1. **搜索框(常驻)** — --glass pill,z-45,浮于地图顶部(状态栏下 8pt)。tap = 键盘 + 结果 overlay(§4.4);有活动搜索词时框内显示词 + × 清除(清除 = 回 viewport 驱动模式)。**无 filter 图标、无高级筛选入口**。
2. **图层 chips** — For sale(默认)= 库存 pin;Your journey = 熟悉度热力 + 足迹染色 + journey strip(§4.3)。两层可叠加(都 on = 库存 pin 画在热力之上)。chip 状态跨会话记忆。
3. **库存 pin 图层** — community pin = 琥珀描边 + 名称 + 在售数;listing pin = 价格 pill(liked = 墨底 + ♥)。zoom <12:只显 community pin + 聚合计数,tap = zoom-in 一级;zoom ≥14:全 listing pin。同屏上限 60,超出按 newest 截断。pin tap = sheet 升 half + 滚到该行高亮,**不出独立预览 sheet**(列表行就是预览 — 少一层)。
4. **Sheet header + 排序** — 计数("23 in this area")+ 排序段控:**Newest**(默认,上市时间倒序,NEW ≤7d 徽)/ **Popular**(全体用户 engagement:like 率 + explore 率 + save 数合成分,72h 窗口)。Stage 4 用户追加第三段 **Match**(match 分数倒序 — 分数不可信前不给这个排序,防伪精准)。排序选择跨会话记忆。
5. **混合列表行** — community 行与 listing 行混排,缩略图角标 HOME / COMM. 区分。community 行带四柱等级摘要(03 §3.4);listing 行 = 价格 + 地址 + bd/ba。行 tap = push 对应 explore(02/03);行左滑 = ♡ Save(轻量,不离开列表)。排序对 community 的 Newest = 该社区最新一条 listing 的上市时间。
6. **Detent 细则** — peek 96pt(header + 首行,地图为主)/ half 50%(默认落地)/ full 92%(纯列表模式,地图缩为顶部 88pt 条,tap 条回 half)。相机移动时 sheet 不动;搜索聚焦时 sheet 降到 peek 让位键盘。

## 4.3 "Your journey" 图层(v2 Map 的 journey 概念收编于此)

*Phone mockup:Your journey 图层 on。搜索框下 chips(For sale off / Your journey on),地图显示琥珀熟悉度热力斑块:Decatur(78% explored)、Brookhaven(45%,较淡),liked community pin "Waterside ♥"。底部 sheet(约 26% 高)为 journey strip:标题 "Your search, so far" + "Stage 3 · Community",5 步漏斗进度:✓ Intent — ✓ Area — ✓ Zips — ● Comm. — Homes。Tab bar 同上,Search on。*

标注说明:

1. **熟悉度热力 + 足迹** — 地理单元按 familiarity 琥珀着色(数据与 You tab §5.3 同源 `areaFamiliarity[]`);pass 过的区 = 灰;未触达 = 空白。单元 tap = familiarity sheet(该区已见卡数 / like 率 / 四柱 ✓ 摘要 + [Swipe more of this area →] 回 feed 注入)。pass 区 sheet 给 [Give it another shot →];空白区给 [Show me this area →](写引擎注入队列)。liked community 显示 ♥ pin。
2. **Journey strip(此图层的 sheet peek 态)** — 图层 on 时 sheet 内容切为 journey:5 步漏斗进度(done 琥珀✓ / current 墨点 / future 灰)。step tap = 该阶段战果 sheet(确认的 scope + 关键 trade-off 结论 + 修改入口 → You tab)。milestone 卡 "See my journey" 深链 = Search tab + journey 图层 on + 高亮 current step。图层 off 则 sheet 回库存列表。
3. **相机初始** — 进 tab 拟合当前 stage 活跃范围(Stage 1 = metro 全景,Stage 3 = 聚焦 zip 群);回访恢复上次相机 + 上次图层组合。

## 4.4 搜索行为(直达 + 回灌漏斗)

| 项 | 规格 |
|---|---|
| 实体类型 | 4 类:city / zip / community / address(listing)。边打边出(debounce 200ms,≥2 字符),每类最多 4 行,journey 内实体优先("in your journey" 徽)。**无价格/bd/ba 筛选**。 |
| 结果落点 | community → community explore(03)push;address → listing explore(02)push;city / zip → **不离开本面**:相机飞到该单元 + 边界描边 + sheet 刷新为该 scope 列表。overlay 收起,搜索框保留词 + ×。 |
| 回灌漏斗 | 搜索并 explore 某 community = 视同右滑(权重 1×,低于 swipe like 2×);搜 city/zip = 该单元进 journey 池;Search 直达 = 显式意图,绕过 Stage 门槛(快进,01 §1.6)。Search 不是旁路系统。 |
| Recent / 空态 | 聚焦且未输入:recent ×5(左滑删)+ "Your journey" 快捷 chip(当前聚焦 city/zip)。无结果:"No match — try a city, zip or community name",不出全库推荐(泛发现归 feed)。 |
| 冷启动(Stage 0,无 scope) | 地图 = metro 全景,列表 = metro 全库 Newest(封顶 50 行)+ 顶部提示条 "Keep swiping — your feed narrows this list for you"。搜索可用(显式意图永远开门)。 |

## 4.5 工程注记

| 项 | 规格 |
|---|---|
| 地图底 | Apple Maps(react-native-maps / expo)muted 样式,原生 POI 标注关闭。边界多边形:census TIGER 简化 geojson(~200 点);subdivision 边界用已有数据。热力 fillOpacity 0.25–0.45 按 familiarity 插值。 |
| Sheet | @gorhom/bottom-sheet,detents [96, '50%', '92%']。列表 FlashList;viewport 刷新 = `region → debounce 600ms → /api/mobile/search-scope?bbox=…&sort=…`,分页 30/页。 |
| 单一状态 | `searchScope = {bbox \| entity, sort, layers[]}` 驱动图 + 列 + 框三者;pin/行联动经由 scope 内 index,不做两套数据。 |
| Popular 定义 | 72h 窗口 engagement 合成分:like 率 ×3 + explore 率 ×2 + save ×5,贝叶斯平滑(m=10)防小样本刷榜。服务端物化,15min 刷新。 |
| 空态/错误 | viewport 内 0 结果:sheet 显示 "Nothing for sale here yet" + [Widen the map →](相机 zoom-out 一级)。API 失败沿用 05 §5.5 全局规则。 |
| 埋点 | `search_query(q, results_n) / search_result_tap(kind, in_journey) / search_no_results(q) / scope_pan(bbox) / sort_switch(kind) / sheet_detent(d) / pin_tap(kind) / list_row_tap(kind, rank, sort) / layer_toggle / region_tap / another_shot / show_me_area / journey_step_tap` → search_events / map_events。no_results 高频词 = 库存缺口信号;list_row_tap 的 rank×sort 分布校准 Popular 公式。 |

下一页:05 Tabs, Onboarding & States →
