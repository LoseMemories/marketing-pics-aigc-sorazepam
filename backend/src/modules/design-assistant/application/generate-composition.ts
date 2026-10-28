import { AppError } from "../../../shared/errors/app-error.js";
import {
  compositionSpecSchema,
  sceneAnalysisSchema,
  type CompositionSpec
} from "../domain/design-assistant.schemas.js";
import { constrainCompositionToScene } from "../domain/composition-layout.js";
import { normalizeCompositionOutput } from "../domain/composition-output-normalizer.js";
import { unwrapStoredSceneAnalysis } from "../domain/scene-analysis-cache.js";
import type { DesignAssistantGateway, DesignAssetStore } from "./design-assistant.ports.js";

export class GenerateComposition {
  constructor(
    private readonly store: DesignAssetStore,
    private readonly gateway: DesignAssistantGateway
  ) {}

  async execute(
    id: string,
    brief: string,
    focusSubjects?: readonly string[]
  ): Promise<CompositionSpec> {
    const asset = await this.store.findAsset(id);
    if (!asset) throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);
    const storedAnalysis = await this.store.readAnalysis<unknown>(id, "scene-analysis");
    const analysis = sceneAnalysisSchema.safeParse(unwrapStoredSceneAnalysis(storedAnalysis));
    if (!analysis.success) {
      throw new AppError("SCENE_ANALYSIS_REQUIRED", "请先完成 AI 画面分析。", 409);
    }
    const raw = await this.gateway.generateComposition({
      brief,
      sceneAnalysis: analysis.data,
      ...(focusSubjects && focusSubjects.length > 0 ? { focusSubjects } : {}),
      durationMs: asset.media.durationMs,
      width: asset.media.width,
      height: asset.media.height
    });
    const parsed = compositionSpecSchema.safeParse(normalizeCompositionOutput(raw));
    if (!parsed.success) {
      throw new AppError("MODEL_OUTPUT_INVALID", "DeepSeek 返回的动效方案格式不正确。", 502, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      });
    }
    if (parsed.data.durationMs !== asset.media.durationMs) {
      throw new AppError("MODEL_OUTPUT_INVALID", "DeepSeek 返回的动效时长与实况视频不一致。", 502, {
        expectedDurationMs: asset.media.durationMs,
        receivedDurationMs: parsed.data.durationMs
      });
    }
    const constrained = constrainCompositionToScene(parsed.data, analysis.data);
    await this.store.writeAnalysis(id, "composition", constrained);
    return constrained;
  }
}
