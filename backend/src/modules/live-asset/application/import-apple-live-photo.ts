import { randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import { toLiveAssetDto } from "../domain/live-asset.js";
import { validateMotionFile, validateStillFile } from "../domain/media-validation.js";
import type { IncomingUploadFile, LiveAssetDto, LiveAssetRecord } from "../domain/live-asset.types.js";
import type { LiveAssetRepository, MediaProbe, PreviewTranscoder } from "./live-asset.ports.js";

export interface ImportAppleLivePhotoInput {
  still: IncomingUploadFile;
  motion: IncomingUploadFile;
  assetIdentifier?: string;
}

export class ImportAppleLivePhoto {
  constructor(
    private readonly repository: LiveAssetRepository,
    private readonly mediaProbe: MediaProbe,
    private readonly previewTranscoder: PreviewTranscoder,
    private readonly limits: { maxStillBytes: number; maxMotionBytes: number }
  ) {}

  async execute(input: ImportAppleLivePhotoInput): Promise<LiveAssetDto> {
    const [stillFormat, motionFormat] = await Promise.all([
      validateStillFile(input.still, this.limits.maxStillBytes),
      validateMotionFile(input.motion, this.limits.maxMotionBytes)
    ]);
    const id = randomUUID();
    try {
      const workspace = await this.repository.createWorkspace(id);
      const still = await this.repository.storeSource({
        id,
        kind: "original",
        location: "source",
        temporaryPath: input.still.temporaryPath,
        originalName: input.still.originalName,
        mimeType: input.still.mimeType,
        format: stillFormat
      });
      const motion = await this.repository.storeSource({
        id,
        kind: "motion",
        location: "source",
        temporaryPath: input.motion.temporaryPath,
        originalName: input.motion.originalName,
        mimeType: input.motion.mimeType,
        format: motionFormat
      });
      const media = await this.mediaProbe.probeVideo(motion.absolutePath);
      await this.previewTranscoder.createPoster(still.absolutePath, stillFormat, workspace.posterPath);
      await this.previewTranscoder.createMotionPreview(motion.absolutePath, workspace.motionPreviewPath);

      const record: LiveAssetRecord = {
        id,
        platformHint: "apple",
        status: "ready",
        source: {
          original: still.file,
          pairedMotion: motion.file,
          ...(input.assetIdentifier ? { assetIdentifier: input.assetIdentifier } : {})
        },
        derived: { still: still.file, motion: motion.file },
        containerExtraction: {
          strategy: "apple-paired-resource",
          videoOffset: 0,
          videoLength: motion.file.byteLength,
          xmpDetected: false
        },
        preview: {
          posterRelativePath: `${id}/preview/poster.jpg`,
          motionRelativePath: `${id}/preview/motion.mp4`
        },
        media,
        createdAt: new Date().toISOString()
      };
      await this.repository.save(record);
      return toLiveAssetDto(record);
    } catch (error) {
      await this.repository.remove(id);
      if (error instanceof AppError) throw error;
      throw new AppError("APPLE_PAIR_IMPORT_FAILED", "Apple 实况资源导入失败。", 500, {
        reason: error instanceof Error ? error.message : "unknown"
      });
    }
  }
}
