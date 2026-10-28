import { AppError } from "../../../shared/errors/app-error.js";
import {
  sceneAnalysisSchema,
  type SceneAnalysis
} from "../domain/design-assistant.schemas.js";
import {
  isStoredSceneAnalysis,
  SCENE_ANALYSIS_PROMPT_VERSION,
  type StoredSceneAnalysis
} from "../domain/scene-analysis-cache.js";
import type { DesignAssistantGateway, DesignAssetStore } from "./design-assistant.ports.js";

interface CacheEntry {
  promptVersion: number;
  analysis: SceneAnalysis;
}

export interface AnalyzeSceneOptions {
  /** 跳过缓存，强制重新调用模型。 */
  refresh?: boolean;
}

/**
 * 画面分析用例，带两级缓存：
 * 1) 进程内 Map：命中后零 IO，进程重启即失效；
 * 2) 磁盘 `<asset>/analysis/scene-analysis.json`：跨重启存活，按提示词版本失效。
 * 另外用 inFlight 做「单飞」，同一张图并发点击只会有一次模型调用。
 */
export class AnalyzeScene {
  private readonly memory = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<SceneAnalysis>>();

  constructor(
    private readonly store: DesignAssetStore,
    private readonly gateway: DesignAssistantGateway
  ) {}

  async execute(id: string, options: AnalyzeSceneOptions = {}): Promise<SceneAnalysis> {
    if (!options.refresh) {
      const memoryHit = this.memory.get(id);
      if (memoryHit && memoryHit.promptVersion === SCENE_ANALYSIS_PROMPT_VERSION) {
        return memoryHit.analysis;
      }
      const diskHit = await this.readCache(id);
      if (diskHit) return diskHit;
    }

    const pending = this.inFlight.get(id);
    if (pending) return pending;

    const task = this.analyzeAndCache(id).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, task);
    return task;
  }

  private async readCache(id: string): Promise<SceneAnalysis | null> {
    const raw = await this.store.readAnalysis<unknown>(id, "scene-analysis");
    // 旧版文件没有版本信封，无法判断提示词是否一致，一律视为过期。
    if (!isStoredSceneAnalysis(raw)) return null;
    if (raw.promptVersion !== SCENE_ANALYSIS_PROMPT_VERSION) return null;
    const parsed = sceneAnalysisSchema.safeParse(raw.analysis);
    if (!parsed.success) return null;
    this.memory.set(id, {
      promptVersion: SCENE_ANALYSIS_PROMPT_VERSION,
      analysis: parsed.data
    });
    return parsed.data;
  }

  private async analyzeAndCache(id: string): Promise<SceneAnalysis> {
    const asset = await this.store.findAsset(id);
    if (!asset) throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);

    const poster = await this.store.readPoster(id);
    const raw = await this.gateway.analyzeScene(poster.toString("base64"));
    const parsed = sceneAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("MODEL_OUTPUT_INVALID", "DeepSeek 返回的画面分析格式不正确。", 502, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const envelope: StoredSceneAnalysis = {
      promptVersion: SCENE_ANALYSIS_PROMPT_VERSION,
      cachedAt: new Date().toISOString(),
      analysis: parsed.data
    };
    await this.store.writeAnalysis(id, "scene-analysis", envelope);
    this.memory.set(id, {
      promptVersion: SCENE_ANALYSIS_PROMPT_VERSION,
      analysis: parsed.data
    });
    return parsed.data;
  }
}
