import { describe, expect, it } from "vitest";
import { constrainCompositionToScene } from "../src/modules/design-assistant/domain/composition-layout.js";
import type {
  CompositionSpec,
  SceneAnalysis
} from "../src/modules/design-assistant/domain/design-assistant.schemas.js";

const analysis: SceneAnalysis = {
  summary: "人物居中",
  subjects: ["人物"],
  subjectRegions: [{ label: "人物", x: 0.3, y: 0.1, width: 0.4, height: 0.8, confidence: 0.98 }],
  environment: "户外",
  dominantColors: ["#87aacc"],
  safeZones: [
    { x: 0.05, y: 0.1, width: 0.18, height: 0.3, reason: "左侧留白" },
    { x: 0.77, y: 0.1, width: 0.18, height: 0.3, reason: "右侧留白" }
  ],
  marketingTone: ["未来感"],
  risks: []
};

describe("composition scene constraints", () => {
  it("moves text off the subject and into the nearest safe zone", () => {
    const composition: CompositionSpec = {
      version: 1,
      durationMs: 2000,
      layers: [{
        id: "title",
        kind: "text",
        text: "新品上市",
        startMs: 0,
        endMs: 1800,
        x: 0.6,
        y: 0.2,
        color: "#ffffff"
      }]
    };

    expect(constrainCompositionToScene(composition, analysis).layers[0]).toMatchObject({
      animation: "slide-up",
      x: 0.86,
      y: 0.25
    });
  });

  it("keeps every layer center inside the source-image safety margin", () => {
    const composition: CompositionSpec = {
      version: 1,
      durationMs: 2000,
      layers: [{
        id: "glow",
        kind: "pulse",
        startMs: 0,
        endMs: 1800,
        x: 0,
        y: 1,
        color: "#ffffff"
      }]
    };

    expect(constrainCompositionToScene(composition, analysis).layers[0]).toMatchObject({
      animation: "breathe",
      x: 0.04,
      y: 0.96
    });
  });

  it("maps design-language ids to executable Canvas animations", () => {
    const composition: CompositionSpec = {
      version: 1,
      durationMs: 2000,
      layers: [
        { id: "particle-snow", kind: "pulse", startMs: 0, endMs: 1800, x: 0.1, y: 0.2, color: "#ffffff" },
        { id: "highlight-edge", kind: "pulse", startMs: 0, endMs: 1800, x: 0.9, y: 0.2, color: "#ffffff" }
      ]
    };

    expect(constrainCompositionToScene(composition, analysis).layers.map((layer) => layer.animation))
      .toEqual(["drift", "sweep"]);
  });

  it("distributes simultaneous snapshot text across safe-zone slots", () => {
    const composition: CompositionSpec = {
      version: 1,
      durationMs: 2000,
      layers: ["hero-title", "sub-title", "tag-line"].map((id) => ({
        id,
        kind: "text" as const,
        text: id,
        startMs: 0,
        endMs: 1800,
        x: 0.5,
        y: 0.5,
        color: "#ffffff"
      }))
    };

    const layers = constrainCompositionToScene(composition, analysis).layers;
    expect(new Set(layers.map((layer) => `${layer.x}:${layer.y}`)).size).toBe(3);
  });
});
