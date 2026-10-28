import { readApiError } from "@/shared/api/http-client";
import { resolveApiBaseUrl } from "@/shared/api/api-endpoint";
import type {
  CompositionSpec,
  DesignLayoutResult,
  DesignSpec,
  LayoutPlan,
  SceneAnalysis
} from "../model/design-assistant.types";

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const apiBaseUrl = await resolveApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) throw readApiError(payload, response.status);
  return payload as T;
}

async function getJson<T>(path: string): Promise<T> {
  const apiBaseUrl = await resolveApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`);
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) throw readApiError(payload, response.status);
  return payload as T;
}

export function analyzeLiveAssetScene(
  assetId: string,
  options: { refresh?: boolean } = {}
): Promise<SceneAnalysis> {
  const query = options.refresh ? "?refresh=1" : "";
  return postJson(`/api/v1/live-assets/${assetId}/scene-analysis${query}`);
}

export function planLayout(
  assetId: string,
  focusSubjects?: readonly string[]
): Promise<LayoutPlan> {
  return postJson(
    `/api/v1/live-assets/${assetId}/layout-plan`,
    focusSubjects === undefined ? {} : { focusSubjects }
  );
}

export function generateComposition(
  assetId: string,
  brief: string,
  focusSubjects: readonly string[] = []
): Promise<CompositionSpec> {
  return postJson(`/api/v1/live-assets/${assetId}/composition`, {
    brief,
    ...(focusSubjects.length > 0 ? { focusSubjects } : {})
  });
}

/** L2：调模型出设计语汇（慢，只在「重新设计」时用）。 */
export function designLayout(
  assetId: string,
  brief: string,
  focusSubjects: readonly string[] = []
): Promise<DesignLayoutResult> {
  return postJson(`/api/v1/live-assets/${assetId}/design-layout`, {
    brief,
    ...(focusSubjects.length > 0 ? { focusSubjects } : {})
  });
}

/** L3：纯解算（快，编辑时每次都调），顺带把设计落盘。 */
export function composeDesign(
  assetId: string,
  design: DesignSpec,
  focusSubjects: readonly string[] = []
): Promise<{ composition: CompositionSpec; design: DesignSpec }> {
  return postJson(`/api/v1/live-assets/${assetId}/compose`, {
    design,
    ...(focusSubjects.length > 0 ? { focusSubjects } : {})
  });
}

/** 读回已保存的 L2 结果（换图/刷新后还能继续改）。 */
export function readDesign(assetId: string): Promise<{ design: DesignSpec | null }> {
  return getJson(`/api/v1/live-assets/${assetId}/design`);
}

/** selfies 里的同名 md 文案源。 */
export function readCopySource(assetId: string): Promise<{ text: string; hasCopySource: boolean }> {
  return getJson(`/api/v1/live-assets/${assetId}/copy-source`);
}
