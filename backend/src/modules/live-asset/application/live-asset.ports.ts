import type {
  LiveAssetRecord,
  MotionFormat,
  StillFormat,
  StoredSourceFile,
  VideoMetadata
} from "../domain/live-asset.types.js";

export interface AssetWorkspace {
  rootPath: string;
  sourceDirectory: string;
  derivedDirectory: string;
  previewDirectory: string;
  originalPath(format: StillFormat): string;
  derivedStillPath(format: StillFormat): string;
  derivedMotionPath: string;
  posterPath: string;
  motionPreviewPath: string;
}

export interface StoreSourceInput {
  id: string;
  kind: "original" | "still" | "motion";
  temporaryPath: string;
  originalName: string;
  mimeType: string;
  format: StillFormat | MotionFormat;
  location?: "source" | "derived";
}

export interface LiveAssetRepository {
  ensureReady(): Promise<void>;
  createWorkspace(id: string): Promise<AssetWorkspace>;
  storeSource(input: StoreSourceInput): Promise<{ file: StoredSourceFile; absolutePath: string }>;
  describeFile(input: Omit<StoreSourceInput, "temporaryPath"> & { absolutePath: string }): Promise<StoredSourceFile>;
  save(record: LiveAssetRecord): Promise<void>;
  findById(id: string): Promise<LiveAssetRecord | null>;
  remove(id: string): Promise<void>;
  resolvePreview(
    id: string,
    filename: "poster.jpg" | "thumb.jpg" | "motion.mp4"
  ): Promise<string | null>;
}

export interface MotionPhotoExtraction {
  stillPath: string;
  motionPath: string;
  motionFormat: MotionFormat;
  platformHint: "android" | "harmony" | "unknown";
  strategy: "xmp-offset" | "ftyp-scan";
  videoOffset: number;
  videoLength: number;
  xmpDetected: boolean;
  media: VideoMetadata;
}

export interface MotionPhotoExtractor {
  extract(input: {
    sourcePath: string;
    stillFormat: StillFormat;
    stillDestination: string;
    motionDestination: string;
  }): Promise<MotionPhotoExtraction>;
}

export interface MediaProbe {
  probeVideo(path: string): Promise<VideoMetadata>;
}

export interface PreviewTranscoder {
  createPoster(sourcePath: string, format: StillFormat, destinationPath: string): Promise<void>;
  createMotionPreview(sourcePath: string, destinationPath: string): Promise<void>;
}
