# Task 5 — Tabs, Onboarding & States(saved / you / onboarding + 收尾)

(先读 `prompts/_MASTER.md`。spec 依据 = `05-tabs.md` 全文 + `00-overview.md`。依赖:task-0–4 已合 main。这是收尾任务。)

## 目标

补齐 Saved / You / Onboarding 三个面 + 全局状态与可达性,并按 §5.6 工程移交清单做全 app 终检。

## 范围(对应 05 页小节)

1. **Onboarding(§5.1)**:2 屏,15 秒内进 feed;首启后直接落 feed(不强制注册墙,按图)。
2. **Saved tab(§5.2)**:按图纸;项 tap → Explore push。
3. **You tab(§5.3)**:persona + area familiarity + evidence + settings;scope 移除 = 漏斗显式回退的唯一入口(接 funnel 状态机);familiarity 区块 → Search journey 图层入口。
4. **推送策略(§5.4)**:按表实现权限请求时机与频控(实际推送后端若无,实现本地策略层 + 桩,plan 里声明)。
5. **全局系统状态 & 可达性(§5.5)**:按表逐条 — Dynamic Type、VoiceOver 标签、reduce motion 降级等。
6. **工程移交清单(§5.6)**:逐条自查全 app,输出 checklist 结果表(✅/❌/N.A. + 证据),❌ 修完再交。

## 验收标准

- [ ] 冷启动 → onboarding 2 屏 → feed 全程录屏 ≤15s
- [ ] Saved / You 各区块与图纸对照截图
- [ ] You tab 移除 scope → funnelStage 回退且 feed 内容相应变化(端到端录屏)
- [ ] reduce motion 开启时 swipe/flip 降级正常
- [ ] VoiceOver 走一遍 feed 主流程(录屏或逐元素说明)
- [ ] §5.6 移交清单全表输出,零 ❌
