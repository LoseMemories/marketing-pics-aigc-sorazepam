import { AppError } from "../../../shared/errors/app-error.js";
import { runCommand } from "../../../shared/media/command-runner.js";
import type { MediaProbe } from "../application/live-asset.ports.js";
import type { VideoMetadata } from "../domain/live-asset.types.js";

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string };
}

export class FfprobeMediaProbe implements MediaProbe {
  constructor(private readonly ffprobePath: string) {}

  async probeVideo(filePath: string): Promise<VideoMetadata> {
    const { stdout } = await runCommand(this.ffprobePath, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath
    ]);
    const output = JSON.parse(stdout) as ProbeOutput;
    const streams = output.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");
    if (!video?.width || !video.height) {
      throw new AppError("INVALID_MOTION_VIDEO", "文件中没有可用的视频轨。", 422);
    }
    const rawDuration = video.duration ?? output.format?.duration ?? "0";
    const durationMs = Math.round(Number.parseFloat(rawDuration) * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new AppError("INVALID_MOTION_VIDEO", "无法确定动态视频时长。", 422);
    }
    const sideDataRotation = video.side_data_list?.find(
      (item) => typeof item.rotation === "number"
    )?.rotation;
    const rotation = sideDataRotation ?? (Number.parseInt(video.tags?.rotate ?? "0", 10) || 0);
    return {
      durationMs,
      width: video.width,
      height: video.height,
      rotation,
      videoCodec: video.codec_name ?? "unknown",
      hasAudio: streams.some((stream) => stream.codec_type === "audio")
    };
  }
}
