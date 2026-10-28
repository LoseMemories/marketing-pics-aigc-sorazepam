import { describe, expect, it } from "vitest";
import { toLiveAssetDto } from "../src/modules/live-asset/domain/live-asset.js";
import type { LiveAssetRecord } from "../src/modules/live-asset/domain/live-asset.types.js";

describe("live asset DTO", () => {
  it("exposes derived previews without exposing source file paths", () => {
    const id = "a66f22a5-9ae1-4fac-8608-9abf20db08ab";
    const record: LiveAssetRecord = {
      id,
      platformHint: "apple",
      status: "ready",
      source: {
        original: {
          kind: "original",
          originalName: "motion-photo.jpg",
          mimeType: "image/jpeg",
          format: "jpeg",
          relativePath: `${id}/source/original.jpg`,
          byteLength: 16,
          sha256: "original-hash"
        }
      },
      derived: {
        still: {
          kind: "still",
          originalName: "motion-photo.jpg",
          mimeType: "image/jpeg",
          format: "jpeg",
          relativePath: `${id}/derived/still.jpg`,
          byteLength: 4,
          sha256: "still-hash"
        },
        motion: {
          kind: "motion",
          originalName: "extracted-motion.mp4",
          mimeType: "video/mp4",
          format: "mp4",
          relativePath: `${id}/derived/motion.mp4`,
          byteLength: 12,
          sha256: "motion-hash"
        }
      },
      containerExtraction: {
        strategy: "ftyp-scan",
        videoOffset: 4,
        videoLength: 12,
        xmpDetected: false
      },
      preview: {
        posterRelativePath: `${id}/preview/poster.jpg`,
        motionRelativePath: `${id}/preview/motion.mp4`
      },
      media: {
        durationMs: 2800,
        width: 1920,
        height: 1080,
        rotation: 0,
        videoCodec: "hevc",
        hasAudio: true
      },
      createdAt: "2026-10-25T00:00:00.000Z"
    };

    const dto = toLiveAssetDto(record);
    expect(dto.posterUrl).toBe(`/media/${id}/preview/poster.jpg`);
    expect(dto.videoUrl).toBe(`/media/${id}/preview/motion.mp4`);
    expect(dto).not.toHaveProperty("source");
  });
});
