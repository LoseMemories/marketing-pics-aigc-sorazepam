import { describe, expect, it } from "vitest";
import { GenerateComposition } from "../src/modules/design-assistant/application/generate-composition.js";
import type {
  DesignAssistantGateway,
  DesignAssetStore
} from "../src/modules/design-assistant/application/design-assistant.ports.js";
import { SCENE_ANALYSIS_PROMPT_VERSION } from "../src/modules/design-assistant/domain/scene-analysis-cache.js";
import type { LiveAssetRecord } from "../src/modules/live-asset/domain/live-asset.types.js";

const assetId = "11111111-1111-4111-8111-111111111111";

const analysis = {
  summary: "室内场景",
  subjects: ["人物"],
  subjectRegions: [{
    label: "人物",
    x: 0.3, y: 0.3, width: 0.4, height: 0.5, confidence: 0.9,
    points: [{ x: 0.28, y: 0.28 }, { x: 0.72, y: 0.28 }, { x: 0.72, y: 0.82 }, { x: 0.28, y: 0.82 }]
  }],
  environment: "室内",
  dominantColors: ["#112233"],
  safeZones: [{ x: 0.02, y: 0.02, width: 0.2, height: 0.15, reason: "左上留白" }],
  marketingTone: ["复古潮流"],
  risks: []
};

function createStore(storedSceneAnalysis: unknown) {
  const store: DesignAssetStore = {
    findAsset: async () =>
      ({ id: assetId, media: { durationMs: 3000, width: 1440, height: 1920 } }) as LiveAssetRecord,
    readPoster: async () => Buffer.from("poster"),
    readAnalysis: async <T,>(_id: string, name: string) =>
      (name === "scene-analysis" ? storedSceneAnalysis : null) as T | null,
    writeAnalysis: async () => undefined
  };
  return store;
}

describe("GenerateComposition", () => {
  it("能从带版本的信封中解出分析结果并透传给模型", async () => {
    let captured: { brief: string; sceneAnalysis: unknown; focusSubjects?: readonly string[] } | undefined;
    const gateway: DesignAssistantGateway = {
      analyzeScene: async () => ({}),
      generateComposition: async (input) => {
        captured = input;
        return {
          version: 1,
          durationMs: 3000,
          layers: [{
            id: "title",
            kind: "text",
            animation: "fade",
            startMs: 0,
            endMs: 2000,
            x: 0.1,
            y: 0.1,
            color: "#ffffff",
            text: "标题"
          }]
        };
      }
    };

    const useCase = new GenerateComposition(
      createStore({
        promptVersion: SCENE_ANALYSIS_PROMPT_VERSION,
        cachedAt: "2026-10-25T00:00:00.000Z",
        analysis
      }),
      gateway
    );

    const spec = await useCase.execute(assetId, "突出人物", ["人物"]);

    expect((captured?.sceneAnalysis as { summary?: string })?.summary).toBe("室内场景");
    expect(captured?.focusSubjects).toEqual(["人物"]);
    expect(spec.layers).toHaveLength(1);
  });

  it("兼容没有版本信封的历史文件", async () => {
    const gateway: DesignAssistantGateway = {
      analyzeScene: async () => ({}),
      generateComposition: async () => ({
        version: 1,
        durationMs: 3000,
        layers: [{
          id: "glow",
          kind: "pulse",
          animation: "breathe",
          startMs: 0,
          endMs: 3000,
          x: 0.5,
          y: 0.5,
          color: "#ffffff"
        }]
      })
    };

    const spec = await new GenerateComposition(createStore(analysis), gateway).execute(assetId, "呼吸光点");
    expect(spec.layers[0]?.id).toBe("glow");
  });
});
