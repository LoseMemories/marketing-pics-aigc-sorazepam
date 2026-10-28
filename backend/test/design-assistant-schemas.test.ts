import { describe, expect, it } from "vitest";
import {
  compositionSpecSchema,
  MAX_SUBJECT_OUTLINE_POINTS,
  sceneAnalysisSchema
} from "../src/modules/design-assistant/domain/design-assistant.schemas.js";

describe("scene analysis", () => {
  it("accepts subject coordinates contained by the source image", () => {
    expect(sceneAnalysisSchema.safeParse({
      summary: "主体位于画面中央",
      subjects: ["人物"],
      subjectRegions: [{ label: "人物", x: 0.3, y: 0.1, width: 0.4, height: 0.8, confidence: 0.96 }],
      environment: "户外",
      dominantColors: ["#87aacc"],
      safeZones: [{ x: 0.04, y: 0.04, width: 0.2, height: 0.3, reason: "左上留白" }],
      marketingTone: ["未来感"],
      risks: []
    }).success).toBe(true);
  });

  it("主体价值分：模型没给时按置信度与面积估算，给超范围会被夹住", () => {
    const base = {
      summary: "两个主体",
      subjects: ["人物", "路人"],
      environment: "户外",
      dominantColors: ["#87aacc"],
      safeZones: [],
      marketingTone: ["未来感"],
      risks: []
    };
    const result = sceneAnalysisSchema.safeParse({
      ...base,
      subjectRegions: [
        { label: "人物", x: 0.2, y: 0.1, width: 0.5, height: 0.8, confidence: 0.95 },
        { label: "高到越界", x: 0.7, y: 0.1, width: 0.2, height: 0.2, confidence: 0.9, score: 180 }
      ]
    });
    expect(result.success).toBe(false); // 越界的 score 直接判非法，而不是静默改成 0

    const ok = sceneAnalysisSchema.safeParse({
      ...base,
      subjectRegions: [
        { label: "人物", x: 0.2, y: 0.1, width: 0.5, height: 0.8, confidence: 0.95 },
        { label: "路人", x: 0.7, y: 0.6, width: 0.1, height: 0.15, confidence: 0.4 }
      ]
    });
    expect(ok.success).toBe(true);
    const [人物, 路人] = ok.data?.subjectRegions ?? [];
    expect(人物?.score).toBeGreaterThan(60);
    expect(路人?.score).toBeLessThan(60);
  });

  it("裁剪越界的主体框而不是整份分析失败", () => {
    const result = sceneAnalysisSchema.safeParse({
      summary: "主体越界",
      subjects: ["人物"],
      subjectRegions: [{ label: "人物", x: 0.8, y: 0.1, width: 0.4, height: 0.8, confidence: 0.96 }],
      environment: "户外",
      dominantColors: ["#87aacc"],
      safeZones: [],
      marketingTone: ["未来感"],
      risks: []
    });
    expect(result.success).toBe(true);
    const region = result.data?.subjectRegions[0];
    expect(region?.x + (region?.width ?? 0)).toBeLessThanOrEqual(1.0001);
    expect(region?.y + (region?.height ?? 0)).toBeLessThanOrEqual(1.0001);
  });

  it("兼容轮廓点写成 [x, y] 数组的模型输出", () => {
    const result = sceneAnalysisSchema.safeParse({
      summary: "轮廓点两种写法",
      subjects: ["人物"],
      subjectRegions: [{
        label: "人物",
        x: 0.2, y: 0.2, width: 0.5, height: 0.6, confidence: 0.9,
        points: [[0.2, 0.2], [0.7, 0.25], [0.68, 0.8]],
        importance: "primary"
      }],
      environment: "户外",
      dominantColors: ["#87aacc"],
      safeZones: [],
      marketingTone: ["复古潮流", "街头潮流", "趣味对比", "平价货场", "夜拍"],
      risks: []
    });
    expect(result.success).toBe(true);
    expect(result.data?.subjectRegions[0]?.points?.[0]).toEqual({ x: 0.2, y: 0.2 });
    expect(result.data?.marketingTone).toHaveLength(5);
  });

  it("保留模型给的多达 100 个轮廓点，不再裁到 20 个", () => {
    const points = Array.from({ length: MAX_SUBJECT_OUTLINE_POINTS }, (_, index) => ({
      x: index / MAX_SUBJECT_OUTLINE_POINTS,
      y: 0.5
    }));
    const result = sceneAnalysisSchema.safeParse({
      summary: "高密度轮廓",
      subjects: ["人物"],
      subjectRegions: [{ label: "人物", x: 0.1, y: 0.1, width: 0.6, height: 0.8, confidence: 0.9, points }],
      dominantColors: ["#87aacc"],
      safeZones: [],
      marketingTone: ["复古潮流", "街头潮流", "趣味对比"],
      risks: []
    });
    expect(result.success).toBe(true);
    expect(result.data?.subjectRegions[0]?.points).toHaveLength(100);
  });

  it("模型多给的点直接截断到上限而不是让整份分析失败", () => {
    const points = Array.from({ length: 160 }, (_, index) => ({ x: index / 160, y: 0.5 }));
    const result = sceneAnalysisSchema.safeParse({
      summary: "超量轮廓",
      subjects: ["人物"],
      subjectRegions: [{ label: "人物", x: 0.1, y: 0.1, width: 0.6, height: 0.8, confidence: 0.9, points }],
      dominantColors: ["#87aacc"],
      safeZones: [],
      marketingTone: ["复古潮流", "街头潮流", "趣味对比"],
      risks: []
    });
    expect(result.success).toBe(true);
    expect(result.data?.subjectRegions[0]?.points).toHaveLength(MAX_SUBJECT_OUTLINE_POINTS);
  });
});

describe("composition spec", () => {
  it("accepts a bounded declarative timeline", () => {
    expect(compositionSpecSchema.safeParse({
      version: 1,
      durationMs: 2000,
      layers: [{ id: "headline", kind: "text", animation: "slide-left", text: "新品上市", startMs: 0, endMs: 1800, x: 0.1, y: 0.2, color: "#d9ff52" }]
    }).success).toBe(true);
  });

  it("rejects executable or out-of-range output", () => {
    expect(compositionSpecSchema.safeParse({
      version: 1,
      durationMs: 2000,
      layers: [{ id: "bad", kind: "script", code: "alert(1)", startMs: 0, endMs: 3000, x: 2, y: 0, color: "red" }]
    }).success).toBe(false);
  });
});
