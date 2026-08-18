# Task 1 — Discovery Feed(/(tabs)/feed)

(先读 `prompts/_MASTER.md`。spec 依据 = `01-feed.md` 全文 + `00-overview.md` §0.2/§0.5–0.7。依赖:task-0 已 merge。)

## 目标

实现唯一主消费面:8 种卡型 + 阶段化漏斗节奏引擎 + swipe 状态机 + 系统状态 + 埋点。

## 范围

1. **8 种卡型**(01 §1.1 总表,每种的 swipe 语义/tap 行为严格按表):Ask(§1.2)、Area(§1.3,三粒度共用 + area data face)、Listing/Community front(§1.4,front 用 task-0 组件拼)、Milestone(§1.5,不可 swipe、位移 30% 封顶回弹)、Trade-off(§1.6,视觉中分、永不 yes/no)、Challenge(§1.6,900ms reveal)、Insight(§1.6,Not sure 第三按钮)。
2. **节奏引擎 generateFeed v2**(§1.7):纯函数 `(funnelStage, state, N) → Card[]`,5 个 stage 的卡型配比表 + 晋级条件 + listing 预告卡规则(1/10、0.5× 权重)+ 层疲劳 + 分页(首包 12、距尾 5 预取、seenIds 去重)。晋级判定 `evaluateStageAdvance` 也是纯函数。两者都要 unit test。
3. **Swipe 状态机**(§1.8):idle→dragging→committed→flyout(260ms spring damping 26)→settle;方向标签 opacity 跟位移;Undo 3s(仅 listing/community/area);Reanimated worklet 内完成 transform。
4. **系统状态**(§1.9):skeleton 首载、静默分页、exhausted 终卡、离线条 + 本地信号队列、视频失败降级。
5. **埋点**(§1.10):buyer_scope_events 全事件字段按表。
6. 服务端:`/api/mobile/feed` 生产化(05 §5.6 第 3 条点名的前置项),按引擎需要的数据形状出。

## 工程红线(01 §1.1 callout)

每个手势 handler 对全部 8 种卡型判空 — ask/milestone 无 data face、milestone 无 swipe。handler 假设存在会 throw 并丢 touch 绑定。

## 数据前置(05 §5.6 第 5 条)

Stage 1–2 要有 area/city/zip 卡可发,需要 Atlanta metro ~40 个地理单元编辑集。若 repo 里还没有,先停下向 owner 报数据缺口和建议格式,不要造假数据绕过。

## 验收标准

- [ ] generateFeed + evaluateStageAdvance unit test:5 个 stage 配比、晋级阈值边界(如 city 右滑 2 vs 3)、listing 硬门槛(Stage 0–2 无 listing 卡,预告除外)、层疲劳 15-swipe
- [ ] Simulator 走完 Stage 0→1:ask/trade-off 流 → milestone 卡插入 + 不可 swipe + CTA 继续
- [ ] Trade-off 拖动时被选半边亮/弃半边暗跟手;Challenge swipe 后 900ms reveal 再飞出
- [ ] 翻面(listing/community/area)350ms crossfade,翻面态禁 swipe;ask 卡 tap no-op
- [ ] Undo toast 3s,ask/trade-off 不可撤
- [ ] push 到 /listing/[id] 返回后 activeIndex 保留
- [ ] exhausted 终卡 + 循环卡 seen 微标
