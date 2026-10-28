import { AppError } from "../../../shared/errors/app-error.js";
import { sceneAnalysisSchema } from "../domain/design-assistant.schemas.js";
import { planLayout, type LayoutPlan } from "../domain/layout-plan.js";
import { unwrapStoredSceneAnalysis } from "../domain/scene-analysis-cache.js";
import type { DesignAssetStore } from "./design-assistant.ports.js";

/**
 * L1 构图决策：只读已有的画面分析（不调用模型），算出主体占比、重心与文字区。
 */
export class PlanLayout {
  constructor(private readonly store: DesignAssetStore) {}

  async execute(id: string, focusSubjects?: readonly string[]): Promise<LayoutPlan> {
    const asset = await this.store.findAsset(id);
    if (!asset) throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);

    const raw = await this.store.readAnalysis<unknown>(id, "scene-analysis");
    const parsed = sceneAnalysisSchema.safeParse(unwrapStoredSceneAnalysis(raw));
    if (!parsed.success) {
      throw new AppError("SCENE_ANALYSIS_REQUIRED", "请先完成 AI 画面分析。", 409);
    }
    return planLayout(parsed.data, focusSubjects, displayFrame(asset.media));
  }
}

/**
 * 视频元数据里的宽高是编码尺寸，旋转 90°/270° 时要交换才是实际观看方向。
 * 决策网格与热区采样都依赖这个比例，算错会让整个九宫格歪掉。
 */
function displayFrame(media: { width: number; height: number; rotation: number }): {
  width: number;
  height: number;
} {
  const swapped = Math.abs(media.rotation) % 180 === 90;
  return swapped
    ? { width: media.height, height: media.width }
    : { width: media.width, height: media.height };
}
