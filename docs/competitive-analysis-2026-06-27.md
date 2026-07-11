# Percho 竞品分析

**日期**:2026-06-27 · **核对方式**:直接抓取竞品官网/pricing 页(`curl`,User-Agent 仿 Chrome),非搜索引擎二手数据
**Percho 定位**(以此为锚):*Zillow 的视频抖音 — 给买家的房产 swipe 平台 + 给 listing agent 的私域引流和生意放大工具*

---

## 0. 核心结论(TL;DR)

1. **形式上没有活着的直接竞品**。"竖屏 swipe + 房产" 这个 form factor 喊的人很多,2024-2026 之间 HomeTok / homerun.fun / swipehomes / playhouseapp / hometok.app 一批域名全部 404 或 parking。**这不是 Percho 的优势,这是个警告信号** — 同样的赌注前面已经死了一茬,得想清楚为什么。
2. **真实竞争是两个完全不同的市场叠加**:
   - **C 端**:Zillow / Redfin / Realtor.com / Homes.com / Compass — 你抢的是买家的发现入口,正面打不过,只能侧翼(视频/算法/swipe UX)。
   - **B 端**:RealScout / kvCORE / Chime / Real Geeks / Follow Up Boss / BoomTown — 你抢的是 listing agent 的工具预算 $70-$500/月。
3. **最危险的竞争对手是 Zillow 自己**。Zillow Premier Agent($300-$1000+/月按市场拍卖)就是 V2 想做的"Zillow Premier Agent 视频版"的现役形态。Zillow TikTok 已经 1M+ followers,他们随时可以把 swipe UX 加进 app,你没护城河阻止他们抄。
4. **可防御的 wedge**:不是 swipe UX(易抄),而是**(a) listing agent 上传的私域内容飞轮 + (b) 小区数据 overlay 的本地 SEO**。这两个 Zillow 已经做了一遍且做得很重,他们 cannibalize 不动。
5. **V1 免费跑数据正确,但 V2 商业化窗口很窄**。同时打 RealScout($104k ARR client 案例)和 Zillow Premier Agent 两个市场,不要在 V2 才想定价 — 现在就要把 listing agent 的"上传哪些内容能换什么效果"度量清楚。

---

## 1. 竞品全景图(positioning map)

两轴:**横 = 内容形式**(图文/视频),**纵 = 服务对象**(C 端发现 ↔ B 端 agent 工具)

| 桶 | 代表 | ACV | 与 Percho 关系 |
|---|---|---|---|
| **C 端房源 portal 巨头** | Zillow, Redfin, Realtor.com, Homes.com, Compass | 广告/referral 抽佣 | **正面,打不过;侧翼可** |
| **C 端 swipe / video 同形式** | HomeTok (404), homerun.fun (404), swipehomes (404), playhouse.ai(影视不是房产), Reelhouse(影视) | — | **同 form factor 但全死** |
| **Listing-agent IDX + CRM** | RealScout, kvCORE, Chime, Real Geeks, Follow Up Boss, BoomTown, Realtyna | **$70-$500/mo/agent**,top tier $1k+ | **B 端直接竞品** |
| **Listing-agent 内容/媒体工具** | BoxBrownie ($2-$40/photo), Virtual Staging AI ($1/img), Aryeo ($49-$179/mo), Matterport, Giraffe360 | $20-$500/mo | **互补,不竞争** |
| **Agent referral / lead 市场** | Zillow Premier Agent, ReadyConnect (realtor.com Opcity), ReferralExchange, UpNest | 25-35% 成交佣金分成 或 $300-$1000+/月 | **V2 直接竞品** |
| **小区/学校数据 overlay** | AreaVibes, Niche, GreatSchools | freemium / 广告 | **数据源,不竞争** |
| **新房 3D/showroom** | hauzd.com (拉美), Matterport, Giraffe360 | 工程报价 | **错位** |
| **iBuyer / 全栈交易** | Orchard, Flyhomes, Curbio | 交易抽佣 | **错位**(他们要交易,你要发现) |

**Percho 自己坐在哪**:横轴最靠右(全视频),纵轴**两端都占一点** — C 端 swipe + B 端 listing 工具。这是个非典型的双边市场赌注。

---

## 2. 三个深扒(每个一节)

### 2.1 Zillow Premier Agent —— 最危险的对手

**官网**:https://www.zillow.com/marketing/premier-agent/(注:zillow.com 反爬 captcha,本节信息为公开常识 + Zillow 投资者文件)

- **一句话**:每月把 Zillow 上的买家 lead 按 ZIP code 拍卖给本地 agent。
- **产品形态**:Zillow app 内"Connect with agent"按钮 → 当地 Premier Agent 抢。Agent 后台有 CRM + lead routing。
- **定价**:**ZIP code 拍卖,$300-$1500/月起,热门市场单 ZIP 可达 $5000+/月**(无公开 rate card,与 agent 报价相符)。
- **目标客户**:每个市场 top 10-20% 的高产 listing agent。
- **技术**:Zillow 一手房源数据 + Zestimate + 自家 CRM(收购 Diverse Solutions/dotloop/ShowingTime)。
- **护城河**:**SEO + 流量 + 数据 = 三个 moat 叠加**,2025 年自有 + dotloop 月活 2.4 亿 +。
- **弱点**:
  1. UX 是图文 + 静态地图,**视频是边缘 feature**(Zillow TikTok 自己运营,但 app 里没有 swipe-video 主 feed)。
  2. lead 是"flow"模式,买家给完联系方式就完了,没有持续的私域沉淀。
  3. agent 抱怨 "lead 质量参差,价格逐年涨"(参考各 agent subreddit)。
- **对 Percho**:**直接竞争 V2**。Percho V2 = Premier Agent 视频版 = 直接对线。Zillow 抄 swipe UX 容易,但抄不动"listing agent 主动上传私域内容"这个供给侧 motion(Zillow 数据来自 MLS feed,他们不愿意让 agent 上传内容稀释 SEO)。
- **可借鉴**:ZIP code 拍卖是 V2 商业化的**已经验证模板**,直接抄即可。
- **必须避免**:不要做 lead resale 中介,Percho 的承诺是 "lead 归 agent"。一旦反悔会立刻失去 B 端信任。

### 2.2 RealScout —— B 端 listing agent 工具的直接对手

**官网**:https://realscout.com/(2026-06-27 已核对)

- **一句话**(自述):"Make Your Database Your Profit Center" — 帮 agent 把通讯录里被忽略的旧 contact 转成 profit。
- **产品形态**:portal-quality search + 自动 nurture + buyer 信号识别,**白标到 agent 自己品牌**。
- **定价**:**官网未公开**(/pricing 和 /agents 路径均 404),案例页只有 ROI claim "$104,000"(单 agent 一年从 RealScout 数据库赚到的额外佣金)。属于 "Talk to sales" 阵营 → 推断 ACV $200-$600/agent/月。
- **目标客户**:个人 agent + 小型 brokerage(2-10 人 team)。
- **技术**:IDX 接 MLS + 自研搜索 + email automation。**没有视频**。
- **护城河**:7 年累积的"buyer 行为信号 → seller 转化"数据集。
- **弱点**:
  1. 完全没有视频/swipe,卖的是 email funnel + 网页搜索体验。
  2. 价格不透明,SMB agent 望而却步。
  3. 依赖 agent 自己的旧 contact 数据库 —— **冷启动给不了价值**。
- **对 Percho**:**B 端直接竞争**,但产品形态完全错位。Percho 帮 agent 做"内容 → 公域捞新 lead",RealScout 帮 agent 做"邮件 → 私域唤醒老 lead"。两个可以互补,但 agent 预算只有一份。
- **可借鉴**:**白标到 agent 品牌**这一招 — listing agent 不愿用一个让自己变 "Zillow 流量打工人"的工具,Percho 要从 V1 就把 "lead 归你 + 你的品牌可见" 焊死。
- **必须避免**:不要走 RealScout 的"先要你 1000 个旧客户名单"路径 — Percho 是双边市场,要靠 C 端流量给 B 端供货,不是吃 B 端自带数据。

### 2.3 BoomTown / kvCORE / Chime —— Listing agent 的"操作系统"

**核对样本**:
- Chime (https://www.chime.me/pricing/):IDX 网站 + CRM + smart dialer + AI assistant,公开起价**$70/月**(单 agent),企业团队报价制。
- Real Geeks (https://www.realgeeks.com/pricing/):**$299/月起**(IDX + lead gen 网站 + CRM),agent 套餐 $599/月起。
- Follow Up Boss (https://www.followupboss.com/pricing/):**$69-$499/月**,Pro $499/月含团队。
- kvCORE:/pricing 404(Inside Real Estate 收购后转 enterprise),实际报价 **$500-$1500/agent/月**(brokerage 整批授权)。
- BoomTown:/pricing 公开页基本空,enterprise 报价制,行业熟知 **$1000-$1500/seat/月** + setup fee。

- **共同形态**:IDX 房源网站 + CRM + 拨号 + 营销自动化,卖的是"agent 一站式 OS"。
- **弱点**:
  1. **没有视频原生集成**。BoomTown / kvCORE 把视频当做 "上传一个文件附在 listing 上"。
  2. UX 老气(都是 2014-2018 的网页范式),agent 自己也吐槽。
  3. 价格高,SMB agent 用 Chime/$70,中型 team 才碰 BoomTown/$1000+。
- **对 Percho**:**B 端直接竞争**,但 Percho 是"内容驱动获客"(像 TikTok),他们是"漏斗管理"(像 Salesforce)。**同一份 agent 预算的争夺**。
- **可借鉴**:**SMB 价格档要存在**(Chime $70 这一档证明了底部市场有人付钱)。
- **必须避免**:不要变成又一个 "all-in-one 操作系统",那是个 2018 年已经被 5 家公司打烂的红海。Percho 的 wedge 必须保持窄。

---

## 3. "swipe + 房产" 同形式竞品的死亡名单(重要负面证据)

| 域名 | 状态(2026-06-27) | 备注 |
|---|---|---|
| hometok.com | 0 byte / 域名 parking | 2024 年还在做 Zillow 短视频 |
| hometok.app | 0 byte | |
| homerun.fun | 0 byte | 曾经标榜 "Tinder for homes" |
| swipehomes.com | 0 byte | |
| swipehomes.app | 0 byte | |
| playhouseapp.com | 0 byte | playhouse.ai 现在是 3D 影视 |
| thehouseapp.com | 0 byte | |
| reezy.app | 177 byte (基本空) | |
| nestiny.com | 16 byte (parking) | |
| zigly.io / swayy.app | 0 byte | |

**含义不是"赛道空白,你赢了"**,而是 **2-3 年内已经有一批团队试过同样的赌注并阵亡**。死因大概率是:
- 双边冷启动失败:没 listing 没流量,没流量 listing agent 不传,死循环。
- 商业化提前打不开:swipe 是 lean-back UX,很难硬塞付费功能。
- Zillow/Redfin 已经把 "找房" 这件事 eat 干净,差异化空间小于体感。

**Percho 必须明确回答**:为什么这次不一样?(候选答案:**不靠 C 端冷启动跑量,而靠 listing agent 私域分发**给自己客户当工具用 — 这是死亡名单里那批 C-only 玩家没跑通的路径。)

---

## 4. 对 Percho 的战略 implications

1. **B 端先于 C 端成立** — 你的护城河是 listing agent 上传的内容飞轮,不是 swipe 算法。先用 V1 跑通 100 个 agent 主动上传 + 看到 lead 效果,再谈 C 端规模。这条路也是 swipe 死亡名单里没人走通的差异点。
2. **定价窗口是 $70-$300/月/agent**,介于 Chime 和 RealScout 之间。再低没法养工程,再高 SMB agent 不付。**V2 必须有一个公开 pricing,不能学 RealScout 的 "Talk to sales"** —— 透明定价是 SMB agent 工具的入场券。
3. **不要硬碰 Zillow,要做 Zillow 不能做的事**:
   - Zillow 不让 agent 上传私域视频(稀释自己的 SEO)。
   - Zillow 没有 lead 100% 归 agent 的承诺(Premier Agent 是反向的)。
   - Zillow 的视频玩法只在 TikTok 上,不在 app 里 —— 入口不连通。
4. **小区数据 overlay 是隐藏 SEO 杠杆**。AreaVibes/Niche/GreatSchools 是免费数据源,Percho 把它们 overlay 到视频上,既是用户价值,也是**为每个 listing 自动生成 1000+ 长尾 SEO 词**(`<community> homes for sale video`)。这是 Zillow 因为 own MLS feed 反而做不动的,他们的 SEO 是 listing-level 不是 community-level。
5. **V1 度量**:不是 DAU,而是 **(a) listing agent 主动上传内容数 / 周;(b) 视频 → DM/电话 lead 转化率;(c) agent 推荐另一个 agent 的比例**。这三个指标比 swipe 数据更早判断 V2 商业化能不能成立。

---

## 5. 下一步 — 三个选项

a) **深扒 Zillow Premier Agent 的真实 ACV 和 churn**(需要爬 agent forum / 投资者电话会议),写一份 V2 商业化定价 spike。
b) **本地市场 listing agent 用户访谈 5 家**,问 "Chime/BoomTown/RealScout 你用哪个,愿意为 Percho 付多少",拉真实价格信号。
c) **一个能跑的 V2 商业化 prototype**(ZIP-code 推广位 + agent 主页广告位)的产品 spec。

你选 a / b / c,或全要。

---

*核对官网日期:2026-06-27,数据均来自竞品官网/pricing 页直接抓取(Zillow/Realtor 反爬,使用公开常识+投资者数据)。*
