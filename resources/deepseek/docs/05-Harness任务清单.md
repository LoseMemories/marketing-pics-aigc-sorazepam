# Harness 任务清单（可直接排期）

> 面向「营销博客数字人 Agent」第一阶段。任务按依赖排序，每条都给出**改哪里、怎么验收**。
> 原则见 `02-局限与增强路线.md` 第四节：任何新能力都要落在「设计语汇 + 确定性解算」的形状上。

---

## T1 · 真实字体度量（替代估算）★最高性价比

- **目标**：文字盒宽高从「字符数 × 字号」变成真实 `measureText`。
- **落点**：
  - 新增 `backend/src/modules/design-assistant/domain/typography.ts`
    ```ts
    export interface TextMetrics { width: number; height: number; lines: number; }
    export function measureText(input: {text: string; font: string; weight: number; sizeRatio: number; tracking: number; lineHeight: number; frameRatio: number}): TextMetrics
    ```
  - `compose-canvas.ts#estimateBox` 内部改调 `measureText`，保持函数签名不变（度量不可用时回退估算）。
  - 字体文件放 `backend/assets/fonts/`（建议先用开源：思源黑体 / 思源宋体 / 霞鹜文楷），用 `canvas` 或 `opentype.js` 度量。
- **验收**：新增 `backend/test/typography.test.ts`：① 中英混排宽度单调性 ② 与浏览器 `measureText` 偏差 < 3% ③ 千例随机文案无溢出（`x1 + width <= 0.9`）。
- **风险**：node-canvas 原生依赖编译；备选 `@napi-rs/canvas`。

## T2 · 评测集与回归脚本

- **目标**：改提示词/算法前先有尺子。
- **落点**：`eval/` 目录（不进 pnpm workspace）
  - `eval/cases/<caseId>/{photo.jpg, copy-source.md, expect.json, notes.md}`
  - `eval/run.ts`：批量跑 L1→L2→L3，输出 `report.md`（耗时、issues、文案是否含禁用词、边距/重叠是否合规）
- **验收**：≥50 例；`pnpm tsx eval/run.ts` 产出对比表；每次 PR 附报告。
- **备注**：`samples/real-run/` 里的两份 JSON 可作为「参考输出」示例。

## T3 · 多候选 + 规则打分

- **目标**：一次产出 3 个候选，用确定性规则挑最优，降低「审美塌陷」概率。
- **落点**：
  - `application/design-layout.ts` 增加 `generateCandidates(n)`、`scoreDesign(spec, ctx)`（对比度、边距、重叠、密度、字数分布、effect 预算）
  - 响应增加 `candidates: Array<{design, score, reasons}>`，`design` 仍为最优单值（向后兼容）
- **验收**：单测覆盖打分函数；评测集上「3 选 1」的人工接受率高于「1 候选」。

## T4 · 分割模型替代 20 点多边形

- **目标**：主体边界从 20 点粗轮廓 → 像素级 mask，用于描边、重叠混色、避让。
- **落点**：
  - 视觉分析提示词去掉「描点」要求（或降级为 fallback）；
  - 新增 `infrastructure/segmentation.ts`（SAM / 商用 API 适配器），输出简化多边形（RDP 抽稀到 64–128 点）+ bbox + mask PNG 路径；
  - `SceneAnalysis.subjectRegions[]` 增加 `outlineRef`（指向 mask 文件），`points` 保留兼容。
- **验收**：边界与人工标注 IoU ≥ 0.9；描边渲染无锯齿抖动；分析时延不高于现状 +30%。

## T5 · 设计师 Skill 层（编译期调用）

- **目标**：L2 输出后自动「量一遍、修一遍、打一次分」。
- **落点**：新增 `backend/src/modules/design-skills/`
  | skill | 依赖 |
  |---|---|
  | `measure_text` | T1 |
  | `check_contrast` | 现有 `effect-palette.ts` 的对比度工具 |
  | `detect_layout_conflict` | `compose-canvas.ts` 的重叠推挤逻辑抽出来 |
  | `render_preview` | 见 T6 |
  | `score_layout` | T3 的打分函数 |
- **编排**：`DesignLayout` 里 `validate → skills.autoFix → score`，把 score < 阈值的理由写进重试 prompt。
- **验收**：评测集 issues 率 ≤ 10%；技能全部有单测。

## T6 · 同构渲染 + 导出管线

- **目标**：预览 = 导出；能出 PNG / 多尺寸 / MP4。
- **落点**：
  - 把 `frontend/src/features/canvas-renderer/runtime/*` 抽成不依赖 Vue/DOM 的纯模块（渲染函数接收 `CanvasRenderingContext2D` 兼容对象），前后端共用；
  - 后端用 `@napi-rs/canvas` 实现同构；`POST /api/v1/live-assets/:id/export {targets[]}`
  - MP4：按 30fps 抽帧 → `ffmpeg-static` 合成（已有依赖）。
- **验收**：同一 CompositionSpec 前后端出图 SSIM ≥ 0.99；3 尺寸 30s 内完成。

## T7 · 多模态设计知识库

- **目标**：可检索的优秀版式资产，作为 L2 的结构化 few-shot。
- **落点**：
  - 新模块 `backend/src/modules/design-kb/`（domain: `DesignCase`, `SearchQuery`, `DesignKnowledgeBase` port；infrastructure: 向量库适配 + 文件索引）
  - 库存储 schema 见 `01-技术方案.md` §4.1
  - L2 提示词新增 `【参考案例 N 组】`（3–5 条 spec，不是整图）
  - 人工「确认」动作 → 写入新 case（`quality.human`）
- **验收**：召回案例的人工认可率 ≥ 70%；注入后评测集人工改动率下降 ≥ 30%。

## T8 · 品牌资产（Brand Kit）

- **目标**：同一账号/品牌出图风格一致。
- **落点**：`backend/src/modules/brand-kit/`（色板、字体白名单、口吻样例、禁用词、Logo 位置）；`DesignContext` 增加 `brand`；提示词注入品牌约束；L3 增加 logo 层类型（可选）。
- **验收**：同账号 5 图风格一致性人评 ≥ 4/5；禁用词 100% 拦截。

## T9 · 照片合成 MCP

- **目标**：从「贴字」升级为「合成」。
- **落点**：独立 MCP server（`compose-mcp/`），工具：`segment / matting / relight / shadow / inpaint / outpaint / composite / relocate / upscale`（签名见 `01-技术方案.md` §4.3）；后端以 client 方式调用，仅在配置了 endpoint 时启用。
- **验收**：能产出「主体重定位 + 光影匹配」的成图；与纯叠加方案的 A/B 人评提升 ≥ 0.5 分（5 分制）。

## T10 · 队列与观测

- **目标**：20 并发不排队失控，成本可视。
- **落点**：`runtime/build-server.ts` 装配队列（默认内存实现，可选 Redis）；幂等键 `assetId+promptVersion+designHash`；`generation_runs` 打点（阶段、耗时、token、issues、是否人工改动）。
- **验收**：20 并发 P95 ≤ 45s；看板能按提示词版本对比成功率与平均 token。

## T11 · 审核与合规

- **目标**：上线素材 100% 过审。
- **落点**：禁用词表 + 肖像提示（检测到人脸时要求人工确认）+ 价格/日期类事实核对（与 copy-source 对齐）+ 免责声明字段。
- **验收**：审核门拒绝率与误杀率均有记录；敏感素材不能直接进入发布队列。

## T12 · Agent 编排（长期）

- **目标**：选题 → 文案 → 视觉 → 自评 → 发布，带记忆与人工干预点。
- **落点**：新建 `agents/` 编排层（可用任意 workflow 引擎），把现有 4 个用例包装成 tool；记忆存「账号画像 + 历史改动偏好」。
- **验收**：端到端无人值守出稿，人工只做「确认 / 打回」；打回理由能回灌 T7。

---

## 建议的提交顺序

```
T2（评测集）→ T1（度量）→ T3（多候选）→ T5（skill 编译期）→ T6（导出）
   → T4（分割）→ T7（知识库）→ T8（品牌）→ T10（队列/观测）→ T9（合成 MCP）→ T11 → T12
```

先做 T2 的理由：没有评测集，T1/T3/T5/T7 的收益都无法证明，容易在「感觉变好了」里打转。
