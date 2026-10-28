const supportedAnimations = new Set([
  "fade",
  "slide-up",
  "slide-left",
  "slide-right",
  "breathe",
  "drift",
  "sweep"
]);

const ROLES = new Set(["headline", "subline", "meta", "kicker"]);
const ENTER_TYPES = new Set([
  "fade",
  "slide-up",
  "slide-left",
  "slide-right",
  "mask-reveal",
  "rise",
  "through"
]);
const EASES = new Set(["linear", "outCubic", "outQuint", "inOutSine"]);
const IDLES = new Set(["float-y", "breathe", "glow-pulse"]);
const ALIGNS = new Set(["left", "center", "right"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(value: unknown, allowed: Set<string>): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, min: number, max: number): number | undefined {
  const clamped = clampNumber(value, min, max);
  return clamped === undefined ? undefined : Math.round(clamped);
}

function inferAnimation(kind: string, hasText: boolean): string {
  if (hasText) return /hero|title|headline/.test(kind) ? "slide-up" : "fade";
  if (/particle|snow|wind|air|drift/.test(kind)) return "drift";
  if (/sweep|highlight|edge|line|streak/.test(kind)) return "sweep";
  return "breathe";
}

/** 模型偶尔会给出枚举表外的值，这里直接丢弃而不是让整份方案失败。 */
function normalizeEnter(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const type = pick(value.type, ENTER_TYPES);
  if (!type) return undefined;
  const durationMs = clampInt(value.durationMs, 60, 4000) ?? 400;
  const startMs = clampInt(value.startMs, 0, 8000) ?? 0;
  const ease = pick(value.ease, EASES);
  return { type, startMs, durationMs, ...(ease ? { ease } : {}) };
}

function normalizeIdle(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const type = pick(value.type, IDLES);
  if (!type) return undefined;
  const amplitude = clampNumber(value.amplitude, 0, 0.2);
  const periodMs = clampInt(value.periodMs, 400, 8000);
  return {
    type,
    ...(amplitude === undefined ? {} : { amplitude }),
    ...(periodMs === undefined ? {} : { periodMs })
  };
}

/** Converts model-friendly semantic layer names into the small executable Canvas DSL. */
export function normalizeCompositionOutput(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.layers)) return raw;
  return {
    ...raw,
    layers: raw.layers.map((value) => {
      if (!isRecord(value)) return value;
      const sourceKind = typeof value.kind === "string" ? value.kind.toLowerCase() : "";
      const sourceId = typeof value.id === "string" ? value.id.toLowerCase() : "";
      const semantics = `${sourceKind} ${sourceId}`;
      const hasText = typeof value.text === "string" && value.text.trim().length > 0;
      const kind = sourceKind === "text" || hasText ? "text" : "pulse";
      const animation = typeof value.animation === "string" && supportedAnimations.has(value.animation)
        ? value.animation
        : inferAnimation(semantics, hasText);

      const role = pick(value.role, ROLES);
      const align = pick(value.align, ALIGNS);
      const size = clampNumber(value.size, 0.01, 0.2);
      const weight = clampInt(value.weight, 300, 900);
      const tracking = clampNumber(value.tracking, -0.1, 0.3);
      const enter = normalizeEnter(value.enter);
      const idle = normalizeIdle(value.idle);

      return {
        ...value,
        kind,
        animation,
        ...(role ? { role } : {}),
        ...(align ? { align } : {}),
        ...(size === undefined ? {} : { size }),
        ...(weight === undefined ? {} : { weight }),
        ...(tracking === undefined ? {} : { tracking }),
        ...(enter ? { enter } : {}),
        ...(idle ? { idle } : {}),
        ...(typeof value.occlude === "boolean" ? { occlude: value.occlude } : {})
      };
    })
  };
}
