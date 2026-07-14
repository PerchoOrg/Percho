# 社区短视频 —— 数据源调研

面向 Percho GA/Atlanta 房产短视频自动化流水线。目标是为每个社区（起点：Peachtree Corners, GA）批量组装 60 秒竖屏视频。本文档聚焦「素材从哪里来」。

评分口径：成本 / 合规 / 质量 / 可扩展性，1 = 差，5 = 优。

---

## 1. Zillow / Redfin / Realtor listing photos

- **成本**：无官方公开 API（Zillow Bridge 仅面向持牌 MLS 会员；Redfin 无 API；Realtor 的 RapidAPI 通道每月按量计费且条款苛刻）。抓取需自建反爬。
- **合规**：**高风险**。Zillow ToS 明令禁止 scraping 与二次分发照片；listing 照片版权归属 listing agent / 摄影师，MLS 一般只授权在原挂牌页面展示。未经授权把 Zillow 照片剪进营销视频 = 版权 + ToS 双重违规。
- **质量**：室内专业摄影，5 分。
- **可扩展性**：抓取脆弱，反爬频繁变化。
- **打分**：成本 2 / 合规 1 / 质量 5 / 可扩展性 2。
- **推荐用途**：**只用 Percho 自家 agent 上传的照片**（我们有明确授权）。第三方 listing photos 不入库。

## 2. Google Places Photos API + Street View Static API

- **成本**：Places Photo $7 / 1000 次；Street View Static $7 / 1000 次；每月 $200 免费额度足够 POC 阶段。
- **合规**：Google Maps Platform ToS 允许在应用内展示，但要求保留 "Powered by Google" attribution，且**禁止**把 Street View 影像重新剪辑成"离线视频后再分发到 TikTok/IG"（第 3.2.4 条禁止 permanent copies for redistribution）。这是硬伤。
- **质量**：Places 照片来自用户 UGC，质量参差；Street View 视角有限、有 Google 水印。3 分。
- **可扩展性**：API 稳定，配额可预测。5 分。
- **打分**：成本 4 / 合规 2 / 质量 3 / 可扩展性 5。
- **推荐用途**：**仅用作 in-app 地图组件的实时展示**（合规内），不进入离线视频合成管线。

## 3. Instagram / TikTok location-tag scraping

- **成本**：无官方 API 支持 location tag 批量拉取；第三方非官方 scraper（apify、bright data）$50-200 / 月。
- **合规**：**灰色**。Meta ToS 明令禁止 automated collection；hiQ v. LinkedIn 案后公开数据抓取民事风险降低，但把他人 UGC 剪进商业视频仍是版权侵权。
- **质量**：高质量 lifestyle 素材，5 分。
- **可扩展性**：账号封禁 + rate limit 是常态。2 分。
- **打分**：成本 3 / 合规 1 / 质量 5 / 可扩展性 2。
- **推荐用途**：**不进管线**。可作为人工"灵感源"参考社区调性，但一律不下载复用。

## 4. Flickr / Unsplash / Wikimedia Commons (CC 授权)

- **成本**：全部免费。Flickr 有 API key（免费），Unsplash 有 API（$0，5000 req/hour），Wikimedia Commons 无需 key。
- **合规**：**零风险**。CC BY / CC BY-SA / CC0 明确允许商业二次创作，只要保留 attribution。Wikimedia 是最严谨的元数据来源（每张图带 License + Author + Source URL）。
- **质量**：Wikimedia 偏纪实/地标，构图一般 3 分；Unsplash 精修 lifestyle 5 分；Flickr CC 池混杂 3-4 分。
- **可扩展性**：API 稳定、免费、可预测。5 分。
- **打分**：成本 5 / 合规 5 / 质量 3-4 / 可扩展性 5。
- **推荐用途**：**流水线冷启动主力**。POC 阶段 100% 用 Wikimedia + Unsplash。

## 5. YouTube local vloggers（yt-dlp + 授权模式）

- **成本**：yt-dlp 免费；如果走"付费授权"模式，需要给 vlogger 一次性 $50-300 的素材授权费。
- **合规**：yt-dlp 下载 YouTube 视频**违反 YouTube ToS**；未经明确授权在营销视频里使用他人素材是版权侵权。走"联系创作者签授权协议"路径才合规。
- **质量**：本地 vlogger 有社区脉络感，B-roll 优秀。5 分。
- **可扩展性**：需要人工洽谈，不易 scale。2 分。
- **打分**：成本 3 / 合规 3（走授权） / 质量 5 / 可扩展性 2。
- **推荐用途**：Phase 2 手工洽谈 3-5 个 Atlanta local vlogger，做「精品社区」深度视频；不做全自动。

## 6. Reddit r/Atlanta + r/PeachtreeCorners

- **成本**：Reddit API 免费额度 100 QPM，够用。
- **合规**：文本可引用（fair use），但 Reddit 里的图片版权仍归原作者，直接用图仍侵权。
- **质量**：文本社区调性极佳（居民真实评价），但**不是视觉素材源**。
- **可扩展性**：API 稳定。5 分。
- **打分**：成本 5 / 合规 4（仅文本） / 质量 5（文本） / 可扩展性 5。
- **推荐用途**：**文案 / 字幕生成源**（挖 "why do you love PTC" 类帖子生成 pull-quote 字幕），不做视觉素材。

---

## 推荐启动组合

**Phase 1（现在，POC → 前 3 个社区）：**
1. **Wikimedia Commons**（视觉主力，零合规风险，本 POC 已跑通）
2. **Percho 自家 agent 上传的 listing 照片**（唯一合法的房源内景来源）
3. **Reddit r/PeachtreeCorners 等**（文案 / 居民 quote 字幕）

**Phase 2（Alpharetta、Sandy Springs 铺开后）：**
4. 加 **Unsplash API**（补 lifestyle B-roll，提升质感）
5. 手动洽谈 **2-3 个本地 YouTube vlogger** 做精品社区

**明确排除**：Zillow / Redfin / Realtor 第三方照片、Instagram / TikTok scraping、未授权 YouTube 下载。这些是 reelestate.dev 之类走"人工录屏 demo"的路径，也是我们坚持自动化 + 合规的原因。
