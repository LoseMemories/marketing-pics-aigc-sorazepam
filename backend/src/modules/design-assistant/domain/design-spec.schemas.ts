import { z } from "zod";
import { EFFECT_RECIPES, TEXT_ENTER_RECIPES, TEXT_IDLE_RECIPES, recipeIds } from "./motion-catalog.js";

/**
 * L2 设计师的产出：**设计语汇层**，不含裸坐标与毫秒。
 *
 * 位置 = 锚点引用 + 偏移（L1 算出的承载区才是可靠基准，模型只做倾向判断）；
 * 动效 = 配方 id + 有界参数 + 枚举选项（枚举与范围由 motion-catalog 唯一维护）。
 * 真正解算成 x/y/startMs 是 L3 的事（compose-canvas.ts）。
 */

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toUpperCase());

/** 锚点引用：L1 的两个承载区，或分析给出的安全区，或自由放置。 */
const anchorRefSchema = z.union([
  z.enum(["textAnchor", "secondaryAnchor", "free"]),
  z.string().regex(/^safeZone:\d{1,2}$/)
]);

const anchorSchema = z.object({
  ref: anchorRefSchema,
  /** 相对短边的百分比偏移，可用范围在校验阶段夹取到 ±8。 */
  dxPct: z.number().default(0),
  dyPct: z.number().default(0)
});

const enterIds = recipeIds("text-enter") as [string, ...string[]];
const idleIds = recipeIds("text-idle") as [string, ...string[]];
const effectIds = recipeIds("effect") as [string, ...string[]];

const motionSchema = z.object({
  id: z.enum(enterIds),
  params: z.record(z.string(), z.number()).default({}),
  options: z.record(z.string(), z.string()).default({})
});

const blockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  /** headline = Hero 大标题；paragraph = 正文段落（≤30 字）。 */
  role: z.enum(["headline", "subline", "paragraph", "meta", "kicker"]),
  text: z.string().min(1).max(60),
  anchor: anchorSchema,
  align: z.enum(["left", "center", "right"]).default("left"),
  /** 字号：占画幅短边的比例。L3 还会按所在分格尺寸再夹一次。 */
  sizeRatio: z.number().min(0.015).max(0.2),
  weight: z.number().int().min(300).max(900).default(600),
  tracking: z.number().min(-0.1).max(0.3).default(0),
  lineHeight: z.number().min(1).max(2).default(1.4),
  /** 字体族：sans=黑体 / serif=宋体 / display=标题感粗衬线 / mono=等宽。 */
  font: z.enum(["sans", "serif", "display", "mono"]).default("sans"),
  /** 变形 schema：整体缩放、旋转、斜切。 */
  transform: z
    .object({
      scaleX: z.number().min(0.4).max(2).default(1),
      scaleY: z.number().min(0.4).max(2).default(1),
      rotateDeg: z.number().min(-25).max(25).default(0),
      skewDeg: z.number().min(-20).max(20).default(0)
    })
    .default({ scaleX: 1, scaleY: 1, rotateDeg: 0, skewDeg: 0 }),
  /** 路线样式变化：起点偏移（相对终点）与首尾缩放，用来做“滑入 + 变大 + 定格”。 */
  path: z
    .object({
      fromDxPct: z.number().min(-60).max(60).default(0),
      fromDyPct: z.number().min(-60).max(60).default(0),
      fromScale: z.number().min(0.3).max(2).default(1),
      toScale: z.number().min(0.3).max(2).default(1)
    })
    .default({ fromDxPct: 0, fromDyPct: 0, fromScale: 1, toScale: 1 }),
  /** 3D 文字质感，只允许给 headline。 */
  text3d: z.enum(["none", "cylinder", "cube"]).default("none"),
  /** 文字压到主体之后（被主体遮挡），即「从人物后方出现」。 */
  occlude: z.boolean().default(false),
  enter: motionSchema,
  idle: z.object({ id: z.enum(idleIds), params: z.record(z.string(), z.number()).default({}), options: z.record(z.string(), z.string()).default({}) }).optional()
});

const effectSchema = z.object({
  id: z.enum(effectIds),
  /** 大多数效果用锚点定位；laser-overlay 忽略锚点（铺满整幅）。 */
  anchor: anchorSchema,
  /** 颜色角色：语义角色优先，也允许十六进制（校验是否属于 L1 配色）。 */
  colorRef: z.union([z.enum(["accent", "text", "support"]), hexColorSchema]).default("accent"),
  params: z.record(z.string(), z.number()).default({}),
  /** 枚举选项：subject-outline 的 style/mode、icon-marker 的 glyph 等。 */
  options: z.record(z.string(), z.string()).default({})
});

export const designSpecSchema = z.object({
  version: z.literal(1),
  /** 一句话设计概念 / 设计思路，只给人看，不参与渲染。 */
  concept: z.string().min(1).max(160),
  blocks: z.array(blockSchema).min(1).max(5),
  effects: z.array(effectSchema).max(3).default([]),
  /** 色彩角色：全部必须来自 L1 的 palette.options（校验阶段强制）。 */
  palette: z.object({
    text: hexColorSchema,
    accent: hexColorSchema.optional(),
    support: hexColorSchema.optional()
  }),
  /** 节拍：由 L3 展开成具体 startMs / durationMs。 */
  beats: z
    .object({
      pace: z.enum(["slow", "medium", "fast"]).default("medium"),
      startMs: z.number().int().min(0).max(3000).default(0)
    })
    .default({ pace: "medium", startMs: 0 })
});

export type DesignSpec = z.infer<typeof designSpecSchema>;
export type DesignBlock = z.infer<typeof blockSchema>;
export type DesignEffect = z.infer<typeof effectSchema>;
export type DesignAnchor = z.infer<typeof anchorSchema>;

export const DESIGN_SPEC_VERSION = 1;

/** 动效 id 汇总，供前端下拉与文档使用。 */
export const motionIds = {
  enter: TEXT_ENTER_RECIPES.map((recipe) => recipe.id),
  idle: TEXT_IDLE_RECIPES.map((recipe) => recipe.id),
  effect: EFFECT_RECIPES.map((recipe) => recipe.id)
} as const;
