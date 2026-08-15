# Percho iOS — v1 End-to-End Spec · 00 Overview

> Canon: README.md(vision)· customer-journey.md v0.1(2026-08)· spec-v3(00–05,2026-07)。本 spec 只设计 spec-v3 未覆盖的**端到端闭环缺口**,已详设的面不重复,直接引用。
>
> v1 范围(owner 2026-08-13 定案):**核心闭环 only** — journey Stage 1–6 的买分支。试住(try 分支)与 Stage 7(社区频道 / UGC)明确 defer 到 v1.1+。

## 0.1 v1 闭环地图:journey 阶段 → 面 → 设计出处

| Journey 阶段 | 面 | 出处 |
|---|---|---|
| 1 触达 · 内容即广告 | 深链冷启动承接(首卡 = 带来用户的原视频) | **本 spec 01** |
| 2 冷启动 · 前 60 秒 | 免注册落地即滑;2 屏 onboarding(非深链路径) | spec-v3 05 §5.1;深链变体 **01** |
| 3 沉浸探索 · 滑动即学习 | Discovery Feed(8 卡型 + 阶段化漏斗引擎) | spec-v3 01(已建) |
| 4 收敛 · Your Perches | Perches 物化仪式 + `/perches` 工作台 + feed 换配方 | **本 spec 02** |
| 5 深研 · Explore 偏好透镜 | listing / community explore;perch 并排对比 | spec-v3 02/03(已建)+ 对比 **02** |
| 6 行动 · 买分支 | 约看房 `/listing/[id]/tour` + agent 转介绍 + 价值时刻注册 | **本 spec 03** |
| 7 落地回流 | 社区频道 / UGC | **v1 不做**(defer) |

## 0.2 术语对齐:journey 三相位 × spec-v3 五阶段

同一台状态机的两个粒度,禁止并存两套名词。工程侧只有 spec-v3 的 `funnelStage` 0–4;journey 文档的相位是它的读法:

| Journey(customer-journey.md) | spec-v3 funnelStage | 判据 |
|---|---|---|
| PHASE A · 广撒 | Stage 0–1 | — |
| PHASE B · 定向 | Stage 2–3 | θ1 ≈ Stage 1→2 晋级(spec-v3 01 §1.7) |
| PHASE C · Your Perches | Stage 4 + Perches 已物化 | θ2 + 证据量下限 = ≥2 community like + 置信度过阈(02 §2.1) |

「还没准备好 → 退回定向」= 用户 dismiss perches 里程碑,feed 配方回到 Phase B;stage 数值不变(漏斗永不自动回退的铁律不变,见 spec-v3 00 §0.2)。变的是**配方**,不是 stage。

## 0.3 IA Delta(spec-v3 基础上)

Tab bar 不变,仍 4 tab:Feed / Search / Saved / You。新面全部是 push 路由或 sheet — 不加第 5 个 tab,不引入 fullScreenModal(spec-v3 00 §0.1 导航铁律)。

| 路由 | 页面 | 入口 | 详设 |
|---|---|---|---|
| `/perches` | Your Perches 工作台 | 物化里程碑 CTA / Saved tab 顶部 section / Search journey strip | 02 |
| `/perches/compare` | Perch 并排对比(2–3 选) | perches 页 / Saved compare 入口 | 02 §2.4 |
| `/listing/[id]/tour` | 约看房 | listing explore 主 CTA / perch 卡 / Saved 行 | 03 |
| —(sheet,非路由) | Auth sheet(价值时刻注册) | 第 3 次 ♡ / 约看房 / Get notified | 03 §3.4 |
| `percho.co/v/{id}` 等深链 | 深链冷启动承接 | TikTok / Reels / Shorts 分发素材 | 01 |

Saved tab 变化:顶部新增 **YOUR PERCHES** section(spec-v3 05 §5.2 的 Homes/Communities/Must-haves 三段下移);原 Compare 灰态入口被 `/perches/compare` 正式取代。

## 0.4 新面的设计原则(在 spec-v3 原则之上补三条)

1. **沉浸铁律只管 feed。**Perches / Compare / Tour 是工作台面:暖纸 chrome、显式按钮、可滚动表单元素在这里合法;卡片手势契约(spec-v3 00 §0.5)不适用,但也**禁止**把手势语义偷渡进来。
2. **诚实即转化。**每个 perch 必须带短板(watch-outs);对比表缺数据永远 "–";agent 转介绍必须对用户透明。journey 说「每个都带证据、带短板」—— 短板不是缺陷展示,是信任建设。
3. **注册是价值时刻的收据,不是墙。**偏好信号(like/save)永远不被注册阻断(本地先存);只有交易动作(约看房 / 通知)才硬性要求 account(03 §3.4)。

## 0.5 v1 指标(指标即验证,对齐 journey §02)

| 阶段 | 指标 | 埋点出处 |
|---|---|---|
| 1 触达 | 深链 → 首滑率 | 01 §1.5 |
| 4 收敛 | 物化后 7 日留存 delta · pin/remove 比 | 02 §2.6 |
| 5 深研 | Perch → Explore 率 · 中档 CTA 率(compare/book 入口点击) | 02 §2.6 |
| 6 行动 | 看房预约数 · auth sheet 完成率 | 03 §3.7 |

## 0.6 工程移交摘要(详表在各页末节)

- 新路由 ×3(`/perches`、`/perches/compare`、`/listing/[id]/tour`)+ auth sheet 组件。
- 新服务端:perches 物化判定 + `/api/mobile/perches`、`/api/mobile/tours`(POST)、auth(Sign in with Apple → Supabase Auth)、深链 seed 解析。
- 新表:`perches` / `tours` / auth users;事件:`perch_*` / `tour_*` / `auth_*` / `deeplink_*`。
- 实现顺序建议:① 深链冷启动(获客闭环前置)→ ② Perches + 配方切换 → ③ 约看房 + auth。

下一页:01 深链冷启动 →
