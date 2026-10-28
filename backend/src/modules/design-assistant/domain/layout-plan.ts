import type { SceneAnalysis } from "./design-assistant.schemas.js";
import { planEffectPalette, type EffectPalette } from "./effect-palette.js";
import {
  buildSubjectHeat,
  buildUnionHeat,
  columnFreeSpan,
  heatCentroid,
  heatInBounds,
  sampleGridFor,
  type FreeSpan,
  type HeatBounds,
  type HeatGrid
} from "./subject-heat.js";

export type SubjectScale = "small" | "medium" | "large";
export type TextColumn = "left" | "center" | "right";

export type LayoutStrategy =
  | "full-bleed"
  | "full-band"
  | "side-block"
  | "column-stack"
  | "edge-small"
  | "wrap-subject";

/** 决策网格：按画面比例自适应，3×3 / 3×4 / 4×3 / 更细。 */
export interface DecisionGrid {
  cols: number;
  rows: number;
}

/**
 * 文字承载区。可以是单格，也可以是「连续非热区」合并出来的一条横带 / 竖带。
 * L1 只做构图探查，这个矩形是建议，L2 可以整体推翻。
 */
export interface AnchorSpan {
  id: string;
  label: string;
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  /** 该矩形内的平均热区（0–1，越小越空）。 */
  heat: number;
  /** 该矩形落在模型安全区内的比例（0–1）。 */
  safe: number;
  /** 综合评分（含配重收益），仅用于排序与展示。 */
  score: number;
  /** 覆盖的决策格格数，1 表示没有合并。 */
  cells: number;
}

export interface PlannedSubject {
  label: string;
  importance?: "primary" | "secondary";
  areaRatio: number;
  center: { x: number; y: number };
  /** 该主体的代表色，特效与文字需要留意。 */
  colors?: string[];
}

/** 单个决策格的评分明细。 */
export interface HeatCell {
  col: number;
  row: number;
  score: number;
  /** 该格被主体覆盖的程度（0–1，越小越空）。 */
  heat: number;
  /** 该格落在模型标注的安全区内的比例（0–1，越大越干净）。 */
  safe: number;
  counterX: number;
  counterY: number;
}

/** 分析阶段给出的文字安全区，原样传给 L2（含原因与底色）。 */
export interface SafeZoneHint {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  colors?: string[];
}

export interface LayoutPlan {
  subjectCount: number;
  /** all=未指定主体（全画面）；explicit=按选择；unmatched=选了但与主体标签不一致。 */
  selection: "all" | "explicit" | "unmatched";
  /** 主体像素的并集覆盖率（0–1，重叠部分只算一次）。 */
  areaRatio: number;
  scale: SubjectScale;
  /** 主体热区重心所在的决策格。 */
  dominantRegion: string;
  /** 决策网格（按画面比例自适应）。 */
  grid: DecisionGrid;
  /** 画面宽高比（宽 / 高）。 */
  frameRatio: number;
  /** 主文字承载区（可能是合并出来的带子）。 */
  textAnchor: AnchorSpan;
  /** 收尾小字的承载区，落在主文字下方；没有合适位置时为 null。 */
  secondaryAnchor: AnchorSpan | null;
  /** 整块文字所在的纵向条带。 */
  textColumn: TextColumn;
  /** 该条带里最长的连续干净区间。 */
  freeColumn: FreeSpan;
  /** 决策格里的峰值热区。 */
  peakHeat: number;
  /** 合并阈值 = 峰值 × MERGE_RATIO，写在输出里便于核对。 */
  mergeThreshold: number;
  strategy: LayoutStrategy;
  /** 主标题字号建议区间（相对画幅短边）。 */
  headlineSizeRange: [number, number];
  rationale: string;
  /** 直接拼进 L2 设计师提示词的一段说明。 */
  designerBrief: string;
  subjects: PlannedSubject[];
  /** 与主文字区重叠最大的安全区（分析原始数据）。 */
  safeZone: SafeZoneHint | null;
  /** 分析阶段给出的全部安全区，连同 reason 一起交给 L2。 */
  safeZones: SafeZoneHint[];
  /** 新增特效配色参考（L2 决定最终用哪套）。 */
  palette: EffectPalette;
  /** 决策格评分，按总分从高到低。 */
  candidates: HeatCell[];
  /** 主体热区网格（行优先），供前端可视化与 L2 参考。 */
  heat: HeatGrid;
}

interface Region {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  importance?: "primary" | "secondary";
  points?: ReadonlyArray<{ x: number; y: number }>;
  colors?: readonly string[];
}

interface Rect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 按画面比例选决策网格。
 *
 * 近正方形 / 3:4 / 5:7 这类不明显的长形仍用 3×3 —— 九宫格在这里已经够用。
 * 接近 16:9 / 9:16 的明显长图换成 4×3 / 3×4，更长的继续加密，
 * 否则一个格子在视觉上被拉得过长，热区判断会失真。
 */
export function decisionGridFor(frame: { width: number; height: number }): DecisionGrid {
  const ratio = frame.width / Math.max(1, frame.height);
  if (ratio >= 1.5) return { cols: clamp(Math.round(2 * ratio), 4, 6), rows: 3 };
  if (ratio <= 0.667) return { cols: 3, rows: clamp(Math.round(2 / ratio), 4, 6) };
  return { cols: 3, rows: 3 };
}

/** 评分权重：先保证不压主体，再保证构图配重，最后才看模型给的干净度。 */
const WEIGHT = {
  heat: 3.2,
  counterX: 1.6,
  counterY: 0.6,
  safe: 1.0,
  area: 0.3
} as const;

/**
 * 合并阈值取「决策格峰值热区」的这个比例。
 * L1 只是一次构图探查，用相对判断比写死绝对值更稳：
 * 峰值 97% 时阈值 29%，峰值 40% 时阈值 12%，随画面自适应。
 */
const MERGE_RATIO = 0.3;

/** 小字可以贴在次要主体上，但不能压主主体。 */
const SECONDARY_HEAT_LIMIT = 0.7;

/** 主体重心离画幅中线多近时，认为不需要左右配重。 */
const CENTERED_TOLERANCE = 0.06;

function rowShort(row: number, rows: number): string {
  if (row === 0) return "上";
  if (row === rows - 1) return "下";
  if (rows === 3 && row === 1) return "中";
  return `第${row + 1}行`;
}

function rowFull(row: number, rows: number): string {
  if (row === 0) return "上方";
  if (row === rows - 1) return "下方";
  if (rows === 3 && row === 1) return "中部";
  return `第${row + 1}行`;
}

function colShort(col: number, cols: number): string {
  if (col === 0) return "左";
  if (col === cols - 1) return "右";
  if (cols === 3 && col === 1) return "中";
  return `第${col + 1}列`;
}

function colFull(col: number, cols: number): string {
  if (col === 0) return "左侧";
  if (col === cols - 1) return "右侧";
  if (cols === 3 && col === 1) return "中部";
  return `第${col + 1}列`;
}

function regionArea(region: Region): number {
  // 用外接矩形估算单个主体的占比；整体占比另用热区并集算，避免重叠重复计数。
  return region.width * region.height;
}

function scaleOf(unionCoverage: number): SubjectScale {
  if (unionCoverage < 0.1) return "small";
  if (unionCoverage < 0.28) return "medium";
  return "large";
}

function boundsOf(rect: Rect, grid: DecisionGrid): HeatBounds {
  return {
    x: rect.c0 / grid.cols,
    y: rect.r0 / grid.rows,
    width: (rect.c1 - rect.c0 + 1) / grid.cols,
    height: (rect.r1 - rect.r0 + 1) / grid.rows
  };
}

function rectId(rect: Rect): string {
  return `c${rect.c0}-${rect.c1}_r${rect.r0}-${rect.r1}`;
}

function spanLabel(rect: Rect, grid: DecisionGrid): string {
  const width = rect.c1 - rect.c0 + 1;
  const height = rect.r1 - rect.r0 + 1;
  if (width === grid.cols && height === grid.rows) return "整屏";
  if (width === grid.cols) {
    return rect.r0 === rect.r1
      ? `${rowFull(rect.r0, grid.rows)}整条带`
      : `${rowFull(rect.r0, grid.rows)}–${rowFull(rect.r1, grid.rows)} 整宽带`;
  }
  if (height === grid.rows) {
    return rect.c0 === rect.c1
      ? `${colFull(rect.c0, grid.cols)}整条带`
      : `${colFull(rect.c0, grid.cols)}–${colFull(rect.c1, grid.cols)} 整高带`;
  }
  if (width === 1 && height === 1) {
    const middleRow = grid.rows === 3 && rect.r0 === 1;
    const middleCol = grid.cols === 3 && rect.c0 === 1;
    if (middleRow && middleCol) return "画面正中";
    if (middleRow) return `${colFull(rect.c0, grid.cols)}居中`;
    return `${colShort(rect.c0, grid.cols)}${rowShort(rect.r0, grid.rows)}`;
  }
  if (height === 1) return `${rowFull(rect.r0, grid.rows)} ${width}/${grid.cols} 横带`;
  if (width === 1) return `${colFull(rect.c0, grid.cols)} ${height}/${grid.rows} 竖带`;
  return `${colFull(rect.c0, grid.cols)}${rowFull(rect.r0, grid.rows)} ${width}×${height} 区`;
}

function safeZoneCoverage(bounds: HeatBounds, zones: readonly HeatBounds[]): number {
  if (zones.length === 0) return 0;
  const steps = 6;
  let hits = 0;
  for (let row = 0; row < steps; row += 1) {
    for (let col = 0; col < steps; col += 1) {
      const px = bounds.x + ((col + 0.5) / steps) * bounds.width;
      const py = bounds.y + ((row + 0.5) / steps) * bounds.height;
      const inside = zones.some(
        (zone) => px >= zone.x && px <= zone.x + zone.width && py >= zone.y && py <= zone.y + zone.height
      );
      if (inside) hits += 1;
    }
  }
  return hits / (steps * steps);
}

/** 任意矩形的综合评分：避让热区 + 与主体配重 + 模型安全区。 */
function scoreBounds(
  bounds: HeatBounds,
  heat: number,
  safe: number,
  centroid: { x: number; y: number }
): number {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const centeredX = Math.abs(centroid.x - 0.5) < CENTERED_TOLERANCE;
  // 主体偏在一侧时，文字优先落在另一侧以取得平衡。
  const counterX = centeredX ? 0 : clamp((centerX - centroid.x) * 2, -1, 1);
  // 主体压在下半部时，文字优先往上走。
  const counterY = clamp((centroid.y - centerY) * 2, -1, 1);
  return (
    -WEIGHT.heat * heat +
    WEIGHT.counterX * counterX +
    WEIGHT.counterY * counterY +
    WEIGHT.safe * safe +
    WEIGHT.area * (bounds.width * bounds.height)
  );
}

function scoreCells(input: {
  heat: HeatGrid;
  grid: DecisionGrid;
  centroid: { x: number; y: number };
  safeZones: readonly HeatBounds[];
}): HeatCell[] {
  const cells: HeatCell[] = [];
  const centeredX = Math.abs(input.centroid.x - 0.5) < CENTERED_TOLERANCE;
  for (let row = 0; row < input.grid.rows; row += 1) {
    for (let col = 0; col < input.grid.cols; col += 1) {
      const bounds = boundsOf({ c0: col, c1: col, r0: row, r1: row }, input.grid);
      const heat = heatInBounds(input.heat, bounds);
      const safe = safeZoneCoverage(bounds, input.safeZones);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      cells.push({
        col,
        row,
        score: Number(scoreBounds(bounds, heat, safe, input.centroid).toFixed(4)),
        heat: Number(heat.toFixed(4)),
        safe: Number(safe.toFixed(3)),
        counterX: Number((centeredX ? 0 : clamp((centerX - input.centroid.x) * 2, -1, 1)).toFixed(3)),
        counterY: Number(clamp((input.centroid.y - centerY) * 2, -1, 1).toFixed(3))
      });
    }
  }
  return cells.sort((left, right) => right.score - left.score);
}

function heatOfCell(heat: HeatGrid, grid: DecisionGrid, row: number, col: number): number {
  return heatInBounds(heat, boundsOf({ c0: col, c1: col, r0: row, r1: row }, grid));
}

/**
 * 主轴：主体在哪个方向偏得多，文字就往那个方向铺开。
 * 主体压在下半部 → 铺横带；主体偏在一侧 → 铺竖带。
 */
function preferredAxis(centroid: { x: number; y: number }): "row" | "col" {
  const vertical = Math.abs(centroid.y - 0.5) * 2;
  const horizontal = Math.abs(centroid.x - 0.5) * 2;
  return vertical >= horizontal ? "row" : "col";
}

/** 把种子所在的整行 / 整列当作一条带，看它整体的热区。 */
function bandHeat(
  heat: HeatGrid,
  grid: DecisionGrid,
  axis: "row" | "col",
  seed: { row: number; col: number }
): number {
  const band: Rect = axis === "row"
    ? { c0: 0, c1: grid.cols - 1, r0: seed.row, r1: seed.row }
    : { c0: seed.col, c1: seed.col, r0: 0, r1: grid.rows - 1 };
  return heatInBounds(heat, boundsOf(band, grid));
}

interface AxisBounds {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
}

/**
 * 沿一根轴把种子铺成一条带，只吞「单格热区」达标的相邻格。
 *
 * 只走一根轴：结果必然是一条横带或一条竖带，不会拐成既不像横也不像竖的方块。
 */
function growAlongAxis(
  input: { heat: HeatGrid; grid: DecisionGrid; coldLimit: number; bounds: AxisBounds },
  seed: { row: number; col: number },
  axis: "row" | "col"
): Rect {
  const rect: Rect = { c0: seed.col, c1: seed.col, r0: seed.row, r1: seed.row };
  for (let step = 0; step < input.grid.cols * input.grid.rows; step += 1) {
    const moves: Array<{ apply: () => void; heat: number }> = [];
    if (axis === "row") {
      if (rect.c0 > input.bounds.colMin) {
        const col = rect.c0 - 1;
        moves.push({
          apply: () => {
            rect.c0 = col;
          },
          heat: heatOfCell(input.heat, input.grid, rect.r0, col)
        });
      }
      if (rect.c1 < input.bounds.colMax) {
        const col = rect.c1 + 1;
        moves.push({
          apply: () => {
            rect.c1 = col;
          },
          heat: heatOfCell(input.heat, input.grid, rect.r0, col)
        });
      }
    } else {
      if (rect.r0 > input.bounds.rowMin) {
        const row = rect.r0 - 1;
        moves.push({
          apply: () => {
            rect.r0 = row;
          },
          heat: heatOfCell(input.heat, input.grid, row, rect.c0)
        });
      }
      if (rect.r1 < input.bounds.rowMax) {
        const row = rect.r1 + 1;
        moves.push({
          apply: () => {
            rect.r1 = row;
          },
          heat: heatOfCell(input.heat, input.grid, row, rect.c0)
        });
      }
    }
    const viable = moves.filter((move) => move.heat <= input.coldLimit);
    if (viable.length === 0) break;
    // 先吞更冷的一侧，避免为了凑面积去啃半热的边。
    viable.sort((left, right) => left.heat - right.heat);
    viable[0]!.apply();
  }
  return rect;
}

function toSpan(
  rect: Rect,
  context: {
    heat: HeatGrid;
    grid: DecisionGrid;
    centroid: { x: number; y: number };
    safeZones: readonly HeatBounds[];
  }
): AnchorSpan {
  const bounds = boundsOf(rect, context.grid);
  const heat = heatInBounds(context.heat, bounds);
  const safe = safeZoneCoverage(bounds, context.safeZones);
  return {
    id: rectId(rect),
    label: spanLabel(rect, context.grid),
    colStart: rect.c0,
    colEnd: rect.c1,
    rowStart: rect.r0,
    rowEnd: rect.r1,
    heat: Number(heat.toFixed(4)),
    safe: Number(safe.toFixed(3)),
    score: Number(scoreBounds(bounds, heat, safe, context.centroid).toFixed(4)),
    cells: (rect.c1 - rect.c0 + 1) * (rect.r1 - rect.r0 + 1)
  };
}

function columnOfSpan(span: AnchorSpan, grid: DecisionGrid): TextColumn {
  const center = (span.colStart + span.colEnd + 1) / 2 / grid.cols;
  if (center < 1 / 3) return "left";
  if (center > 2 / 3) return "right";
  return "center";
}

/** 收尾小字：在主文字下方、同一列范围内挑最冷的格子，沿同一根轴再合并一次。 */
function pickSecondarySpan(input: {
  primary: AnchorSpan;
  heat: HeatGrid;
  grid: DecisionGrid;
  centroid: { x: number; y: number };
  safeZones: readonly HeatBounds[];
  coldLimit: number;
}): AnchorSpan | null {
  const rowMin = input.primary.rowEnd + 1;
  if (rowMin >= input.grid.rows) return null;

  const seeds: Array<{ row: number; col: number; heat: number }> = [];
  for (let row = rowMin; row < input.grid.rows; row += 1) {
    for (let col = input.primary.colStart; col <= input.primary.colEnd; col += 1) {
      seeds.push({ row, col, heat: heatOfCell(input.heat, input.grid, row, col) });
    }
  }
  const usable = seeds.filter((seed) => seed.heat <= SECONDARY_HEAT_LIMIT);
  if (usable.length === 0) return null;
  // 热区最低优先；同样冷时取更靠下的，把整列用满、形成垂直文字带。
  usable.sort((left, right) => left.heat - right.heat || right.row - left.row);
  const seed = usable[0]!;
  // 与主文字保持同一根轴，小字才不会甩到画面另一头。
  const axis: "row" | "col" = input.primary.colStart === input.primary.colEnd ? "col" : "row";
  const grown = growAlongAxis(
    {
      heat: input.heat,
      grid: input.grid,
      coldLimit: input.coldLimit,
      bounds: {
        rowMin,
        rowMax: input.grid.rows - 1,
        colMin: axis === "col" ? input.primary.colStart : 0,
        colMax: axis === "col" ? input.primary.colEnd : input.grid.cols - 1
      }
    },
    seed,
    axis
  );
  return toSpan(grown, {
    heat: input.heat,
    grid: input.grid,
    centroid: input.centroid,
    safeZones: input.safeZones
  });
}

const STRATEGY_LABEL: Record<LayoutStrategy, string> = {
  "full-bleed": "自由排版，仍保持单一视觉块",
  "full-band": "文字铺成一条整宽横带",
  "side-block": "文字在单侧成块",
  "column-stack": "主次文字同列上下分置，用足垂直空间",
  "edge-small": "文字贴边、字号收小",
  "wrap-subject": "文字环绕主体、避开重心"
};

function strategyOf(input: {
  noSubject: boolean;
  primary: AnchorSpan;
  grid: DecisionGrid;
  column: TextColumn;
  freeRatio: number;
  scale: SubjectScale;
}): LayoutStrategy {
  if (input.noSubject) return "full-bleed";
  if (input.primary.colEnd - input.primary.colStart + 1 === input.grid.cols) return "full-band";
  if (input.column === "center" && input.freeRatio >= 0.75) return "full-bleed";
  if (input.freeRatio >= 0.85) return "side-block";
  if (input.freeRatio >= 0.45) return "column-stack";
  if (input.scale === "large") return "wrap-subject";
  return "edge-small";
}

/** 哪些横 / 纵带被主体压住了，用于生成可读的避让说明。 */
function describeAvoidance(cells: readonly HeatCell[], grid: DecisionGrid): string {
  const columnHeats = Array.from({ length: grid.cols }, (_, col) => {
    const column = cells.filter((cell) => cell.col === col);
    return column.reduce((total, cell) => total + cell.heat, 0) / Math.max(1, column.length);
  });
  const rowHeats = Array.from({ length: grid.rows }, (_, row) => {
    const line = cells.filter((cell) => cell.row === row);
    return line.reduce((total, cell) => total + cell.heat, 0) / Math.max(1, line.length);
  });
  const hotCols = columnHeats
    .map((heat, col) => ({ heat, name: colFull(col, grid.cols) }))
    .filter((entry) => entry.heat >= 0.3)
    .map((entry) => entry.name);
  const hotRows = rowHeats
    .map((heat, row) => ({ heat, name: rowFull(row, grid.rows) }))
    .filter((entry) => entry.heat >= 0.3)
    .map((entry) => entry.name);
  const parts: string[] = [];
  if (hotRows.length > 0) parts.push(`${hotRows.join("与")}整条带`);
  if (hotCols.length > 0) parts.push(`${hotCols.join("与")}纵向`);
  return parts.length > 0 ? parts.join("、") : "局部";
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export function planLayout(
  analysis: SceneAnalysis,
  focusSubjects?: readonly string[],
  frame: { width: number; height: number } = { width: 3, height: 4 }
): LayoutPlan {
  const all = analysis.subjectRegions as readonly Region[];
  // 三态语义：未传 = 不过滤；传空数组 = 明确不要主体；传了但匹配不上 = 回退全部并提示。
  const matched = focusSubjects
    ? all.filter((region) => focusSubjects.includes(region.label))
    : all;
  const selection: LayoutPlan["selection"] = !focusSubjects
    ? "all"
    : focusSubjects.length === 0
      ? "explicit"
      : matched.length > 0
        ? "explicit"
        : "unmatched";
  const chosen = selection === "explicit" ? matched : all;

  const subjects: PlannedSubject[] = chosen.map((region) => ({
    label: region.label,
    ...(region.importance ? { importance: region.importance } : {}),
    areaRatio: Number(regionArea(region).toFixed(4)),
    center: {
      x: Number((region.x + region.width / 2).toFixed(4)),
      y: Number((region.y + region.height / 2).toFixed(4))
    },
    ...(region.colors && region.colors.length > 0 ? { colors: [...region.colors] } : {})
  }));

  const noSubject = subjects.length === 0;
  const grid = decisionGridFor(frame);
  const frameRatio = Number((frame.width / Math.max(1, frame.height)).toFixed(3));
  const sample = sampleGridFor(frame);
  const heat = buildSubjectHeat(chosen, sample);

  // 占比用「等权重」的并集覆盖率算：叠加多个主体时重叠部分只算一次，
  // 而 heat 是按重要度加权的，直接拿它求和会被 secondary 的折扣带偏。
  const unionHeat = buildUnionHeat(chosen, sample);
  const coveredRatio = noSubject
    ? 0
    : Number(
        Math.min(
          1,
          unionHeat.cells.reduce((total, value) => total + value, 0) /
            (unionHeat.cols * unionHeat.rows)
        ).toFixed(4)
      );
  const scale = scaleOf(coveredRatio);
  const centroid = noSubject ? { x: 0.5, y: 0.5 } : heatCentroid(heat);

  const safeZones = analysis.safeZones.map((zone) => ({
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    reason: zone.reason,
    ...(zone.colors ? { colors: [...zone.colors] } : {})
  })) as SafeZoneHint[];

  const cells = scoreCells({ heat, grid, centroid, safeZones });
  const peakHeat = cells.reduce((peak, cell) => Math.max(peak, cell.heat), 0);
  const coldLimit = peakHeat * MERGE_RATIO;
  const mergeThreshold = Number(coldLimit.toFixed(4));

  const dominantRegion = (() => {
    if (noSubject) return "center";
    const col = clamp(Math.floor(centroid.x * grid.cols), 0, grid.cols - 1);
    const row = clamp(Math.floor(centroid.y * grid.rows), 0, grid.rows - 1);
    return `${colShort(col, grid.cols)}${rowShort(row, grid.rows)}`;
  })();

  const seedCell = cells[0]!;
  const seedRect: Rect = { c0: seedCell.col, c1: seedCell.col, r0: seedCell.row, r1: seedCell.row };
  // 先按主体偏移方向选主轴，主轴整条带太热才换另一根轴。
  const axis = preferredAxis(centroid);
  const alternativeAxis = axis === "row" ? "col" : "row";
  const chosenAxis = bandHeat(heat, grid, axis, seedCell) <= coldLimit
    ? axis
    : bandHeat(heat, grid, alternativeAxis, seedCell) <= coldLimit
      ? alternativeAxis
      : null;
  const spanContext = { heat, grid, centroid, safeZones };

  const textAnchor: AnchorSpan = noSubject
    ? toSpan({ c0: 0, c1: grid.cols - 1, r0: 0, r1: grid.rows - 1 }, spanContext)
    : toSpan(
        chosenAxis
          ? growAlongAxis(
              {
                heat,
                grid,
                coldLimit,
                bounds: { rowMin: 0, rowMax: grid.rows - 1, colMin: 0, colMax: grid.cols - 1 }
              },
              seedCell,
              chosenAxis
            )
          : seedRect,
        spanContext
      );

  const textColumn = noSubject ? "center" : columnOfSpan(textAnchor, grid);
  // 可用纵向区间按承载区自己的横向范围算：整宽带就看整幅，单列就看这一列。
  const freeColumn = noSubject
    ? { fromY: 0, toY: 1, freeRatio: 1 }
    : columnFreeSpan(heat, {
        x: textAnchor.colStart / grid.cols,
        width: (textAnchor.colEnd - textAnchor.colStart + 1) / grid.cols,
        y: 0,
        height: 1
      });
  const secondaryAnchor = noSubject
    ? null
    : pickSecondarySpan({
        primary: textAnchor,
        heat,
        grid,
        centroid,
        safeZones,
        coldLimit
      });
  const strategy = strategyOf({
    noSubject,
    primary: textAnchor,
    grid,
    column: textColumn,
    freeRatio: freeColumn.freeRatio,
    scale
  });

  const headlineSizeRange: [number, number] = scale === "small"
    ? [0.1, 0.16]
    : scale === "medium"
      ? [0.08, 0.12]
      : [0.05, 0.08];

  const primaryBounds = boundsOf(
    { c0: textAnchor.colStart, c1: textAnchor.colEnd, r0: textAnchor.rowStart, r1: textAnchor.rowEnd },
    grid
  );
  const matchedZone = safeZones
    .map((zone) => ({ zone, overlap: safeZoneCoverage(primaryBounds, [zone as HeatBounds]) }))
    .sort((left, right) => right.overlap - left.overlap)[0];

  const palette = planEffectPalette({
    subjectColors: subjects.flatMap((subject) => subject.colors ?? []),
    imageColors: analysis.dominantColors.slice(0, 3),
    ...(matchedZone?.zone.colors?.[0] ? { backdropColor: matchedZone.zone.colors[0] } : {}),
    coolAnchors: [...cells]
      .sort((left, right) => left.heat - right.heat || right.score - left.score)
      .filter((cell) => !(cell.col === seedCell.col && cell.row === seedCell.row))
      .map((cell) => `${colShort(cell.col, grid.cols)}${rowShort(cell.row, grid.rows)}`)
  });

  const avoidText = describeAvoidance(cells, grid);
  const scaleLabel = { small: "小面积", medium: "中等面积", large: "大面积" }[scale];
  const growthNote = textAnchor.cells > 1
    ? `由 ${textAnchor.cells} 个连续非热格合并`
    : "单格承载";

  // 无法给出可靠建议的情形要明确告警，而不是硬给一个热区 40% 的位置。
  const reasonParts: string[] = [];
  const centerX = primaryBounds.x + primaryBounds.width / 2;
  if (Math.abs(centroid.x - 0.5) >= CENTERED_TOLERANCE && Math.abs((centerX - centroid.x) * 2) >= 0.3) {
    reasonParts.push(`能与${centroid.x < 0.5 ? "左侧" : "右侧"}主体配重`);
  }
  if (textAnchor.heat <= 0.1) reasonParts.push("该区几乎无主体");
  if (textAnchor.safe >= 0.3) reasonParts.push("落在模型标注的干净区内");
  const winnerReason = reasonParts.join("、") || "综合避让与构图评分最高";

  const rationale = noSubject
    ? "未指定设计主体，按全画面自由排版处理（不约束主体避让），仍保持单一视觉块。"
    : `主体${scaleLabel}（像素并集覆盖 ${percent(coveredRatio)}），热区重心在 ${dominantRegion}，` +
      `主体压在${avoidText}上。画面比例 ${frameRatio}（${frame.width}×${frame.height}），决策网格 ${grid.cols}×${grid.rows}；` +
      `峰值热区 ${percent(peakHeat)}，合并阈值取峰值的 ${(MERGE_RATIO * 100).toFixed(0)}% = ${percent(mergeThreshold)}：` +
      `承载区定为「${textAnchor.label}」${growthNote}，该区平均热区 ${percent(textAnchor.heat)}，${winnerReason}，` +
      `因此采用「${STRATEGY_LABEL[strategy]}」` +
      (secondaryAnchor ? `；「${secondaryAnchor.label}」留给收尾小字（热区 ${percent(secondaryAnchor.heat)}）。` : "。") +
      palette.rationale;

  const safeZoneLines = safeZones.map(
    (zone, index) =>
      `  ${index + 1}. 列 ${zone.x.toFixed(2)}–${(zone.x + zone.width).toFixed(2)} / 行 ${zone.y.toFixed(2)}–${(zone.y + zone.height).toFixed(2)}` +
      `（面积 ${percent(zone.width * zone.height)}）${zone.colors ? `，底色 ${zone.colors.join(" ")}` : ""}：${zone.reason}`
  );

  const designerBrief = noSubject
    ? [
        "未指定主体：不做主体避让，文字可在安全区内自由成块。",
        `版式策略：${strategy}；文字集中在 ${textAnchor.label}。`,
        `主标题字号建议 ${headlineSizeRange[0]}–${headlineSizeRange[1]} 画幅短边。`,
        `新增特效配色参考：正文 ${palette.text}、强调建议 ${palette.suggested.accent}、描边 ${palette.suggested.support}；最终配色由你决定。`,
        "所有文字必须构成单一视觉块；禁止散落到多个角落。"
      ].join("\n")
    : [
        `画面比例 ${frameRatio}（${frame.width}×${frame.height}），决策网格 ${grid.cols}×${grid.rows}。`,
        `主体热区覆盖 ${percent(coveredRatio)}（${scaleLabel}），热区重心 ${dominantRegion}。`,
        `主体占据${avoidText}，这些区域禁止压正文。`,
        "",
        "【数据一 · 主图分析的文字安全区（静帧，来自视觉模型）】",
        ...(safeZoneLines.length > 0 ? safeZoneLines : ["  （模型未给出安全区，需自行判断）"]),
        "",
        "【数据二 · L1 主体热区与承载区（基于像素覆盖率，也反映动态轨迹的大致行进）】",
        `  主文字承载区「${textAnchor.label}」（列 ${textAnchor.colStart}–${textAnchor.colEnd}，行 ${textAnchor.rowStart}–${textAnchor.rowEnd}，${growthNote}）；` +
          `该区热区 ${percent(textAnchor.heat)}，可用纵向区间 ${freeColumn.fromY}–${freeColumn.toY}（${(freeColumn.freeRatio * 100).toFixed(0)}%）。`,
        secondaryAnchor
          ? `  次要小字承载区「${secondaryAnchor.label}」（热区 ${percent(secondaryAnchor.heat)}），位于主文字下方，用于收尾与配重。`
          : "  不额外增设次要文字层。",
        `  峰值热区 ${percent(peakHeat)}；合并阈值 ${percent(mergeThreshold)}。`,
        "",
        "以上两组数据一同作为排版依据：静帧安全区说明哪几块放字最稳，" +
          "热区说明主体在画面里实际占了多少像素；动态轨迹通常不会偏离静帧太多，但仍以热区为硬边界。",
        "",
        `版式策略：${strategy}；主标题字号 ${headlineSizeRange[0]}–${headlineSizeRange[1]} 画幅短边，层级递减比约 1 : 0.35 : 0.26。`,
        `配色参考：基调 ${palette.base.join(" ") || "—"}；正文 ${palette.text}（${palette.textContrast}:1）；` +
          `强调色建议 ${palette.suggested.accent}、描边/阴影 ${palette.suggested.support}；` +
          `候选 ${palette.options.map((option) => `${option.name} ${option.hex}`).join("、")}。最终配色由你（L2）决定。`,
        "所有文字必须构成单一视觉块；禁止散落到多个角落。"
      ].join("\n");

  return {
    subjectCount: subjects.length,
    selection,
    areaRatio: coveredRatio,
    scale,
    dominantRegion,
    grid,
    frameRatio,
    textAnchor,
    secondaryAnchor,
    textColumn,
    freeColumn,
    peakHeat: Number(peakHeat.toFixed(4)),
    mergeThreshold,
    strategy,
    headlineSizeRange,
    rationale,
    designerBrief,
    subjects,
    safeZone: matchedZone && matchedZone.overlap > 0 ? matchedZone.zone : null,
    safeZones,
    palette,
    candidates: cells,
    heat
  };
}
