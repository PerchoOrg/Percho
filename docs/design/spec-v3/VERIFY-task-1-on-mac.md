# task-1 验收清单 — Mac mini + iPhone

Linux EC2 上跑不了 iOS simulator，所以 task-1 的 6 条视觉验收必须在 Mac 上做。
这份清单逐项可打勾，走完即可决定要不要 merge `phase-ios1/discovery-feed`。

代码状态：分支 `phase-ios1/discovery-feed`，**未 push、未 merge**。
EC2 上已验证的：**240 个单测全绿**、`tsc --noEmit` 0 错、biome clean、
`npx expo export --platform ios` 成功出包（1476 modules / 3.97 MB Hermes bundle）。

**渲染和手势没有任何视觉验证** —— 这份清单就是补那一块。跟 task-0 那份的区别是：
task-0 验的是 9 个独立组件，这次验的是**整条漏斗**，所以顺序不能跳，
第 1 条走不完后面几条没有卡可看。

---

## 0. 环境准备（Mac mini）

```bash
cd ~/Percho
git fetch origin
git checkout phase-ios1/discovery-feed
git pull origin phase-ios1/discovery-feed    # 若本地已有该分支

node -v            # 需 >= 20
pnpm -v            # 需 9.x
pnpm install       # .npmrc 是 node-linker=hoisted，RN 需要
```

> 注意：这个分支**没有 push**。如果 `git fetch` 看不到它，说明我这边还没推
> —— 回来说一声，不要自己从 main 建同名分支。

手机端装 **Expo Go**（App Store，SDK 54）。Mac 和 iPhone 必须同一个 Wi-Fi。
用到的 4 个原生模块（expo-video / expo-haptics / reanimated 4 /
gesture-handler 2.28）都在 SDK 54 的 Expo Go 里，不用编 dev-client。

## 1. 启动

```bash
cd ~/Percho
pnpm mobile:start
```

扫二维码 → Expo Go 打开。

**这次不需要手动跳转**：`app/index.tsx` 现在直接 redirect 到 `/feed`，
feed 就是落地屏（旧的 "Homes that fit your vibe." splash 已删）。

### 1.1 API base（重要，否则全是空卡）

App 默认打**生产** `https://www.percho.co/api/mobile/feed`。三种情况：

- **生产上已经部署了这个分支的 API** → 什么都不用做。
- **生产还是旧代码** → `/api/mobile/feed` 会返回旧的组合 feed 格式，客户端
  解析不出 pool，你会看到 skeleton 然后 exhausted 终卡。**这不是 bug**，
  是没有可用数据源。走下面第三条。
- **想打你 Mac 上的本地 web** →

```bash
# 终端 A
cd ~/Percho/apps/web && pnpm dev          # 记下端口，可能是 3000 或 3001

# 终端 B — 用 Mac 的局域网 IP，不是 localhost（手机访问不到 localhost）
ipconfig getifaddr en0                     # 例如 192.168.1.23
cd ~/Percho
EXPO_PUBLIC_API_BASE=http://192.168.1.23:3000 pnpm mobile:start
```

`apps/web/.env.local` 需要有真实 Supabase key（仓库里是 gitignore 的软链）。

先做一次 sanity：feed 能出卡（不是一直转 skeleton），说明数据通了。

---

## 2. 六条验收 — 逐项打勾

漏斗是**单向**的（§0.2：stage 只前进，不自动回退），所以第 1 条只能验一次。
要重验请先清 stage：Expo Go 里摇一摇 → Reload 不够，**必须删掉 app 数据** ——
最快是在 Expo Go 里长按项目 → Delete，再重新扫码（AsyncStorage 一起清）。

### V1 — Stage 0→1 全流程：ask/trade-off → milestone 插卡 → 不可 swipe → CTA 继续

冷启动后你在 Stage 0，卡池是 **ask ×7 + trade-off ×3**（没有 listing、没有
area、没有 challenge —— 这是 §0.2 硬门槛，不是缺卡）。

一路右滑/选边回答，直到攒够：**intent + budget band + ≥2 个生活信号**。
budget 是**二分**问的（"Under $500K ← → Over $500K"，再窄一次），
**不会**出现任何 slider 或 picker（这是 iron law）。

- [ ] Stage 0 全程**一张 listing 都没有**（连预告卡都没有）
- [ ] 没有任何 slider / picker / 输入框，budget 是左右二选
- [ ] 攒够信号的那一刻，**下一张**就是 milestone 卡（不是攒到某个数字才出，
      也不是等你翻到牌堆末尾）
- [ ] milestone 卡上的 chip 只写你**真的答过**的东西（预算区间 / 你右滑过的
      地名 / 你选过的偏好）。**没答过的不该出现，也不该有占位 chip**
- [ ] milestone 上**没有任何数字统计**（不该出现 "47 套房匹配" 这种话）
- [ ] milestone 出现时有一下**成功震动**（notification success，比普通轻震明显）
- [ ] **拖 milestone 卡**：跟手，但**最多只走约 30% 卡宽就到顶**，松手**必定弹回**
- [ ] milestone **永远划不走**（左右都不行，甩得再快也不行）
- [ ] 拖 milestone 时**不该有**"过阈值"那一下震动（因为它根本不会成交）
- [ ] 点 `Keep going →` 才继续，之后卡池变成 area/city 卡

> 最后三条是 §1.5 的核心，也是我这轮改动最大的地方（task-0 只有
> `enabled: true/false`，做不出"能拖但不成交"）。如果 milestone 能被划走，
> 或者完全拖不动，都是红。

### V2 — Trade-off 拖动：被选半边变亮 / 弃的半边压暗，跟手

trade-off 卡中间一条**虚线**分成两半（例如"更大院子 ← → 更短通勤"）。

- [ ] 中缝是**虚线**（dashed），很细（1.5px）
- [ ] 静止时两半都是**略暗**的，不是一边亮一边暗
- [ ] **慢慢**往右拖：右半边逐渐变亮到全亮，左半边同时**逐渐压暗**
- [ ] 往左拖反过来
- [ ] 亮暗**跟手**（拖回去会跟着回来），不是松手才变
- [ ] 卡上**永远没有 ✓ / ✗、没有"是/否"**（§1.6 红线）

### V3 — Challenge 卡：900ms reveal，然后才飞出

challenge 卡（🎲 GUESS THE PRICE）**只在 Stage 2 及以后**出现。
如果你还在 Stage 0/1 看不到它，那是对的，不是缺卡。

- [ ] 左右任选一边划过阈值 → 卡片**停在原地**，正面淡出、换成**真实价格**
- [ ] 猜对时价格是**绿色**，猜错是**红色**
- [ ] 停约 **0.9 秒**后才飞出去（不是立刻飞走，也不是停住不动了）
- [ ] 飞出去时屏上显示的是**答案面**，不是又切回问题面

> 这条最容易红：reveal 和"翻面"用的是两个**不同**的动画值（有意为之）。
> 如果你看到卡片飞出去时闪回问题面，或者答案面根本没出现，记下来。
> 另外：challenge 需要一个**带真实价格**的 listing 才生成得出来。如果 Stage 2
> 一张 challenge 都没有，先别判红 —— 告诉我，那可能是数据问题不是渲染问题。

### V4 — 翻面 350ms crossfade / 翻面态禁 swipe / ask 卡 tap 无反应

**能翻的**：listing、community、area（三种地理粒度都算）。
**不能翻的**：ask、trade-off、challenge、insight、milestone。

- [ ] 点 area / listing / community 卡 → **淡入淡出**换到深色数据面
- [ ] 过程中**没有任何一帧**看到 3D 旋转、镜像或反字
- [ ] 手感约 1/3 秒
- [ ] 数据面上**只显示真的有的数据**。大多数城市**没有**中位价，那一行就
      **整行不出现** —— 不该看到 "—"、"N/A" 或 "$0"
- [ ] `See on map →` 是**灰的、点不动**（目标是 task 4 的 Search，故意不接）
- [ ] **翻面状态下左右拖 → 卡片不动，划不走**（§1.1 红线）
- [ ] 再点一次翻回正面，就又能划了
- [ ] **点 ask 卡 → 什么都不发生**（不该淡出到空白面）
- [ ] 点 trade-off / challenge / insight / milestone 也一样，无反应

> 最后两条是 **task-0 遗留的真 bug**，我在 step 4 修的：task-0 的
> `SwipeStack` 用 `!!renderBack`（那个**函数**存不存在）判断能不能翻，
> 而混合牌堆只传一个 `renderBack`、对 ask 卡返回 null —— 所以每张卡都
> "可翻"，点 ask 卡会把正面淡成一张空白面。task-0 的 review 漏了这条。
> 现在改成判断**渲染结果**，并且额外加了"卡型允许 AND 真的渲染出东西"两重条件。

### V5 — Undo toast 3 秒；ask / trade-off 不可撤

- [ ] 划掉一张 **listing / community / area** → 底部出现 `Liked` / `Passed`
      + `Undo` 的小条
- [ ] 约 **3 秒**后自己消失
- [ ] 点 `Undo` → 上一张卡**回来**
- [ ] 划掉 **ask / trade-off / challenge / insight** → **不出** toast
- [ ] `Undo` 按钮好点（≥44pt，不用瞄）

关于 undo 的一个**已知不对称**（我提出、owner 确认的取舍，不是 bug）：
如果你撤销的那一刀刚好触发了升级，**信号会退回，但 stage 不退**
（`funnel.ts` 设计上单向）。此时那张还没看到的 milestone 卡会**被移除**。

- [ ] 撤销触发升级的那一刀 → 没看到的 milestone 卡消失了，且没有报错

### V6 — 分页 / exhausted 终卡 / 循环卡 seen 角标

- [ ] 连续划 12 张以上，**不卡顿、不闪 skeleton**（静默分页）
- [ ] 同一张卡在池子还有新内容时**不会重复出现**
- [ ] 一直划到池子见底 → 出现 **exhausted 终卡**，文案是
      "You've seen everything in your area — widen it?" + `Adjust my scope`
      按钮（不是报错、不是白屏）
- [ ] 终卡上**没有** `Browse map` 按钮（目标是 task 4 的 Search，故意不传 handler）
- [ ] 点 `Adjust my scope` → **重新拉一次池子**（不报错）。
      ⚠️ **已知不完整**：这个按钮现在只是重新取数，**不是**真正的"改范围"。
      真正的范围编辑在 You tab（task 5）。所以如果池子真的空了，点它还是空 ——
      文案承诺的比现在做到的多，我认这一条，等 task 5 接上 You tab 再改。
- [ ] 见底之后开始循环旧卡时，卡上有 **`SEEN` 小角标**

**V6 里有一条这次验不了**：验收标准原文是
"push 到 `/listing/[id]` 返回后 activeIndex 保留"。
`/listing/[id]` 是 **task 2** 的屏，现在不存在，所以 listing / community 卡上的
`Explore →` 按钮**故意没接**（`CardFoot` 只在给了 handler 时才渲染那个按钮，
所以你看不到一个点了没反应的死按钮）。这条留到 task 2 一起验。

- [ ] listing / community 卡上**没有**一个点了没反应的 `Explore →` 按钮

### 顺带确认（不算 6 条之内）

- [ ] **insight 卡的第三个按钮**：insight 卡（要攒够证据才出，Stage 2+）底部有
      一个描边的 `Not sure` 药丸，≥44pt。点它 → 换下一张，且**什么都不记录**
      （不该被当成同意或反对）
- [ ] **ask 卡的 `Skip this topic`**：点它 → 该层的问题**不再出现**
      （例如跳过 life 层后，就不该再问生活类问题，也不再问预算 —— 预算属于
      life 层，这是有意的）
- [ ] 点 `Skip this topic` / `Not sure` 时，**卡片不该同时被当成一次滑动**

- [ ] 底部 tab bar 恰好 **4 个** tab，当前 tab 明显区别于其他三个
- [ ] **刘海机关键项**：tab bar 整条在 home indicator **上方**，文字没被压住
- [ ] 点 Search / Saved / You → 三个都是"task 4/5 再做"的说明屏，
      **不是**白屏或报错
- [ ] 切到别的 tab 再切回 Feed → **还是原来那张卡**（activeIndex 保住了）
- [ ] 开飞行模式 → 顶部出现离线条
      "Offline — showing cached homes"；关掉飞行模式 → 离线条消失
      （注意：**第一次**请求失败不会出条，要连续两次才出 —— 故意的，
      免得网慢闪一下就吓人。所以要等它自己再试一次，或者多划几张触发预取）

---

## 3. Stage 2 现在是"降级"跑的 —— 你会看到什么

**这不是 bug，是已知的数据缺口，owner 已经拍过板。**

`01-feed.md` §1.7 说 Stage 2 应该发 **zip（邮编）级**的卡。但数据库里
`communities.zip` 是 **100% NULL** ——
EC2 上刚查过：8679 条 active community，**0 条**有 zip。
`listings.zip` 倒是 260/260 都有，但只覆盖 **12 个城市**。

所以引擎不按字面读 §1.7，而是narrow到"**池子里真正有货的最细粒度**"
（`finestAvailableLevel()`，owner 批准）。今天那就是 **city**。具体到手机上：

- Stage 2 的 4 个 zip 槽位换成：**2 张没见过的同级 city 卡 + 1 张 geo ask +
  1 张 trade-off**（槽位总数不变，还是 10 张一轮）。
- 所以 **Stage 1 和 Stage 2 看起来很像**，都是 city 卡。这是预期的。
- 2→3 的升级条件跟着变成"**2–4 个 city 单元各右滑 ≥2 次**"，
  所以漏斗**照样能推进**，Stage 3（community，8680 条真数据，最丰满的一段）
  照样能解锁。
- 也就是说：**你不会在手机上看到任何 "ZIP" 字样的卡**。看不到是对的。

要真正拿到 zip 级卡，需要一次 `communities.lat/lng → zip` 的反向地理编码回填
（8679 行，Google Geocoding，约 $40）。**这笔钱还没批，我也没写那个脚本。**
等批了之后，池子自然变深，引擎**一行都不用改**（这一点有双向单测钉住：
`geo-unit.test.ts` 同时验了 city 读法和 zip 读法）。

- [ ] 确认 Stage 2 看到的是 city 卡而不是 zip 卡（符合预期）

另外两个"看起来少"其实是**故意**的：
- **大多数 city 没有中位价**。260 套房散在 12 个城市 / 109 个 city 单元里，
  只有 **5 个**城市的样本量够（≥8 套）：Alpharetta（$594,450，n=52）、
  Duluth（$429,900，n=50）、Johns Creek（$744,000，n=50）、
  Sandy Springs（$719,910，n=50）、Suwanee（$617,450，n=50）。
  其余 104 个**整行不显示**。宁可空着，不编数字。
- **学区评分 / 通勤时间 / 房价趋势 / HOA 一律没有**，因为没有真实数据源。
  这些字段在类型里**根本没声明**（不是"声明成可选然后填假的"）。

---

## 4. 验完之后

**全绿** → 回来说一声，我把分支 push 上去开 PR。（现在**没有 push，也没有
merge**，本地 commit 不等于已上线。）

**有红** → 告诉我哪条红了 + 手机型号，能录屏最好。不用自己改。

已知**这份清单验不了**的：
1. **`Explore →` → `/listing/[id]` 往返保 activeIndex**（V6 末条）——
   那个屏是 task 2 的，现在不存在。tab 间切换保 activeIndex 可以验（见"顺带确认"），
   算是同一机制的一半。
2. **震动在 simulator 上没有**，V1 的成功震动必须真机。
3. **视频**：`community_videos` 只有 4 行，所以你大概率看到的是**静态首图**
   而不是视频卡。§0.7 把静态图当一等状态（不该出现"缺视频"的占位符）。
4. **埋点**：§1.10 的事件队列这次是**空实现 sink**（`buyer_scope_events`
   这张表还不存在，owner 同意延后到有消费方再建）。所以事件进了本地队列
   就被丢掉了 —— 你在手机上看不到、也没法验证埋点内容。
5. **`Adjust my scope` 只是重新取数**（见 V6 注）。

## 5. 我这边已经验过的（不用你重复）

免得你重做：这些在 EC2 上是可验证的，已经绿了。

| 项 | 结果 |
|---|---|
| 单测 | **240 passed / 14 files**（task-0 的 26 个手势+漏斗测试全部保持绿） |
| `tsc --noEmit`（mobile + web） | 0 错 |
| `biome check`（mobile 全量） | clean |
| `npx expo export --platform ios` | 成功，1476 modules / 3.97 MB |
| 4 个 tab 路由进包 | 全部在导出的 bundle 里 |
| 旧屏真的删了 | bundle 里 `Homes that fit your vibe` / `trycloudflare` 各 0 次 |
| 硬编码色值 / 圆角 | **整个 mobile 目录 0 处**（不再只是 task-0 那几个目录） |
| `city_geo_units` view | 已 apply 到远端，109 个单元，5 个中位价全部与手算一致 |
| `/api/mobile/feed` 五个 stage 的门槛 | curl 真库验过：stage 0 → 0 套；1–2 → 恰好 2 张预告；3 → 12 个社区；4 → 12 套解锁 |

**唯一没验的就是"看起来对不对"和"手感对不对"** —— 也就是上面 V1–V6。
