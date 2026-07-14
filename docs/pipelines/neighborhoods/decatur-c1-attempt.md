# C1 Attempt Log — Decatur via config-only reuse

**Tick**: 2026-07-11 (Phase C, C1)
**Goal**: 复用 `fetch_wikimedia.py`,只加 `neighborhoods/decatur.yaml`,尝试抓 15+ Decatur 素材。
**Rule**: 不改 `.py`,只加 config。

## 结果:破产 (预期,C2 会给重构建议)

### 静态分析 `fetch_wikimedia.py`
```
OUT     = Path('/home/ubuntu/Percho/docs/pipelines/poc-output/assets')  # 硬编码
QUERIES = ['Peachtree Corners Georgia', 'Gwinnett County Georgia',
           'Norcross Georgia', 'Chattahoochee River Georgia',
           'Jones Bridge Park']                                         # 硬编码
TARGET  = 22                                                             # 硬编码
```
脚本无任何 `open()` / `argparse` / `os.environ` / `yaml.load` 调用 —— **不消费任何外部配置**。

### 破产点(不改 code 时)
1. **QUERIES 不动** → 直接跑 = 重抓 Peachtree Corners,不是 Decatur。
2. **OUT 不动** → 即使 QUERIES 改到,素材会覆盖/污染现有 `assets/` 目录。
3. **TARGET 不动** → 无法针对 Decatur 单独设阈值(如 15)。
4. **manifest.json 单一** → 无法区分 neighborhood ownership。

因此 C1 无法在"零 code 改动"约束下产出 Decatur 素材。

### 已交付
- `docs/pipelines/neighborhoods/decatur.yaml`(config 就位,供 C2 之后的重构消费)
  - `wikimedia_queries`: 7 条(Decatur square / DeKalb courthouse / Agnes Scott / Emory / Oakhurst / MARTA Decatur)
  - `output_dir`: `poc-output/decatur/assets`(隔离)
  - `target_asset_count`: 22
  - `tag_hints` + `reel` 结构,给 tag_rules.py / compose.py 复用铺路

### 手动验证 API 可达(不写盘,不改 py)
命令:
```
curl -sG 'https://commons.wikimedia.org/w/api.php' \
  --data-urlencode 'action=query' --data-urlencode 'format=json' \
  --data-urlencode 'generator=search' \
  --data-urlencode 'gsrsearch=filetype:bitmap Decatur Georgia' \
  --data-urlencode 'gsrnamespace=6' --data-urlencode 'gsrlimit=3' \
  -A 'PerchoPipelinePOC/0.1' | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('query',{}).get('pages',{})),'hits')"
```
结论:Wikimedia Commons 对 "Decatur Georgia" 有大量命中(手动验证接口活),素材侧无风险,阻塞纯粹在 fetcher 硬编码。

## C2 需回答
- fetcher 应接受 `--neighborhood <slug>` 参数,`OUT/QUERIES/TARGET` 从 yaml 读。
- manifest 结构应加 `neighborhood_slug` 字段,支持多 neighborhood 共存。
- 目录布局:`poc-output/<neighborhood>/{assets,tags.json,composition_plan.json,*.mp4}` 隔离。
- 详见下 tick 交付的 `architecture-v2.md`。
