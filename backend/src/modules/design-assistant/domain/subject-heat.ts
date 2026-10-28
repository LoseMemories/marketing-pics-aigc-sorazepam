/**
 * 主体热区图（subject heat map）。
 *
 * 解决的问题：只知道"主体在 bottom-left"对排版毫无用处——真正需要的是
 * "画面里哪些像素格子被主体占了、占得多重"。所以这里把主体区域栅格化成
 * 覆盖率网格，后续所有"文字该放哪"的判断都基于它，而不是仅凭主体中心点。
 *
 * 采样网格按画面比例自适应：竖幅会分配更多行、横幅更多列，
 * 保证每个采样格在视觉上接近正方形，热区判断才不会被拉伸失真。
 */

export interface HeatRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  importance?: "primary" | "secondary";
  points?: ReadonlyArray<{ x: number; y: number }>;
}

export interface SampleGrid {
  cols: number;
  rows: number;
}

export interface HeatGrid extends SampleGrid {
  /** 行优先的覆盖率，0–1，已按主体重要度加权。 */
  cells: number[];
}

export interface HeatBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FreeSpan {
  /** 连续可用纵向区间的起止（0–1）。 */
  fromY: number;
  toY: number;
  /** 可用行占整列的比例。 */
  freeRatio: number;
}

/** 采样分辨率：短边固定 32 格，长边按比例展开。 */
const SAMPLE_SHORT_SIDE = 32;
const SAMPLE_MAX_LONG_SIDE = 64;

/** 主主体比次要主体更"不能压"：木栏之类可以让小字贴上去，人脸不行。 */
const IMPORTANCE_WEIGHT = { primary: 1, secondary: 0.45 } as const;

const SUB_SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];

/** 低于此值视为"干净"格子，用于纵向可用区间判断。 */
const FREE_THRESHOLD = 0.15;

/** 按画面宽高比给出采样网格，保持采样格接近正方形。 */
export function sampleGridFor(frame: { width: number; height: number }): SampleGrid {
  const ratio = frame.width / Math.max(1, frame.height);
  if (ratio >= 1) {
    return {
      cols: Math.min(SAMPLE_MAX_LONG_SIDE, Math.max(SAMPLE_SHORT_SIDE, Math.round(SAMPLE_SHORT_SIDE * ratio))),
      rows: SAMPLE_SHORT_SIDE
    };
  }
  return {
    cols: SAMPLE_SHORT_SIDE,
    rows: Math.min(SAMPLE_MAX_LONG_SIDE, Math.max(SAMPLE_SHORT_SIDE, Math.round(SAMPLE_SHORT_SIDE / ratio)))
  };
}

function pointInPolygon(
  px: number,
  py: number,
  points: ReadonlyArray<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const before = points[previous];
    if (!current || !before) continue;
    const crosses =
      current.y > py !== before.y > py &&
      px < ((before.x - current.x) * (py - current.y)) / (before.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function buildSubjectHeat(
  regions: readonly HeatRegion[],
  sample: SampleGrid
): HeatGrid {
  const cells = new Array<number>(sample.cols * sample.rows).fill(0);
  for (const region of regions) {
    const weight = IMPORTANCE_WEIGHT[region.importance ?? "secondary"];
    const polygon = region.points && region.points.length >= 3 ? region.points : null;
    const colStart = Math.max(0, Math.floor(region.x * sample.cols));
    const colEnd = Math.min(sample.cols - 1, Math.ceil((region.x + region.width) * sample.cols) - 1);
    const rowStart = Math.max(0, Math.floor(region.y * sample.rows));
    const rowEnd = Math.min(sample.rows - 1, Math.ceil((region.y + region.height) * sample.rows) - 1);

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        let hits = 0;
        for (const fy of SUB_SAMPLES) {
          for (const fx of SUB_SAMPLES) {
            const px = (col + fx) / sample.cols;
            const py = (row + fy) / sample.rows;
            if (coversPoint(region, polygon, px, py)) hits += 1;
          }
        }
        if (hits === 0) continue;
        const index = row * sample.cols + col;
        cells[index] = Math.min(1, (cells[index] ?? 0) + (hits / (SUB_SAMPLES.length ** 2)) * weight);
      }
    }
  }
  return { ...sample, cells };
}

/**
 * 像素并集覆盖率网格：逐采样点判断"是否被任意主体盖住"。
 *
 * 不能用上面那个加权网格求和来算面积 —— 两个主体局部重叠时，每格
 * `min(1, a+b)` 在边缘格上仍会多算，占比会系统性偏高。
 */
export function buildUnionHeat(
  regions: readonly HeatRegion[],
  sample: SampleGrid
): HeatGrid {
  const cells = new Array<number>(sample.cols * sample.rows).fill(0);
  if (regions.length === 0) return { ...sample, cells };

  const prepared = regions.map((region) => ({
    region,
    polygon: region.points && region.points.length >= 3 ? region.points : null
  }));
  const box = regions.reduce(
    (acc, region) => ({
      x0: Math.min(acc.x0, region.x),
      y0: Math.min(acc.y0, region.y),
      x1: Math.max(acc.x1, region.x + region.width),
      y1: Math.max(acc.y1, region.y + region.height)
    }),
    { x0: 1, y0: 1, x1: 0, y1: 0 }
  );
  const colStart = Math.max(0, Math.floor(box.x0 * sample.cols));
  const colEnd = Math.min(sample.cols - 1, Math.ceil(box.x1 * sample.cols) - 1);
  const rowStart = Math.max(0, Math.floor(box.y0 * sample.rows));
  const rowEnd = Math.min(sample.rows - 1, Math.ceil(box.y1 * sample.rows) - 1);

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      let hits = 0;
      for (const fy of SUB_SAMPLES) {
        for (const fx of SUB_SAMPLES) {
          const px = (col + fx) / sample.cols;
          const py = (row + fy) / sample.rows;
          if (prepared.some((entry) => coversPoint(entry.region, entry.polygon, px, py))) hits += 1;
        }
      }
      if (hits === 0) continue;
      cells[row * sample.cols + col] = hits / (SUB_SAMPLES.length ** 2);
    }
  }
  return { ...sample, cells };
}

function coversPoint(
  region: HeatRegion,
  polygon: ReadonlyArray<{ x: number; y: number }> | null,
  px: number,
  py: number
): boolean {
  if (polygon) return pointInPolygon(px, py, polygon);
  return (
    px >= region.x &&
    px <= region.x + region.width &&
    py >= region.y &&
    py <= region.y + region.height
  );
}

/** 指定矩形内的平均覆盖率（0–1）。 */
export function heatInBounds(grid: HeatGrid, bounds: HeatBounds): number {
  const colStart = Math.max(0, Math.floor(bounds.x * grid.cols));
  const colEnd = Math.min(grid.cols - 1, Math.ceil((bounds.x + bounds.width) * grid.cols) - 1);
  const rowStart = Math.max(0, Math.floor(bounds.y * grid.rows));
  const rowEnd = Math.min(grid.rows - 1, Math.ceil((bounds.y + bounds.height) * grid.rows) - 1);
  let total = 0;
  let count = 0;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      total += grid.cells[row * grid.cols + col] ?? 0;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

/** 热区重心：按覆盖率加权的像素质心，比"各主体中心点取平均"更贴近视觉重量。 */
export function heatCentroid(grid: HeatGrid): { x: number; y: number } {
  let total = 0;
  let sumX = 0;
  let sumY = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const value = grid.cells[row * grid.cols + col] ?? 0;
      if (value <= 0) continue;
      total += value;
      sumX += ((col + 0.5) / grid.cols) * value;
      sumY += ((row + 0.5) / grid.rows) * value;
    }
  }
  return total === 0 ? { x: 0.5, y: 0.5 } : { x: sumX / total, y: sumY / total };
}

/** 某一列（纵向条带）里最长的一段连续干净区间。 */
export function columnFreeSpan(grid: HeatGrid, bounds: HeatBounds): FreeSpan {
  let bestStart = 0;
  let bestLength = 0;
  let currentStart = 0;
  let currentLength = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    const rowHeat = heatInBounds(grid, {
      x: bounds.x,
      width: bounds.width,
      y: row / grid.rows,
      height: 1 / grid.rows
    });
    if (rowHeat <= FREE_THRESHOLD) {
      if (currentLength === 0) currentStart = row;
      currentLength += 1;
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    } else {
      currentLength = 0;
    }
  }
  return {
    fromY: Number((bestStart / grid.rows).toFixed(3)),
    toY: Number(((bestStart + bestLength) / grid.rows).toFixed(3)),
    freeRatio: Number((bestLength / grid.rows).toFixed(3))
  };
}
