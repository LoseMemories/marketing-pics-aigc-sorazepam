export const platformHints = ["apple", "android", "harmony", "unknown"] as const;
export type PlatformHint = (typeof platformHints)[number];

export type StillFormat = "jpeg" | "heic" | "avif";
export type MotionFormat = "mov" | "mp4";

export interface IncomingUploadFile {
  temporaryPath: string;
  originalName: string;
  mimeType: string;
  byteLength: number;
}

export interface StoredSourceFile {
  kind: "original" | "still" | "motion";
  originalName: string;
  mimeType: string;
  format: StillFormat | MotionFormat;
  relativePath: string;
  byteLength: number;
  sha256: string;
}

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  rotation: number;
  videoCodec: string;
  hasAudio: boolean;
}

export interface LiveAssetRecord {
  id: string;
  platformHint: PlatformHint;
  status: "ready";
  source: {
    original: StoredSourceFile;
    pairedMotion?: StoredSourceFile;
    assetIdentifier?: string;
  };
  derived: {
    still: StoredSourceFile;
    motion: StoredSourceFile;
  };
  containerExtraction: {
    strategy: "xmp-offset" | "ftyp-scan" | "apple-paired-resource" | "demo-seed";
    videoOffset: number;
    videoLength: number;
    xmpDetected: boolean;
  };
  preview: {
    posterRelativePath: string;
    motionRelativePath: string;
    /** 预览生成管线版本；升级后会触发重新生成，避免沿用旧规则产出的海报。 */
    pipelineVersion?: number;
  };
  media: VideoMetadata;
  createdAt: string;
}

export interface LiveAssetDto {
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
