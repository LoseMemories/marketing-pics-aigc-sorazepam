import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { qualifyApiUrl, resolveApiBaseUrl } from "@/shared/api/api-endpoint";
import { ApiClientError, readApiError } from "@/shared/api/http-client";
import { runtimeConfig } from "@/shared/config/runtime-config";
import type { PhotoHelperHealth } from "../model/import-source.types";

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function getPhotoHelperHealth(): Promise<PhotoHelperHealth> {
  let response: Response;
  try {
    response = await fetch(`${runtimeConfig.photoHelperBaseUrl}/health`, {
      signal: AbortSignal.timeout(1_500)
    });
  } catch {
    throw new ApiClientError("未检测到本机相册助手，请先启动它。", "PHOTO_HELPER_OFFLINE", 0);
  }
  const payload = await readJson(response);
  if (!response.ok) throw readApiError(payload, response.status);
  return payload as PhotoHelperHealth;
}

export async function pickAppleLivePhoto(): Promise<LiveAsset> {
  const backendBaseUrl = await resolveApiBaseUrl();
  const backendUrl = backendBaseUrl || window.location.origin;
  let response: Response;
  try {
    response = await fetch(`${runtimeConfig.photoHelperBaseUrl}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backendBaseUrl: backendUrl })
    });
  } catch {
    throw new ApiClientError("无法连接本机相册助手。", "PHOTO_HELPER_OFFLINE", 0);
  }
  const payload = await readJson(response);
  if (!response.ok) throw readApiError(payload, response.status);
  const asset = payload as LiveAsset;
  return {
    ...asset,
    posterUrl: qualifyApiUrl(backendBaseUrl, asset.posterUrl),
    videoUrl: qualifyApiUrl(backendBaseUrl, asset.videoUrl)
  };
}
