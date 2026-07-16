# Nearby Video — MAP Archetype

**父文档**: [README.md](./README.md) · [通用 nearby 流程见 TRUST](./video-nearby-trust.md#三nearby-通用渲染流程)
**Buckets 覆盖**: `outdoor`, `transit`, `work_hubs`
**用途**: 地图定位型 POI —— 显著卡片 + inline mini-map + 距离 / 车程数据行

---

## 一、captions.json 字段(每 clip)

由 `worker.py:945-947` 组装:

```json
{
  "clip": 1,
  "poi": "Piedmont Park",
  "type": "Urban park",
  "dist": 1.5,
  "drive": "4 min",
  "mode": "Drive",
  "time": "4 min"
}
```

- `mode` 目前硬编码 `"Drive"`(worker.py:946)。未来接入 transit / walk 判断可切换 `"Walk"` / `"Transit"`
- `time` 目前 = `drive`,但独立字段留以区分未来 walk time

---

## 二、DOM 结构(overlay.html:304,`.MAP-card`)

```
┌─────────────────────────────┐
│                             │
│         (photo area)        │
│                             │
│                             │
│  ┌─────────────────────────┐│ ← .MAP-card (白底大卡片,底部)
│  │ ▓▓ │ Piedmont Park      ││    .MAP-mini  mini-map svg (232×232)
│  │ ─┼─│ Urban park         ││    .MAP-info  name / type
│  │  ┃ │ Dist  Drive        ││    .rows      数据行
│  │    │ 1.5mi 4 min        ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

- `.MAP-mini`:纯 CSS/SVG 绘制的示意 mini-map,含两条道路(`.road-h` / `.road-v`)+ 定位 pin(`.pin`)+ home dot(`.dot-home`)。**不调用真实地图 API**,只做视觉暗示
- 卡片白底 + 深字(`#0F172A`)—— MAP 是唯一亮色卡片,和其他 archetype 的暗底 scrim 反差明显

---

## 三、MAP 特定决策

- **专给"看位置比看照片重要"的 bucket**:公园(照片同质化)/ 交通站点 / 工作区,用户实际想要「离我家多远、怎么去」而不是「这地方长啥样」
- **mini-map 是抽象化视觉**:不接真地图 API 省成本 + 保证渲染确定性(无网络依赖)。真的要看具体路线用户会点站外
- **白底卡片是设计信号**:蓝地图 · 白纸 · 数据行——与前 5 种暗底 archetype 明显区隔,识别度高
- Landscape 布局(overlay.html:175-181): 卡片贴底,mini 缩到 180,rows 字号成比例下调
