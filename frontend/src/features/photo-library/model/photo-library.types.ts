import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";

export type PhotoLibraryStatus = "processing" | "ready" | "failed";

export interface PhotoLibraryItem {
  key: string;
  title: string;
  status: PhotoLibraryStatus;
  photoWidth?: number;
  photoHeight?: number;
  asset?: LiveAsset;
  message?: string;
}
