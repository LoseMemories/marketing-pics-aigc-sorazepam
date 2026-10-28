import { describe, expect, it } from "vitest";
import { normalizeCompositionOutput } from "../src/modules/design-assistant/domain/composition-output-normalizer.js";

describe("composition output normalizer", () => {
  it("maps semantic design-language layers to the executable Canvas DSL", () => {
    const normalized = normalizeCompositionOutput({
      version: 1,
      durationMs: 2000,
      layers: [
        { id: "hero-title", kind: "typography", text: "新品", startMs: 0, endMs: 1800, x: 0.5, y: 0.2, color: "#ffffff" },
        { id: "snow", kind: "particle-flow", startMs: 0, endMs: 1800, x: 0.2, y: 0.3, color: "#ffffff" },
        { id: "shine", kind: "highlight-sweep", startMs: 0, endMs: 1800, x: 0.6, y: 0.4, color: "#ffffff" },
        { id: "halo", kind: "glow", startMs: 0, endMs: 1800, x: 0.8, y: 0.6, color: "#ffffff" }
      ]
    }) as { layers: Array<Record<string, unknown>> };

    expect(normalized.layers.map(({ kind, animation }) => ({ kind, animation }))).toEqual([
      { kind: "text", animation: "slide-up" },
      { kind: "pulse", animation: "drift" },
      { kind: "pulse", animation: "sweep" },
      { kind: "pulse", animation: "breathe" }
    ]);
  });
});
