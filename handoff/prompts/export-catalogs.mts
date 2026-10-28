// ⚠️ 只能在原仓库内运行：脚本 import 的是 `backend/src/**` 与仓库 node_modules。
/**
 * 导出「目录型」提示词片段（动效目录 / 文案正反例 / 设计语言），写成 markdown。
 * 用法：cd backend && pnpm tsx ../handoff/prompts/export-catalogs.mts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildMotionCatalogPrompt, EFFECT_RECIPES, TEXT_ENTER_RECIPES, TEXT_IDLE_RECIPES } from "../../backend/src/modules/design-assistant/domain/motion-catalog.js";
import { buildCopyRulesPrompt, COPY_NEGATIVE_EXAMPLES, COPY_POSITIVE_EXAMPLES, COPY_REWRITE_EXAMPLES } from "../../backend/src/modules/design-assistant/domain/copy-rules.catalog.js";
import { designLanguageReference } from "../../backend/src/modules/design-assistant/domain/design-language.catalog.js";

const outDir = path.resolve(import.meta.dirname);

const count = (list: readonly unknown[]) => list.length;

writeFileSync(
  path.join(outDir, "03-motion-catalog.prompt.md"),
  [
    "# 提示词片段 · 动效目录（`domain/motion-catalog.ts`）",
    "",
    "这是**唯一的动效事实源**：提示词里给模型看的目录、以及校验器夹取参数/枚举，都由同一份数据生成。",
    `当前条目：文字入场 ${count(TEXT_ENTER_RECIPES)} 个、文字循环 ${count(TEXT_IDLE_RECIPES)} 个、光效/滤镜 ${count(EFFECT_RECIPES)} 个。`,
    "",
    "## 实际注入提示词的文本",
    "",
    "```text",
    buildMotionCatalogPrompt(),
    "```",
    ""
  ].join("\n"),
  "utf8"
);

writeFileSync(
  path.join(outDir, "04-copy-rules.prompt.md"),
  [
    "# 提示词片段 · 文案正反例（`domain/copy-rules.catalog.ts`）",
    "",
    "用来压制三类错误文案：① 图片描述（视角/构图/色调）② 设计心思（反差/层次/描边）③ 主体外观罗列（黑卫衣/迷彩裤/鞋）。",
    `当前条目：反例 ${count(COPY_NEGATIVE_EXAMPLES)} 条、正例 ${count(COPY_POSITIVE_EXAMPLES)} 条、改写对照 ${count(COPY_REWRITE_EXAMPLES)} 组。`,
    "",
    "## 实际注入提示词的文本",
    "",
    "```text",
    buildCopyRulesPrompt(),
    "```",
    ""
  ].join("\n"),
  "utf8"
);

writeFileSync(
  path.join(outDir, "05-design-language.prompt.md"),
  [
    "# 提示词片段 · 设计语言（`domain/design-language.catalog.ts`）",
    "",
    "注意：这份目录是**给旧版一次性出图（`/composition`）**用的；新的 L2 设计师走的是 `motion-catalog.ts` + 本文档的排版纪律摘要。保留是因为它还定义了「设计语言」的共同语汇，可作为知识库的种子内容。",
    "",
    "```text",
    designLanguageReference,
    "```",
    ""
  ].join("\n"),
  "utf8"
);

console.log("catalogs written ->", outDir);
