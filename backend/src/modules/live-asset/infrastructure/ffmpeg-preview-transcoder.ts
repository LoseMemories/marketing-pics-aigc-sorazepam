import { copyFile, rename, rm } from "node:fs/promises";
import { runCommand } from "../../../shared/media/command-runner.js";
import type { PreviewTranscoder } from "../application/live-asset.ports.js";
import type { StillFormat } from "../domain/live-asset.types.js";

export class FfmpegPreviewTranscoder implements PreviewTranscoder {
  constructor(
    private readonly ffmpegPath: string,
    private readonly sipsPath: string,
    private readonly heifConvertPath: string
  ) {}

  async createPoster(
    sourcePath: string,
    format: StillFormat,
    destinationPath: string
  ): Promise<void> {
    if (format === "jpeg") {
      await copyFile(sourcePath, destinationPath);
      return;
    }
    if (process.platform === "darwin") {
      try {
        await runCommand(this.heifConvertPath, [sourcePath, destinationPath]);
        await runCommand(this.sipsPath, [
          "--resampleHeightWidthMax",
          "2000",
          destinationPath
        ]);
        await this.bakeOrientation(destinationPath);
        const dimensions = await this.readSipsDimensions(destinationPath);
        assertSipsRasterOutput(dimensions);
        return;
      } catch {
        await rm(destinationPath, { force: true });
      }
      try {
        await runCommand(this.sipsPath, [
          "--resampleHeightWidthMax",
          "2000",
          "--setProperty",
          "format",
          "jpeg",
          sourcePath,
          "--out",
          destinationPath
        ]);
        await this.bakeOrientation(destinationPath);
        assertSipsRasterOutput(await this.readSipsDimensions(destinationPath));
        return;
      } catch {
        await rm(destinationPath, { force: true });
        // The bundled FFmpeg is the portable fallback when sips cannot decode a source.
      }
    }
    await runCommand(this.ffmpegPath, [
      "-y",
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-map_metadata",
      "-1",
      "-q:v",
      "2",
      destinationPath
    ]);
  }

  /**
   * sips 会保留源文件的 EXIF 方向标记而不旋转像素，浏览器随后会再旋转一次，
   * 导致「海报像素尺寸」与「实际显示尺寸」不一致。这里用 ffmpeg 把方向烘焙进像素
   * 并剥离元数据，确保后续读到的像素尺寸就是浏览器显示尺寸。
   */
  private async bakeOrientation(imagePath: string): Promise<void> {
    const temporaryPath = `${imagePath}.upright.jpg`;
    try {
      await runCommand(this.ffmpegPath, [
        "-y",
        "-i",
        imagePath,
        "-map_metadata",
        "-1",
        "-q:v",
        "2",
        temporaryPath
      ]);
      await rename(temporaryPath, imagePath);
    } catch {
      await rm(temporaryPath, { force: true });
    }
  }

  async createMotionPreview(sourcePath: string, destinationPath: string): Promise<void> {
    await runCommand(this.ffmpegPath, [
      "-y",
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      destinationPath
    ]);
  }

  private async readSipsDimensions(filePath: string): Promise<string> {
    const result = await runCommand(this.sipsPath, [
      "--getProperty",
      "pixelWidth",
      "--getProperty",
      "pixelHeight",
      filePath
    ]);
    return result.stdout;
  }
}

export function assertSipsRasterOutput(output: string): void {
  const width = Number.parseInt(/pixelWidth:\s*(\d+)/.exec(output)?.[1] ?? "", 10);
  const height = Number.parseInt(/pixelHeight:\s*(\d+)/.exec(output)?.[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("sips produced an image without decodable pixel dimensions");
  }
}
