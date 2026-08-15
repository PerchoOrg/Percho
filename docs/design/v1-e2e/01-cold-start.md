# 01 · 深链冷启动(Stage 1 触达 → Stage 2 前 60 秒)

Pipeline 产出的社区/房源视频直接作为 TikTok / Reels / Shorts 获客素材;用户经深链进入。**承接体验的第一公理:用户在别处的观看不能断** — 落地首卡必须就是他刚看完的那条视频,而不是通用 onboarding。

Canon: customer-journey.md Stage 1–2 · spec-v3 05 §5.1(非深链 onboarding 不变)· spec-v3 01 §1.7(显式意图快进)

## 1.1 深链入口与 seed 解析

| 链接形态 | 场景 | seed |
|---|---|---|
| `percho.co/v/{videoId}` | 分发的内容视频(社区/房源/街景) | 视频锚定的实体(community 或 listing)→ 地理上下文 |
| `percho.co/l/{listingId}` | 直接分享房源 | 该 listing + 所在 community/city |
| `percho.co/c/{slug}` | 直接分享社区 | 该 community + 所在 city |
| 无深链(商店自然量) | 直接打开 | 无 seed → 走 spec-v3 05 §5.1 原版 2 屏 onboarding,本页不适用 |

- Universal links 冷启动直达;已安装用户 back 落 feed 原位(spec-v3 05 §5.5 深链规则不变)。
- **Deferred deep link(未安装):**商店页文案锚定来源内容("See Waterside on Percho");安装首启经 attribution 恢复 seed。恢复失败 = 无 seed,静默回退普通 onboarding,不出错误提示。

## 1.2 深链落地:跳过 onboarding,首卡 = 原视频

*Phone mockup:深链落地首屏 — 全出血播放用户刚在 TikTok 看完的 Waterside 社区视频,kind chip "COMMUNITY",顶部一条低强调 context strip "Picked up from where you watched",卡底名称 "Waterside" · "Subdivision · Decatur GA",swipe hints "← Not for me / Tell me more →"。无 onboarding 屏、无注册、无权限请求。*

标注说明:

1. **零 onboarding 屏** — 深链用户跳过 spec-v3 的两屏(价值主张 + 手势教学)。理由:他已经在 TikTok 完成了"价值主张"教育;手势教学由首卡的 1.2s hints 轻摆承担(spec-v3 01 §1.2 的既有机制,深链首卡强制触发一次)。
2. **Context strip** — 顶部一条 28pt 玻璃条 "Picked up from where you watched",首滑后消失,永不再现。只回答"我是不是来对地方了"一个问题,不做欢迎词。
3. **首卡 swipe 语义按实体卡型正常走**(community = like/pass)。它本身不计弱信号 — 用户是被内容击中的,首卡反馈是强意图证据,右滑按正常权重计。
4. **第 2 张 = 轻确认 ask 卡** — "Still curious about the Waterside area?"(地理确认,带 map thumb)。右滑 = seed 正式进 scope;左滑 = seed 降权但不拉黑,feed 退回 Stage 0 正常冷启动。

## 1.3 Seed 后的前 5 卡配方(深链专用冷启动 deck)

| # | 卡 | 目的 |
|---|---|---|
| 1 | 来源视频实体卡 | 连续性 |
| 2 | ask:地理轻确认(§1.2.4) | seed → scope 转正 |
| 3 | 同 community 的另一条内容卡(或同 city 代表 community) | 多样性,防"只有一条视频"感 |
| 4 | trade-off(该地理层的生活维度) | 开始学优先级 |
| 5 | ask(budget 带)或同层 area 卡 | 并入正常漏斗节奏 |

第 6 张起交还 `generateFeed` 正常引擎。Stage 快进按 spec-v3 01 §1.7「显式意图不受漏斗限制」:listing 深链 → 该 community 直接进池,引擎按信号完备度落 Stage 2–3;不直接落 Stage 4(单点意图 ≠ 偏好已收敛)。

## 1.4 系统状态

| 状态 | 呈现 |
|---|---|
| Seed 实体已下市 / 不存在 | 首卡降级为同 community 最新内容卡 + context strip 文案变 "This one sold — here's the street it's on";无死链错误页 |
| Seed 视频加载失败 | 降级 poster 静态图(spec-v3 01 §1.9 既有规则) |
| 离线冷启动 | 无法 seed → 普通 Stage 0 冷启动 + OfflineBar;seed 存本地,恢复后下 session 注入 |

## 1.5 埋点与验证

| 事件 | 字段 |
|---|---|
| `deeplink_open` | link_kind(v/l/c)、entity_id、deferred(bool)、installed_before |
| `deeplink_first_swipe` | 首滑方向、dt_since_open — **深链→首滑率** = journey Stage 1 核心指标 |
| `seed_confirm` | 第 2 张 ask 的 verdict(seed 转正率) |
| `seed_recover_fail` | deferred 恢复失败次数(归因链路健康) |

验证假设:深链落地(零 onboarding)的前 5 卡留存 ≥ 普通 onboarding 路径。若显著更低,回退方案 = 深链用户也过屏 2 手势教学(开关在服务端 seed 解析响应里)。

下一页:02 Your Perches →
