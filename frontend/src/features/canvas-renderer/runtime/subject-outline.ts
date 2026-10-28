/**
 * 主体轮廓的几何整理：平滑 + 按弧长重采样。
 *
 * 模型给的是「避让边界」多边形，点数少时画出来是一圈折线拐角，看起来粗糙。
 * 这里用 Chaikin 角切把拐角磨圆（结果始终落在原多边形内部，不会外扩），
 * 再按弧长均匀采样到固定点数，屏幕上就是一条顺滑闭合曲线。
 */
export interface OutlinePoint {
  x: number;
  y: number;
}

/** 单个主体轮廓最多渲染的点数。 */
export const MAX_OUTLINE_POINTS = 100;

/** 角切次数上限：20 个点切 4 次 = 320 个点，足够贴合后再重采样。 */
const MAX_SMOOTH_PASSES = 4;

/** Chaikin 角切一次：每条边按 1/4、3/4 处取新点，拐角变圆。 */
function chaikinOnce(points: readonly OutlinePoint[]): OutlinePoint[] {
  const result: OutlinePoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as OutlinePoint;
    const next = points[(index + 1) % points.length] as OutlinePoint;
    result.push({ x: current.x * 0.75 + next.x * 0.25, y: current.y * 0.75 + next.y * 0.25 });
    result.push({ x: current.x * 0.25 + next.x * 0.75, y: current.y * 0.25 + next.y * 0.75 });
  }
  return result;
}

/** 按弧长把闭合折线均匀重采样成 `count` 个点。 */
function resampleClosed(points: readonly OutlinePoint[], count: number): OutlinePoint[] {
  const closed = [...points, points[0] as OutlinePoint];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const from = closed[index] as OutlinePoint;
    const to = closed[index + 1] as OutlinePoint;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    lengths.push(length);
    total += length;
  }
  // 退化轮廓（所有点重合）：不重采样，避免除零产生 NaN。
  if (total < 1e-9) return points.slice(0, count);

  const step = total / count;
  const result: OutlinePoint[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let index = 0; index < count; index += 1) {
    const target = index * step;
    while (segment < lengths.length - 1 && segmentStart + (lengths[segment] as number) < target) {
      segmentStart += lengths[segment] as number;
      segment += 1;
    }
    const from = closed[segment] as OutlinePoint;
    const to = closed[segment + 1] as OutlinePoint;
    const length = lengths[segment] as number;
    const ratio = length < 1e-9 ? 0 : (target - segmentStart) / length;
    result.push({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    });
  }
  return result;
}

/**
 * 把模型给的轮廓整理成最多 `target` 个点的顺滑闭合折线。
 * 少于 3 个点无法构成面积，原样返回交给调用方兜底。
 */
export function refineOutline(
  points: readonly OutlinePoint[],
  target: number = MAX_OUTLINE_POINTS
): OutlinePoint[] {
  if (points.length < 3) return [...points];
  const limit = Math.max(3, Math.floor(target));
  let smoothed: readonly OutlinePoint[] = points;
  for (let pass = 0; pass < MAX_SMOOTH_PASSES && smoothed.length < limit; pass += 1) {
    smoothed = chaikinOnce(smoothed);
  }
  return resampleClosed(smoothed, limit);
}
