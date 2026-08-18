# Task 3 — Community Explore(/community/[slug] + data face + 四柱)

(先读 `prompts/_MASTER.md`。spec 依据 = `03-community.md` 全文 + `00-overview.md`。依赖:task-0、task-2 已 merge — data face/explore 骨架、深链模式、sheet 模式与 listing 同族,能复用的复用,不许 fork 出第二套。)

## 目标

Community(subdivision)三面:front face、data face(四柱 scorecard)、explore page(Vibe + 四柱 + Homes)+ 四柱等级算法 + POI sheet。

## 铁律(memory + spec 双重确认)

- 社区锚定 = subdivision(如 Waterside),非 city;POI 3km 从**入口**切,非质心。
- 四柱 = 安 safety / 学 schools / 便 convenience / 潜 potential,命名与 You tab familiarity 维度严格一致(05 §5.3)。
- 缺数据柱显示 "–" + not enough data,禁止编造;等级永远相对表达(vs metro),禁裸分数。

## 范围

1. **Front face**(03 §3.1):pills = 最强 2 柱证据 + 1 POI;右滑 like 权重 2×(计入 funnel 晋级),左滑 -0.5×。
2. **Data face**(§3.2):市场 → 四柱 2×2 scorecard → trait 契合(top 2,Stage<3 隐藏)三段固定序;深链 `/community/[slug]?focus=<key>`;面属性同 listing data face(复用)。
3. **Explore page**(§3.3):Vibe + 四柱 section(每柱内容按 spec 详设:安=crime 对比+来源行;学=assigned 三级区分 assigned/nearby;便=life radius mini map + 通勤矩阵;潜=趋势+规划利好须有来源年份)+ Homes section(>5 见 See all;无在售 = 近 3 月成交 + Get notified);底部 CTA "Swipe homes in Waterside →" 置顶 scope 回 feed;**无 guided tour**。
4. **Life radius mini map**(§3.3.2):静态渲染,边界多边形 + 入口 pin + POI pin(车程 min 从入口);pin tap = POI sheet;图身 tap = 跳 Search tab 聚焦(task-4 前先留 TODO stub + tracking issue,不做死链)。
5. **四柱算法**(§3.4):metro 分位数定级 A–D,四柱各自的输入/权重/证据行模板按表实现;便柱 workplace 个性化标 "for you"。算法纯函数 + unit test。
6. **POI detail sheet**(§3.5)+ **埋点**(§3.6):community_explore_events 全事件。
7. 服务端:四柱聚合 + POI 数据管道(复用现有 GOOGLE_PLACES 数据,3km 入口切)。

## 验收标准

- [ ] 四柱算法 unit test:分位数边界、violent 2× 权重、缺数据 → "–"、潜柱利好 +半级封顶 A
- [ ] data face 四柱 tap 各自深链到 explore 对应 section;Stage<3 时 trait 段隐藏
- [ ] mini map POI 时间从入口算(选一个已知社区人工核对 1–2 个 POI)
- [ ] 学 section assigned vs nearby 视觉可分
- [ ] 无在售社区:Homes section 降级态 + CTA 变 "Swipe similar communities →"
- [ ] community 右滑后 funnel 状态里权重 2× 生效(test)
