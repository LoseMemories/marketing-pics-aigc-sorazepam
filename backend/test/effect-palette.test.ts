import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  hueDistance,
  planEffectPalette,
  relativeLuminance,
  toHsl
} from "../src/modules/design-assistant/domain/effect-palette.js";

const baseInput = {
  subjectColors: ["#1D232B", "#C8A17F"],
  imageColors: ["#2F6FB0", "#1D5C96", "#C0915F"],
  backdropColor: "#4A86C0",
  coolAnchors: ["top-right", "right"]
};

describe("特效配色参考", () => {
  it("对比度符合 WCAG 定义", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 2);
    expect(contrastRatio("#F6F8F9", "#8FB7DE")).toBeLessThan(4.5);
    expect(contrastRatio("#12160F", "#8FB7DE")).toBeGreaterThan(4.5);
  });

  it("相对亮度单调：白 > 浅蓝 > 深蓝 > 黑", () => {
    const white = relativeLuminance("#FFFFFF");
    const sky = relativeLuminance("#8FB7DE");
    const navy = relativeLuminance("#1E2733");
    const black = relativeLuminance("#000000");
    expect(white).toBeGreaterThan(sky);
    expect(sky).toBeGreaterThan(navy);
    expect(navy).toBeGreaterThan(black);
  });

  it("色相距离是环形的，取最短弧", () => {
    expect(hueDistance("#FF0000", "#FF0000")).toBe(0);
    expect(hueDistance("#FF0000", "#00FFFF")).toBeGreaterThan(170);
    expect(hueDistance("#808080", "#FF0000")).toBe(90);
    expect(toHsl("#FF0000").h).toBeCloseTo(0, 1);
  });

  it("配色基调取自主体色与画面前三主色", () => {
    const palette = planEffectPalette(baseInput);
    expect(palette.base).toContain("#2F6FB0");
    expect(palette.base).toContain("#C0915F");
    expect(palette.base.length).toBeLessThanOrEqual(3);
  });

  it("基调优先取有色彩倾向的颜色，灰调排后面", () => {
    const palette = planEffectPalette({
      subjectColors: ["#23272E", "#141416", "#C8C6BF"],
      imageColors: ["#2F72B4"],
      backdropColor: "#2F72B4",
      coolAnchors: []
    });
    expect(palette.base[0]).toBe("#2F72B4");
  });

  it("候选集始终包含纯白与近黑", () => {
    const names = planEffectPalette(baseInput).options.map((option) => option.name);
    expect(names).toEqual(expect.arrayContaining(["纯白", "近黑"]));
  });

  it("派生色都与画面基调同色相，不出现外挂跳跃色", () => {
    const palette = planEffectPalette(baseInput);
    const derived = palette.options.filter((option) => option.source === "derived");
    expect(derived.length).toBeGreaterThan(0);
    for (const option of derived) {
      const nearest = Math.min(
        ...palette.base.map((color) => hueDistance(option.hex, color))
      );
      // 同色系派生，色相偏差只来自饱和度抬升，不应超过 12°
      expect(nearest).toBeLessThanOrEqual(12);
    }
  });

  it("浅色承载区自动用深色正文", () => {
    const palette = planEffectPalette({ ...baseInput, backdropColor: "#C6D2D6" });
    expect(relativeLuminance(palette.text)).toBeLessThan(0.2);
    expect(palette.textContrast).toBeGreaterThan(4.5);
  });

  it("深色承载区自动用浅色正文", () => {
    const palette = planEffectPalette({ ...baseInput, backdropColor: "#12161C" });
    expect(relativeLuminance(palette.text)).toBeGreaterThan(0.6);
    expect(palette.textContrast).toBeGreaterThan(4.5);
  });

  it("强调色在承载区上可读，且与正文有明显明度差", () => {
    const palette = planEffectPalette(baseInput);
    expect(palette.suggested.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(palette.suggested.accent, palette.backdrop)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.suggested.accent, palette.suggested.headline)).toBeGreaterThanOrEqual(1.8);
  });

  it("画面色系在承载区上读不出来时，回落通用安全色", () => {
    // 主体色 == 承载区底色，派生色的对比度必然不足
    const palette = planEffectPalette({
      subjectColors: ["#2F6FB0"],
      imageColors: ["#2F6FB0"],
      backdropColor: "#2F6FB0",
      coolAnchors: []
    });
    const accent = palette.options.find((option) => option.hex === palette.suggested.accent);
    expect(accent).toBeDefined();
    expect(["derived", "universal"]).toContain(accent!.source);
    expect(accent!.contrast).toBeGreaterThanOrEqual(3);
  });

  it("L1 只给建议：候选集里同时留有其他选择", () => {
    const palette = planEffectPalette(baseInput);
    expect(palette.options.length).toBeGreaterThan(2);
    expect(palette.rationale).toContain("最终配色由 L2 设计师");
    expect(palette.effectAnchors).toEqual(["top-right", "right"]);
  });
});
