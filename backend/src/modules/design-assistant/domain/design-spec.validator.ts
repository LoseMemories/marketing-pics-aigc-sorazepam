import { clampOptions, clampParams, findRecipe } from "./motion-catalog.js";
import type { DesignAnchor, DesignBlock, DesignSpec } from "./design-spec.schemas.js";
import type { SceneAnalysis } from "./design-assistant.schemas.js";
import type { LayoutPlan } from "./layout-plan.js";

/**
 * L2 产出的事后校验：模型（或人手改）给出的东西不一定守规矩，
 * 这里把锚点、颜色、动效参数、层数预算全部夹到「L3 一定能画」的范围内，
 * 同时把被修正的地方记成 issues —— 上层可以把 issues 丢回模型重试一次。
 */

export interface DesignContext {
  /** L3 认得的锚点 id：textAnchor / secondaryAnchor / safeZone:<i>。 */
  anchors: readonly string[];
  /** L1 给出的候选配色（含建议正文色与承载区底色）。 */
  palette: readonly string[];
  defaultAnchor: string;
  defaultColor: string;
}

export interface DesignIssue {
  path: string;
  message: string;
}

export interface DesignValidation {
  design: DesignSpec;
  issues: DesignIssue[];
}

const MAX_OFFSET_PCT = 8;
const MAX_BLOCKS = 5;
const MAX_EFFECTS = 3;
const HEADLINE_MAX_CHARS = 14;
const PARAGRAPH_MAX_CHARS = 30;
const TEXT_MAX_CHARS = 40;

/** 版式顺序：同一锚点内自上而下堆叠的依据。 */
const ROLE_ORDER: Record<DesignBlock["role"], number> = {
  kicker: 0,
  headline: 1,
  subline: 2,
  paragraph: 3,
  meta: 4
};

export function buildDesignContext(plan: LayoutPlan, analysis: SceneAnalysis): DesignContext {
  const anchors = ["textAnchor"];
  if (plan.secondaryAnchor) anchors.push("secondaryAnchor");
  analysis.safeZones.forEach((_, index) => anchors.push(`safeZone:${index}`));

  const palette = new Set<string>([plan.palette.suggested.headline, plan.palette.suggested.support, plan.palette.backdrop]);
  for (const option of plan.palette.options) palette.add(option.hex);

  return {
    anchors,
    palette: [...palette],
    defaultAnchor: "textAnchor",
    defaultColor: plan.palette.suggested.headline
  };
}

function clampOffset(value: number, path: string, label: string, issues: DesignIssue[]): number {
  if (!Number.isFinite(value)) {
    issues.push({ path, message: `${label} 不是数字，已置 0` });
    return 0;
  }
  const clamped = Math.max(-MAX_OFFSET_PCT, Math.min(MAX_OFFSET_PCT, value));
  if (clamped !== value) {
    issues.push({ path, message: `${label} ${value}% 超出 ±${MAX_OFFSET_PCT}%，已夹取` });
  }
  return clamped;
}

function fixAnchor(anchor: DesignAnchor, path: string, context: DesignContext, issues: DesignIssue[]): DesignAnchor {
  const ref = context.anchors.includes(anchor.ref) ? anchor.ref : context.defaultAnchor;
  if (ref !== anchor.ref) {
    issues.push({ path: `${path}.ref`, message: `锚点 ${anchor.ref} 不存在，已回退到 ${ref}` });
  }
  return {
    ref,
    dxPct: clampOffset(anchor.dxPct, `${path}.dxPct`, "dxPct", issues),
    dyPct: clampOffset(anchor.dyPct, `${path}.dyPct`, "dyPct", issues)
  };
}

function fixColor(hex: string, path: string, context: DesignContext, issues: DesignIssue[]): string {
  const upper = hex.toUpperCase();
  if (context.palette.includes(upper)) return upper;
  issues.push({ path, message: `颜色 ${upper} 不在 L1 给出的配色里，已回退到 ${context.defaultColor}` });
  return context.defaultColor;
}

function fixText(text: string, limit: number, path: string, issues: DesignIssue[]): string {
  const trimmed = text.trim();
  if ([...trimmed].length <= limit) return trimmed;
  issues.push({ path, message: `文案超过 ${limit} 字，已截断` });
  return [...trimmed].slice(0, limit).join("");
}

/**
 * 两类「不像文案」的词一起拦：
 * ① 设计手法/动效说明（描边、镭射、构图…）；
 * ② 图片描述（视角、景别、色调、光线、器材…）。
 * 注意：客观的「复古潮流、深秋」这类 tag 是允许的，所以不能把这些词写进这里。
 */
const DESIGN_NOTE_PATTERN = new RegExp(
  [
    // ① 设计手法 / 动效说明
    "描边|描一圈|描线|镭射|光晕|蒙层|遮罩|动效|滤镜|构图|排版|字号|滑入|渐显|频闪",
    "呼吸点|视觉重心|层次感|呼吸感|留白|节奏感|交给光|留给光|反差",
    // ② 图片描述（视角 / 景别 / 光线 / 色彩）
    "俯拍|俯视|仰拍|仰视|视角|运镜|景别|特写|中景|全景|广角|长焦|机位",
    "逆光|侧光|顶光|色调|色温|饱和|莫兰迪|电影感|金属光泽|质感压|画质"
  ].join("|")
);

export function looksLikeDesignNote(text: string): boolean {
  return DESIGN_NOTE_PATTERN.test(text);
}

function fixBlock(block: DesignBlock, index: number, context: DesignContext, issues: DesignIssue[]): DesignBlock {
  const path = `blocks[${index}]`;
  const limit =
    block.role === "headline" ? HEADLINE_MAX_CHARS : block.role === "paragraph" ? PARAGRAPH_MAX_CHARS : TEXT_MAX_CHARS;
  const enterRecipe = findRecipe("text-enter", block.enter.id);
  const enterClamp = enterRecipe ? clampParams(enterRecipe, block.enter.params) : { params: {}, corrected: [] };
  const enterOptions = enterRecipe ? clampOptions(enterRecipe, block.enter.options) : { options: {}, corrected: [] };
  for (const note of [...enterClamp.corrected, ...enterOptions.corrected]) {
    issues.push({ path: `${path}.enter`, message: note });
  }

  let idle = block.idle;
  if (idle) {
    const idleRecipe = findRecipe("text-idle", idle.id);
    if (idleRecipe) {
      const idleClamp = clampParams(idleRecipe, idle.params);
      for (const note of idleClamp.corrected) issues.push({ path: `${path}.idle`, message: note });
      idle = { id: idle.id, params: idleClamp.params, options: idle.options };
    }
  }

  // 3D 文字只允许给 Hero，其它层级强制退回 none
  let text3d = block.text3d;
  if (text3d !== "none" && block.role !== "headline") {
    issues.push({ path: `${path}.text3d`, message: "3D 文字只允许用于主标题，已回退为 none" });
    text3d = "none";
  }

  const clampNumber = (value: number, min: number, max: number, field: string): number => {
    const clamped = Math.max(min, Math.min(max, value));
    if (clamped !== value) issues.push({ path: `${path}.${field}`, message: `${field} ${value} 超出 ${min}–${max}，已夹取` });
    return clamped;
  };

  return {
    ...block,
    text: fixText(block.text, limit, `${path}.text`, issues),
    anchor: fixAnchor(block.anchor, `${path}.anchor`, context, issues),
    enter: { id: block.enter.id, params: enterClamp.params, options: enterOptions.options },
    ...(idle ? { idle } : {}),
    text3d,
    sizeRatio: Math.max(0.015, Math.min(0.2, block.sizeRatio)),
    weight: Math.max(300, Math.min(900, Math.round(block.weight / 100) * 100)),
    transform: {
      scaleX: clampNumber(block.transform.scaleX, 0.4, 2, "transform.scaleX"),
      scaleY: clampNumber(block.transform.scaleY, 0.4, 2, "transform.scaleY"),
      rotateDeg: clampNumber(block.transform.rotateDeg, -25, 25, "transform.rotateDeg"),
      skewDeg: clampNumber(block.transform.skewDeg, -20, 20, "transform.skewDeg")
    },
    path: {
      fromDxPct: clampNumber(block.path.fromDxPct, -60, 60, "path.fromDxPct"),
      fromDyPct: clampNumber(block.path.fromDyPct, -60, 60, "path.fromDyPct"),
      fromScale: clampNumber(block.path.fromScale, 0.3, 2, "path.fromScale"),
      toScale: clampNumber(block.path.toScale, 0.3, 2, "path.toScale")
    }
  };
}

function fixEffect(effect: DesignSpec["effects"][number], index: number, context: DesignContext, issues: DesignIssue[]) {
  const path = `effects[${index}]`;
  const recipe = findRecipe("effect", effect.id);
  const clamp = recipe ? clampParams(recipe, effect.params) : { params: {}, corrected: [] };
  const options = recipe ? clampOptions(recipe, effect.options) : { options: {}, corrected: [] };
  for (const note of [...clamp.corrected, ...options.corrected]) {
    issues.push({ path: `${path}.params`, message: note });
  }
  const colorRef =
    effect.colorRef === "accent" || effect.colorRef === "text" || effect.colorRef === "support"
      ? effect.colorRef
      : fixColor(effect.colorRef, `${path}.colorRef`, context, issues);
  return {
    ...effect,
    anchor: fixAnchor(effect.anchor, `${path}.anchor`, context, issues),
    colorRef,
    params: clamp.params,
    options: options.options
  };
}

export function validateDesignSpec(input: DesignSpec, context: DesignContext): DesignValidation {
  const issues: DesignIssue[] = [];

  // 1) 层数预算
  let blocks = input.blocks;
  if (blocks.length > MAX_BLOCKS) {
    issues.push({ path: "blocks", message: `文字块超过 ${MAX_BLOCKS} 个，已截断` });
    blocks = blocks.slice(0, MAX_BLOCKS);
  }
  let effects = input.effects;
  if (effects.length > MAX_EFFECTS) {
    issues.push({ path: "effects", message: `光效层超过 ${MAX_EFFECTS} 个，已截断` });
    effects = effects.slice(0, MAX_EFFECTS);
  }

  // 2) 层级唯一性：headline 只能有一个
  const seen = new Set<string>();
  blocks = blocks.map((block, index) => {
    let role = block.role;
    if (role === "headline" && seen.has("headline")) {
      issues.push({ path: `blocks[${index}].role`, message: "已有 headline，重复的降级为 subline" });
      role = "subline";
    }
    seen.add(role);
    return { ...block, role };
  });
  if (!seen.has("headline")) {
    const first = blocks[0];
    if (first) {
      issues.push({ path: "blocks[0].role", message: "缺少 headline，已把第一块提升为主标题" });
      blocks[0] = { ...first, role: "headline" };
    }
  }

  // 3) id 唯一
  const ids = new Set<string>();
  blocks = blocks.map((block) => {
    let id = block.id;
    let suffix = 1;
    while (ids.has(id)) id = `${block.id}-${suffix++}`;
    ids.add(id);
    return { ...block, id };
  });

  const fixedBlocks = blocks.map((block, index) => fixBlock(block, index, context, issues));
  const fixedEffects = effects.map((effect, index) => fixEffect(effect, index, context, issues));

  // 3.5) 设计说明不是文案：带「描边/镭射/动效」这类词的块不该出现在画面上
  const noteBlocks = fixedBlocks.filter((block) => looksLikeDesignNote(block.text));
  let visibleBlocks = fixedBlocks;
  if (noteBlocks.length > 0) {
    for (const block of noteBlocks) {
      issues.push({
        path: "blocks[].text",
        message: `「${[...block.text].slice(0, 12).join("")}」像是设计说明，文案应写成给消费者看的话`
      });
    }
    const cleaned = fixedBlocks.filter((block) => !looksLikeDesignNote(block.text));
    // 至少留一块、且必须还有 headline，否则保留原样交回上层重试
    if (cleaned.length > 0 && cleaned.some((block) => block.role === "headline")) {
      visibleBlocks = cleaned;
    }
  }

  visibleBlocks.sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role]);

  return {
    design: {
      ...input,
      blocks: visibleBlocks,
      effects: fixedEffects,
      palette: {
        text: fixColor(input.palette.text, "palette.text", context, issues),
        ...(input.palette.accent ? { accent: fixColor(input.palette.accent, "palette.accent", context, issues) } : {}),
        ...(input.palette.support ? { support: fixColor(input.palette.support, "palette.support", context, issues) } : {})
      }
    },
    issues
  };
}
