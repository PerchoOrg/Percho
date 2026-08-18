# Master 前置块(每个任务 prompt 都以此开头)

> 用法:把本文件全文 + 对应任务文件(task-0 … task-5)拼成一个 prompt 丢给 coding agent(Claude Code / Codex,在 Percho repo 根目录运行)。任务必须按 0→5 顺序做,前一个任务 merge 到 main 后才开下一个。不并行。

---

你在实现 Percho buyer-facing iOS app(Expo + expo-router,monorepo 已 bootstrap,Expo Go iOS 可跑)。UX spec 是唯一权威,位于 `docs/design/spec-v3/`:

- `00-overview.md` — 全局:IA/路由、发现漏斗状态机、design tokens、typography、手势契约、组件库 8 件、视频规则。**每个任务开工前必须完整读一遍。**
- `01-feed.md` … `05-tabs.md` — 各页面详设。只读你当前任务对应的页(+任务文件里点名的依赖页)。
- Canon 产品文档(spec 的上游依据,冲突时以 spec-v3 为准并指出冲突):`docs/design/discovery-feed.md`、`docs/design/listing-explore.md`。

同时遵守 repo 根目录 `CLAUDE.md` 的全部规则(DEVLOG、branch 策略、验证后才可声称完成)。

## 硬规则(违反任何一条 = 返工)

1. **Tokens 唯一来源**:颜色/圆角/字体/字号只能引用 `theme/tokens.ts`(task-0 建立,内容 = 00 §0.3/§0.4 两张表)。组件代码里禁止出现任何 hex 色值、任何字面量圆角。圆角只有 28/24/14/16/999 五档。
2. **手势契约(00 §0.5)不可协商**:横滑阈值 = 卡宽 35%;速度 >800pt/s 直接判定;跟手旋转 ±8°;pan 限 ±30° 扇区起判横滑,其余交给 ScrollView;垂直手势在 feed 卡面上无语义;long-press 全卡型 no-op;flip = 350ms opacity crossfade,**禁 3D rotateY**。
3. **Haptics 严格按 00 §0.5 表**,特别是:pass(左滑)无 haptic。
4. **视频规则(00 §0.7)**:仅 top 卡播放;换卡全体 pause+mute、top 卡 currentTime=0 后 play;82% CTA 换卡必须 reset;无视频时静态照片是一等状态,不做占位/缺失提示。
5. **导航**:Explore 全部是 push(back 回 feed 原位,activeIndex 保留),动作用 bottom sheet,禁 fullScreenModal。
6. **沉浸面不变量**:卡片面永远深色(照片 + --card-grad),卡外 chrome 永远暖纸色,禁止给卡片面做 light variant。
7. **数据**:不留任何 mock/test data 进 commit(开发期临时 fixture 放 gitignored 路径);视频文件禁进 git。
8. **Ambiguity 协议**:spec 没写清的地方,先在回复里列 ambiguity 清单(逐条:问题 + 你建议的默认),等 owner 确认后再动手。禁止自己发明交互。

## 交付协议(每个任务相同)

1. **先 plan 后码**:完整读完 spec 后,先输出实现计划(组件树 + 状态/数据流 + ambiguity 清单),owner 批准后才写码。
2. **验收自查**:任务文件里有逐条验收标准。完成后在 iOS simulator 实跑,对每条截图/录屏,逐项标 ✅/❌;❌ 先修再交。不接受纯文字"已实现"。
3. **纯逻辑必须可测**:手势阈值判定、漏斗晋级、节奏引擎等截图验不了的,抽成 pure function + 最小 unit test。
4. 分支按 CLAUDE.md:一个任务一个 `phaseN/<slug>` 分支,验收过了 merge main,更新 DEVLOG。
