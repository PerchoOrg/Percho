# ReelEstate.dev 竞品拆解

**日期**：2026-07-11
**竞品**：ReelEstate — https://reelestate.dev · Beaker Ice Studios · "Real estate, on reels."
**抓取方式**：browser_navigate（curl 被服务器 blackhole，Wayback 无快照）
**截图**：`~/.hermes/audio_cache/reelestate/landing.png`（单页 SPA，全站信息一屏收）
**站点结构**：**只有一个 landing page**（外加 `/privacy`、`/terms`、`/support`）。没有独立 features/pricing 页 —— 全 SPA 单栏叙事。

---

## 1. 全站信息盘点

Landing 从上到下 8 个 section：

| # | Section | Eyebrow label | 核心 copy |
|---|---------|--------------|-----------|
| 1 | Nav | — | logo + "Download" CTA（不是主 hero CTA，副的） |
| 2 | Hero | — | H1 "Real estate, on reels." · 副 "Turn every listing into a short-form video tour…" · CTA "Download on the App Store" · 微文案 "● 7-day free trial · cancel anytime · free for buyers" · 一张 iPhone mockup 显示 $635K Austin TX 房源 reel |
| 3 | Features | WHY REELESTATE | H2 "The whole pipeline, one app." · 6 张 feature card：Vertical reels / AI listing import (Gemini) / Brokerage seats / Real-time messaging / Open houses (QR check-in) / Circles (co-shop) |
| 4 | Screenshot gallery | INSIDE THE APP | H2 "A real estate suite that doesn't look like one." · 8 张 app screenshot（property detail、list w/ filter、office profile、agent profile、create reel、commute calc、create listing、messages inbox） |
| 5 | Two-sided value | TWO-SIDED BY DESIGN | H2 "Free for buyers. Pro tools for agents." · 两栏 buyer(free) vs agent(paid) |
| 6 | Pricing | PRICING | H2 "Built for solo agents and offices alike." · Individual Agent $9.99/mo · 4 档 Office (Starter/Growth/Pro/Enterprise) |
| 7 | Final CTA | GET IT | H2 "Start your 7 free days." · App Store button |
| 8 | Footer | — | © 2026 ReelEstate · Privacy / Terms / Support |

**关键观察**：全站 **零 social proof**（没有 testimonial、logo cloud、"used by X agents"）。产品还早期，赌 aesthetic + 定价说服力。

---

## 2. UI patterns

### 2.1 Color system（深色 neon-noir）

| Token | 用途 | Hex |
|-------|------|-----|
| bg-primary | 全站底色 | `#000000` ~ `#0A0A0F` |
| bg-elevated | card 微抬 | `#111114` ~ `#161620` |
| accent-cyan | H1 gradient 一半、eyebrow、CTA 点缀 | `#00E5FF` ~ `#22D3EE` |
| accent-magenta | H1 gradient 另一半、tag pill | `#E879F9` ~ `#D946EF` |
| cta-blue | nav 里的 Download 按钮 | `#3B82F6` |
| text-primary | 标题正文 | `#FFFFFF` / `#F5F5F7` |
| text-secondary | body | `#8B8B95` ~ `#A1A1AA` |
| text-tertiary | 微文案 | `#6B6B75` |

Vibe 参考：Linear、Arc Browser、Vercel。**赌"我们不像传统 real estate CRM"** —— 与 Zillow/Realtor 的信息密集浅色 UI 割裂。

### 2.2 Typography

- 全站 sans-serif（Inter / Geist 系）。零 serif。
- H1 700-800 weight、tight letter-spacing、gradient 填色。
- Eyebrow 用 small-caps + tracked-out + cyan 色 —— 典型 SaaS 惯例。
- Body 400-500，muted gray 拉层次。

### 2.3 Layout / 节奏

- Hero + iPhone mockup 右侧漂浮（cinematic），左侧 H1 靠左。
- Feature grid：6 张 card，2 列或 3 列，每 card 一个小 illustration + H3 + 一段 body。
- Screenshot gallery：8 张 iPhone screenshot 水平/网格铺陈，展示 app 内不同页面（这是他们的**核心武器 —— 展示"我们已经做完了"**）。
- Pricing：**两栏**（Individual vs Office），不是常见 3-4 栏 tier。Individual 只有一个价 $9.99，Office 4 档纵向堆。

### 2.4 CTA

- **主 CTA 只有一个动作**："Download on the App Store"，重复 3 次（Nav / Hero / Final）。
- 副信号："Mac app — coming soon"（未来感 + 平台扩张信号）。
- **没有 "Book a demo" / "Contact sales" / "Talk to us"** —— 完全 self-serve，不做企业销售。

### 2.5 Caption / info hierarchy（feed 里的房源）

从 mockup 反推（唯一可见的 hero 图）：
- 顶部：agent avatar + 名字 + follow button（社交气）
- 中部：video reel 竖屏，object-cover 全屏
- 底部：价格大字（$635,000）+ 城市 + beds/baths/sqft 小字
- CTA：love/comment/share 竖排右侧（TikTok/Reels 抄）

**结论：feed = TikTok/Reels 复刻，房源信息塞底部**。跟 Percho 74.14 的 feed 22/26 caption 层级思路一致，但 ReelEstate 更 social（有 agent follow）。

---

## 3. Landing 结构 —— 抄 / 改 / 弃

| 段位 | ReelEstate 做法 | Percho 策略 | 理由 |
|------|----------------|------------|------|
| Hero H1 | "Real estate, on reels." （3 字押韵） | **改**："GA 的房产短视频。" 或 "Georgia homes, on reels." | GA-only 定位必须一眼看到；押韵结构值得抄。 |
| Hero CTA | 单一 "Download App Store" | **改**：双 CTA —— "See Atlanta reels"（buyer 免费即看）+ "For GA agents"（agent trial）。Percho web-first，非 iOS-only。 | Percho 是 web app（vicinities.cc），不需要 App Store gating。web-first 反倒能 SEO + 分享链接。 |
| Social proof | 无 | **加**："GA MLS 已覆盖 X 郡" + "N 个 Atlanta agent 已上线" 数字条 | GA-only 需要证明"我们真的在这里"，reelestate 全国盲战不需要 proof。 |
| Feature grid | 6 张：reels / AI import / brokerage seats / messaging / open houses / circles | **抄 3 改 3**：抄 reels 主线、AI import、brokerage seats；改 messaging→ "Neighborhood chat"；改 open houses→"Weekend tour reels"；改 circles→"Neighborhood-first browsing" | Percho 差异化在 neighborhood community（vibe，不是 kin），circles 改成 neighborhood 语义。 |
| Screenshot gallery | 8 张 iPhone mockup | **抄格式改内容**：8 张 Percho web screenshot（feed / listing detail / neighborhood page / agent dashboard / create-reel / batch-video pipeline / GA map / Rednote 分享） | Screenshot gallery 是最强 conversion 武器，必抄。但突出 Percho 独有的 **neighborhood page** + **batch pipeline**。 |
| Two-sided | Buyer free / Agent paid | **抄** | 逻辑没问题：buyer 免费获客、agent 付费。改动只在文案本地化。 |
| Pricing | Individual $9.99 · Office 4 档 | **改**：见 §4 | GA-only 池子小，定价需要重新锚定；office tier 数量可以精简。 |
| Final CTA | Download | **改**：双入口同 hero | 同上。 |
| Footer | 3 links | **加**：GA 覆盖 county 列表 + 中/英/西/越/韩 语种选择器（Percho 覆盖多语种 buyer） | 与 CLAUDE.md §1 一致：US 多语种 buyer 是核心受众。 |

---

## 4. Pricing 模型深挖

### 4.1 ReelEstate 定价表

| Tier | Seats | Monthly | Annual | Per-seat/mo (annual) |
|------|-------|---------|--------|-----------------------|
| Individual | 1 | $9.99 | $79.99 | $6.67 |
| Office Starter | ≤5 | $34.99 | $349.99 | $5.83 |
| Office Growth | ≤10 | $59.99 | $599.99 | $5.00 |
| Office Pro | ≤25 | $124.99 | $999.99 | $3.33 |
| Office Enterprise | ≤50 | $229.99 | — | (仅月付) |

### 4.2 定价心理

- **锚定**：$9.99 是"心理免疫价"（低于 $10），进门无痛。Enterprise $229.99 是天花板锚定 —— 让 $59.99 看起来"合理"。
- **规模折扣**：per-seat 从 $6.67 → $3.33，5x 团队 = 2x 单价折扣。促进 upgrade。
- **年付诱因**："save 33%" 明码。Office 年付相当于 10 个月月付（save 17%），Individual 年付 save 33% —— 拉个人比拉团队更愿意锁年费。
- **免费额度**：buyer 完全免费 · agent 7 天试用。**没有 freemium agent tier**（e.g. "免费发 3 条 reel"）—— 逼 agent 上钩后立即付费或走人。
- **Enterprise 不做年付**：$229.99/mo × 12 = $2760/年 —— 保留月对月弹性可能是因为大 office 的销售流程尚未成型。

### 4.3 Percho 定价策略（GA-only）

**问题**：GA active real estate agent 约 4-5 万（估算，全 US ~150 万的 3%）。ReelEstate 全国盘 vs Percho 只有 3% 的市场，定价不能照抄。

**Percho 定价原则**：
1. **提价空间**：GA-only 深耕 = 帮 agent 拿本地 buyer，per-agent value 更高，可以敢定 $19-29 而不是 $9.99。
2. **减少 tier 复杂度**：4 档 office → 2 档（Team + Brokerage）。GA-only 客户量不足以支撑 4 档差异。
3. **加 buyer 增值**：Percho buyer 也可以有 optional $2.99 "早鸟 alerts"（GA 特定 zip code 新上榜 push）。ReelEstate 没做 buyer 变现。

**Percho 推荐定价**（3 个 prototype 会各试一版）：

| Version | Solo Agent | Team (≤10) | Brokerage | Buyer |
|---------|-----------|------------|-----------|-------|
| v1（抄 ReelEstate 结构） | $9.99/mo | $59.99/mo | $199/mo | Free |
| v2（差异化：中位提价） | $19/mo | $79/mo (≤10) | $299/mo (≤50) | Free + $2.99 Pro alerts |
| v3（激进：neighborhood-first） | $29/mo（含 1 neighborhood video/月） | $99/mo | $399/mo (unlimited neighborhood pipeline) | Free |

---

## 5. Percho 差异化护城河（在 prototype 里必须体现）

从 memory 里我已经知道的三大护城河，逐一映射到 UI 元素：

1. **GA/Atlanta selling only** → hero 里明喊 "Georgia"、footer 列 county、pricing 页说 "GA MLS covered"。
2. **Community = neighborhood vibe（风景+人文，不是家人）** → feature 里替换 "Circles"（家庭 co-shop）为 "Neighborhoods"（社区探索）。v3 直接把 neighborhood 顶上 hero。
3. **照片→视频 pipeline 批量化** → 加一个 feature card "Batch listing videos from photos"，暗示 agent 不需要手工录制 —— ReelEstate 需要 agent 举手机拍。

---

## 6. Gap / 未抓到的信息

- 无法拿到 App Store 详情页（需 iOS device 或 App Store scraping）—— reviews / rating / 下载量未知。
- ReelEstate 没暴露 API / open graph 数据 —— 没法量化用户规模。
- 没找到 pitch deck / VC 消息。
- Beaker Ice Studios 其他项目未查（可以后续补）。

**若未来要补**：可以用 [App Store scraper 库](https://github.com/facundoolano/app-store-scraper) 拉 reviews + rating trend。

---

## 7. Revisit — 2026-07-11 20:00 UTC (F1 tick)

**方法**：`browser_navigate https://reelestate.dev` + `document.body.innerText` 全站文本 diff。

**结论**：**零更新**。逐段核对：
- H1 仍是 "Real estate, on reels." · 副文案逐字一致。
- Nav / Hero / Final CTA 都仍是 "Download on the App Store" + "Mac app — coming soon" + "7-day free trial · cancel anytime · free for buyers"。
- 6 张 feature card 顺序/标题/正文一字不改（Vertical reels / AI listing import (Gemini) / Brokerage seats / Real-time messaging / Open houses (QR check-in) / Circles）。
- Pricing 5 档价格与 §4.1 表完全一致：Individual $9.99/$79.99 · Starter $34.99/$349.99 · Growth $59.99/$599.99 · Pro $124.99/$999.99 · Enterprise $229.99/mo（Enterprise 仍无年付）。
- Footer 仍 © 2026 ReelEstate + 3 links (Privacy/Terms/Support)。
- **零 social proof 新增**（仍无 testimonial / logo cloud / 用户数字）。
- 未见 web app / waitlist / blog / changelog 新入口 —— 仍是 iOS-only SPA 落地页。

**含义**：竞品在 ~9 天窗口内无 landing 迭代 → 要么产品迭代重心在 iOS App（landing 不动是常态），要么公司节奏慢。**对 Percho 无威胁信号**，也无需 patch §1-§6 任何一项。三大护城河（GA-only / neighborhood community / photo→video 批量 pipeline）仍未被竞品覆盖。

**Next-look 触发器**（不主动 poll）：若 App Store 详情页出现"web app / brokerage web console"字样,或 landing 出现 testimonial + agent count 数字 —— 说明产品已过冷启动进入 growth,回来 patch §1-§6 并重估 pricing。
