import type { LiveAssetRecord } from "../../live-asset/domain/live-asset.types.js";

export interface DesignAssetStore {
  findAsset(id: string): Promise<LiveAssetRecord | null>;
  readPoster(id: string): Promise<Buffer>;
  readAnalysis<T>(id: string, name: string): Promise<T | null>;
  writeAnalysis(id: string, name: string, value: unknown): Promise<void>;
  /** 与照片同名的博客文案（selfies/<key>.md），没有就返回空字符串。 */
  readCopySource(id: string): Promise<string>;
}

export interface DesignAssistantGateway {
  analyzeScene(imageBase64: string): Promise<unknown>;
  generateComposition(input: {
    brief: string;
    sceneAnalysis: unknown;
    focusSubjects?: readonly string[];
    durationMs: number;
    width: number;
    height: number;
  }): Promise<unknown>;
  /** L2：只出设计语汇（DesignSpec），不负责坐标与毫秒。 */
  designLayout(input: {
    brief: string;
    copySource: string;
    layoutPlan: unknown;
    sceneAnalysis: unknown;
    durationMs: number;
    frameRatio: number;
  }): Promise<unknown>;
}
