# task-0 验收清单 — Mac mini + iPhone

Linux EC2 上跑不了 iOS simulator，所以 task-0 的 7 条视觉验收必须在 Mac 上做。
这份清单是逐项可打勾的，走完即可开 task-1。

代码状态：`main`，foundation 层已修完 opus-5 review 的 6 个 blocker。
逻辑有 26 个单测覆盖；**渲染没有任何验证** —— 这份清单就是补那一块。

---

## 0. 一次性环境准备（Mac mini）

```bash
cd ~/Percho
git checkout main && git pull

# pnpm 9 + node >= 20（package.json engines）
node -v            # 需 >= 20，仓库在 v22 上验证过
pnpm -v            # 需 9.x

pnpm install       # .npmrc 是 node-linker=hoisted，RN 需要
```

手机端装 **Expo Go**（App Store）。Mac 和 iPhone 必须在同一个 Wi-Fi。

> 为什么是 Expo Go 而不是 `expo run:ios`：仓库里没有 `ios/` 原生目录，
> 走的是 managed 流程。用到的 4 个原生模块（expo-video、expo-haptics、
> reanimated 4、gesture-handler 2.28）都在 SDK 54 的 Expo Go 里，不需要
> 自己编 dev-client。省掉一次 15 分钟的 Xcode 构建。

## 1. 启动

```bash
cd ~/Percho
pnpm mobile:start
```

终端会出二维码。iPhone 相机扫码 → 在 Expo Go 里打开。

先跑一次 sanity：Percho 首页（浅米色底 + "Homes that fit your vibe."）能出来，
说明 bundle 正常。

## 2. 打开验收屏

验收屏是 `/dev-foundation`，**故意不挂在任何导航里**（spec: "demo 屏不进 main
导航"），所以要手动跳。

**最可靠的办法** —— 临时在首页加一个入口，验完删掉：

```bash
# ~/Percho/apps/mobile/app/index.tsx，在 "Open feed →" 那个 Link 下面加一行：
<Link href="/dev-foundation" style={styles.cta}>dev-foundation →</Link>
```

保存即热更新，手机上直接多出一个按钮。验完 `git checkout apps/mobile/app/index.tsx` 还原。

> 为什么不用 deep link：Expo Go 里 `percho://` 这个自定义 scheme 不生效
> （那是 standalone build 才有的），得用 `exp://<你的局域网IP>:8081/--/dev-foundation`，
> IP 每次换网络都变，还要额外装 `uri-scheme` 包。加一行 Link 更快。

> 注意：`/dev-foundation` 现在**已进 git**。之前它被 `apps/mobile/.gitignore`
> 挡掉了，你 pull 下来根本没有这个文件 —— 这是我上一轮的错，已修。

---

## 3. 七条验收 — 逐项打勾

屏幕上每一块都标了 A1..A7 对应下面的编号。

### A1 — 无硬编码色值 / 圆角
在 Mac 上跑，不用看手机。**注意范围**：只扫 task-0 产出的目录。
`app/feed.tsx`、`app/index.tsx`、`app/place/[slug].tsx` 是 task-0 之前的旧屏，
里面几十处 hex 和 `borderRadius: 999` 都还在 —— 那是 task-1 要替换的东西，
不算 task-0 失败。

```bash
cd ~/Percho/apps/mobile

# 1. task-0 范围内不该有任何 hex（tokens.ts 是唯一允许的地方）
grep -rn -E '#[0-9a-fA-F]{3}' components hooks state lib theme app/dev-foundation.tsx \
  --include='*.ts' --include='*.tsx' | grep -v 'theme/tokens.ts'

# 2. task-0 范围内不该有字面量圆角
grep -rn 'borderRadius: [0-9]' components hooks state lib app/dev-foundation.tsx \
  --include='*.ts' --include='*.tsx'
```

两条都应该**零输出**。（我在 EC2 上实测过，确实是零。）

- [ ] 两条 grep 均无输出

### A2 — tap 翻面是 350ms 淡入淡出，不是 3D 翻转
点卡片正面 → 应淡出到深色数据面；再点 → 淡回。

- [ ] 换面是**淡入淡出**，不是绕轴旋转
- [ ] 过程中**没有**任何一帧看到镜像/反字
- [ ] 手感约 1/3 秒，不拖沓

### A3 — 拖动跟手 ±8° + 后面两张卡的缩放透明度
**慢慢**往右拖，拖到快出屏但不松手。

- [ ] 卡片跟手倾斜，最大约 8°（不是几乎看不出的 3°，也不是夸张的 20°）
- [ ] 第二张卡随拖动**逐渐放大变清晰**（0.94→1，0.5→1）
- [ ] 第三张卡明显更小更淡（0.88 / 0.25）
- [ ] 松手飞出后，**没有任何一帧**看到卡片在屏幕外闪一下

反悔行为（我替你定的，spec 没写）：拖过阈值后**快速甩回**再松手 → 卡片应该
**弹回**不出牌。注意必须是快甩（>800pt/s），慢慢拖回到阈值内松手也是弹回，
但那走的是另一条逻辑。

- [ ] 拖过头再快速甩回 → 弹回，不算一票
- [ ] 往左拖一点、然后快速向右甩 → 弹回（不该向右飞出去）

### A4 — 震动
真机才有，simulator 无震动（这是 simulator 限制，不是 bug）。

右滑过阈值会有**两次**震动，这是设计如此，不是 bug：
拖过 35% 的瞬间一下 selection（告诉你"这一票已经算数了"），
卡片飞出去落定后再一下 Light impact。

- [ ] 左滑（pass）**全程无**震动
- [ ] 右滑：拖过阈值瞬间一下轻震（手指还没松）
- [ ] 右滑：卡片飞出后第二下轻震
- [ ] 拖过阈值 → 退回阈值内 → 再拖过去，会**再震一次**（这是设计：
      每次"重新跨过"都确认一下；但按住不动不会连震）
- [ ] tap 翻面结束时也有一下 Light impact

### A5 — 视频切卡行为
前两张卡是**两个不同的视频**（Big Buck Bunny 兔子 / Jellyfish 水母），一眼能分清。
都是 10 秒短片，所以 82% 回调约 8.2 秒就触发，不用干等。

> 这两个 URL 是我实测过 HTTP 200 + 支持 range 请求的。原来写的
> `commondatastorage.googleapis.com/gtv-videos-bucket/...` 现在全部 **403**，
> 如果你看到黑屏别怀疑 CardVideo —— 那是源挂了，已换掉。

- [ ] 只有最上面那张在播
- [ ] 右滑换卡后：新的 top 卡**从头开始**播（不是接着上一张的进度）
- [ ] 被划掉那张的声音立刻停
- [ ] 点右上角喇叭切声音，播放**不中断**、不跳回开头
- [ ] 等约 8 秒 → 下方 event log 出现 `A5 onNearEnd 82% fired`
- [ ] 划到第二张，第二张也能**再次**触发它自己的 82%（latch 每卡重置）

### A6 — MatchBadge 三态
屏幕上方 A6 那一行并排放了 55 / 72 / 92。

- [ ] 55 分**什么都不显示**
- [ ] 72 分显示普通灰底 `72% MATCH`
- [ ] 92 分显示橙底 `🎯 92% MATCH · See why →`，可点，点了开 sheet

### A7 — BottomSheet 两档 + TabBar 四态
- [ ] "A7 sheet: medium" → 半屏；"large" → 大屏
- [ ] 顶部有 grabber 横条
- [ ] 往下拖能关；点上方暗背景能关
- [ ] TabBar 恰好 4 个 tab，选中的那个明显区别于另外三个
- [ ] **刘海机关键项**：tab bar 整条在 home indicator **上方**，文字没有被
      底部横条压住或截掉

### 额外 — 竖向手势不被卡片偷走（task-1 前置）
卡片下面有个 event log 小框，可以滚。

- [ ] 手指从**卡片上**开始往下拖 → 卡片不动（不该被当成 swipe）
- [ ] 在 event log 框里上下滚 → 能正常滚动

这条是 task-1（竖向 feed）能不能建在这层上的前提。

---

## 4. 验完之后

如果全绿：回来说一声，直接开 task-1。

如果有红：把哪条红了 + 手机型号告诉我（截图/录屏最好）。不用自己改，
我在 EC2 上修完再让你复验。

已知**不能**在这份清单里验的：
- simulator 上没有震动（A4 需真机）
- 后端 5 处 `ANTHROPIC_API_KEY` 调用点在这台 EC2 上是坏的，但验收屏用的是
  公开 sample 视频 + Unsplash 图，不碰后端，所以不影响
