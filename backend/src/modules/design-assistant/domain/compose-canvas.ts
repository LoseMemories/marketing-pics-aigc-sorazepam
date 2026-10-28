import type { CompositionSpec, SceneAnalysis } from "./design-assistant.schemas.js";
import type { AnchorSpan, DecisionGrid, LayoutPlan } from "./layout-plan.js";
import type { DesignBlock, DesignSpec } from "./design-spec.schemas.js";
import { constrainCompositionToScene } from "./composition-layout.js";

/**
 * L3：把 L2 的设计语汇解算成渲染器认识的 CompositionSpec。
 *
 * 纯函数：同样的 DesignSpec + LayoutPlan + 媒体信息，永远得到同样的结果，
 * 所以前端编辑时只重跑这一层（不调模型），毫秒级出图。
 *
 * 这里额外负责两条**硬排版规则**（模型不该管，也管不准）：
 * 1) 所有文字距画幅边缘 ≥ MARGIN（10%）；
 * 2) 各级文字之间不许重叠 —— 用估算的文字盒做干涉消解。
 */

const EDGE_MARGIN = 0.1;
const PACE_FACTOR: Record<DesignSpec["beats"]["pace"], number> = {
  slow: 1.25,
  medium: 1,
  fast: 0.8
};
const STAGGER_MS = 140;
const BLOCK_GAP_RATIO = 0.25;

type Layer = CompositionSpec["layers"][number];
type EnterType = NonNullable<Layer["enter"]>["type"];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function spanRect(span: AnchorSpan, grid: DecisionGrid): Rect {
  return {
    x: span.colStart / grid.cols,
    y: span.rowStart / grid.rows,
    width: (span.colEnd - span.colStart + 1) / grid.cols,
    height: (span.rowEnd - span.rowStart + 1) / grid.rows
  };
}

/** 锚点 id → 归一化矩形。未知锚点退化成整幅安全内框。 */
export function resolveAnchorRect(ref: string, plan: LayoutPlan, analysis: SceneAnalysis): Rect {
  if (ref === "textAnchor") return spanRect(plan.textAnchor, plan.grid);
  if (ref === "secondaryAnchor" && plan.secondaryAnchor) {
    return spanRect(plan.secondaryAnchor, plan.grid);
  }
  const zoneMatch = /^safeZone:(\d{1,2})$/.exec(ref);
  if (zoneMatch) {
    const zone = analysis.safeZones[Number(zoneMatch[1])];
    if (zone) return { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
  }
  return { x: EDGE_MARGIN, y: EDGE_MARGIN, width: 1 - EDGE_MARGIN * 2, height: 1 - EDGE_MARGIN * 2 };
}

/** 字号（相对短边）换算成「占画幅高度的比例」。 */
function verticalUnit(frameRatio: number): number {
  return Math.min(1, frameRatio);
}

/** 字号（相对短边）换算成「单个字符占画幅宽度的比例」。 */
function horizontalUnit(frameRatio: number): number {
  return frameRatio < 1 ? 1 : 1 / frameRatio;
}

function anchorKey(block: DesignBlock): string {
  // 同一锚点 + 同一对齐 = 同一个文字组；dxPct/dyPct 只作为整组微调，
  // 否则模型给每个块加 1–2% 的微小偏移就会把它们拆成多个互相覆盖的组。
  return `${block.anchor.ref}|${block.align}`;
}

function numericParam(source: { params: Record<string, number> }, key: string, fallback: number): number {
  const value = source.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 估算文字盒（归一化）：用于 10% 边距与「各级文字不重叠」的干涉消解。 */
function estimateBox(block: DesignBlock, frameRatio: number): Box {
  const lines = block.text.split("\n");
  const longest = Math.max(...lines.map((line) => [...line].length), 1);
  const width = Math.min(
    1 - EDGE_MARGIN * 2,
    longest * block.sizeRatio * horizontalUnit(frameRatio) * block.transform.scaleX
  );
  const height =
    lines.length * block.sizeRatio * block.lineHeight * verticalUnit(frameRatio) * block.transform.scaleY;
  return { x0: 0, y0: 0, x1: width, y1: height };
}

export interface ComposeCanvasInput {
  design: DesignSpec;
  plan: LayoutPlan;
  analysis: SceneAnalysis;
  durationMs: number;
}

export function composeCanvas(input: ComposeCanvasInput): CompositionSpec {
  const { design, plan, analysis, durationMs } = input;
  const pace = PACE_FACTOR[design.beats.pace] ?? 1;
  const frameRatio = plan.frameRatio;

  // ---- 1) 先把每个文字块的「目标中心点」算出来（锚点 + 偏移 + 同锚点堆叠）----
  const groups = new Map<string, DesignBlock[]>();
  for (const block of design.blocks) {
    const key = anchorKey(block);
    const group = groups.get(key);
    if (group) group.push(block);
    else groups.set(key, [block]);
  }

  const placed: Array<{
    block: DesignBlock;
    box: Box;
    scaleHint: number;
  }> = [];

  let groupIndex = 0;
  for (const blocks of groups.values()) {
    const first = blocks[0];
    if (!first) continue;
    const rect = resolveAnchorRect(first.anchor.ref, plan, analysis);
    const meanOffset = (pick: (block: DesignBlock) => number) =>
      blocks.reduce((sum, block) => sum + pick(block), 0) / blocks.length;
    const centerX = rect.x + rect.width / 2 + meanOffset((block) => block.anchor.dxPct) / 100;
    const centerY = rect.y + rect.height / 2 + meanOffset((block) => block.anchor.dyPct) / 100;

    const boxes = blocks.map((block) => estimateBox(block, frameRatio));
    const total = boxes.reduce((sum, box) => sum + (box.y1 - box.y0), 0);
    let cursor = centerY - total / 2;

    blocks.forEach((block, index) => {
      const size = boxes[index] ?? { x0: 0, y0: 0, x1: 0.2, y1: 0.04 };
      const height = size.y1 - size.y0;
      placed.push({
        block,
        box: { x0: 0, y0: cursor, x1: size.x1, y1: cursor + height },
        scaleHint: 1
      });
      cursor += height * (1 + BLOCK_GAP_RATIO) + block.sizeRatio * verticalUnit(frameRatio) * 0.2;
    });
    groupIndex += 1;
  }

  // ---- 2) 干涉消解：按 y 排序后把重叠的块向下推，再统一夹到 10% 边距内 ----
  placed.sort((left, right) => left.box.y0 - right.box.y0);
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const upper = placed[i];
        const lower = placed[j];
        if (!upper || !lower) continue;
        const overlapY = Math.min(upper.box.y1, lower.box.y1) - Math.max(upper.box.y0, lower.box.y0);
        const overlapX = Math.min(upper.box.x1, lower.box.x1) - Math.max(upper.box.x0, lower.box.x0);
        if (overlapY <= 0 || overlapX <= 0) continue;
        lower.box.y0 += overlapY + 0.008;
        lower.box.y1 += overlapY + 0.008;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // ---- 3) 统一夹进 10% 边距，并输出图层 ----
  const layers: Layer[] = [];
  const textSpans: Array<{ x0: number; x1: number; minY: number; maxY: number }> = [];

  placed.forEach((item, index) => {
    const block = item.block;
    const rect = resolveAnchorRect(block.anchor.ref, plan, analysis);
    const boxWidth = item.box.x1 - item.box.x0;
    const boxHeight = item.box.y1 - item.box.y0;

    // 垂直：先夹进边距，再回写
    let y0 = Math.max(EDGE_MARGIN, Math.min(1 - EDGE_MARGIN - boxHeight, item.box.y0));
    const centerY = y0 + boxHeight / 2;

    // 水平：以锚点为基准，按对齐方式算锚点，再保证整盒不越界
    const baseX =
      block.align === "left"
        ? rect.x + EDGE_MARGIN / 2 + block.anchor.dxPct / 100
        : block.align === "right"
          ? rect.x + rect.width - EDGE_MARGIN / 2 + block.anchor.dxPct / 100
          : rect.x + rect.width / 2 + block.anchor.dxPct / 100;

    const minX = EDGE_MARGIN + (block.align === "left" ? 0 : block.align === "center" ? boxWidth / 2 : boxWidth);
    const maxX =
      1 - EDGE_MARGIN - (block.align === "left" ? boxWidth : block.align === "center" ? boxWidth / 2 : 0);
    const x = Math.max(minX, Math.min(maxX, baseX));

    const startMs = Math.max(
      0,
      Math.round(design.beats.startMs + index * STAGGER_MS * pace)
    );
    const enterDuration = Math.max(
      120,
      Math.min(
        Math.max(160, durationMs - startMs),
        Math.round(numericParam(block.enter, "durationMs", 420) * pace)
      )
    );

    textSpans.push({
      x0: block.align === "left" ? x : block.align === "center" ? x - boxWidth / 2 : x - boxWidth,
      x1: block.align === "left" ? x + boxWidth : block.align === "center" ? x + boxWidth / 2 : x,
      minY: centerY - boxHeight / 2,
      maxY: centerY + boxHeight / 2
    });

    layers.push({
      id: block.id,
      kind: "text",
      role: block.role,
      text: block.text,
      size: Math.round(block.sizeRatio * 10000) / 10000,
      weight: block.weight,
      tracking: block.tracking,
      align: block.align,
      font: block.font,
      text3d: block.text3d,
      transform: block.transform,
      occlude: block.occlude,
      enter: {
        type: block.enter.id as EnterType,
        startMs,
        durationMs: enterDuration,
        ease: "outCubic",
        from: {
          dx: block.path.fromDxPct / 100,
          dy: block.path.fromDyPct / 100,
          scale: block.path.fromScale
        },
        toScale: block.path.toScale,
        ...(numericParam(block.enter, "perspectiveDeg", 0) > 0
          ? { perspectiveDeg: numericParam(block.enter, "perspectiveDeg", 28) }
          : {})
      },
      ...(block.idle
        ? {
            idle: {
              type: block.idle.id === "float-y" ? ("float-y" as const) : ("breathe" as const),
              amplitude:
                block.idle.id === "float-y"
                  ? numericParam(block.idle, "amplitudePct", 0.4) / 100
                  : numericParam(block.idle, "scalePct", 2.5) / 100,
              periodMs: Math.round(numericParam(block.idle, "periodMs", 2400))
            }
          }
        : {}),
      startMs,
      endMs: Math.max(startMs + enterDuration, durationMs),
      x: Math.round(x * 10000) / 10000,
      y: Math.round(centerY * 10000) / 10000,
      color: design.palette.text
    });
  });

  // ---- 4) 光效 / 图形层 ----
  const accent = design.palette.accent ?? design.palette.support ?? design.palette.text;

  const ANIMATION_MAP: Record<string, NonNullable<Layer["animation"]>> = {
    sweep: "sweep",
    drift: "drift",
    "breathing-dot": "dot",
    "subject-outline": "outline",
    "icon-marker": "marker",
    "laser-overlay": "laser",
    "glow-mask": "glow",
    "soft-focus": "soft",
    strobe: "strobe"
  };

  /** 整幅滤镜类效果：铺满画面，位置固定居中，不参与避让。 */
  const FULL_FRAME_EFFECTS = new Set(["laser-overlay", "glow-mask", "soft-focus", "strobe"]);

  design.effects.forEach((effect, index) => {
    const color =
      effect.colorRef === "text"
        ? design.palette.text
        : effect.colorRef === "accent"
          ? accent
          : effect.colorRef === "support"
            ? (design.palette.support ?? design.palette.text)
            : effect.colorRef;

    const isLaser = FULL_FRAME_EFFECTS.has(effect.id);
    const rect = resolveAnchorRect(effect.anchor.ref, plan, analysis);
    const requestedX = rect.x + rect.width / 2 + effect.anchor.dxPct / 100;
    const requestedY = rect.y + rect.height / 2 + effect.anchor.dyPct / 100;

    // 光效不能压在文字上：落在文字盒里就横向让开，没地方再改到文字块下方。
    let x = requestedX;
    let y = requestedY;
    if (!isLaser) {
      const pad = 0.035;
      const hit = textSpans.find(
        (span) =>
          x > span.x0 - pad &&
          x < span.x1 + pad &&
          y > span.minY - pad &&
          y < span.maxY + pad
      );
      if (hit) {
        const rightX = hit.x1 + 0.07;
        const leftX = hit.x0 - 0.07;
        if (rightX <= 1 - EDGE_MARGIN) x = rightX;
        else if (leftX >= EDGE_MARGIN) x = leftX;
        else y = Math.min(1 - EDGE_MARGIN, hit.maxY + 0.07);
      }
    }

    layers.push({
      id: `effect-${index + 1}`,
      kind: "pulse",
      animation: ANIMATION_MAP[effect.id] ?? "breathe",
      size: Math.round((effect.params.radiusPct ?? effect.params.sizePct ?? effect.params.widthPct ?? 18) * 100) / 10000,
      startMs: Math.max(0, Math.round(design.beats.startMs + 200 * pace)),
      endMs: durationMs,
      x: Math.round((isLaser ? 0.5 : clamp01(x)) * 10000) / 10000,
      y: Math.round((isLaser ? 0.5 : clamp01(y)) * 10000) / 10000,
      color,
      params: effect.params,
      ...(effect.options.style ? { style: effect.options.style } : {}),
      ...(effect.options.mode ? { mode: effect.options.mode } : {}),
      ...(effect.options.glyph ? { glyph: effect.options.glyph } : {}),
      ...(effect.options.pattern ? { pattern: effect.options.pattern } : {})
    });
  });

  const spec: CompositionSpec = { version: 1, durationMs, layers };
  // ---- 5) 最后再压一次：任何层落到主体多边形上都拉回来（L1 的硬约束） ----
  const constrained = constrainCompositionToScene(spec, analysis, { keepLayout: true });
  // ---- 6) 约束可能把光效推进文字区，最后再过一遍，保证光效不压字 ----
  const spanById = new Map(
    placed.map((item) => [item.block.id, item.box] as const)
  );
  const finalSpans = constrained.layers
    .filter((layer) => layer.kind === "text")
    .map((layer) => {
      const box = spanById.get(layer.id);
      const width = box ? box.x1 - box.x0 : 0.22;
      const height = box ? box.y1 - box.y0 : (layer.size ?? 0.05) * 1.4;
      const x0 =
        layer.align === "left"
          ? layer.x
          : layer.align === "center"
            ? layer.x - width / 2
            : layer.x - width;
      return { x0, x1: x0 + width, minY: layer.y - height / 2, maxY: layer.y + height / 2 };
    });

  return {
    ...constrained,
    layers: constrained.layers.map((layer) => {
      if (layer.kind !== "pulse") return layer;
      if (layer.animation === "laser" || layer.animation === "glow" || layer.animation === "soft" || layer.animation === "strobe") {
        return layer;
      }
      const pad = 0.03;
      const hit = finalSpans.find(
        (span) =>
          layer.x > span.x0 - pad &&
          layer.x < span.x1 + pad &&
          layer.y > span.minY - pad &&
          layer.y < span.maxY + pad
      );
      if (!hit) return layer;
      const rightX = hit.x1 + 0.06;
      const leftX = hit.x0 - 0.06;
      if (rightX <= 1 - EDGE_MARGIN) {
        return { ...layer, x: Math.round(rightX * 10000) / 10000 };
      }
      if (leftX >= EDGE_MARGIN) {
        return { ...layer, x: Math.round(leftX * 10000) / 10000 };
      }
      return { ...layer, y: Math.round(Math.min(1 - EDGE_MARGIN, hit.maxY + 0.06) * 10000) / 10000 };
    })
  };
}
