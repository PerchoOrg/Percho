# 02 · Your Perches(Stage 4 收敛 · 逛 → 项目)

置信度与证据量双双过阈后,引擎物化出 3 个候选社区的 shortlist —— **每个都带证据、带短板**。这是用户从「随便逛」切换到「我的项目」的心理转折点,也是 feed 配方切换(Phase C)的触发点。journey 的 3↔4 循环:perches 是活的工作台,不是一次性结论。

Canon: customer-journey.md Stage 4 + 三相位状态机 · spec-v3 01 §1.5(milestone 卡机制)· spec-v3 03(community 四柱 = perch 证据骨架)

## 2.1 物化触发与里程碑卡

| 规则 | 规格 |
|---|---|
| 触发条件(θ2 + 证据量下限) | ≥2 community like(权重后)+ 该批候选的 trait 证据量过阈(引擎侧判定,同 insight 的 evidence 阈值族)+ 当前 funnelStage ≥3 |
| 候选构成 | 3 个槽位:top-2 = 用户 like 出的最强 community;第 3 槽 = **challenger**(引擎提出的不同赌注,卡上明确标注,不伪装成用户自己的选择)。用户已 like ≥3 时 challenger 槽取消 |
| 里程碑卡 | 特殊 milestone(不可 swipe,spec-v3 01 §1.5 机制):大标题 "Your perches are ready." · 副文案 "3 communities, narrowed from {n} you swiped — each with its evidence, and its catches." · 三个 community chip · 主 CTA "See your perches →" · 副链 "Not yet — keep exploring" |
| 「还没准备好」 | 副链 = dismiss:不物化(或撤销),feed 回 Phase B 配方。里程碑在满足条件后最多每 session 复现 1 次;连续 dismiss ×3 = 本阶段不再打扰,Perches 入口仍可从 Saved tab 进 |
| 与 Stage 3→4 milestone 的关系 | 若两里程碑同刻触发,合并为一张(Perches 优先,Stage 4 解锁文案并进副文案)。每用户每级一张的铁律不变 |

## 2.2 `/perches` 工作台(暖纸 utility 面,非沉浸面)

*Phone mockup:Perches 页 — 暖纸底,页首 "Your Perches"(New York 28)+ 副行 "3 communities · narrowed from 41 you swiped · updated Tue";三张 perch 卡纵向排列:① hero 图条(88pt)+ "Waterside"(serif 22)+"Decatur · Subdivision · 214 homes" · WHY THIS PERCH 证据条 ×2 · WATCH-OUTS ×1 · "7 for sale · $540K–$780K" · 动作行 [Explore] [Compare] [Book a showing];② 同款;③ challenger 卡(琥珀虚线描边,"CHALLENGER · a different bet" tag)。*

标注说明:

1. **Perch 卡解剖(三段固定序,对齐 community data face 的市场 → 证据 → 契合结构):**
   - **头部:**hero 图条 + 名称 + 定位行 + 市场行(median / 在售数 / 价格带)。
   - **WHY THIS PERCH(证据,≤3 条):**必须引用用户的真实行为数字,模板同 insight 卡:"You liked 6 trail-access homes — the greenway runs through Waterside." / "9/10 elementary — schools ranked #1 in your trade-offs." 禁形容词堆砌。
   - **WATCH-OUTS(短板,≥1 条,强制):**该 perch 在用户已揭示优先级上的真实弱项:"Commute to Midtown 32 min — longer than your stated 25." / "潜 B− · price growth trails metro." 无短板可写时显示该用户尚未覆盖的维度缺口("You haven't seen much about safety here yet — we'll ask.")。**没有短板的 perch 不许出** — 编造短板和隐瞒短板同样违反真实性铁律。
   - **动作行:**Explore(→ community explore,spec-v3 03)· Compare(勾选进入 §2.4)· Book a showing(→ 03 页,落该 community 在售 top listing 的 tour flow)。challenger 卡动作行把 Book 换成 "Swipe homes here →"(证据不足时不直接推交易)。
2. **Pin / remove:**卡右上 × = remove(undo toast 3s,同 feed 机制);pin 是默认态不做显式按钮。remove 到 0 个 perch = 明确信号,feed 回 Phase B 配方 + You tab 对应 scope 降权(不经用户确认不改 scope 本体)。
3. **页首副行的 "narrowed from {n}"** = 已 swipe 的相关地理卡数 — 这是「它懂我」的收据,数字必须真实。
4. **空态(被 dismiss / 全 remove 后):**"Your shortlist will take shape as you swipe" + [Back to feed]。永远给回主循环的按钮(spec-v3 05 §5.5 铁律)。

## 2.3 Feed 配方切换(Phase C,替代 spec-v3 Stage 4 配比)

物化生效起,`generateFeed` 的 Stage 4 配比替换为:

| 槽位 | 占比 | 内容 |
|---|---|---|
| 纵深 | 60% | perches 内:在售 listing 卡(主力)+ 该 community 的街景/设施内容卡;同 perch 连续 ≤2 张防疲劳 |
| 挑战者位 | 20% | challenger 候选 community 卡 + 其内 listing;右滑 2 次 = challenger 转正进 perches(undo toast 提示 "Added to your perches") |
| 探索与消歧 | 20% | ask/trade-off/insight,优先问 perches 间还没分开胜负的维度("Schools sealed it for Waterside — does commute settle Brookhaven vs. Chamblee?") |

- match badge 规则不变(Stage 4 才显示);Phase C 里 perches 内 listing 的 match 分数是最高置信档。
- 「还没准备好」/ 全 remove → 回 Phase B(spec-v3 Stage 2–3 配比按剩余 scope 出卡),stage 数值不降(00 §0.2)。

## 2.4 `/perches/compare` 并排对比(Stage 5 偏好透镜的收口面)

*Phone mockup:Compare — 页首 "Compare perches",选择条 "2 of 3 selected";三列对比表,行序:🎓 学 Schools(该行标 "your #1 priority")→ 🛒 便 Convenience → 🛡 安 Safety → 📈 潜 Potential → Price band → Homes for sale;单元格全相对表述("9/10 assigned" / "Grocery 8 min" / "62% below metro" / "+3.2% vs metro +1.8%");列底 CTA [Explore] [Book]。*

标注说明:

1. **行序 = 用户已揭示的优先级,不是固定 spec 表** — trade-off 答案驱动四柱排序(赢过的维度排前),并标注 "your #1 priority";无 trade-off 证据的维度按 explore 停留时长补排,再缺按 安→学→便→潜 默认序。这是 spec-v3 05 §5.2 Compare 灰态入口的正式版(对比对象从 homes 升级为 perches — 先选社区再选房,与漏斗哲学一致)。
2. **单元格铁律:**相对表述永远带基线("vs metro" · "below metro");缺数据 = "–" + VoiceOver "no data",禁编造(spec-v3 03 §3.4)。同一行三列的表述单位必须一致可横比。
3. **选择机制:**perches 页 Compare 按钮 = 勾选;2–3 个进入,1 个时 Compare 灰态带提示 "pick one more"。
4. **列底 CTA 是中档转化点:**Explore(深研)与 Book a showing(行动)双钮 — 「中档 CTA 率」指标在此采集。

## 2.5 入口与持久化

| 入口 | 形态 |
|---|---|
| 物化里程碑卡 | 主发现入口(§2.1) |
| Saved tab | 顶部 YOUR PERCHES section:3 行精简版(名称 + 一句最强证据 + 在售数),tap → `/perches`;原三段下移。未物化时该 section 不渲染(无灰态占位) |
| Search journey strip | current step tap → 战果 sheet 内 [See your perches →](spec-v3 04 §4.3 的 step sheet 扩展) |
| 持久化 | 匿名期存本地(zustand persist);注册后写 `perches` 表服务端同步。dismiss/remove 同为可同步状态 |

## 2.6 埋点与验证

| 事件 | 字段 / 用途 |
|---|---|
| `perch_materialize` / `perch_dismiss` / `perch_remind` | candidate_ids、swipes_to_threshold — 物化时机健康度 |
| `perch_pin` / `perch_remove`(undo 与否) | **pin/remove 比** = journey Stage 4 验证指标;remove 高 = 候选质量差 |
| `perch_explore` / `compare_open` / `compare_cta` | **Perch → Explore 率**、**中档 CTA 率**(journey Stage 5) |
| `challenger_accept` | challenger 转正率 — 引擎探索质量 |
| 留存 delta | 物化时刻作为分流点的 7 日留存对比(journey Stage 4 核心假设:「物化 shortlist 提升留存」) |

验证假设:① 物化后 7 日留存显著高于未物化同信号量用户;② watch-outs 不降低 Book 转化(若降低 >20% 需复盘文案语气,不是移除短板)。

下一页:03 行动 · 约看房 + 注册 →
