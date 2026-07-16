# Nearby Video — UTILITY Archetype

**父文档**: [README.md](./README.md) · [通用 nearby 流程见 TRUST](./video-nearby-trust.md#三nearby-通用渲染流程)
**Buckets 覆盖**: `shopping`, `daily_errands`, `pets`
**用途**: 便利型 POI —— 单点信息,只需 POI 名 + 距离 + 车程,不需要引语或叙事

---

## 一、captions.json 字段(每 clip)

由 `worker.py` 通用分支组装(UTILITY 无额外字段,worker.py:948 注释:「UTILITY needs no extras — {poi, type, dist, drive} is enough」):

```json
{
  "clip": 1,
  "poi": "Kroger",
  "type": "Grocery store",
  "dist": 0.6,
  "drive": "2 min"
}
```

---

## 二、DOM 结构(overlay.html:276,`.UTIL-chip` + `.UTIL-drive`)

```
┌─────────────────────────────┐
│                             │
│         (photo area)        │
│                             │
│                             │
│  [📍 Kroger · 0.6 mi]       │ ← .UTIL-chip (pin icon + name + dist)
│  [⏱ 2 min]                  │ ← .UTIL-drive (clock icon + drive time)
└─────────────────────────────┘
```

两个独立 chip,不是 sheet。inline SVG icon(pin 24×24, clock 24×24)避免字体依赖。

---

## 三、UTILITY 特定决策

- **最轻量的 archetype**:pets / shopping / errands 的照片自身信息量足够,字幕只做「点位标注」,不抢戏
- **无 chapter numbering**:每个 POI 独立,不需要"逛系列"的叙事绑定
- **无 `why` / `quote` / `badges`**:worker 分支直接跳过所有 archetype-specific 字段
- POI type 由 `poi_type_label()` 映射(`worker.py:913`)
