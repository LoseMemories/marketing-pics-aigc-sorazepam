# 批量读图任务（设计语汇 JSON 生产）

工作目录：`/Users/sunsizhe/Documents/deepseek-harness/handoff`

## 必读
1. `docs/10-设计语汇分析提示词.md` —— 唯一的分析规范与输出 schema，逐条遵守。
2. `tools/design-vocab/data/_analysis_batches.json` —— 批次清单；你只处理分配给你的那个批次 id。

## 每张图的操作
对批次里的每个 item：
1. 用 `read_image` 读 `item.path`（动图只描述首帧可见内容）。
2. 按规范产出一个 JSON 对象（单图单对象，不要数组）。
3. 用 `write` 工具写到 `item.out`，UTF-8，2 空格缩进，纯 JSON（不要 markdown 代码块、不要注释、不要多余文字）。若 `item.out` 已存在，先用 `read` 读一次再覆盖写（避免文件策略拦截）。
4. 描述性字段一律用**中文**：`label` / `positionDesc` / `attributes` 各值 / `titleRelation` / `semanticSummary` / `designRecipe`；`textBlocks.content` 保留画面原文（日/英/中照抄）。
5. `image_id` = `item.basename`；`meta.width` / `meta.height` 必须等于 item 给定值；`meta.ratio` 用 item 的 `ratio` 字符串。

## 硬性落地要求（validator 会逐项检查）
- 顶层键一个都不能少：`image_id, meta, grid, subjects, textBlocks, titleRelation, sceneTags, emotionTags, composition, palette, style, metadata, semanticSummary, designRecipe, confidence`。
- `meta` 键：`width, height, ratio, language, media_type`；`language` ∈ `zh|en|mixed|null`（日文等其他文字用 `mixed`；无文字用 null）。
- `grid` 默认 `{"cols":4,"rows":4}`；只有极端长宽比才改 3×3 / 3×5 / 5×3，且 `region` 编号必须落在 `cols*rows` 范围内（4×4 为 0–15）。
- `subjects`：至少 1 条；键齐全（category/label/importance/role/areaRatio/region/positionDesc/mainColor/bgColor/attributes/confidence）；`category` ∈ 人类|景物|动物|商品；`role` ∈ primary|secondary；importance 最高者 primary；`attributes` 按 category 给对应子键（人类: gender/age/pose/expression/outfit；商品: productType/brandVisible/logoPosition/textOnProduct；景物: indoor/season/timeOfDay/weather；动物: species/wildOrPet）。
- `textBlocks`：键齐全（level/content/region/positionDesc/occlusion/orientation/fontStyle/color/confidence）；`level` ∈ 主标题|副标题|小字文案；`occlusion` ∈ 无遮挡|文字在主体前|主体压在文字上|看不清；`orientation` ∈ 横排|竖排|倾斜|null；`fontStyle` ∈ 衬线|无衬线|手写|书法|未识别。**只抽看得清的文字**，小字/艺术字看不清就 `content:null` + `occlusion:"看不清"`，严禁猜测或补写。最多 8 条，抓主要层级即可。
- `composition.type` ∈ 对角线构图|左右构图|上下构图|极简构图|极繁构图|多向构图|对称构图|光影构图；`complexity` ∈ 极简|适中|极繁；whitespace 0–1；mainColorCount 与 1–5→极简 / 6–9→适中 / 10+→极繁 的规则一致。
- `palette`：maincolor/vicecolor 必给 `#RRGGBB`，accentColors/textColors 非空数组，contrast ∈ 高|中|低。
- `style.colorTone` 只能取：黑白色调、棕黄灰绿蓝、复古色调、暖色、冷色、暗色调、清新感、炫光色调、霓虹迷幻、赛伯朋克、废土风、像素风；`style.styleTags` 只能取：写实、动画、3d、虚实混合、中国风、日本昭和、美式、欧洲、历史、漫画；`texture` ∈ 摄影|插画|3D|拼贴|合成|null。
- `sceneTags` / `emotionTags` 只能从规范字典里选（可多选，可空数组，禁止造词）。
- `metadata.purpose` ∈ 电商主图|详情页|海报|社媒封面|线下物料|品牌页面|null；`intent` ∈ 促销|种草|品牌形象|情绪共鸣|信息告知|null。
- 每个 subject、每个 textBlock 都要有 `confidence`（0–1）；`composition` / `palette` / `style` 对象里额外加 `confidence`（0–1，规范硬性约束 2）；顶层再有 `confidence`。
- 所有颜色为 `#RRGGBB` 近似值，不留空串。
- `semanticSummary` 一句话（含用途推断）；`designRecipe` 一句话配方。
- 忠实原图：不臆造画面没有的主体/文字；网页截图类素材按「品牌页面/社媒封面」等合理推断用途，但主体与文字必须来自画面。

## 完成后
只回复一行：`DONE <batch_id> <成功文件数>/<总数>`，不要粘贴 JSON 内容。若某张图读取失败，在该行后附 `FAIL <path>`。
