// ⚠️ 只能在原仓库内运行：脚本 import 的是 `backend/src/**` 与仓库 node_modules。
/**
 * 一次性导出脚本：拦截 DeepSeekDesignAssistant.complete，把真实提示词抓下来写成 markdown。
 * 用法：cd backend && pnpm tsx ../handoff/prompts/export-prompts.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DeepSeekDesignAssistant } from "../../backend/src/modules/design-assistant/infrastructure/deepseek-design-assistant.js";

const outDir = path.resolve(import.meta.dirname);

const gateway = new DeepSeekDesignAssistant({
  apiKey: "dummy-key",
  baseUrl: "http://127.0.0.1:1",
  model: "stub",
  timeoutMs: 1000,
  maxRetries: 0,
  imageDetail: "low"
});

const captured: unknown[] = [];
(gateway as unknown as { complete: (messages: unknown[]) => Promise<unknown> }).complete = async (messages) => {
  captured.push(messages);
  return {};
};

const sceneAnalysis = {
  summary: "傍晚老街，暖光透过百叶窗落到灰墙上",
  subjects: ["坐着的男生"],
  subjectRegions: [
    {
      label: "画面下方坐姿男生（金色短发 + 墨镜 + 黑卫衣）",
      x: 0.2, y: 0.42, width: 0.45, height: 0.5, confidence: 0.96, score: 92, importance: "primary",
      colors: ["#14161A", "#5A5F52"]
    }
  ],
  environment: "城市老街",
  background: { description: "灰色水泥墙与百叶窗", complexity: "moderate", textFriendly: false },
  dominantColors: ["#0F1211", "#D0841A", "#8E8B80"],
  safeZones: [
    { x: 0.04, y: 0.08, width: 0.9, height: 0.26, reason: "上方灰墙留白", colors: ["#3A3B38"] }
  ],
  marketingTone: ["街头潮流", "暗调质感"],
  risks: ["主体贴边"]
};

const layoutPlan = {
  frameRatio: 0.75,
  selection: "top-band",
  areaRatio: 0.235,
  scale: "medium",
  subjectCount: 1,
  grid: { cols: 3, rows: 3, cells: [] },
  textAnchor: { id: "c0-2_r0-0", label: "上方整条带", colStart: 0, colEnd: 2, rowStart: 0, rowEnd: 0, heat: 0, cells: 3 },
  secondaryAnchor: null,
  palette: {
    suggested: { headline: "#F6F8F9", support: "#D8B45A" },
    backdrop: "#101412",
    options: [{ hex: "#FFFFFF", source: "universal" }]
  }
};

const brief = "突出人物主体，做一个有品牌感的营销版式";
const copySource =
  "这是我在北京南锣鼓巷拍摄的照片，深秋时节，透过房间的暖色灯光，和周围傍晚灰色的墙面形成强烈对比。突出地点、秋季感受、潮流、穿搭。";

await gateway.analyzeScene("QUJD");
await gateway.designLayout({
  brief,
  copySource,
  layoutPlan,
  sceneAnalysis,
  durationMs: 3000,
  frameRatio: 0.75
});

function render(messages: unknown, title: string, note: string): string {
  const list = messages as Array<{ role: string; content: unknown }>;
  const parts: string[] = [`# ${title}`, "", note, ""];
  for (const message of list) {
    parts.push(`## role: ${message.role}`, "");
    if (typeof message.content === "string") {
      parts.push("```text", message.content, "```", "");
      continue;
    }
    const blocks = message.content as Array<Record<string, unknown>>;
    for (const block of blocks) {
      if (block.type === "text") {
        parts.push("```text", String(block.text), "```", "");
      } else if (block.type === "image_url") {
        parts.push("```text", "[image_url: <照片 JPEG base64，detail=low>]", "```", "");
      }
    }
  }
  return parts.join("\n");
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "01-scene-analysis.prompt.md"),
  render(
    captured[0],
    "提示词导出 · 画面理解（SCENE_ANALYSIS_PROMPT_VERSION = 7）",
    "来源：`backend/src/modules/design-assistant/infrastructure/deepseek-design-assistant.ts` 的 `analyzeScene()`。\n下面的示例值是为了导出提示词临时造的，不是真实分析结果。"
  ),
  "utf8"
);
writeFileSync(
  path.join(outDir, "02-design-layout.prompt.md"),
  render(
    captured[1],
    "提示词导出 · L2 设计师（DESIGN_PROMPT_VERSION = 4）",
    "来源：`backend/src/modules/design-assistant/infrastructure/deepseek-design-assistant.ts` 的 `designLayout()`。\n其中【动效目录】由 `domain/motion-catalog.ts` 生成，【文案正反例】由 `domain/copy-rules.catalog.ts` 生成，示例数据为导出时临时构造。"
  ),
  "utf8"
);

console.log("written:", captured.length, "prompt files ->", outDir);
