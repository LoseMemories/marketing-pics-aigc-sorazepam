import type { LiveAssetDto, LiveAssetRecord } from "./live-asset.types.js";

export function toLiveAssetDto(record: LiveAssetRecord): LiveAssetDto {
  return {
    id: record.id,
    platformHint: record.platformHint,
    status: record.status,
    posterUrl: `/media/${record.id}/preview/poster.jpg`,
    thumbUrl: `/media/${record.id}/preview/thumb.jpg`,
    videoUrl: `/media/${record.id}/preview/motion.mp4`,
    durationMs: record.media.durationMs,
    width: record.media.width,
    height: record.media.height,
    rotation: record.media.rotation,
    videoCodec: record.media.videoCodec,
    hasAudio: record.media.hasAudio,
    createdAt: record.createdAt
  };
}
