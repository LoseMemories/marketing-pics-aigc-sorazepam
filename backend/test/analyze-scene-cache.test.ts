import { describe, expect, it } from "vitest";
import { AnalyzeScene } from "../src/modules/design-assistant/application/analyze-scene.js";
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
  subjectRegions: [{ label: "人物", x: 0.2, y: 0.2, width: 0.5, height: 0.6, confidence: 0.9 }],
  environment: "室内",
  dominantColors: ["#112233"],
  safeZones: [],
  marketingTone: ["复古潮流"],
  risks: []
};

function createStore(initial: unknown = null) {
  const files = new Map<string, unknown>([["scene-analysis", initial]]);
  const store: DesignAssetStore = {
    findAsset: async () => ({ id: assetId, media: { durationMs: 3000, width: 1440, height: 1920 } } as LiveAssetRecord),
    readPoster: async () => Buffer.from("poster"),
    readAnalysis: async <T,>(_id: string, name: string) => (files.get(name) ?? null) as T | null,
    writeAnalysis: async (_id, name, value) => {
      files.set(name, value);
    }
  };
  return { store, files };
}

function createGateway() {
  let calls = 0;
  const gateway: DesignAssistantGateway = {
    analyzeScene: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return analysis;
    },
    generateComposition: async () => ({})
  };
  return { gateway, calls: () => calls };
}

describe("AnalyzeScene 缓存", () => {
  it("首次分析调用模型，并把带版本的信封写入磁盘", async () => {
    const { store, files } = createStore();
    const { gateway, calls } = createGateway();
    const useCase = new AnalyzeScene(store, gateway);

    await useCase.execute(assetId);

    expect(calls()).toBe(1);
    const stored = files.get("scene-analysis") as { promptVersion: number; analysis: unknown };
    expect(stored.promptVersion).toBe(SCENE_ANALYSIS_PROMPT_VERSION);
    expect(stored.analysis).toMatchObject({ summary: "室内场景" });
  });

  it("同一进程内重复分析命中内存缓存", async () => {
    const { store } = createStore();
    const { gateway, calls } = createGateway();
    const useCase = new AnalyzeScene(store, gateway);

    await useCase.execute(assetId);
    await useCase.execute(assetId);

    expect(calls()).toBe(1);
  });

  it("重启后可从磁盘缓存恢复，不再调用模型", async () => {
    const { store, files } = createStore();
    const first = createGateway();
    await new AnalyzeScene(store, first.gateway).execute(assetId);

    const second = createGateway();
    const restored = await new AnalyzeScene(store, second.gateway).execute(assetId);

    expect(second.calls()).toBe(0);
    expect(restored.summary).toBe("室内场景");
    expect(files.size).toBe(1);
  });

  it("提示词版本变化后旧缓存失效", async () => {
    const { store } = createStore({
      promptVersion: SCENE_ANALYSIS_PROMPT_VERSION - 1,
      cachedAt: "2026-01-01T00:00:00.000Z",
      analysis
    });
    const { gateway, calls } = createGateway();

    await new AnalyzeScene(store, gateway).execute(assetId);

    expect(calls()).toBe(1);
  });

  it("刷新参数强制重新调用模型", async () => {
    const { store } = createStore();
    const { gateway, calls } = createGateway();
    const useCase = new AnalyzeScene(store, gateway);

    await useCase.execute(assetId);
    await useCase.execute(assetId, { refresh: true });

    expect(calls()).toBe(2);
  });

  it("并发请求同一张图只调用一次模型（单飞）", async () => {
    const { store } = createStore();
    const { gateway, calls } = createGateway();
    const useCase = new AnalyzeScene(store, gateway);

    await Promise.all([useCase.execute(assetId), useCase.execute(assetId), useCase.execute(assetId)]);

    expect(calls()).toBe(1);
  });
});
