# Task 4 — Search tab(/(tabs)/search:地图 + 伸缩列表 + journey 图层)

(先读 `prompts/_MASTER.md`。spec 依据 = `04-search.md` 全文 + `00-overview.md`。依赖:task-0–3 已 merge — 行 tap push 到 listing/community explore 必须是真路由。)

## 铁律

**无 filter 表单**(无价格滑杆、无 bd/ba 下拉、无高级筛选入口)。收窄手段只有三个:搜索词、地图 viewport、图层。偏好学习归 feed。

## 范围

1. **结构三层 + 一开关**(04 §4.1):搜索框(--glass pill 常驻)+ Apple Maps muted 地图 + 三档 detent sheet(peek 96pt / half 50% 默认 / full 92%)+ 图层 chips(For sale 默认 / Your journey,可叠加,跨会话记忆)。
2. **联动契约**(§4.1 callout):平移缩放 → 列表 debounce 600ms 刷新(无 "Search this area" 按钮);pin tap → sheet 升 half + 行高亮 1.2s;行 tap → push explore;搜索命中 → 相机飞 + sheet 刷新。单一 `searchScope = {bbox|entity, sort, layers[]}` 驱动三者,不做两套数据。
3. **默认态**(§4.2):pin 规则(zoom <12 聚合 / ≥14 全 listing pin / 同屏 60 截断);排序段控 Newest / Popular(+ Stage 4 才出 Match);混合列表行(HOME/COMM. 角标、community 行带四柱摘要、行左滑 ♡ Save);detent 细则(搜索聚焦时降 peek)。
4. **Your journey 图层**(§4.3):familiarity 热力(与 You tab 同源 `areaFamiliarity[]`)+ 足迹染色 + journey strip(5 步漏斗进度、step tap 战果 sheet);单元 tap 三态 sheet(Swipe more / another shot / show me);milestone 卡深链落点。
5. **搜索行为**(§4.4):4 类实体、debounce 200ms、结果落点按表(city/zip 不离面)、回灌漏斗权重(explore=1×)、recent/空态/冷启动态。
6. **工程注记**(§4.5)全表照做:react-native-maps、census TIGER geojson、@gorhom/bottom-sheet、FlashList、Popular 合成分服务端物化(like 率 ×3 + explore 率 ×2 + save ×5,贝叶斯 m=10,15min 刷新)、search-scope API 分页 30。
7. **埋点**(§4.5 末行):search_events / map_events 全事件。
8. 补 task-3 留的 stub:community mini map 图身 tap → 本 tab 聚焦。

## 验收标准

- [ ] 平移后列表 600ms 内自动刷新,无确认按钮;pin↔行双向联动(tap pin 高亮行、行入屏 pin 放大)
- [ ] 三档 detent 手感;full 档地图缩为顶条,tap 回 half
- [ ] 全页无任何 filter UI(自查截图)
- [ ] 搜 city → 相机飞 + 边界描边 + 列表刷新,不 push;搜 community/address → push explore
- [ ] journey 图层:热力与 You tab familiarity 数值一致(同一数据源断言);milestone 深链落到本 tab + 图层 on
- [ ] Stage<4 无 Match 排序段;Stage 4 出现
- [ ] viewport 0 结果:Widen the map → zoom-out 一级
