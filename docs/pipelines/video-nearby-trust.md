# Nearby Video — TRUST Archetype

**父文档**: [README.md](./README.md) · [公共 nearby 流程见下方「三」](#三-nearby-通用渲染流程)
**Buckets 覆盖**: `schools`, `healthcare`
**用途**: 权威型 POI —— 数据密度高、需要 credibility signal(评级/评分/资质徽章)

---

## 一、captions.json 字段(每 clip)

由 `worker.py:924` 组装:

```json
{
  "clip": 1,
  "poi": "Riverside Elementary",
  "type": "Public elementary school",
  "dist": 0.8,
  "drive": "2 min",
  "badges": [{ "t": "Schools", "c": "gold" }]
}
```

- `badges` 目前是占位 `[{t: bucket_label, c: "gold"}]`(worker.py:926)。Phase 89.3 会接 GreatSchools / GoodRx 等真实评级源。
- badge 颜色: `gold` / `green`(overlay.html:35-36),需要新色重新扩样式表。

---

## 二、DOM 结构(overlay.html:246,`.TRUST-sheet`)

```
┌─────────────────────────────┐
│                             │
│         (photo area)        │
│                             │
├─────────────────────────────┤ ← .TRUST-sheet (bottom sheet)
│  Riverside Elementary       │    .name    64px bold (portrait) / 52px (landscape)
│  Public elementary · 0.8mi  │    .meta    36px 75% white
│  [Schools]                  │    .badges  gold/green pills
└─────────────────────────────┘
```

Landscape 覆盖: overlay.html:144-149(padding `90px 60px 50px`,name 52,meta 30,badge 26)。

---

## 三、Nearby 通用渲染流程

所有 6 种 nearby archetype 共用,与 Listing 的差异点:

1. `claim_bucket_job()` @ `worker.py:518` — `scope in ('intent_bucket','community_intent_bucket')`
2. `process_bucket_job()` @ `worker.py:550` — `is_community` 决定 owner column(`listing_id` vs `community_id`)
3. 照片源 = `input_photo_ids`(POI 照片,**不是** `listing_photos`)
4. 每个 POI 算 `_fmt_distance_mi()` / `_fmt_drive_min()` 填 overlay
5. 字幕:HTML→PNG。按 archetype 生成 `captions.json` → `caption-render/render.py` Playwright 打开 `overlay.html` 给每 clip 截 1080×1920 / 1920×1080 透明 PNG
6. **运镜换 v1 filter**(`kenburns_filter`,blur-letterbox): POI 缩略图取景不可控,用静态模糊底 + 动画前景 overlay 避免拉伸/裁剪。motion 只允许 `zoom_in` / `zoom_out`(pan 会带出 fg/bg 缝隙)
7. `generate.py` 调用形状一致,`--listing-overlay` 换成 archetype 数据,加 `--captions captions.json`
8. Landscape 画布必须走 `cover=True` 分支,不复用 portrait 的 fit-inside(否则左右两侧烧出模糊竖条)

---

## 四、TRUST 特定决策

- **底部 sheet 而非全屏卡片**:学校/医院照片本身信息量少(建筑外观 / logo),给 photo 留 60% 屏幕保住可信度;数据(评级、距离)靠 badge 密集堆
- **默认色 gold**(信任 / 权威),green 备用(健康类)
- POI type 用 `poi_type_label()`(`worker.py:913`)从 `google_places.types` 映射,fallback `bucket_label`
