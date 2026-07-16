# Nearby Video — NARRATIVE Archetype

**父文档**: [README.md](./README.md) · [通用 nearby 流程见 TRUST](./video-nearby-trust.md#三nearby-通用渲染流程)
**Buckets 覆盖**: `nightlife`
**用途**: 场景 / 氛围型 POI —— 用引语(`quote`)带情绪,全屏 scrim + 大字体

---

## 一、captions.json 字段(每 clip)

由 `worker.py:931-933` 组装:

```json
{
  "clip": 1,
  "poi": "The Painted Duck",
  "type": "Cocktail lounge",
  "dist": 2.1,
  "drive": "6 min",
  "quote": "Vintage duckpin bowling and craft cocktails."
}
```

- `quote` 由 Phase 89.2 LLM 生成(`narrative_caption_fields_by_poi[poi_id].quote`),fallback `poi_name`(worker.py:933),**禁**捏造

---

## 二、DOM 结构(overlay.html:286)

```
┌─────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← .NARR-scrim (半透明遮罩,加深照片)
│                             │
│    "Vintage duckpin         │ ← .NARR-quote (大字体 serif italic 引语,居中/居下)
│     bowling and craft       │
│     cocktails."             │
│                             │
│    The Painted Duck · 2.1mi │ ← .NARR-attr (归属行)
└─────────────────────────────┘
```

比 LIFESTYLE / TRUST 强侵入——scrim 覆盖大部分照片。适合本身画面 moody(酒吧夜店灯光偏暗)的 nightlife 素材。

---

## 三、NARRATIVE 特定决策

- **专给 `nightlife`**:酒吧 / 夜店 POI 照片本身色调深,scrim 融入自然;换到白天场景(dining/schools)会显得压抑
- **无 chapter numbering / badges**:引语是主角,一次一个焦点,不做序列绑定
- **quote 必须真实**:vision tag → LLM 抽取,不允许模板句
- 归属行放 POI 名 + 距离,不放 type(type 抢引语视觉重心)
