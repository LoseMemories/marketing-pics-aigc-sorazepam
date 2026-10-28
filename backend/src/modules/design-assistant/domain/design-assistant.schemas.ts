import { z } from "zod";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const clampText = (maxLength: number) => (value: string) => value.trim().slice(0, maxLength);

const unitNumber = z.number().transform(clamp01);

/** 模型有时返回 [x, y] 数组，有时返回 {x, y} 对象，两种都接受。 */
const normalizedPointSchema = z
  .union([z.object({ x: unitNumber, y: unitNumber }), z.tuple([unitNumber, unitNumber])])
  .transform((point) => (Array.isArray(point) ? { x: point[0], y: point[1] } : point));

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toUpperCase());

/**
 * 轮廓点数上限（仅作兜底）：提示词只要 20 个点，点数越多模型输出越长、分析越慢
 * （实测 20 点 23s、100 点 75s），所以这里只防模型多给，不主动要求加密。
 */
export const MAX_SUBJECT_OUTLINE_POINTS = 100;

const normalizedBoxSchema = z
  .object({
    x: unitNumber,
    y: unitNumber,
    width: unitNumber,
    height: unitNumber,
    reason: z.string().min(1).transform(clampText(120)),
    /** 该区域的平均底色，用于计算文字与特效的对比度。旧版缓存可能没有。 */
    colors: z.array(hexColorSchema).max(2).optional()
  })
  .transform((box) => {
    const x = box.x;
    const y = box.y;
    return {
      ...box,
      width: Math.max(0.01, Math.min(box.width, 1 - x)),
      height: Math.max(0.01, Math.min(box.height, 1 - y))
    };
  });

const backgroundSchema = z.object({
  description: z.string().min(1).transform(clampText(200)),
  complexity: z.enum(["clean", "moderate", "busy"]),
  textFriendly: z.boolean()
});

const subjectRegionSchema = z
  .object({
    label: z.string().min(1).transform(clampText(80)),
    x: unitNumber,
    y: unitNumber,
    width: unitNumber,
    height: unitNumber,
    confidence: unitNumber,
    /** 沿主体外侧避让边界顺时针采样的归一化点，用于精确判断文字/动效是否压到主体。 */
    points: z
      .array(normalizedPointSchema)
      .min(3)
      // 不设 max：模型偶尔多给点也不该让整份分析失败，超出上限直接截断。
      .transform((items) => items.slice(0, MAX_SUBJECT_OUTLINE_POINTS))
      .optional(),
    importance: z.enum(["primary", "secondary"]).optional(),
    /**
     * 主体价值分 0–100：这个主体值不值得作为营销主体留在画面里。
     * 前端默认只选 60 分以上的主体；模型没给时用置信度 × 面积占比保守估算。
     */
    score: z.number().min(0).max(100).optional(),
    /** 该主体最具代表性的颜色，特效与文字必须避开这些色相。旧版缓存可能没有。 */
    colors: z.array(hexColorSchema).max(3).optional()
  })
  .transform((region) => {
    const x = region.x;
    const y = region.y;
    return {
      ...region,
      width: Math.max(0.01, Math.min(region.width, 1 - x)),
      height: Math.max(0.01, Math.min(region.height, 1 - y)),
      score: Math.round(
        region.score ??
          Math.min(100, Math.max(0, region.confidence * (region.width * region.height) ** 0.35 * 100))
      )
    };
  });

export const sceneAnalysisSchema = z.object({
  summary: z.string().min(1).transform(clampText(500)),
  subjects: z.array(z.string().min(1).transform(clampText(80))).max(12).transform((items) => items.slice(0, 8)),
  subjectRegions: z.array(subjectRegionSchema).max(12).transform((items) => items.slice(0, 8)),
  /** 模型偶尔漏掉这段描述性字段，不应因此判整份分析失败。 */
  environment: z.string().transform(clampText(300)).optional(),
  background: backgroundSchema.optional(),
  dominantColors: z
    .array(hexColorSchema)
    .min(1)
    .max(10)
    .transform((items) => items.slice(0, 6)),
  safeZones: z.array(normalizedBoxSchema).max(8).transform((items) => items.slice(0, 4)),
  marketingTone: z.array(z.string().min(1).transform(clampText(40))).min(1).max(10).transform((items) => items.slice(0, 5)),
  risks: z.array(z.string().min(1).transform(clampText(120))).max(8)
}).transform((analysis) => ({
  ...analysis,
  environment:
    analysis.environment?.trim() || analysis.background?.description || analysis.summary
}));

export type SceneAnalysis = z.infer<typeof sceneAnalysisSchema>;

export const compositionSpecSchema = z
  .object({
    version: z.literal(1),
    durationMs: z.number().int().positive(),
    layers: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]{1,48}$/),
          kind: z.enum(["text", "pulse"]),
          animation: z.enum([
            "fade",
            "slide-up",
            "slide-left",
            "slide-right",
            "breathe",
            "drift",
            "sweep",
            "dot",
            "outline",
            "marker",
            "laser",
            "glow",
            "soft",
            "strobe"
          ]).optional(),
          /** 排版层级：决定字号、字重、字距与组块关系。 */
          role: z.enum(["headline", "subline", "paragraph", "meta", "kicker"]).optional(),
          /** 字号（相对画幅短边，0–0.2）。 */
          size: z.number().min(0.01).max(0.2).optional(),
          weight: z.number().int().min(300).max(900).optional(),
          tracking: z.number().min(-0.1).max(0.3).optional(),
          align: z.enum(["left", "center", "right"]).optional(),
          /** 字体族：sans / serif / display / mono。 */
          font: z.enum(["sans", "serif", "display", "mono"]).optional(),
          /** 3D 文字质感（仅 headline）。 */
          text3d: z.enum(["none", "cylinder", "cube"]).optional(),
          /** 变形 schema：整体缩放/旋转/斜切。 */
          transform: z
            .object({
              scaleX: z.number(),
              scaleY: z.number(),
              rotateDeg: z.number(),
              skewDeg: z.number()
            })
            .optional(),
          /** 是否被主体遮挡（文字从人物后方出现）。 */
          occlude: z.boolean().optional(),
          /** 脉冲/图形层参数（呼吸点、描边、图标、镭射等）。 */
          params: z.record(z.string(), z.number()).optional(),
          /** 枚举选项：style=solid/dashed、mode=draw-on/blink、glyph=finger/…、pattern=dapple/… */
          style: z.string().optional(),
          mode: z.string().optional(),
          glyph: z.string().optional(),
          pattern: z.string().optional(),
          enter: z
            .object({
              type: z.enum([
                "fade",
                "fade-in-place",
                "slide-up",
                "slide-left",
                "slide-right",
                "mask-reveal",
                "rise",
                "stand-up-3d",
                "through"
              ]),
              startMs: z.number().int().min(0),
              durationMs: z.number().int().positive(),
              ease: z.enum(["linear", "outCubic", "outQuint", "inOutSine"]).optional(),
              /** 起点相对终点的位移与缩放（路线样式变化）。 */
              from: z
                .object({
                  dx: z.number().default(0),
                  dy: z.number().default(0),
                  scale: z.number().default(1)
                })
                .optional(),
              /** 终态缩放。 */
              toScale: z.number().optional(),
              /** stand-up-3d 的透视角度。 */
              perspectiveDeg: z.number().optional()
            })
            .optional(),
          idle: z
            .object({
              type: z.enum(["float-y", "breathe", "glow-pulse"]),
              amplitude: z.number().min(0).max(0.2).optional(),
              periodMs: z.number().int().min(400).max(8000).optional()
            })
            .optional(),
          startMs: z.number().int().min(0),
          endMs: z.number().int().positive(),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
          text: z.string().max(40).optional()
        })
      )
      .min(1)
      .max(8)
  })
  .superRefine((spec, context) => {
    const ids = new Set<string>();
    for (const layer of spec.layers) {
      if (ids.has(layer.id)) {
        context.addIssue({ code: "custom", message: `Duplicate layer id: ${layer.id}` });
      }
      ids.add(layer.id);
      if (layer.endMs <= layer.startMs || layer.endMs > spec.durationMs) {
        context.addIssue({ code: "custom", message: `Invalid layer time: ${layer.id}` });
      }
      if (layer.kind === "text" && !layer.text?.trim()) {
        context.addIssue({ code: "custom", message: `Text is required: ${layer.id}` });
      }
    }
  });

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;
