/**
 * 新增特效的配色**参考**。
 *
 * 原则：
 *  1. 基调来自画面本身 —— 主体色 + 主图分析的前三个主色，不用外挂跳跃色；
 *  2. 大标题优先纯白 / 近黑这类常见安全色，可读性优先；
 *  3. 这里只给候选集与建议，**最终决定权在 L2 设计师**。
 *
 * 主图分析里拿到的 dominantColors 在那一层没用上，到这里才真正被消费。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export type SwatchUse = "headline" | "accent" | "support" | "any";
export type SwatchSource = "subject" | "image" | "derived" | "universal";

/** 一个配色候选，带足够元信息让 L2 自己判断。 */
export interface PaletteSwatch {
  hex: string;
  name: string;
  source: SwatchSource;
  /** 对承载区的对比度。 */
  contrast: number;
  /** 与主体的最小色相距离；无彩色为 null。 */
  hueGap: number | null;
  use: SwatchUse;
  note: string;
}

export interface EffectPalette {
  /** 承载区底色（主文字锚点所在安全区的平均色）。 */
  backdrop: string;
  /** 承载区上的文字色：可读性硬约束，不交给 L2 自由发挥。 */
  text: string;
  textContrast: number;
  /** 配色基调：主体色 + 画面前三主色。 */
  base: string[];
  /** 配色参考集，供 L2 挑选。 */
  options: PaletteSwatch[];
  /** L1 的建议（L2 可推翻）。 */
  suggested: { headline: string; accent: string; support: string };
  /** 主体自身色：压在主体上会看不清。 */
  avoid: string[];
  /** 光点 / 呼吸效果优先放的位置（热区最低的格）。 */
  effectAnchors: string[];
  /** 一句话给 L2 / L3 的配色说明。 */
  rationale: string;
}

export interface EffectPaletteInput {
  /** 选中主体各自的代表色。 */
  subjectColors: readonly string[];
  /** 主图分析的前三个主色。 */
  imageColors: readonly string[];
  /** 主文字锚点所属安全区的平均底色。 */
  backdropColor?: string;
  /** 热区最低的候选锚点（已按热区从低到高排序）。 */
  coolAnchors: readonly string[];
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** 通用安全色：大标题、正文、描边在任何照片上都过得去。 */
const UNIVERSAL_SWATCHES: ReadonlyArray<{ hex: string; name: string; use: SwatchUse }> = [
  { hex: "#FFFFFF", name: "纯白", use: "headline" },
  { hex: "#0B0D10", name: "近黑", use: "headline" },
  { hex: "#7A1F28", name: "暗红", use: "any" },
  { hex: "#1B2A4A", name: "海军蓝", use: "any" },
  { hex: "#3F6B3A", name: "草绿", use: "any" }
];

/** 正文可读的最低对比度（WCAG AA 大字号）。 */
const MIN_TEXT_CONTRAST = 4.5;
/** 强调色 / 光点压在承载区上的最低对比度。 */
const MIN_ACCENT_CONTRAST = 3;
/** 强调色与正文色之间的最低对比度，保证两者不会糊成一块。 */
const MIN_ACCENT_TEXT_GAP = 1.8;
/** 参与参考集的对比度下限，低于这个值基本看不见。 */
const MIN_SWATCH_CONTRAST = 2.2;
/** 主体色最多展示几个，避免 UI 上堆一长排。 */
const MAX_AVOID_COLORS = 4;
/** 参考集最多给几个选项，L2 选择太多反而会乱选。 */
const MAX_OPTIONS = 9;
/** 派生色最多从几个基调色出发，太多会把参考集刷满。 */
const MAX_DERIVE_BASE = 2;

export function parseHex(hex: string): Rgb | null {
  if (!HEX_PATTERN.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 相对亮度（0–1）。 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

/** WCAG 对比度（1–21）。 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHsl(hex: string): Hsl {
  const rgb = parseHex(hex) ?? { r: 128, g: 128, b: 128 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / delta + 2) * 60
        : ((r - g) / delta + 4) * 60;
  return { h: hue, s: saturation, l: lightness };
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1 ? [chroma, second, 0]
      : sector < 2 ? [second, chroma, 0]
        : sector < 3 ? [0, chroma, second]
          : sector < 4 ? [0, second, chroma]
            : sector < 5 ? [second, 0, chroma]
              : [chroma, 0, second];
  const base = lightness - chroma / 2;
  const channel = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value + base)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** 色相环形距离（0–180）。低饱和色视为无明确色相，返回 90。 */
export function hueDistance(left: string, right: string): number {
  const a = toHsl(left);
  const b = toHsl(right);
  if (a.s < 0.12 || b.s < 0.12) return 90;
  const raw = Math.abs(a.h - b.h) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** 把色相翻译成可读色名，避免出现 L2 读不懂的 "#2F6FB0"。 */
export function hueName(hsl: Hsl): string {
  if (hsl.s < 0.12) return hsl.l > 0.55 ? "浅灰" : "深灰";
  const h = hsl.h;
  if (h < 15) return "红";
  if (h < 40) return "橙";
  if (h < 68) return "黄";
  if (h < 95) return "黄绿";
  if (h < 150) return "绿";
  if (h < 185) return "青绿";
  if (h < 215) return "青";
  if (h < 255) return "蓝";
  if (h < 285) return "蓝紫";
  if (h < 320) return "紫";
  if (h < 345) return "品红";
  return "红紫";
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function pickBackdrop(input: EffectPaletteInput): string {
  if (input.backdropColor && HEX_PATTERN.test(input.backdropColor)) {
    return input.backdropColor.toUpperCase();
  }
  // 没有安全区底色时，用画面主色里最亮的一个近似"留白"。
  const candidates = input.imageColors.filter((color) => HEX_PATTERN.test(color));
  if (candidates.length === 0) return "#1A1E24";
  return candidates
    .map((color) => ({ color, luminance: relativeLuminance(color) }))
    .sort((left, right) => right.luminance - left.luminance)[0]!.color.toUpperCase();
}

function pickText(backdrop: string): string {
  const darkText = "#12160F";
  const lightText = "#F6F8F9";
  const preferred = contrastRatio(darkText, backdrop) >= contrastRatio(lightText, backdrop)
    ? darkText
    : lightText;
  if (contrastRatio(preferred, backdrop) >= MIN_TEXT_CONTRAST) return preferred;
  // 都不够时退到纯黑 / 纯白再试一次。
  return contrastRatio("#FFFFFF", backdrop) >= contrastRatio("#000000", backdrop)
    ? "#FFFFFF"
    : "#000000";
}

/** 主体里最暗的颜色，用作描边与投影，让新增元素"长在画面里"。 */
function pickSupport(subjectColors: readonly string[], text: string): string {
  const usable = subjectColors.filter((color) => HEX_PATTERN.test(color));
  if (usable.length === 0) return relativeLuminance(text) > 0.5 ? "#0A0C0F" : "#E7EBEF";
  return [...usable]
    .sort((left, right) => relativeLuminance(left) - relativeLuminance(right))[0]!
    .toUpperCase();
}

/** 从画面某个颜色派生同色系的深 / 浅两档，保证基调统一。 */
function deriveVariants(hex: string): Array<{ hex: string; name: string; note: string }> {
  const hsl = toHsl(hex);
  if (hsl.s < 0.15) return [];
  const family = hueName(hsl);
  return [
    {
      hex: hslToHex(hsl.h, Math.min(1, hsl.s + 0.08), Math.max(0.12, hsl.l - 0.2)),
      name: `${family}·加深`,
      note: "与画面同色系加深，用于强调与光点"
    },
    {
      hex: hslToHex(hsl.h, Math.min(1, hsl.s + 0.08), Math.min(0.9, hsl.l + 0.22)),
      name: `${family}·提亮`,
      note: "与画面同色系提亮，用于高光与下划线"
    }
  ];
}

function toSwatch(
  entry: { hex: string; name: string; note?: string; use?: SwatchUse },
  source: SwatchSource,
  context: { backdrop: string; subjectColors: readonly string[] }
): PaletteSwatch {
  const contrast = Number(contrastRatio(entry.hex, context.backdrop).toFixed(2));
  const gaps = context.subjectColors
    .filter((color) => HEX_PATTERN.test(color))
    .map((color) => hueDistance(entry.hex, color));
  const hueGap = toHsl(entry.hex).s < 0.12 || gaps.length === 0
    ? null
    : Math.round(Math.min(...gaps));
  return {
    hex: entry.hex.toUpperCase(),
    name: entry.name,
    source,
    contrast,
    hueGap,
    use: entry.use ?? "accent",
    note: entry.note ?? (source === "universal"
      ? `常见安全色，对承载区对比度 ${contrast.toFixed(1)}:1`
      : "取自画面本身")
  };
}

function buildOptions(input: {
  backdrop: string;
  base: readonly string[];
  subjectColors: readonly string[];
}): PaletteSwatch[] {
  const context = { backdrop: input.backdrop, subjectColors: input.subjectColors };
  // 只从最饱和的基调色派生，灰调派生出来还是灰。
  const deriveFrom = [...input.base]
    .map((hex) => ({ hex, hsl: toHsl(hex) }))
    .filter((entry) => entry.hsl.s >= 0.15)
    .sort((left, right) => right.hsl.s - left.hsl.s)
    .slice(0, MAX_DERIVE_BASE);

  const derived = deriveFrom.flatMap((entry) =>
    deriveVariants(entry.hex).map((variant) => toSwatch(variant, "derived", context))
  );
  const universal = UNIVERSAL_SWATCHES.map((entry) => toSwatch(entry, "universal", context));

  const seen = new Set<string>();
  const kept: PaletteSwatch[] = [];
  for (const swatch of [...derived, ...universal]) {
    if (seen.has(swatch.hex)) continue;
    // 纯白 / 近黑是标题默认值，即使对比度不够也保留，但会如实标注。
    const isHeadlineSafe = swatch.source === "universal" && swatch.use === "headline";
    if (!isHeadlineSafe && swatch.contrast < MIN_SWATCH_CONTRAST) continue;
    seen.add(swatch.hex);
    kept.push(swatch);
  }
  return kept.slice(0, MAX_OPTIONS);
}

/** 优先画面同色系的派生色；画面色系在承载区上读不出来时才回落到通用安全色。 */
function suggestAccent(options: readonly PaletteSwatch[], text: string): PaletteSwatch | null {
  // 强调色必须与正文有明显明度差，否则和一个「近白的提亮色」没区别。
  const usable = options.filter(
    (option) =>
      option.use !== "support" &&
      option.contrast >= MIN_ACCENT_CONTRAST &&
      contrastRatio(option.hex, text) >= MIN_ACCENT_TEXT_GAP
  );
  if (usable.length === 0) {
    return [...options]
      .filter((option) => option.hex !== text.toUpperCase())
      .sort((left, right) => right.contrast - left.contrast)[0] ?? null;
  }
  // 同色系派生色里优先饱和的：提亮过度会褪成奶油色，失去强调作用。
  const rank = (option: PaletteSwatch): number =>
    toHsl(option.hex).s * 100 + Math.min(option.contrast, 6);
  const derivedFirst = usable.filter((option) => option.source === "derived");
  const pool = derivedFirst.length > 0 ? derivedFirst : usable;
  return [...pool].sort((left, right) => rank(right) - rank(left))[0] ?? null;
}

const SOURCE_LABEL: Record<SwatchSource, string> = {
  subject: "主体色",
  image: "画面主色",
  derived: "画面同色系派生",
  universal: "通用安全色"
};

export function planEffectPalette(input: EffectPaletteInput): EffectPalette {
  const subjectColors = dedupe(input.subjectColors.filter((color) => HEX_PATTERN.test(color)))
    .map((color) => color.toUpperCase());
  const imageColors = dedupe(input.imageColors.filter((color) => HEX_PATTERN.test(color)))
    .map((color) => color.toUpperCase());
  // 基调优先挑有色彩倾向的：灰调派生不出颜色，参考集会被通用安全色占满。
  const base = dedupe([...subjectColors, ...imageColors])
    .map((hex) => ({ hex, saturation: toHsl(hex).s }))
    .sort((left, right) => right.saturation - left.saturation)
    .slice(0, 3)
    .map((entry) => entry.hex);

  const backdrop = pickBackdrop(input);
  const text = pickText(backdrop);
  const textContrast = Number(contrastRatio(text, backdrop).toFixed(2));
  const options = buildOptions({ backdrop, base, subjectColors });
  const accent = suggestAccent(options, text);
  const support = pickSupport(subjectColors, text);
  const effectAnchors = [...input.coolAnchors].slice(0, 2);

  const parts = [
    `承载区底色 ${backdrop}，正文用 ${text}（对比度 ${textContrast}:1）`,
    base.length > 0
      ? `配色基调取自画面：${base.join(" / ")}`
      : "画面无可用主色，仅提供通用安全色"
  ];
  if (accent) {
    parts.push(
      `强调色建议 ${accent.name} ${accent.hex}（${SOURCE_LABEL[accent.source]}，对比度 ${accent.contrast}:1）`
    );
  }
  const universalNames = options
    .filter((option) => option.source === "universal")
    .map((option) => option.name)
    .join(" / ");
  if (universalNames) parts.push(`另有通用安全色可选：${universalNames}`);
  parts.push("最终配色由 L2 设计师按画面与文案决定");

  return {
    backdrop,
    text,
    textContrast,
    base,
    options,
    suggested: { headline: text, accent: accent?.hex ?? text, support },
    avoid: subjectColors.slice(0, MAX_AVOID_COLORS),
    effectAnchors,
    rationale: `${parts.join("；")}。`
  };
}
