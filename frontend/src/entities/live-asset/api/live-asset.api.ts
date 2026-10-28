import { ApiClientError, readApiError } from "@/shared/api/http-client";
import { qualifyApiUrl, resolveApiBaseUrl } from "@/shared/api/api-endpoint";
import type {
  LiveAsset,
  UploadAppleLivePhotoPairInput,
  UploadLiveAssetInput
} from "../model/live-asset.types";

function sendForm(
  endpoint: string,
  form: FormData,
  onProgress: (percentage: number) => void
): Promise<LiveAsset> {
  return resolveApiBaseUrl().then((apiBaseUrl) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiBaseUrl}${endpoint}`);
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      const payload = request.response as unknown;
      if (request.status >= 200 && request.status < 300) {
        const asset = payload as LiveAsset;
        resolve({
          ...asset,
          posterUrl: qualifyApiUrl(apiBaseUrl, asset.posterUrl),
          thumbUrl: qualifyApiUrl(apiBaseUrl, asset.thumbUrl),
          videoUrl: qualifyApiUrl(apiBaseUrl, asset.videoUrl)
        });
        return;
      }
      reject(readApiError(payload, request.status));
    });
    request.addEventListener("error", () => {
      reject(new ApiClientError("无法连接本地后端服务。", "NETWORK_ERROR", 0));
    });
    request.send(form);
  }));
}

export async function uploadLiveAsset(
  input: UploadLiveAssetInput,
  onProgress: (percentage: number) => void
): Promise<LiveAsset> {
  const form = new FormData();
  form.append("livePhoto", input.livePhoto);
  return sendForm("/api/v1/live-assets", form, onProgress);
}

export async function uploadAppleLivePhotoPair(
  input: UploadAppleLivePhotoPairInput,
  onProgress: (percentage: number) => void
): Promise<LiveAsset> {
  const form = new FormData();
  form.append("still", input.still);
  form.append("motion", input.motion);
  if (input.assetIdentifier) form.append("assetIdentifier", input.assetIdentifier);
  return sendForm("/api/v1/live-assets/apple-pair", form, onProgress);
}
