import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const SRC = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const PROJ = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc";
const FRONT_FONTS = path.join(PROJ, "frontend/public/fonts");
const BACK_FONTS = path.join(PROJ, "backend/assets/fonts");
const FRONT_STYLES = path.join(PROJ, "frontend/src/shared/styles");
const FRONT_SHARED = path.join(PROJ, "frontend/src/shared/fonts");

const manifest = JSON.parse(readFileSync(path.join(SRC, "manifest.json"), "utf8"));

mkdirSync(FRONT_FONTS, { recursive: true });
mkdirSync(BACK_FONTS, { recursive: true });
mkdirSync(FRONT_STYLES, { recursive: true });
mkdirSync(FRONT_SHARED, { recursive: true });

const faceLines = ["/* 自动生成的字体声明（Fontshare · FFL 授权，可变字体） */"];
const familyMap = {};
const projectMap = { sans: "Satoshi", serif: "Gambetta", display: "Clash Display", mono: "Tabular" };

for (const m of manifest) {
  const name = m.name;
  familyMap[m.slug] = name;
  // 复制 woff2 到前端
  const woff2Src = path.join(SRC, m.slug, m.woff2);
  if (existsSync(woff2Src)) copyFileSync(woff2Src, path.join(FRONT_FONTS, m.woff2));
  // 复制 ttf 到后端
  const ttfSrc = path.join(SRC, m.slug, m.ttf);
  if (existsSync(ttfSrc)) copyFileSync(ttfSrc, path.join(BACK_FONTS, m.ttf));

  faceLines.push(`@font-face {\n  font-family: "${name}";\n  src: url("/fonts/${m.woff2}") format("woff2");\n  font-weight: 100 900;\n  font-style: normal;\n  font-display: swap;\n}`);
}
writeFileSync(path.join(FRONT_STYLES, "fonts.css"), faceLines.join("\n") + "\n", "utf8");

const ts = `/**
 * 字体加载工具：Canvas 渲染前调用，确保 @font-face 字体已就绪。
 * 浏览器字体是异步加载的，若不等待会 fallback 到系统字体。
 */
const FONT_FAMILY_MAP: Record<string, string> = ${JSON.stringify(familyMap, null, 2)};

/** 项目 DesignSpec.font 字段 → 默认字体族 */
export const PROJECT_FONT_FAMILY: Record<string, string> = ${JSON.stringify(projectMap, null, 2)};

/** 确保单个字体已加载 */
export async function ensureFontLoaded(family: string): Promise<void> {
  const name = FONT_FAMILY_MAP[family] ?? family;
  try {
    await document.fonts.load(\`600 48px "\${name}"\`);
  } catch {
    /* 加载失败静默，回退系统字体 */
  }
}

/** 批量确保字体加载 */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  await Promise.all(families.map(ensureFontLoaded));
}

/** 把 DesignSpec.font 字段映射成真实字体族名 */
export function resolveFontFamily(font: string): string {
  return PROJECT_FONT_FAMILY[font] ?? PROJECT_FONT_FAMILY.sans;
}
`;
writeFileSync(path.join(FRONT_SHARED, "font-loader.ts"), ts, "utf8");

console.log("✅ 复制完成：");
console.log("  前端 woff2 →", FRONT_FONTS);
console.log("  后端 ttf   →", BACK_FONTS);
console.log("  @font-face →", path.join(FRONT_STYLES, "fonts.css"));
console.log("  加载工具   →", path.join(FRONT_SHARED, "font-loader.ts"));
