# Task 2 — Listing Explore(/listing/[id] + data face)

(先读 `prompts/_MASTER.md`。spec 依据 = `02-listing.md` 全文 + `00-overview.md`。依赖:task-0、task-1 已 merge。)

## 目标

Listing 三面模型的后两面:data face(tap 翻面)+ explore page(guided tour → free explore)。

## 范围

1. **Data face**(02 §2.1):底 #14100B(进 tokens,命名如 `surfaceImmersive`,不许散落 hex);行 = 深链 `/listing/[id]?focus=<key>`(focus key 全集按 spec);行 onclick stopPropagation;Why 92% accordion(Stage<4 整行不出);Est. monthly 行;价格分布 7 桶直方图(<5 样本降级单行,不出假图);sticky 底栏;内容优先级砍序按 spec。
2. **Explore 流程**(§2.2):默认进 guided tour;`?focus=` 跳过 tour 直达 section 高亮 2s;tour X = 进 free explore 不惩罚;二次访问默认 free explore + Replay tour 链;空 profile 通用 3 停 fallback。
3. **Guided Tour Stop**(§2.3):进度条 + STOP N OF M;媒体区 220pt(视频遵守全局规则);WHY 块 serif 17.5,**类型强制 Stop.evidence 非空**(canon 铁律 — 用 TS 类型和运行时校验双保险);动作行 ≥3;Prev/Next + 横滑加速器。
4. **Transition 卡 + Free Explore**(§2.4):hero + hotspot pins(未访问脉冲);section 导航条 chip(单页长滚,非 tab);Monthly 计算器;Comps 全尺寸直方图;Community section 内嵌 → push /community/[slug];吸底 Schedule a tour CTA。
5. **Hotspot 动作 sheet**(§2.5):5 动作展开行为按 spec(Save 即时反馈不关 sheet;Ask AI v1 = coming soon 灰态);每 hotspot 3–5 动作,少于 3 不上线;副文案必须带具体数据。
6. **埋点**(§2.6):listing_explore_events 全事件。
7. 服务端:generateGuidedTour + listing_hotspots 表(05 §5.6 第 4 条)。

## 验收标准

- [ ] data face 每行 tap 深链到 explore 对应 section 且高亮 2s;行 tap 不触发翻回
- [ ] Stage<4 时 Why 行和 match 徽都不出现(用 stage 切换验证)
- [ ] tour:X 跳出记 tour_abandoned;最后一停 → transition 卡 → Continue 同 URL 同滚动位置
- [ ] Stop.evidence 空时类型报错 + 运行时拒绝渲染该停(test 覆盖)
- [ ] hotspot pin:未访问脉冲/访问后静止;sheet 内 Save 行变 ♥ Saved + haptic 且 sheet 不关
- [ ] 直方图 <5 样本降级单行
- [ ] 二次进入同 listing 直接 free explore,顶栏有 Replay tour
