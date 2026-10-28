import { qualifyApiUrl, resolveApiBaseUrl } from "@/shared/api/api-endpoint";
import { readApiError } from "@/shared/api/http-client";
import type { DemoAsset } from "../model/import-source.types";

export async function listDemoAssets(): Promise<DemoAsset[]> {
  const baseUrl = await resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/demo-assets`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(payload, response.status);
  return (payload as DemoAsset[]).map((entry) => ({
    ...entry,
    asset: {
      ...entry.asset,
      posterUrl: qualifyApiUrl(baseUrl, entry.asset.posterUrl),
      thumbUrl: qualifyApiUrl(baseUrl, entry.asset.thumbUrl),
      videoUrl: qualifyApiUrl(baseUrl, entry.asset.videoUrl)
    }
  }));
}
