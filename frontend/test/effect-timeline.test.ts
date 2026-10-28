import { describe, expect, it } from "vitest";
import { createEffectTimeline } from "../src/features/motion-effects/runtime/effect-timeline";

describe("effect timeline", () => {
  it("returns deterministic progress only while an effect is active", () => {
    const timeline = createEffectTimeline(
      [
        {
          id: "title",
          kind: "text",
          startMs: 100,
          endMs: 900,
          x: 0.5,
          y: 0.5,
          color: "#fff",
          text: "Title"
        }
      ],
      1000
    );

    expect(timeline.sample(50)).toEqual([]);
    expect(timeline.sample(500)[0]?.progress).toBe(0.5);
    expect(timeline.sample(950)).toEqual([]);
  });

  it("renders every layer in the static marketing snapshot", () => {
    const timeline = createEffectTimeline(
      [
        { id: "early", kind: "text", startMs: 0, endMs: 300, x: 0.2, y: 0.2, color: "#fff", text: "A" },
        { id: "late", kind: "pulse", animation: "drift", startMs: 700, endMs: 1000, x: 0.8, y: 0.8, color: "#fff" }
      ],
      1000
    );

    expect(timeline.snapshot().map((effect) => effect.id)).toEqual(["early", "late"]);
    expect(timeline.snapshot().every((effect) => effect.progress === 0.55)).toBe(true);
  });

  it("静态封面是最终形态：文字全显示、标记为 staticFrame", () => {
    const timeline = createEffectTimeline(
      [
        {
          id: "headline",
          kind: "text",
          startMs: 300,
          endMs: 1000,
          x: 0.2,
          y: 0.2,
          color: "#fff",
          text: "秋日暖光",
          enter: { type: "mask-reveal", startMs: 300, durationMs: 700 }
        },
        {
          id: "outline",
          kind: "pulse",
          animation: "outline",
          startMs: 200,
          endMs: 1000,
          x: 0.5,
          y: 0.5,
          color: "#fff"
        }
      ],
      1000
    );

    const snapshot = timeline.snapshot();
    expect(snapshot.every((effect) => effect.staticFrame === true)).toBe(true);
    expect(snapshot.every((effect) => effect.enterProgress === 1)).toBe(true);
    // 静止状态下描边必须已经画完，不能停在半条线上
    expect(snapshot[1]?.elapsedMs).toBeDefined();
  });
});
