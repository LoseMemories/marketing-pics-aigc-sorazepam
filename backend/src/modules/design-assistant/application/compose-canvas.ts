import { AppError } from "../../../shared/errors/app-error.js";
import {
  sceneAnalysisSchema,
  type CompositionSpec,
  type SceneAnalysis
} from "../domain/design-assistant.schemas.js";
import { composeCanvas } from "../domain/compose-canvas.js";
import { designSpecSchema, type DesignSpec } from "../domain/design-spec.schemas.js";
import {
  buildDesignContext,
  validateDesignSpec,
  type DesignIssue
} from "../domain/design-spec.validator.js";
import type { LayoutPlan } from "../domain/layout-plan.js";
import { planLayout } from "../domain/layout-plan.js";
import { unwrapStoredSceneAnalysis } from "../domain/scene-analysis-cache.js";
import { DESIGN_PROMPT_VERSION } from "./design-layout.js";
import type { DesignAssetStore } from "./design-assistant.ports.js";

export interface ComposeCanvasResult {
  design: DesignSpec;
  composition: CompositionSpec;
  issues: DesignIssue[];
  plan: LayoutPlan;
}

/**
 * L3 用例：不调模型，把（可能被人手改过的）DesignSpec 解算成 CompositionSpec。
 * 同时把这份设计写回 design.json —— 手动编辑即最终结果。
 */
export class ComposeCanvasCase {
  constructor(private readonly store: DesignAssetStore) {}

  async execute(
    id: string,
    designInput: unknown,
    focusSubjects?: readonly string[]
  ): Promise<ComposeCanvasResult> {
    const asset = await this.store.findAsset(id);
    if (!asset) throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);

    const analysis = await this.loadAnalysis(id);
    const plan = planLayout(analysis, focusSubjects, displayFrame(asset.media));
    const context = buildDesignContext(plan, analysis);

    const parsed = designSpecSchema.safeParse(designInput);
    if (!parsed.success) {
      throw new AppError("DESIGN_SPEC_INVALID", "设计结构不合法。", 400, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      });
    }
    const { design, issues } = validateDesignSpec(parsed.data, context);

    const composition = composeCanvas({
      design,
      plan,
      analysis,
      durationMs: asset.media.durationMs
    });

    // 编辑结果即 L2 最终产物：落盘，重开页面还在
    await this.store.writeAnalysis(id, "design", {
      promptVersion: DESIGN_PROMPT_VERSION,
      cachedAt: new Date().toISOString(),
      design
    });

    return { design, composition, issues, plan };
  }

  /** 读取已保存的 L2 结果（没有就返回 null）。 */
  async load(id: string): Promise<DesignSpec | null> {
    const stored = await this.store.readAnalysis<{ design?: unknown }>(id, "design");
    if (!stored?.design) return null;
    const parsed = designSpecSchema.safeParse(stored.design);
    return parsed.success ? parsed.data : null;
  }

  private async loadAnalysis(id: string): Promise<SceneAnalysis> {
    const raw = await this.store.readAnalysis<unknown>(id, "scene-analysis");
    const parsed = sceneAnalysisSchema.safeParse(unwrapStoredSceneAnalysis(raw));
    if (!parsed.success) {
      throw new AppError("SCENE_ANALYSIS_REQUIRED", "请先完成 AI 画面分析。", 409);
    }
    return parsed.data;
  }
}

function displayFrame(media: { width: number; height: number; rotation: number }): {
  width: number;
  height: number;
} {
  const swapped = Math.abs(media.rotation) % 180 === 90;
  return swapped ? { width: media.height, height: media.width } : { width: media.width, height: media.height };
}
