# Nearby Video — MAGAZINE Archetype

**父文档**: [README.md](./README.md) · [通用 nearby 流程见 TRUST](./video-nearby-trust.md#三nearby-通用渲染流程)
**Buckets 覆盖**: `kids`, `asian_community`, `faith`
**用途**: 编辑刊型 POI —— masthead + 章节 + 大写 credit 行,类似 Kinfolk / Monocle 风格

---

## 一、captions.json 字段(每 clip)

由 `worker.py:934-944` 组装:

```json
{
  "clip": 1,
  "poi": "Great Wall Supermarket",
  "type": "Asian grocery",
  "dist": 3.4,
  "drive": "9 min",
  "section": "The Neighborhood",
  "chapter": "Chapter I",
  "title": "Great Wall Supermarket",
  "credit": "ASIAN GROCERY · 3.4 MI · 9 MIN"
}
```

- `section` 目前硬编码 `"The Neighborhood"`(worker.py:935)
- `chapter` = LLM `chapter` 覆盖,否则 fallback `Chapter I / II / III / IV / V / VI`(罗马数字,worker.py:937-941)
- `title` = LLM `title` 覆盖,否则 fallback `poi_name`(worker.py:943)
- `credit` = `{type_label.upper()} · {dist_mi} MI · {drive.upper()}`

---

## 二、DOM 结构(overlay.html:291)

```
┌─────────────────────────────┐
│  ────────────────────────   │ ← .MAG-mast top rule
│  Percho · Vol. 07   The N.  │    .row  刊名 · section
│  ────────────────────────   │    bottom rule
│                             │
│         (photo area)        │
│                             │
│                             │
│  Chapter I                  │ ← .MAG-caption
│  Great Wall Supermarket     │    .title
│  ASIAN GROCERY · 3.4 MI...  │    .credit (uppercase)
└─────────────────────────────┘
```

`.MAG-scrim` 打底压暗照片保住 masthead 可读性。

---

## 三、MAGAZINE 特定决策

- **专给多样、需要"目录式"呈现的 bucket**:kids(儿童活动)/ asian_community(华人商圈)/ faith(教堂庙宇)本身跨类目,用 chapter 把不同 POI 串成 issue 感
- **`section` 目前 hardcode**:未来可扩为 archetype 传参(如 kids → "The Family Guide")
- **credit 一律 UPPERCASE**:editorial 风格标志,和 TRUST 的 title case 明显区隔
- **`Vol. 07` 是当前版本号占位**:随全量刊次滚(不与 listing 数关联),暂时手改
- LLM 生成 `title` 时,禁止改写 POI 官方名——只在没有 title 覆盖时用 `poi_name`
