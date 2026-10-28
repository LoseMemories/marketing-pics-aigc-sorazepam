# Marketing Photo AIGC · 项目阶段交付包

> 面向「营销博客数字人 Agent」的交接包：产品 PRD + 技术方案 + 现有提示词全文 + 前后端源码。
> 目的：把这个文件夹直接交给 DeepSeek Harness，让它在此基础上继续搭建**效果更好**的下一阶段系统。

## 1. 这个包是什么

一个已经跑通端到端的**实况照片 → 营销画面（文案 + 动效）**流水线原型：

| 层 | 名称 | 实现 | 输出 |
|---|---|---|---|
| L1 | 构图决策 | **纯代码**（像素覆盖率 + 决策网格） | 文字承载区 / 收尾小字区 / 候选配色 |
| L2 | 设计师 | **LLM（DeepSeek）** 结构化输出 | `DesignSpec`：文案层级、锚点、字号、动效 id、参数 |
| L3 | Canvas 解算 | **纯函数**（无模型） | `CompositionSpec`：每层的最终坐标 / 时间轴 |
| — | 渲染 | 前端 Canvas 2D | 静态封面（最终形态）+ 长按播放动效 |

关键设计取舍：**模型只输出「设计语汇」，绝不输出坐标与毫秒**。坐标、边距、不重叠、时间轴全部由确定性代码算，因此结果可复现、可解释、可被代码夹取修正。

## 2. 怎么读这个包

```
handoff/
├─ README.md                    ← 你在这里
├─ docs/
│  ├─ 00-产品PRD.md             ← 产品形态、现有能力、**阶段局限**、下一阶段需求与指标
│  ├─ 01-技术方案.md             ← 现有架构、数据契约、**技术局限**、目标架构与新组件设计
│  ├─ 02-局限与增强路线.md        ← 一页表格：局限 → 根因 → 影响 → 需要的新技术 → 验收
│  ├─ 03-提示词与约束清单.md      ← 现有提示词清单、版本号、validator 夹取规则
│  ├─ 04-数据契约.md             ← DesignSpec / CompositionSpec / SceneAnalysis / LayoutPlan 字段表
│  ├─ 05-Harness任务清单.md       ← 可直接排期的 12 个任务（改哪里 + 怎么验收）
│  └─ 90-legacy/                ← 项目早期设计文档（macOS 图库 demo、一次性出图方案）
├─ prompts/
│  ├─ 01-scene-analysis.prompt.md  ← 画面理解提示词全文（由代码导出，非手抄）
│  ├─ 02-design-layout.prompt.md   ← L2 设计师提示词全文（含动效目录与文案正反例）
│  ├─ 03-motion-catalog.prompt.md  ← 动效目录（唯一事实源）
│  ├─ 04-copy-rules.prompt.md      ← 文案正反例目录
│  ├─ 05-design-language.prompt.md ← 设计语言参考（旧版一次性出图用，可作知识库种子）
│  ├─ export-prompts.mts / export-catalogs.mts ← 导出脚本（提示词改了重新跑一次即可）
└─ source/
   ├─ backend/   ← Fastify + TS + zod + vitest（不含 node_modules / data）
   ├─ frontend/  ← Vue 3 + ant-design-vue + webpack（不含 node_modules / dist）
   ├─ native/    ← macOS 实况照片解析 helper（Swift，含 Info.plist 与源码）
   └─ samples/copy-sources/ ← 运营写的「照片事实背景」样例（selfies/*.md）
```

## 3. 怎么跑起来（本地）

```bash
pnpm install
# 后端：需要 backend/.env.local 里配置 DeepSeek
#   DEEPSEEK_API_KEY=...
#   DEEPSEEK_BASE_URL=https://api.deepseek.com
#   DEEPSEEK_MODEL=deepseek-chat
pnpm --filter @marketing-photo/backend dev     # 127.0.0.1:3000
pnpm --filter @marketing-photo/frontend dev    # 127.0.0.1:5173（代理 /api /media /health）
pnpm --filter @marketing-photo/backend test
pnpm --filter @marketing-photo/frontend test
```

> 源码里 `backend/data/live-assets/<uuid>/` 是运行时产物（照片、视频、分析 JSON），已被排除。
> 没有真实素材时，可用 `/api/v1/demo-assets` 的 demo 素材目录跑通链路。

## 4. 交给 Harness 时的建议顺序

1. 先读 `docs/00-产品PRD.md` 与 `docs/02-局限与增强路线.md`，明确「现在能做什么、差什么」。
2. 再读 `docs/01-技术方案.md` 与 `docs/04-数据契约.md`，明确扩展点在哪。
3. 需要改提示词时，以 `prompts/*.prompt.md` 为**当前真相**（它们由代码导出，与实现一致），改代码后重新运行 `export-*.mts` 保持同步。
4. 需要改渲染/交互时，入口文件：
   - L2 提示词：`source/backend/src/modules/design-assistant/infrastructure/deepseek-design-assistant.ts`
   - 校验与夹取：`source/backend/src/modules/design-assistant/domain/design-spec.validator.ts`
   - L3 解算：`source/backend/src/modules/design-assistant/domain/compose-canvas.ts`
   - 动效目录：`source/backend/src/modules/design-assistant/domain/motion-catalog.ts`
   - Canvas 渲染：`source/frontend/src/features/canvas-renderer/runtime/canvas-renderer.ts`
   - 工作台面板：`source/frontend/src/features/design-assistant/components/AiDesignPanel.vue`

## 5. 三条不能破坏的约定

1. **L2 不产坐标、不产毫秒**：任何新能力都要落到「设计语汇 + 确定性解算」这个形状上。
2. **动效目录是唯一事实源**：新增动效 = 加一条目录 + 实现渲染分支 + 补测试；不允许只在提示词里写。
3. **改提示词必须升版本号**：`DESIGN_PROMPT_VERSION`（L2）与 `SCENE_ANALYSIS_PROMPT_VERSION`（画面理解），否则旧缓存会继续被沿用。
