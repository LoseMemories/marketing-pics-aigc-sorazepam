import type {
  CompositionSpec,
  SceneAnalysis
} from "./design-assistant.schemas.js";

const EDGE_MARGIN = 0.04;

interface Point {
  x: number;
  y: number;
}

function resolveAnimation(
  layer: CompositionSpec["layers"][number]
): CompositionSpec["layers"][number]["animation"] {
  if (layer.animation) return layer.animation;
  if (layer.kind === "text") {
    return /title|hero|headline/.test(layer.id) ? "slide-up" : "fade";
  }
  if (/particle|snow|wind|air/.test(layer.id)) return "drift";
  if (/sweep|highlight|edge|line/.test(layer.id)) return "sweep";
  return "breathe";
}

function clamp(value: number): number {
  return Math.max(EDGE_MARGIN, Math.min(1 - EDGE_MARGIN, value));
}

/** 射线法判断点是否在多边形内（多边形为归一化坐标，点数 3–20）。 */
function pointInPolygon(points: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index];
    const last = points[previous];
    if (!current || !last) continue;
    const straddles = current.y > point.y !== last.y > point.y;
    if (straddles && point.x < ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x) {
      inside = !inside;
    }
  }
  return inside;
}

interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: ReadonlyArray<Point>;
}

function containsPoint(
  subject: RegionBounds,
  point: Point,
  padding = 0
): boolean {
  // 优先用主体外侧的避让多边形，没有再退回矩形。
  if (subject.points && subject.points.length >= 3 && pointInPolygon(subject.points, point)) {
    return true;
  }
  return point.x >= subject.x - padding
    && point.x <= subject.x + subject.width + padding
    && point.y >= subject.y - padding
    && point.y <= subject.y + subject.height + padding;
}

function centerOf(box: SceneAnalysis["safeZones"][number]): Point {
  return {
    x: clamp(box.x + box.width / 2),
    y: clamp(box.y + box.height / 2)
  };
}

function distanceSquared(left: Point, right: Point): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function anchorsCollide(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 0.34 && Math.abs(left.y - right.y) < 0.085;
}

function safeZoneSlots(anchor: Point, analysis: SceneAnalysis): Point[] {
  return [...analysis.safeZones]
    .sort((left, right) => distanceSquared(centerOf(left), anchor) - distanceSquared(centerOf(right), anchor))
    .flatMap((zone) => [0.5, 0.22, 0.78].map((verticalPosition) => ({
      x: clamp(zone.x + zone.width / 2),
      y: clamp(zone.y + zone.height * verticalPosition)
    })));
}

function resolveTextAnchor(anchor: Point, analysis: SceneAnalysis, usedAnchors: readonly Point[]): Point {
  const anchorIsOnSubject = analysis.subjectRegions.some((subject) => containsPoint(subject, anchor, 0.02));
  const anchorIsInSafeZone = analysis.safeZones.some((zone) => containsPoint(zone, anchor));
  const anchorCollides = usedAnchors.some((used) => anchorsCollide(used, anchor));

  if (!anchorCollides && (anchorIsInSafeZone || (analysis.safeZones.length === 0 && !anchorIsOnSubject))) {
    return anchor;
  }
  return safeZoneSlots(anchor, analysis)
    .find((candidate) => !usedAnchors.some((used) => anchorsCollide(used, candidate))) ?? anchor;
}

/**
 * 文字必须"成块"：kicker / subline / meta 与 headline 共用同一 x 锚点，
 * 按固定节奏垂直堆叠，避免短句散落在画面各处。
 */
const TEXT_STACK: ReadonlyArray<{ role: "kicker" | "headline" | "subline" | "meta"; offset: number }> = [
  { role: "kicker", offset: -0.062 },
  { role: "headline", offset: 0 },
  { role: "subline", offset: 0.058 },
  { role: "meta", offset: 0.104 }
];

function groupTextLayers(
  layers: CompositionSpec["layers"]
): CompositionSpec["layers"] {
  const textIndexes = layers
    .map((layer, index) => ({ layer, index }))
    .filter((entry) => entry.layer.kind === "text");
  if (textIndexes.length < 2) return layers;

  const headline =
    textIndexes.find((entry) => entry.layer.role === "headline") ??
    textIndexes.find((entry) => /hero|title|headline/.test(entry.layer.id)) ??
    textIndexes[0];
  if (!headline) return layers;

  const baseX = headline.layer.x;
  const baseY = headline.layer.y;
  const next = layers.map((layer) => ({ ...layer }));

  for (const { layer, index } of textIndexes) {
    if (index === headline.index) continue;
    const slot = TEXT_STACK.find((entry) => entry.role === layer.role);
    if (!slot) continue;
    const target = next[index];
    if (!target) continue;
    target.x = clamp(baseX);
    target.y = clamp(baseY + slot.offset);
  }
  return next as CompositionSpec["layers"];
}

/**
 * 光点也要避开主体：只对「避让多边形」做判定，避免把贴边但合理的粒子也挪走。
 */
function resolvePulseAnchor(anchor: Point, analysis: SceneAnalysis, slot: number): Point {
  const insideSubject = analysis.subjectRegions.some(
    (subject) => subject.points && subject.points.length >= 3 && pointInPolygon(subject.points, anchor)
  );
  if (!insideSubject || analysis.safeZones.length === 0) return anchor;
  const zone = [...analysis.safeZones]
    .sort((left, right) => distanceSquared(centerOf(left), anchor) - distanceSquared(centerOf(right), anchor))[0];
  if (!zone) return anchor;
  const horizontal = [0.28, 0.5, 0.72][slot % 3] ?? 0.5;
  const vertical = [0.3, 0.7][slot % 2] ?? 0.5;
  return {
    x: clamp(zone.x + zone.width * horizontal),
    y: clamp(zone.y + zone.height * vertical)
  };
}

/**
 * Enforces the coordinate contract even when a model returns a merely plausible layout.
 * Text anchors are moved to the nearest analyzed safe zone when they overlap a subject.
 */
export function constrainCompositionToScene(
  spec: CompositionSpec,
  analysis: SceneAnalysis,
  options: { keepLayout?: boolean } = {}
): CompositionSpec {
  if (options.keepLayout) {
    // L3 已经算好了锚点、边距与堆叠，这里只做「不越界 + 补动画」两项保底。
    return {
      ...spec,
      layers: spec.layers.map((layer) => ({
        ...layer,
        animation: resolveAnimation(layer),
        x: clamp(layer.x),
        y: clamp(layer.y)
      }))
    };
  }
  const usedTextAnchors: Point[] = [];
  let pulseIndex = 0;
  const positioned = spec.layers.map((layer) => {
    const boundedAnchor = { x: clamp(layer.x), y: clamp(layer.y) };
    const anchor = layer.kind === "text"
      ? resolveTextAnchor(boundedAnchor, analysis, usedTextAnchors)
      : resolvePulseAnchor(boundedAnchor, analysis, pulseIndex++);
    if (layer.kind === "text") usedTextAnchors.push(anchor);
    return {
      ...layer,
      animation: resolveAnimation(layer),
      x: anchor.x,
      y: anchor.y
    };
  });

  return {
    ...spec,
    layers: groupTextLayers(positioned)
  };
}
