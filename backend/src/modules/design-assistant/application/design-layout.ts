import { AppError } from "../../../shared/errors/app-error.js";
import { sceneAnalysisSchema, type SceneAnalysis } from "../domain/design-assistant.schemas.js";
import { designSpecSchema, type DesignSpec } from "../domain/design-spec.schemas.js";
import {
  buildDesignContext,
  validateDesignSpec,
  type DesignContext,
  type DesignIssue
} from "../domain/design-spec.validator.js";
import { planLayout, type LayoutPlan } from "../domain/layout-plan.js";
import { unwrapStoredSceneAnalysis } from "../domain/scene-analysis-cache.js";
import type { DesignAssistantGateway, DesignAssetStore } from "./design-assistant.ports.js";

/** L2 提示词版本：改 prompt 或字段语义时必须 +1，否则旧 design.json 会被沿用。 */
export const DESIGN_PROMPT_VERSION = 4;

export interface DesignLayoutResult {
  design: DesignSpec;
  /** 校验阶段被修正过的地方（空数组 = 模型一次就守规矩）。 */
  issues: DesignIssue[];
  /** 是否用到了 selfies/<key>.md 的文案源。 */
  hasCopySource: boolean;
  promptVersion: number;
}

export class DesignLayout {
  constructor(
    private readonly store: DesignAssetStore,
    private readonly gateway: DesignAssistantGateway
  ) {}

  async execute(
    id: string,
    input: { brief?: string; focusSubjects?: readonly string[] } = {}
  ): Promise<DesignLayoutResult> {
    const asset = await this.store.findAsset(id);
    if (!asset) throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);

    const analysis = await this.loadAnalysis(id);
    const plan = planLayout(analysis, input.focusSubjects, displayFrame(asset.media));
    const context = buildDesignContext(plan, analysis);
    const copySource = await this.store.readCopySource(id);
    const brief = input.brief?.trim() ?? "";

    const first = await this.askModel({ brief, copySource, plan, analysis, asset, context });
    let design = first.design;
    let issues = first.issues;

    // 被修正过就带着问题清单再要一次，最多重试 1 次（成本可控，质量明显更稳）
    if (issues.length > 0) {
      const retryBrief = [
        brief,
        "",
        "【上一次输出被代码修正的问题，这次不要重复】",
        ...issues.slice(0, 8).map((issue) => `- ${issue.path}: ${issue.message}`)
      ].join("\n");
      const second = await this.askModel({ brief: retryBrief, copySource, plan, analysis, asset, context });
      if (second.issues.length < issues.length) {
        design = second.design;
        issues = second.issues;
      }
    }

    await this.store.writeAnalysis(id, "design", {
      promptVersion: DESIGN_PROMPT_VERSION,
      cachedAt: new Date().toISOString(),
      design
    });

    return { design, issues, hasCopySource: copySource.length > 0, promptVersion: DESIGN_PROMPT_VERSION };
  }

  private async askModel(args: {
    brief: string;
    copySource: string;
    plan: LayoutPlan;
    analysis: SceneAnalysis;
    asset: { media: { durationMs: number } };
    context: DesignContext;
  }): Promise<{ design: DesignSpec; issues: DesignIssue[] }> {
    const raw = await this.gateway.designLayout({
      brief: args.brief,
      copySource: args.copySource,
      layoutPlan: summarizePlan(args.plan, args.context),
      sceneAnalysis: summarizeAnalysis(args.analysis),
      durationMs: args.asset.media.durationMs,
      frameRatio: args.plan.frameRatio
    });

    const parsed = designSpecSchema.safeParse(normalizeDesignOutput(raw));
    if (!parsed.success) {
      throw new AppError("MODEL_OUTPUT_INVALID", "DeepSeek 返回的设计结构不正确。", 502, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      });
    }
    return validateDesignSpec(parsed.data, args.context);
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

/** 模型偶尔把结果包一层、或用字符串写数字，先掰正再交给 zod。 */
export function normalizeDesignOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  const source = (record.design ?? record.spec ?? record) as Record<string, unknown>;

  const toNumber = (value: unknown): unknown => {
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return value;
  };

  const blocks = Array.isArray(source.blocks)
    ? source.blocks.map((block) => {
        if (!block || typeof block !== "object") return block;
        const item = block as Record<string, unknown>;
        const anchor = (item.anchor ?? {}) as Record<string, unknown>;
        const enter = (item.enter ?? {}) as Record<string, unknown>;
        const idle = item.idle as Record<string, unknown> | undefined;
        return {
          ...item,
          sizeRatio: toNumber(item.sizeRatio),
          weight: toNumber(item.weight),
          tracking: toNumber(item.tracking),
          lineHeight: toNumber(item.lineHeight),
          anchor: { ...anchor, dxPct: toNumber(anchor.dxPct ?? 0), dyPct: toNumber(anchor.dyPct ?? 0) },
          enter: { id: enter.id ?? "fade", params: enter.params ?? {} },
          ...(idle ? { idle: { id: idle.id, params: idle.params ?? {} } } : {})
        };
      })
    : source.blocks;

  const effects = Array.isArray(source.effects)
    ? source.effects.map((effect) => {
        if (!effect || typeof effect !== "object") return effect;
        const item = effect as Record<string, unknown>;
        const anchor = (item.anchor ?? {}) as Record<string, unknown>;
        return {
          ...item,
          anchor: { ...anchor, dxPct: toNumber(anchor.dxPct ?? 0), dyPct: toNumber(anchor.dyPct ?? 0) },
          params: item.params ?? {}
        };
      })
    : [];

  return {
    ...source,
    version: 1,
    concept:
      typeof source.concept === "string"
        ? [...source.concept.trim()].slice(0, 160).join("")
        : "",
    blocks,
    effects,
    beats: source.beats ?? { pace: "medium", startMs: 0 }
  };
}

/** 给模型看的 L1 摘要：只保留决策，不回传整张热区表（省 token）。 */
function summarizePlan(plan: LayoutPlan, context: DesignContext) {
  const anchor = (span: LayoutPlan["textAnchor"] | null | undefined) =>
    span
      ? {
          id: span.id,
          label: span.label,
          colStart: span.colStart,
          colEnd: span.colEnd,
          rowStart: span.rowStart,
          rowEnd: span.rowEnd,
          heat: Number(span.heat.toFixed(3)),
          cells: span.cells
        }
      : null;

  return {
    selection: plan.selection,
    areaRatio: Number(plan.areaRatio.toFixed(3)),
    scale: plan.scale,
    dominantRegion: plan.dominantRegion,
    grid: plan.grid,
    frameRatio: Number(plan.frameRatio.toFixed(3)),
    strategy: plan.strategy,
    textAnchor: anchor(plan.textAnchor),
    secondaryAnchor: anchor(plan.secondaryAnchor),
    freeColumn: plan.freeColumn,
    availableAnchors: context.anchors,
    palette: {
      suggested: plan.palette.suggested,
      base: plan.palette.base,
      options: plan.palette.options.map((option) => ({
        hex: option.hex,
        name: option.name,
        use: option.use,
        contrast: Number(option.contrast.toFixed(2))
      }))
    }
  };
}

/** 给模型看的画面摘要：不传 20 点多边形，只留语义。 */
function summarizeAnalysis(analysis: SceneAnalysis) {
  return {
    summary: analysis.summary,
    environment: analysis.environment,
    background: analysis.background,
    dominantColors: analysis.dominantColors,
    marketingTone: analysis.marketingTone,
    subjects: analysis.subjectRegions.map((region) => ({
      label: region.label,
      importance: region.importance,
      colors: region.colors
    })),
    safeZones: analysis.safeZones.map((zone) => ({
      x: Number(zone.x.toFixed(3)),
      y: Number(zone.y.toFixed(3)),
      width: Number(zone.width.toFixed(3)),
      height: Number(zone.height.toFixed(3)),
      reason: zone.reason,
      colors: zone.colors
    }))
  };
}

function displayFrame(media: { width: number; height: number; rotation: number }): {
  width: number;
  height: number;
} {
  const swapped = Math.abs(media.rotation) % 180 === 90;
  return swapped ? { width: media.height, height: media.width } : { width: media.width, height: media.height };
}
