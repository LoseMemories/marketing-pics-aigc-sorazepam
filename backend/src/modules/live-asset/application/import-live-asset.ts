import { randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import { toLiveAssetDto } from "../domain/live-asset.js";
import { validateStillFile } from "../domain/media-validation.js";
import type {
  IncomingUploadFile,
  LiveAssetDto,
  LiveAssetRecord,
} from "../domain/live-asset.types.js";
import type {
  LiveAssetRepository,
  MotionPhotoExtractor,
  PreviewTranscoder
} from "./live-asset.ports.js";

export interface ImportLiveAssetInput {
  livePhoto: IncomingUploadFile;
}

export interface ImportLimits {
  maxMotionBytes: number;
}

export class ImportLiveAsset {
  constructor(
    private readonly repository: LiveAssetRepository,
    private readonly extractor: MotionPhotoExtractor,
    private readonly previewTranscoder: PreviewTranscoder,
    private readonly limits: ImportLimits
  ) {}

  async execute(input: ImportLiveAssetInput): Promise<LiveAssetDto> {
    const stillFormat = await validateStillFile(input.livePhoto, this.limits.maxMotionBytes);

    const id = randomUUID();
    try {
      const workspace = await this.repository.createWorkspace(id);
      const original = await this.repository.storeSource({
        id,
        kind: "original",
        temporaryPath: input.livePhoto.temporaryPath,
        originalName: input.livePhoto.originalName,
        mimeType: input.livePhoto.mimeType,
        format: stillFormat
      });
      const extraction = await this.extractor.extract({
        sourcePath: original.absolutePath,
        stillFormat,
        stillDestination: workspace.derivedStillPath(stillFormat),
        motionDestination: workspace.derivedMotionPath
      });
      const stillFile = await this.repository.describeFile({
        id,
        kind: "still",
        originalName: input.livePhoto.originalName,
        mimeType: input.livePhoto.mimeType,
        format: stillFormat,
        absolutePath: extraction.stillPath
      });
      const motionFile = await this.repository.describeFile({
        id,
        kind: "motion",
        originalName: "extracted-motion.mp4",
        mimeType: "video/mp4",
        format: extraction.motionFormat,
        absolutePath: extraction.motionPath
      });

      await this.previewTranscoder.createPoster(
        extraction.stillPath,
        stillFormat,
        workspace.posterPath
      );
      await this.previewTranscoder.createMotionPreview(
        extraction.motionPath,
        workspace.motionPreviewPath
      );

      const record: LiveAssetRecord = {
        id,
        platformHint: extraction.platformHint,
        status: "ready",
        source: { original: original.file },
        derived: { still: stillFile, motion: motionFile },
        containerExtraction: {
          strategy: extraction.strategy,
          videoOffset: extraction.videoOffset,
          videoLength: extraction.videoLength,
          xmpDetected: extraction.xmpDetected
        },
        preview: {
          posterRelativePath: `${id}/preview/poster.jpg`,
          motionRelativePath: `${id}/preview/motion.mp4`
        },
        media: extraction.media,
        createdAt: new Date().toISOString()
      };
      await this.repository.save(record);
      return toLiveAssetDto(record);
    } catch (error) {
      await this.repository.remove(id);
      if (error instanceof AppError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AppError("MEDIA_TOOL_UNAVAILABLE", "本机缺少可用的媒体转换工具。", 503);
      }
      throw new AppError("PREVIEW_GENERATION_FAILED", "预览资源生成失败。", 500, {
        reason: error instanceof Error ? error.message : "unknown"
      });
    }
  }
}
