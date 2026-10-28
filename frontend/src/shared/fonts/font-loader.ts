/**
 * 字体加载工具：Canvas 渲染前调用，确保 @font-face 字体已就绪。
 * 浏览器字体是异步加载的，若不等待会 fallback 到系统字体。
 */
const FONT_FAMILY_MAP: Record<string, string> = {
  "kihim": "Kihim",
  "striper": "Striper",
  "comico": "Comico",
  "cabinet-grotesk": "Cabinet Grotesk",
  "chillax": "Chillax",
  "clash-display": "Clash Display",
  "expose": "Expose",
  "general-sans": "General Sans",
  "ranade": "Ranade",
  "satoshi": "Satoshi",
  "switzer": "Switzer",
  "synonym": "Synonym",
  "tabular": "Tabular",
  "tanker": "Tanker",
  "technor": "Technor",
  "gambarino": "Gambarino",
  "gambetta": "Gambetta",
  "rowan": "Rowan",
  "sentient": "Sentient",
  "boska": "Boska"
};

/** 项目 DesignSpec.font 字段 → 默认字体族 */
export const PROJECT_FONT_FAMILY: Record<string, string> = {
  "sans": "Satoshi",
  "serif": "Gambetta",
  "display": "Clash Display",
  "mono": "Tabular"
};

/** 确保单个字体已加载 */
export async function ensureFontLoaded(family: string): Promise<void> {
  const name = FONT_FAMILY_MAP[family] ?? family;
  try {
    await document.fonts.load(`600 48px "${name}"`);
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
