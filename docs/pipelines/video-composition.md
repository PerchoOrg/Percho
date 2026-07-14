# 视频结构模板

Percho 社区短视频统一规范：**60 秒、9:16、1080×1920、light theme（#F7F5F2）、所有图/视频 object-contain 上下 letterbox**。

---

## 反面：堆叠式（禁止）

「首页拉 20 张 listing 照片，每张 3 秒堆到 60 秒，配 BGM 出片。」

**为什么禁**：
1. **没有 hook**：前 3 秒没有社区招牌镜头，用户左滑走人。TikTok/Reels 完播率 3 秒定生死。
2. **信息熵单调**：全是室内 / 全是外景，观众在 15 秒疲劳。
3. **无社区叙事**：卖房不是卖户型，是卖「住在这条街上的感觉」。堆叠式让 Percho = 幻灯片工厂，与 reelestate.dev 无差异化。
4. **CTA 缺席**：没结尾引导 → 无转化。

---

## 目标结构

| 区间 | 时长 | 内容 | 素材来源 | 转场 | 字幕（drawtext） |
|---|---|---|---|---|---|
| 0–3s | 3s | **Hook**：社区招牌镜头（社区入口 / 地标 / 天际线） | Wikimedia streetscape L1=streetscape | 硬切入 | 大字：`Peachtree Corners` |
| 3–15s | 12s | **Community vibe**：3-4 段街景 + people-vibe 快切 | streetscape / people-vibe | 交叉淡入 0.4s | 副标：`Where Atlanta lives quietly` |
| 15–40s | 25s | **Listings 展示**：3-5 条真实房源快切，每条 5-8s | Percho agent 上传 listing-exterior + interior | zoom-in 微推进 | 每段左下角：`$799K · 4bd 3ba · 3120 Main St` |
| 40–55s | 15s | **配套补充**：学校 + 公园 + 餐厅 | park / school / restaurant | fade 0.5s | 每段顶端：`Simpson Elementary · 8/10` |
| 55–60s | 5s | **CTA** | 纯色 + logo | fade to bg | 中央大字：`See all homes → percho.com/ptc` |

**BGM**：Phase 1 用 Epidemic Sound 或 Artlist 订阅池（POC 用无声 anullsrc）。选 lo-fi acoustic 或 warm indie，避开 hype trap，与 light theme 一致。

**字幕规则**：
- 字体：Inter 或 Söhne（fallback DejaVu Sans）
- 颜色：`#2A2A2A` 深炭灰（对比 light bg）
- 位置：hook 居中大字 72pt，段落副标居底 42pt，listing 元数据左下 34pt
- **写在 letterbox 区**（因图片 object-contain 上下留白，字幕落在留白上，绝不覆盖图内容）

---

## ffmpeg filter_complex 骨架

以 3 段素材为例（POC 的完整版本见 `poc-output/build_video.sh`）：

```bash
BG=0xF7F5F2
ffmpeg -y \
  -loop 1 -t 4 -i hook.jpg \
  -loop 1 -t 4 -i vibe1.jpg \
  -loop 1 -t 4 -i listing1.jpg \
  -f lavfi -t 12 -i anullsrc=cl=stereo:r=48000 \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,
         pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG},
         drawtext=text='Peachtree Corners':fontsize=72:fontcolor=0x2A2A2A:
                  x=(w-text_w)/2:y=200,setsar=1,fps=30[v0];
    [1:v]scale=1080:1920:force_original_aspect_ratio=decrease,
         pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,fps=30[v1];
    [2:v]scale=1080:1920:force_original_aspect_ratio=decrease,
         pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,fps=30[v2];
    [v0][v1][v2]concat=n=3:v=1:a=0[v]
  " \
  -map "[v]" -map 3:a \
  -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -shortest \
  out.mp4
```

**关键点**：
- `force_original_aspect_ratio=decrease + pad` 组合 = object-contain letterbox（**任何素材宽高比都不裁切**）
- `setsar=1` + `fps=30` 归一化，否则 concat 会报维度不一致
- 转场用 `xfade` 需要按 offset 计算，POC 用 concat 简化
- `-pix_fmt yuv420p` 确保 iOS Safari / TikTok 可播
```

---

## 复盘：PTC v1 vs Decatur v1(C6, 2026-07-11)

两支 60s reel 都用同一 `compose.py`，同 slot 模板（hook/vibe/listX/…/cta），只换素材池 + captions。对比后暴露 3 个结构性问题，下一版 pipeline 必修。

**素材面对照**：

| 维度 | Peachtree Corners v1 | Decatur v1 |
|---|---|---|
| 总 clip 数 | 14 | 14 |
| Hook 素材 | `Gateway_to_Peachtree_Corners`（**静态招牌照**） | `Curving_Over_Decatur`（**航拍/俯视**） |
| 主体重复度 | 4/14 是 logo/seal/street-sign（**纯文字/标识**） | 5/14 是 DeKalb Courthouse（**同一建筑不同角度**） |
| 空 slot 处理 | 全 slot 填满 | `park` 池 count=0 → shim 里硬 fork 12 LOC 换 `homes` slot |
| CTA 素材 | `Georgia_I85sb_..._Overpass`（高速公路,与 CTA 语义无关） | `Raging_Burrito_on_Decatur_Square`（一家餐厅） |
| CTA URL | `percho.com/ptc` | `percho.com/decatur` |

**主观观感**：Decatur hook 更抓（3 秒内出"这是哪里 + 航拍地理感"），PTC hook 弱（Gateway 招牌像政府宣传片）。反过来 PTC listing 段 Town Center 组更连贯（3 张同主题递进），Decatur list1 三张都是 courthouse 显得单调。两支 CTA 都是"随手拿一张剩余素材"，尬。

---

### 改进项 1：Hook 必须是"动/宏观/地理感"，禁止 signage-only

- **证据**：PTC 用 Gateway 招牌 → 前 3 秒没有社区实体，观众不知道镜头在"哪"。Decatur 用 aerial curving 天然带地理坐标 + 运动，完播率结构上占优（TikTok 3-秒定生死，见本文档 §反面-1）。
- **落地**：`tag_rules.py` 新增 L3 hint = `hook_grade ∈ {aerial, skyline, motion, landmark_wide, signage}`；`compose.py` 选 hook 时按此优先级排序，`signage` 只在前四类全空时兜底。
- **对 config 破产的连带影响**：hook_grade 是内容属性，应在 fetcher 抓完后自动打标（图片长宽比 + filename regex `aerial|overhead|skyline|drone|from_above`），不能靠 YAML 手写。这条是 `architecture-v2.md §6` refactor 的**必要前置**。

### 改进项 2：Slot 必须有"降级链"而非硬 slot 名，否则每加一个 neighborhood 都要 fork PLAN

- **证据**：Decatur 抓不到 park 素材（quiet-suburban=14 但 park=0），`run_decatur_c4.py` 里手写 re.sub 把 slot 名从 `park+school` 改成 `schools+homes` —— 这**不是配置化，是二次开发**（见 `reuse-report.md §4`）。
- **落地**：`neighborhoods/*.yaml` 的 `reel_structure` 改成**槽位声明 + fallback 链**：
  ```yaml
  slots:
    - name: nature
      prefers: [park, greenway, water]
      fallback: [streetscape]
      captions_by_source:
        park: "Chattahoochee greenway"
        streetscape: "Historic tree-lined streets"
    - name: schools
      prefers: [school]
      fallback: [listing-exterior, streetscape]
      captions_by_source:
        school: "Simpson Elementary · Norcross HS"
        _default: "City Schools of Decatur · top-rated"
  ```
- `compose.py` 读到 `nature` slot、preferred 池空时，自动降级到 `fallback` 并切换到对应 caption 变体。**目标**：新 neighborhood = 0 code fork，YAML 完成。
- 与 memory GA-only / selling-only 对齐：captions 禁止双语，selling framing 强制。

### 改进项 3：CTA slot 必须"专用素材"，不能 repurpose 池尾图

- **证据**：PTC CTA 落在 I-85 overpass（跟 CTA 无关的高速公路），Decatur CTA 落在 burrito 餐厅（跟"See homes"无关）。两个都是 slot 池填完后**随便拿最后一张剩的图**，非常业余。
- **落地**：CTA slot 素材来源改为**三选一固定资产**（不进 slot 抢池）：
  1. `assets/cta/logo-card-9x16.png`（纯色 peach `#F3EEE7` + Percho logo + URL 大字，静态卡片） — MVP 默认。
  2. Hook 素材末尾 2 秒 slow-zoom 回放（首尾闭环）。
  3. Agent 自定义上传（Phase E 的 listing-focused reel 用）。
- 与 memory selling-only 一致：CTA 文案定型 `See <slug> homes → percho.com/<slug>`，不做"vibe/lifestyle"结尾，直接进转化路径。
- `poc-output/assets/cta/` 下应预生成 5-10 个 neighborhood 的 logo-card（ffmpeg drawtext 20 行脚本），避免每次跑 pipeline 现场合成字体加载。

---

**这三条与 `architecture-v2.md §6` 的关系**：改进项 2 就是 refactor 主线，改进项 1 是 fetcher/tagger 面的前置增强，改进项 3 是资产库工程化的最小 patch（可在 refactor 前独立落地）。合起来的 N=3 break-even 会比 `reuse-report.md §6` 估算的 155 LOC 略高（+~40 LOC for slot fallback engine），但每加一个 neighborhood 省 ~100 LOC shim，仍远比 fork 划算。

**明确不改的两条**（避免下轮 tick 手痒）：60 秒总时长 + 9:16 + light theme letterbox。都是产品定位（selling-only、light-only、TikTok/Reels 原生比例），不是技术选择。
