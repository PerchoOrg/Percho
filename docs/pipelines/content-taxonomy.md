# 内容标签体系（3-Level Taxonomy）

面向社区短视频组装：每个素材（图片 / 视频片段）在入库时被打上一组标签，Composer 层按模板需要检索。

---

## L1 · 内容类型（互斥，单选）

| tag | 定义 | 典型来源 |
|---|---|---|
| `listing-interior` | 房源室内 | Percho agent 上传 |
| `listing-exterior` | 房源正立面 / 前院 | Percho agent 上传 |
| `streetscape` | 街景、社区主干道、招牌节点 | Wikimedia、Unsplash |
| `park` | 公园 / 绿道 / 河道 | Wikimedia |
| `school` | 学校外景 / 校园招牌 | Wikimedia |
| `restaurant` | 餐厅 / 咖啡 / 商圈 | Unsplash |
| `event` | 社区活动 / 集市 / 节庆 | Wikimedia、Flickr CC |
| `people-vibe` | 人文氛围（非亲属，居民日常） | Unsplash |

> ⚠️ 定位：`people-vibe` **不是** family/kin。是社区调性——街上遛狗的人、跑步的通勤者、周末集市的人流。Percho 是卖房平台，不是家庭生活博客。

## L2 · Mood（互斥，单选）

| tag | 视觉线索 |
|---|---|
| `quiet-suburban` | 空街、宽草坪、单车 |
| `walkable` | 人行道 + 招牌 + 商铺连排 |
| `family` | 学校、儿童公园（*mood 不是内容，family 只描调性*） |
| `nightlife` | 夜景 / 灯光 / 招牌霓虹 |
| `nature` | 河、林、原生绿地 |

## L3 · 房源关联（多选）

- `nearest_listing_id`：本素材最近的一条 Percho listing（geo 距离，用于跨 CTA 关联）
- `distance_m`：距离米数
- `price_band`：与最近 listing 的价格段匹配 `[<500k, 500-800k, 800k-1.2M, >1.2M]`
- `neighborhood_slug`：`peachtree-corners`（一个素材可属多个邻里，如骑边界公园）

---

## 打标模型对比

| 模型 | 成本（1000 张） | 延迟 | 准确率（内部估计） | 部署难度 |
|---|---|---|---|---|
| **CLIP zero-shot**（openai/clip-vit-B32 本地） | ~$0（GPU 电费） | 30 ms / 图 | L1 ~78%、L2 ~55% | 中（需 GPU 或 CPU 慢跑） |
| **GPT-4V / gpt-4o**（API） | ~$10-15 | 2-3 s / 图 | L1 ~92%、L2 ~85% | 低（HTTP 调用） |
| **本地 LLaVA-1.6-13B** | ~$1（自托管电费+摊薄） | 4-8 s / 图 | L1 ~85%、L2 ~72% | 高（需 24GB VRAM、量化、服务化） |

### 结论 · 推荐

**冷启动用 GPT-4o**：POC 阶段每社区打标预算 < $2，速度快、准确率对 L1/L2 都够用。批量到 10k+ 张后再评估切 CLIP（省钱）或 LLaVA（隐私）。本地 LLaVA 目前不划算——运维复杂度 vs 每月节省 $50 不成比例。

**L3 不需要模型**：纯 geo 计算 + SQL join，Ranker 层做。
