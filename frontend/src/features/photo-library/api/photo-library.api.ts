import { qualifyApiUrl, resolveApiBaseUrl } from "@/shared/api/api-endpoint";
import { readApiError } from "@/shared/api/http-client";
import type { PhotoLibraryItem } from "../model/photo-library.types";

export async function listPhotoLibrary(options: { refresh?: boolean } = {}): Promise<PhotoLibraryItem[]> {
  const baseUrl = await resolveApiBaseUrl();
  const query = options.refresh ? "?refresh=1" : "";
  const response = await fetch(`${baseUrl}/api/v1/photo-library${query}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(payload, response.status);

  return (payload as PhotoLibraryItem[]).map((item) =>
    item.asset
      ? {
          ...item,
          asset: {
            ...item.asset,
            posterUrl: qualifyApiUrl(baseUrl, item.asset.posterUrl),
            thumbUrl: qualifyApiUrl(baseUrl, item.asset.thumbUrl),
            videoUrl: qualifyApiUrl(baseUrl, item.asset.videoUrl)
          }
        }
      : item
  );
}
