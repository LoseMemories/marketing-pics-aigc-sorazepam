import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { runCommand } from "./command-runner.js";

export interface ToolAvailability {
  ffmpeg: boolean;
  ffprobe: boolean;
  sips: boolean;
  heifConvert: boolean;
}

export class MediaToolchain {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly sipsPath: string;
  readonly heifConvertPath: string;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const bundledFfmpegPath = typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : null;
    this.ffmpegPath = environment.FFMPEG_PATH ?? bundledFfmpegPath ?? "ffmpeg";
    this.ffprobePath = environment.FFPROBE_PATH ?? ffprobeStatic.path ?? "ffprobe";
    this.sipsPath = environment.SIPS_PATH ?? "sips";
    this.heifConvertPath = environment.HEIF_CONVERT_PATH ?? "heif-convert";
  }

  async availability(): Promise<ToolAvailability> {
    const [ffmpeg, ffprobe, sips, heifConvert] = await Promise.all([
      this.canRun(this.ffmpegPath, ["-version"]),
      this.canRun(this.ffprobePath, ["-version"]),
      process.platform === "darwin"
        ? this.canRun(this.sipsPath, ["--version"])
        : Promise.resolve(false),
      this.canRun(this.heifConvertPath, ["--help"])
    ]);
    return { ffmpeg, ffprobe, sips, heifConvert };
  }

  private async canRun(command: string, args: readonly string[]): Promise<boolean> {
    try {
      await runCommand(command, args, 5_000);
      return true;
    } catch {
      return false;
    }
  }
}
