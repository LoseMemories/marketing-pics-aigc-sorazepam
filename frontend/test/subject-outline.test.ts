import { describe, expect, it } from "vitest";
import {
  MAX_OUTLINE_POINTS,
  refineOutline,
  type OutlinePoint
} from "../src/features/canvas-renderer/runtime/subject-outline";

/** 一圈 20 个点的矩形轮廓，模拟模型返回的粗粒度避让边界。 */
function coarseRect(): OutlinePoint[] {
  const points: OutlinePoint[] = [];
  for (let index = 0; index < 20; index += 1) {
    const t = index / 20;
    if (t < 0.25) points.push({ x: 0.2 + t * 4 * 0.6, y: 0.2 });
    else if (t < 0.5) points.push({ x: 0.8, y: 0.2 + (t - 0.25) * 4 * 0.6 });
    else if (t < 0.75) points.push({ x: 0.8 - (t - 0.5) * 4 * 0.6, y: 0.8 });
    else points.push({ x: 0.2, y: 0.8 - (t - 0.75) * 4 * 0.6 });
  }
  return points;
}

describe("subject outline refine", () => {
  it("把 20 个点的粗轮廓补齐到 100 个点", () => {
    const refined = refineOutline(coarseRect());
    expect(refined).toHaveLength(MAX_OUTLINE_POINTS);
    expect(MAX_OUTLINE_POINTS).toBe(100);
  });

  it("模型已经给满 100 个点时保持 100 个点，不再额外平滑", () => {
    const points: OutlinePoint[] = Array.from({ length: 100 }, (_, index) => {
      const angle = (index / 100) * Math.PI * 2;
      return { x: 0.5 + Math.cos(angle) * 0.3, y: 0.5 + Math.sin(angle) * 0.3 };
    });
    const refined = refineOutline(points);
    expect(refined).toHaveLength(MAX_OUTLINE_POINTS);
    // 圆上的点重采样后仍应落在圆上（半径不变）。
    for (const point of refined) {
      const radius = Math.hypot(point.x - 0.5, point.y - 0.5);
      expect(radius).toBeCloseTo(0.3, 2);
    }
  });

  it("多给的点按上限截断到 100 个", () => {
    const points: OutlinePoint[] = Array.from({ length: 160 }, (_, index) => {
      const angle = (index / 160) * Math.PI * 2;
      return { x: 0.5 + Math.cos(angle) * 0.3, y: 0.5 + Math.sin(angle) * 0.3 };
    });
    expect(refineOutline(points)).toHaveLength(MAX_OUTLINE_POINTS);
  });

  it("平滑后不会外扩出原多边形的范围", () => {
    const refined = refineOutline(coarseRect());
    for (const point of refined) {
      expect(point.x).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(point.x).toBeLessThanOrEqual(0.8 + 1e-6);
      expect(point.y).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(point.y).toBeLessThanOrEqual(0.8 + 1e-6);
    }
  });

  it("点按弧长均匀分布，相邻点间距接近一致", () => {
    const refined = refineOutline(coarseRect());
    const gaps = refined.map((point, index) => {
      const next = refined[(index + 1) % refined.length] as OutlinePoint;
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    for (const gap of gaps) expect(gap).toBeLessThanOrEqual(average * 1.6 + 1e-6);
  });

  it("点数不足 3 个时原样返回，交给调用方兜底成矩形", () => {
    const line: OutlinePoint[] = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }];
    expect(refineOutline(line)).toEqual(line);
    expect(refineOutline([])).toEqual([]);
  });

  it("所有点重合的退化轮廓不会产生 NaN", () => {
    const same: OutlinePoint[] = [
      { x: 0.4, y: 0.4 },
      { x: 0.4, y: 0.4 },
      { x: 0.4, y: 0.4 }
    ];
    for (const point of refineOutline(same)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
