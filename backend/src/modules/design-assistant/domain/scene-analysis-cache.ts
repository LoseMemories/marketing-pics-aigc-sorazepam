/**
 * 画面分析提示词的版本号。
 * 修改 `DeepSeekDesignAssistant.analyzeScene()` 的提示词或字段语义时必须 +1，
 * 否则本地缓存里的旧结果会继续被沿用。
 */
/**
 * v3：主体区域增加 colors、安全区增加底色 colors，用于特效配色与文字对比度。
 * v4：主体轮廓 points 由 20 个点加密到 80 个点（上限 100），用于更贴合的高亮与热区。
 * v5：主体轮廓固定 100 个点，并明确它是外扩的大致范围（不抠图）。
 * v6：退回 20 个点（100 点使分析耗时从 23s 涨到 75s），形状仍由前端平滑到 100 点渲染。
 */
export const SCENE_ANALYSIS_PROMPT_VERSION = 7;

export interface StoredSceneAnalysis {
  promptVersion: number;
  cachedAt: string;
  analysis: unknown;
}

export function isStoredSceneAnalysis(value: unknown): value is StoredSceneAnalysis {
  return (
    typeof value === "object" &&
    value !== null &&
    "analysis" in value &&
    "promptVersion" in value
  );
}

/** 兼容历史文件：早期直接存的就是分析结果本身，没有信封。 */
export function unwrapStoredSceneAnalysis(value: unknown): unknown {
  return isStoredSceneAnalysis(value) ? value.analysis : value;
}
