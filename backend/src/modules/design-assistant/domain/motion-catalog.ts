/**
 * 动效目录：动效 id、参数名、参数范围的**唯一来源**。
 * 提示词（给模型看）与校验器（夹取模型输出）都从这里生成，避免两处漂移。
 *
 * 新增一个动效 = 在这里加一条 + 在渲染器里实现对应分支，别只改提示词。
 */

export type MotionKind = "text-enter" | "text-idle" | "effect";

export interface MotionParamSpec {
  key: string;
  defaultValue: number;
  min: number;
  max: number;
  unit: "ms" | "%" | "count" | "deg" | "none";
  note: string;
}

/** 字符串型选项（样式、图标、模式这类无法用数值表达的东西）。 */
export interface MotionEnumSpec {
  key: string;
  values: readonly string[];
  defaultValue: string;
  note: string;
}

export interface MotionRecipe {
  id: string;
  kind: MotionKind;
  /** 一句话说明：模型据此判断「什么时候用」。 */
  summary: string;
  params: readonly MotionParamSpec[];
  enums?: readonly MotionEnumSpec[];
}

/** 文字入场。id 必须与 CompositionSpec.enter.type 的枚举一致。 */
export const TEXT_ENTER_RECIPES: readonly MotionRecipe[] = [
  {
    id: "fade",
    kind: "text-enter",
    summary: "原地淡入，最克制，适合 kicker / meta",
    params: [{ key: "durationMs", defaultValue: 320, min: 120, max: 600, unit: "ms", note: "淡入时长" }]
  },
  {
    id: "fade-in-place",
    kind: "text-enter",
    summary: "在终点位置原地渐显，不走位，最不打扰主体",
    params: [{ key: "durationMs", defaultValue: 460, min: 200, max: 900, unit: "ms", note: "渐显时长" }]
  },
  {
    id: "slide-up",
    kind: "text-enter",
    summary: "自下而上位移入场，最通用",
    params: [
      { key: "durationMs", defaultValue: 420, min: 200, max: 800, unit: "ms", note: "入场时长" },
      { key: "distancePct", defaultValue: 4, min: 1.5, max: 9, unit: "%", note: "位移量（占画幅短边）" }
    ]
  },
  {
    id: "slide-left",
    kind: "text-enter",
    summary: "自右向左滑入（起点在右侧），适合主体在右、文字在左",
    params: [
      { key: "durationMs", defaultValue: 460, min: 220, max: 900, unit: "ms", note: "入场时长" },
      { key: "distancePct", defaultValue: 6, min: 2, max: 14, unit: "%", note: "位移量（占画幅短边）" }
    ]
  },
  {
    id: "slide-right",
    kind: "text-enter",
    summary: "自左向右滑入（起点在左侧），适合主体在左、文字在右",
    params: [
      { key: "durationMs", defaultValue: 460, min: 220, max: 900, unit: "ms", note: "入场时长" },
      { key: "distancePct", defaultValue: 6, min: 2, max: 14, unit: "%", note: "位移量（占画幅短边）" }
    ]
  },
  {
    id: "mask-reveal",
    kind: "text-enter",
    summary: "遮罩自下而上揭示，最有版式感，首选给 Hero",
    params: [
      { key: "durationMs", defaultValue: 620, min: 350, max: 1000, unit: "ms", note: "揭示时长" },
      { key: "softness", defaultValue: 0.2, min: 0, max: 1, unit: "none", note: "遮罩边缘柔和度" }
    ]
  },
  {
    id: "rise",
    kind: "text-enter",
    summary: "纵向拉伸 + 上移，模拟「立起来」，只给 Hero",
    params: [
      { key: "durationMs", defaultValue: 720, min: 450, max: 1100, unit: "ms", note: "立起时长" },
      { key: "liftPct", defaultValue: 3, min: 1, max: 7, unit: "%", note: "上移量（占画幅短边）" }
    ]
  },
  {
    id: "stand-up-3d",
    kind: "text-enter",
    summary: "2D→3D 立体模拟：透视压缩 + 立起 + 光影扫过，Hero 专用的强强调",
    params: [
      { key: "durationMs", defaultValue: 860, min: 550, max: 1400, unit: "ms", note: "立起时长" },
      { key: "perspectiveDeg", defaultValue: 28, min: 8, max: 60, unit: "deg", note: "透视角度" },
      { key: "liftPct", defaultValue: 4, min: 1, max: 9, unit: "%", note: "上移量" }
    ]
  },
  {
    id: "through",
    kind: "text-enter",
    summary: "横向滑过画面后停住，位移方向要避开主体重心，只给 Hero",
    params: [
      { key: "durationMs", defaultValue: 820, min: 550, max: 1300, unit: "ms", note: "滑过时长" },
      { key: "travelPct", defaultValue: 28, min: 12, max: 50, unit: "%", note: "水平行程（占画幅宽）" }
    ]
  }
];

/** 文字循环微动。 */
export const TEXT_IDLE_RECIPES: readonly MotionRecipe[] = [
  {
    id: "float-y",
    kind: "text-idle",
    summary: "纵向缓慢漂浮，最不易察觉的呼吸感",
    params: [
      { key: "amplitudePct", defaultValue: 0.4, min: 0.2, max: 1.2, unit: "%", note: "振幅（占画幅短边）" },
      { key: "periodMs", defaultValue: 2600, min: 1800, max: 4000, unit: "ms", note: "周期" }
    ]
  },
  {
    id: "breathe",
    kind: "text-idle",
    summary: "整体极缓缩放呼吸，适合大标题",
    params: [
      { key: "scalePct", defaultValue: 2.5, min: 1, max: 5, unit: "%", note: "缩放幅度" },
      { key: "periodMs", defaultValue: 2200, min: 1500, max: 3200, unit: "ms", note: "周期" }
    ]
  }
];

/**
 * 光效 / 图形层（kind=pulse）。
 * 每个 id 在渲染器里有对应绘制分支；参数由 L3 解算后透传。
 */
export const EFFECT_RECIPES: readonly MotionRecipe[] = [
  {
    id: "sweep",
    kind: "effect",
    summary: "一道横向光带扫过，商业感强，适合开场或收尾",
    params: [
      { key: "widthPct", defaultValue: 18, min: 10, max: 32, unit: "%", note: "光带宽度（占画幅宽）" },
      { key: "opacity", defaultValue: 0.3, min: 0.1, max: 0.5, unit: "none", note: "不透明度" },
      { key: "angleDeg", defaultValue: 12, min: -30, max: 30, unit: "deg", note: "倾斜角" }
    ]
  },
  {
    id: "drift",
    kind: "effect",
    summary: "微小粒子缓慢漂移，氛围感强，适合夜景/暖光",
    params: [
      { key: "particleCount", defaultValue: 10, min: 5, max: 16, unit: "count", note: "粒子数量" },
      { key: "radiusPct", defaultValue: 0.5, min: 0.2, max: 0.9, unit: "%", note: "粒子半径（占画幅短边）" },
      { key: "opacity", defaultValue: 0.35, min: 0.1, max: 0.5, unit: "none", note: "不透明度" }
    ]
  },
  {
    id: "breathing-dot",
    kind: "effect",
    summary: "呼吸圆点：持续放大缩小的光点，用于指向卖点或点缀留白",
    params: [
      { key: "sizePct", defaultValue: 2.4, min: 0.8, max: 8, unit: "%", note: "基准半径（占画幅短边）" },
      { key: "minScale", defaultValue: 0.7, min: 0.3, max: 1, unit: "none", note: "呼吸最小倍率" },
      { key: "maxScale", defaultValue: 1.5, min: 1, max: 2.4, unit: "none", note: "呼吸最大倍率" },
      { key: "periodMs", defaultValue: 2000, min: 800, max: 4000, unit: "ms", note: "一个呼吸来回的时长" },
      { key: "opacity", defaultValue: 0.55, min: 0.15, max: 0.9, unit: "none", note: "不透明度" }
    ]
  },
  {
    id: "subject-outline",
    kind: "effect",
    summary: "沿主体轮廓描一圈线，可选涂鸦实线/虚线，逐步划线或描边闪烁",
    params: [
      { key: "widthPct", defaultValue: 0.5, min: 0.15, max: 2, unit: "%", note: "线宽（占画幅短边）" },
      { key: "durationMs", defaultValue: 1400, min: 400, max: 3000, unit: "ms", note: "划线/循环时长" },
      { key: "opacity", defaultValue: 0.75, min: 0.2, max: 1, unit: "none", note: "不透明度" },
      { key: "jitterPct", defaultValue: 0.3, min: 0, max: 1.2, unit: "%", note: "涂鸦抖动幅度（0 = 光滑线）" }
    ],
    enums: [
      { key: "style", values: ["spray-solid", "spray-dashed"], defaultValue: "spray-solid", note: "涂鸦实线 / 涂鸦虚线" },
      { key: "mode", values: ["draw-on", "blink"], defaultValue: "draw-on", note: "逐步划线 / 描边闪烁" }
    ]
  },
  {
    id: "icon-marker",
    kind: "effect",
    summary: "小范围移动的贴图图标（手指/灯泡），指向画面里的某个对象",
    params: [
      { key: "sizePct", defaultValue: 4.5, min: 2, max: 9, unit: "%", note: "图标高度（占画幅短边）" },
      { key: "orbitPct", defaultValue: 1.4, min: 0.4, max: 3.5, unit: "%", note: "来回摆动幅度" },
      { key: "periodMs", defaultValue: 1800, min: 900, max: 4000, unit: "ms", note: "摆动周期" },
      { key: "opacity", defaultValue: 0.9, min: 0.3, max: 1, unit: "none", note: "不透明度" }
    ],
    enums: [{ key: "glyph", values: ["finger", "bulb", "arrow"], defaultValue: "finger", note: "图标类型" }]
  },
  {
    id: "laser-overlay",
    kind: "effect",
    summary: "潮流滤镜蒙层：整幅彩虹渐变缓慢流动，制造 Y2K/科技质感，必须低透明度",
    params: [
      { key: "opacity", defaultValue: 0.14, min: 0.04, max: 0.3, unit: "none", note: "不透明度" },
      { key: "hueSpreadDeg", defaultValue: 140, min: 40, max: 320, unit: "deg", note: "色相跨度" },
      { key: "periodMs", defaultValue: 4200, min: 1600, max: 8000, unit: "ms", note: "色相流动周期" },
      { key: "bandPct", defaultValue: 26, min: 8, max: 60, unit: "%", note: "光带宽度" }
    ]
  },
  {
    id: "glow-mask",
    kind: "effect",
    summary:
      "画面滤镜：树影透光/光斑蒙层——光斑缓慢飘移，像阳光透过树叶洒在画面上；适合户外、傍晚、有植物或窗光的故事",
    params: [
      { key: "opacity", defaultValue: 0.3, min: 0.08, max: 0.6, unit: "none", note: "整体不透明度" },
      { key: "blobCount", defaultValue: 6, min: 3, max: 12, unit: "count", note: "光斑数量" },
      { key: "sizePct", defaultValue: 13, min: 4, max: 30, unit: "%", note: "单个光斑直径（占画幅短边）" },
      { key: "driftPct", defaultValue: 2, min: 0, max: 6, unit: "%", note: "缓慢飘移幅度" },
      { key: "softness", defaultValue: 0.7, min: 0.2, max: 1, unit: "none", note: "光斑边缘柔化程度" }
    ],
    enums: [
      {
        key: "pattern",
        values: ["dapple", "bokeh", "beam"],
        defaultValue: "dapple",
        note: "树叶碎光 / 圆形散景光斑 / 斜射光束"
      }
    ]
  },
  {
    id: "soft-focus",
    kind: "effect",
    summary:
      "画面滤镜：柔光变换——画面被一层扩散的柔和光线包住，轻微发亮发梦，适合温情、治愈、唯美调性",
    params: [
      { key: "opacity", defaultValue: 0.26, min: 0.06, max: 0.5, unit: "none", note: "柔光强度" },
      { key: "radiusPct", defaultValue: 60, min: 20, max: 100, unit: "%", note: "光晕扩散半径（占画幅短边）" },
      { key: "warmthPct", defaultValue: 60, min: 0, max: 100, unit: "%", note: "暖色程度（0=冷，100=暖）" }
    ]
  },
  {
    id: "strobe",
    kind: "effect",
    summary: "画面滤镜：一次/两次频闪——极短的亮闪把注意力瞬间拉回画面，适合街头、夜店、运动等强节奏题材",
    params: [
      { key: "opacity", defaultValue: 0.42, min: 0.1, max: 0.7, unit: "none", note: "闪光强度" },
      { key: "periodMs", defaultValue: 1600, min: 600, max: 4000, unit: "ms", note: "两次闪光的间隔" },
      { key: "flashes", defaultValue: 2, min: 1, max: 3, unit: "count", note: "一个循环内闪几次" },
      { key: "dutyPct", defaultValue: 12, min: 4, max: 30, unit: "%", note: "单次闪光占周期比例" }
    ]
  }
];

export const ALL_RECIPES: readonly MotionRecipe[] = [
  ...TEXT_ENTER_RECIPES,
  ...TEXT_IDLE_RECIPES,
  ...EFFECT_RECIPES
];

export function findRecipe(kind: MotionKind, id: string): MotionRecipe | undefined {
  return ALL_RECIPES.find((recipe) => recipe.kind === kind && recipe.id === id);
}

export function recipeIds(kind: MotionKind): readonly string[] {
  return ALL_RECIPES.filter((recipe) => recipe.kind === kind).map((recipe) => recipe.id);
}

/** 把参数夹到合法范围：未知键丢弃、缺省补默认、越界夹取。被修正的键会上报。 */
export function clampParams(
  recipe: MotionRecipe,
  params: Record<string, unknown> | undefined
): { params: Record<string, number>; corrected: string[] } {
  const output: Record<string, number> = {};
  const corrected: string[] = [];
  const input = params ?? {};

  for (const spec of recipe.params) {
    const raw = input[spec.key];
    if (raw === undefined) {
      output[spec.key] = spec.defaultValue;
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      output[spec.key] = spec.defaultValue;
      corrected.push(`${spec.key} 不是数字`);
      continue;
    }
    const clamped = Math.min(spec.max, Math.max(spec.min, raw));
    if (clamped !== raw) corrected.push(`${spec.key} ${raw} 超出 ${spec.min}–${spec.max}`);
    output[spec.key] = spec.unit === "count" || spec.unit === "ms" ? Math.round(clamped) : clamped;
  }

  for (const key of Object.keys(input)) {
    if (!recipe.params.some((spec) => spec.key === key)) corrected.push(`未知参数 ${key}`);
  }

  return { params: output, corrected };
}

/** 字符串选项同样要夹取：非法值回退默认，缺省补默认。 */
export function clampOptions(
  recipe: MotionRecipe,
  options: Record<string, unknown> | undefined
): { options: Record<string, string>; corrected: string[] } {
  const output: Record<string, string> = {};
  const corrected: string[] = [];
  for (const spec of recipe.enums ?? []) {
    const raw = options?.[spec.key];
    if (typeof raw === "string" && spec.values.includes(raw)) {
      output[spec.key] = raw;
    } else {
      if (raw !== undefined) corrected.push(`${spec.key} ${String(raw)} 不在 ${spec.values.join("/")} 内`);
      output[spec.key] = spec.defaultValue;
    }
  }
  return { options: output, corrected };
}

function describeRecipe(recipe: MotionRecipe): string {
  const params = recipe.params
    .map(
      (spec) =>
        `${spec.key} ${spec.min}–${spec.max}${spec.unit === "%" ? "%" : spec.unit === "none" ? "" : spec.unit}（默认 ${spec.defaultValue}，${spec.note}）`
    )
    .join("；");
  const enums = (recipe.enums ?? [])
    .map((spec) => `${spec.key} ∈ {${spec.values.join(" | ")}}（默认 ${spec.defaultValue}，${spec.note}）`)
    .join("；");
  return `- ${recipe.id}：${recipe.summary}。参数：${params}${enums ? `；选项：${enums}` : ""}`;
}

/** 生成给模型看的动效目录片段（与上面表格逐条对应）。 */
export function buildMotionCatalogPrompt(): string {
  return [
    "【文字入场 enter（每个文字块选 1 种）】",
    ...TEXT_ENTER_RECIPES.map(describeRecipe),
    "",
    "【文字循环 idle（可选，最多 1 种，幅度必须克制）】",
    ...TEXT_IDLE_RECIPES.map(describeRecipe),
    "",
    "【光效 / 图形层 effects（从里面挑 0–3 个，绝不抢文字）】",
    ...EFFECT_RECIPES.map(describeRecipe)
  ].join("\n");
}
