# Nearby Video — LIFESTYLE Archetype

**父文档**: [README.md](./README.md) · [通用 nearby 流程见 TRUST](./video-nearby-trust.md#三nearby-通用渲染流程)
**Buckets 覆盖**: `dining`, `fitness`
**用途**: 生活方式 POI —— 靠 chapter numbering + 引语(`why`)营造 editorial 感

---

## 一、captions.json 字段(每 clip)

由 `worker.py:927-930` 组装:

```json
{
  "clip": 1,
  "poi": "Blue Ridge Grill",
  "type": "American restaurant",
  "dist": 1.2,
  "drive": "3 min",
  "chapter": "01 / 06",
  "why": "Farm-to-table brunch, patio brunch spot."
}
```

- `why` 由 Phase 89.2 LLM 生成(`narrative_caption_fields_by_poi`),fallback `poi_name`(worker.py:929),**禁**捏造
- `chapter` = `f"{i:02d} / {len(input_photo_ids):02d}"`

---

## 二、DOM 结构(overlay.html:255,`.LIFE-sheet`)

**Phase 92 之后所有 clip 都走底部 sheet**(含 clip 1),不再有全屏 `.LIFE-title` 遮住照片:

```
┌─────────────────────────────┐
│                             │
│         (photo area)        │
│                             │
├─────────────────────────────┤ ← .LIFE-sheet (bottom sheet)
│  01 / 06                    │    .num
│  Blue Ridge Grill           │    .name
│  American restaurant        │    .type
│  "Farm-to-table brunch..."  │    .why (引号包裹)
│  1.2mi · 3 min drive        │    .dist
└─────────────────────────────┘
```

`c.why` 为空时降级为 `.LIFE-badge` 单行(overlay.html:273)——一般不该走到这条,数据缺才 fallback。

---

## 三、LIFESTYLE 特定决策 & 历史坑

- **Phase 90 → Phase 92 演化**:原设计 clip 1 用全屏 `.LIFE-title` 大字卡片,用户实测反馈"dining 视频只见字不见店",Phase 92 把 clip 1 也降到底部 sheet 保住照片可见
- **`why` 必须来自真实 vision / LLM tag**,不允许 hardcode 通用文案("Great food and drinks")
- Chapter numbering 给 dining/fitness 一种"逛几家店"的连续感,和 UTILITY 的 chip 单点式明显区隔

---

## 四、Font & 布局

字号族(portrait): `.name` 大标题 · `.type` subtitle · `.why` italic serif 引语 · `.dist` 单行数字。Landscape 缩比同 TRUST。
