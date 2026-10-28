# 样例数据

## copy-sources/ —— 运营写的「照片事实背景」

真实使用时的输入形态：一张照片配一段「事实 + 想突出什么」的中文资料，由 `backend/selfies/<素材key>.md` 读取。

三个真实样例（可直接当回归素材）：

| 文件 | 内容要点 | 说明 |
|---|---|---|
| `IMG_2472.md` | The Weeknd 曼谷站演唱会、内场仰拍、突出歌手/演唱会/地点 | 曾经产出反例「内场仰视 · 空山基金色立像，金属光泽压着整片蓝天」；现在产物是「THE WEEKND / 曼谷 · 第二场 / 亚洲巡回 · 泰国曼谷站 / 2026.10.12」 |
| `IMG_3161.md` | 南锣鼓巷、深秋、暖光与灰墙对比、突出地点/秋季/潮流/穿搭 | 产物「南锣鼓巷 · 深秋傍晚 / 窗光取暖，街头有型」 |
| `IMG_8236.md` | 巴音布鲁克、海拔 3000+、晴天大风、突出地点/自由/远方 | 注意：资料「顺带提到穿搭」，但没要求突出单品 → 文案不允许罗列衣服 |

## real-run/ —— 一次真实的运行产物

- `scene-analysis.sample.json`：视觉模型输出（含 `subjectRegions[].score`、`points` 粗轮廓、`safeZones`）。
- `design.sample.json`：L2 设计师输出（含 `concept`、`blocks[]`、`effects[]`、`palette`），外面包了 `promptVersion / cachedAt`。

这两份可以直接喂给 L3（`POST /api/v1/live-assets/:id/compose`）复算，或作为评测集的「参考输出」起点。

## 怎么自己造样例

```bash
# 1. 放一张照片到素材库（或用 demo-assets 目录）
# 2. 在 backend/selfies/<key>.md 写事实资料
# 3. 依次调接口
POST /api/v1/live-assets/:id/scene-analysis        # 视觉模型（≈20s）
POST /api/v1/live-assets/:id/layout-plan           # L1（瞬时）
POST /api/v1/live-assets/:id/design-layout         # L2（≈15–20s）
POST /api/v1/live-assets/:id/compose               # L3（≈12ms）
```

产物落在 `backend/data/live-assets/<id>/analysis/{scene-analysis,design}.json`。
