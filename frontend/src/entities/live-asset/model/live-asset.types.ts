export type PlatformHint = "apple" | "android" | "harmony" | "unknown";

export interface LiveAsset {
  id: string;
  platformHint: PlatformHint;
  status: "ready";
  posterUrl: string;
  thumbUrl: string;
  videoUrl: string;
  durationMs: number;
  width: number;
  height: number;
  rotation: number;
  videoCodec: string;
  hasAudio: boolean;
  createdAt: string;
}

export interface UploadLiveAssetInput {
  livePhoto: File;
}

export interface UploadAppleLivePhotoPairInput {
  still: File;
  motion: File;
  assetIdentifier?: string;
}
