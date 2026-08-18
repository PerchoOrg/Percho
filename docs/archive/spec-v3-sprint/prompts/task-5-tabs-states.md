# Task 5 — Onboarding + Saved + You + 推送 + 全局状态(收尾)

(先读 `prompts/_MASTER.md`。spec 依据 = `05-tabs.md` 全文 + `00-overview.md`。依赖:task-0–4 已 merge。)

## 范围

1. **Onboarding**(05 §5.1):2 屏 15 秒进 feed;屏 1 价值主张(全出血视频 + Start swiping,**无注册墙** — 匿名 swipe、scope 本地、注册在第一次 Save/Schedule 时);屏 2 手势教学卡(可 swipe,swipe 即落 feed);权限时机:定位永不启动要、通知第一次 Save 后、无 ATT。
2. **Saved tab**(§5.2):Homes / Communities / Must-haves 三段;must-have tap = feed 临时加权 + 跳回;行内状态徽(降价 --neg、DOM、Sold 置灰);Compare v1.1 灰态入口。
3. **You tab**(§5.3):persona 卡;**Area Familiarity section** — familiarity score 算法按 spec 精确实现(覆盖 40 饱和 25 张 + 决断 30 偏离 50% + 维度 30 四柱各 7.5 每维 ≥2 信号 ✓),纯函数 + unit test,与 Search journey 热力**同一数据源**;缺口即行动(未知维度词 tap = feed 注入);evidence 列表可纠错(Still true? Yes/No);scope 管理(× 移除 = 该层重新可问,stage 不自动降);Settings 标准分组列表。无徽章无 streak 无满分奖励。
4. **推送**(§5.4):3 类触发 + 上限按表;禁止列表照抄(无 streak/complete profile/营销 blast);全部 deep link。
5. **全局状态 & 可达性**(§5.5):空态、API 失败 toast + 3 次后错误卡(不用 alert)、Dynamic Type(卡上 serif 锁定)、VoiceOver(卡片单元素 + custom actions,swipe 全有按钮等价)、Reduce Motion(旋转/呼吸/milestone 动画关,flyout 改 crossfade,haptics 留)、深链 4 条 + universal links。
6. **移交清单核对**(§5.6):此时 6 条应全部满足,逐条核对并在 DEVLOG 记录状态;第 3 条(删 deep peek/scope strip 旧代码路径、API_BASE 指生产)若前面任务遗漏,在本任务补。

## 验收标准

- [ ] 冷启动 → 15s 内落 Stage 0 feed(录屏计时);全程无权限弹窗
- [ ] 匿名 swipe 后杀 app 重开,scope 保留(本地持久);第一次 Save 触发注册提示 + 通知权限
- [ ] familiarity 算法 unit test:覆盖饱和边界(24/25/26 张)、决断 50% 偏离、维度 ✓ 阈值;You tab 数值 === Search 热力数值
- [ ] evidence 行 No → 该链降权(state test);scope × → 该层 ask 卡重新出现
- [ ] VoiceOver 走查 feed:卡片 label 完整、四个 custom action 可用
- [ ] Reduce Motion on:无旋转/脉冲,haptic 仍在
- [ ] 4 条深链 + universal link 各 push 正确页面,back 落 feed 首位
