# Percho vs ReelEstate — 决策表 & 落地推荐

**日期**：2026-07-11
**输入**：`reelestate-teardown.md` + 3 个 prototype
**产出**：本文件 —— 一表 review 所有 UI/copy/pricing 决策 + 最终推荐组合

---

## 决策表（按 landing 段位排列）

| # | 维度 | ReelEstate 做法 | Percho 决策 | 抄/改/弃 | 理由 | 落在 |
|---|------|----------------|-------------|---------|------|------|
| 1 | 主 color scheme | 深色 neon-noir（黑底 + cyan/magenta gradient） | 浅色 warm-earth（暖米底 + 陶土/moss/sage 点缀） | **弃** | 用户视觉偏好硬性浅色（memory）；也是本地化差异——GA 房产客群非 SF/NY 科技极客 | v1/v2/v3 全部 |
| 2 | H1 tagline 结构 | "Real estate, on reels." 3 词押韵 | v1: "Georgia homes, on reels." · v2: "The Atlanta home tour, in your pocket." · v3: "Move to a neighborhood, not a listing." | **改** | 押韵结构值得学；但 GA-only 一眼可见 + v3 直接换视角 | v1/v2/v3 |
| 3 | Hero visual | 单张 iPhone mockup 展示单条 reel | v1/v2: 相同 iPhone mockup · v3: **neighborhood mosaic 网格**（6 张不同 neighborhood 卡片） | v1 抄 · v2 抄 · v3 **改** | v3 是 neighborhood-first 差异化的最有力视觉表达 | v3 |
| 4 | 主 CTA 动作 | 单一 "Download App Store" | 双 CTA：agent trial + buyer 免费看 reel | **改** | Percho 是 web app，无 App Store gating；buyer 无痛入口拉留存 | v1/v2/v3 |
| 5 | Social proof | **无** | v1 沿用无 · v2 加数字条（142 agents / 18 counties / 4200 reels / 5 languages）· v3 用 neighborhood mosaic 本身作为 proof | v1 抄 · v2/v3 **加** | GA-only 定位需要证明"我们真的在这里"，reelestate 全国盲战不需要 | v2/v3 |
| 6 | Feature grid 数量 | 6 张 card | v1: 6 张（抄 1:1） · v2: 6 张（3 抄 3 改） · v3: 5 张 + 一张 big feature card 顶头 | v1 抄 · v2/v3 **改** | 6 张是 SaaS 最优密度；v3 强调 neighborhood-first 需要一张 hero card | v1/v2/v3 |
| 7 | Feature：Circles | "Circles for buyers"（家人 co-shop） | v1 沿用 · v2/v3 替换为 "Neighborhood-first browsing" | v1 抄 · v2/v3 **改** | Percho community = neighborhood vibe，不是 kin（memory 硬规则） | v2/v3 |
| 8 | Feature：photos → video | **无**（reelestate 要 agent 手动录） | v1: 无（保持 baseline） · v2/v3: 加 "Photos → reels, no filming" | v1 弃 · v2/v3 **加** | Percho 三大护城河之一，冷启动核心武器 | v2/v3 |
| 9 | Feature：multilingual | **无** | v1: 无 · v2/v3: 加多语种 caption（EN/ES/ZH/VI/KO + Rednote/WeChat） | v1 弃 · v2/v3 **加** | CLAUDE.md §1 硬要求 —— multilingual buyer 是核心受众 | v2/v3 |
| 10 | Screenshot gallery | 8 张 iPhone mockup 网格 | v1 抄 8 张 · v2 用 neighborhood card 替代 · v3 用 mosaic + versus 表替代 | v1 抄 · v2/v3 **改** | 8 张 screenshot 是 SaaS 最强 conversion 武器（reelestate 靠它证明"做完了"）；但 Percho 早期 web app 用 neighborhood 更省事更差异化 | v1 |
| 11 | Two-sided pricing 段 | 独立 section："Free for buyers · 7-day trial for agents" | v1 抄 · v2/v3 融入其他段 | v1 抄 · v2/v3 **改** | v1 需要 baseline 结构完整；v2/v3 已经在 pricing 段说清了 free/paid | v1 |
| 12 | Pricing tier 结构 | Individual + Office 4 档（共 5 tier） | v1: 抄 5 tier · v2: 3 tier（Solo/Team/Brokerage） · v3: 3 tier + **Neighborhood Exclusive** add-on | v1 抄 · v2 **改** · v3 **激进改** | GA 市场池 3% 规模不撑 4 档 office；v3 的 "own a neighborhood" 是 reelestate 抄不来的 moat | 每个 prototype 独立 |
| 13 | Pricing 锚定价 | $9.99 solo · $229.99 top office | v1: $9.99 / $229.99（抄） · v2: $19 / $299 · v3: $29 solo / $249 neighborhood-exclusive | 见上 | v1 baseline；v2 中位提价（GA-only 单客户价值更高）；v3 走"owned neighborhood"稀缺定价 | 每个 prototype 独立 |
| 14 | Buyer 变现 | 完全免费，无路径 | v1: 完全免费 · v2: 免费 + optional $2.99 Pro Alerts · v3: 完全免费 | v1 抄 · v2 **加** · v3 抄 | Buyer 免费是获客底线；$2.99 是低摩擦增值试探（zip-code alerts） | v2 |
| 15 | Trial 时长 | 7-day free trial（agent） | 全部沿用 7-day | **抄** | 7 天是 SaaS 行业稳态，无需另创 | v1/v2/v3 |
| 16 | Nav 结构 | 只有 logo + "Download" | v1: 类似 · v2: logo + Neighborhoods/For agents/Pricing + CTA · v3: logo + Neighborhoods/How/Agents/Pricing | v1 抄 · v2/v3 **改** | GA-only + 复杂 pricing 需要引导 nav；SPA 单页也需要锚点 | v2/v3 |
| 17 | Footer | 3 links: Privacy/Terms/Support | v1 抄 · v2/v3 加 counties list + 语种选择器 | v1 抄 · v2/v3 **加** | GA 覆盖 counties 展示扎实感；multilingual 入口 | v2/v3 |
| 18 | Typography | 全 sans-serif（Inter/Geist） | v1: 全 sans-serif（Inter） · v2: sans + Fraunces serif（H1/H2） · v3: 大量 Fraunces italic + Inter body | v1 抄 · v2/v3 **改** | Serif italic 传达"本地故事、社区人文"的调性（vs reelestate 的"tech-forward"）；差异化立起来 | v2/v3 |
| 19 | Pipeline 解释（技术护城河展示） | **无** | v1: 无 · v2: 5 步 pipeline explainer（Source→Tag→Rank→Compose→Publish） · v3: 融入 versus section | v1 弃 · v2/v3 **加** | 是 Percho 三大护城河之一（batch pipeline），给潜在 agent 客户看"为什么我们比手工录快" | v2/v3 |
| 20 | 反-竞品 comparison | 无（不点名 Zillow/reelestate） | v1: 无 · v2: 无 · v3: 独立 versus 表（Traditional real estate app vs Percho） | **加**（v3 独有） | v3 是激进版，直接说"listing-first vs neighborhood-first" —— 用户拿到 prototype 后可以判断是否敢这么明杠 | v3 |
| 21 | Manifesto 段 | 无 | v1/v2: 无 · v3: "Zillow shows you houses. We show you where you'll live." 大字宣言 | **加**（v3 独有） | v3 走 brand-forward 路线，宣言段拉记忆点；风险：过于 marketing，可能显得空 | v3 |
| 22 | Free "buyer" alerts 变现 | 无 | v1 无 · v2 有 · v3 无 | v2 **加** | 低摩擦月订阅（zip 级 alerts）—— test 一下 buyer 是否愿意付一点点 | v2 |

---

## 推荐组合 —— **v2 落地，v3 做 "About / Manifesto" 页, v1 弃**

### 落地：**Landing v2**

**理由（三个决策）**：

1. **v2 是差异化 + 保守收敛的平衡点**。v1 是"reelestate 换个皮"—— 没有差异化就不会被 buyer/agent 记住；v3 是"neighborhood-first 全押"—— 太激进，早期 GA agent 可能看不懂或不敢下单。v2 保留 reelestate 的稳态结构（feature grid / two-sided / pricing 两栏 → 三栏），同时把三大护城河（GA-local + neighborhood community + photo-to-video pipeline）明码写在 hero / feature / pricing 里。

2. **v2 pricing 三档最好卖**：Solo $19 / Team $79 / Brokerage $299。$19 打过 reelestate 的 $9.99（因为 GA-only per-agent 价值更高，覆盖 MLS integration + multilingual + neighborhood library），$79 team 是中位甜点（reelestate 是 $59.99 up to 10），$299 brokerage 只到 50 seats，够 GA 大部分中型 brokerage 用。三档 vs reelestate 五档，减少决策疲劳。

3. **v2 Fraunces serif + warm earth 色调是本地化的正确调性**。GA/Atlanta 买家家庭属性重、社区感重（不是硅谷极客），warm earth + serif italic 传达"神秘/温度/家门口"的调性，与 reelestate "neon-noir tech product"（Linear/Arc/Vercel 系）明显区隔。用户视觉偏好硬性浅色也满足。

### 保留：**Landing v3 用作 /manifesto 或 /about 页**

v3 的 neighborhood mosaic + manifesto + versus 表 → **不是首页**，但可以做 About/Manifesto 页面（`percho.co/why` 或 `percho.co/manifesto`）。这是"值得深读的品牌页"，配合博客 + neighborhood 深度稿一起投放。风险最低，回报最高（不需要 first-touch 转化，允许 marketing-forward）。

**v3 的 "Neighborhood Exclusive $249/月/neighborhood" 定价**：作为 v2 Brokerage 的 add-on 保留，不进主 pricing 表。以后如果 v2 上线后 traction 起来，把 v3 的 Neighborhood Exclusive 单拎出来做一个高毛利产品线。

### 弃：**Landing v1**

v1 是"抄 reelestate"的 baseline，价值只在于**给我们自己看**"如果不差异化会长什么样"。**不上线**。存 repo 里作为 reference。

---

## 补充：8 个 Screenshot Gallery 的处理

v2 砍了 v1 的 8-shot gallery（reelestate 靠这个证明"做完了"），因为 Percho 已经上线（percho.co 真实产品），不需要用 mockup 装作 shipped。可以在 v2 的 pipeline explainer 段插 2-3 张真实产品截图作为可信度 anchor：**建议之后拿 percho.co 的 feed、single-neighborhood page、agent dashboard 三个真实截图塞进去**。这一步不进本次 prototype（避免动 percho.co repo 或找截图），交付后再补。

---

## 快速 review 用命令

```bash
cd ~/Percho/docs/prototypes/landing-v1 && python3 -m http.server 8081 &
cd ~/Percho/docs/prototypes/landing-v2 && python3 -m http.server 8082 &
cd ~/Percho/docs/prototypes/landing-v3 && python3 -m http.server 8083 &
# open http://localhost:8081  8082  8083
```
