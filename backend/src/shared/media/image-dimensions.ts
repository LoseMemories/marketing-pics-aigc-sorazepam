import { runCommand } from "./command-runner.js";

export interface PixelSize {
  width: number;
  height: number;
}

export function parseSipsPixelSize(output: string): PixelSize | null {
  const width = Number.parseInt(/pixelWidth:\s*(\d+)/.exec(output)?.[1] ?? "", 10);
  const height = Number.parseInt(/pixelHeight:\s*(\d+)/.exec(output)?.[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export async function readSipsPixelSize(
  sipsPath: string,
  filePath: string
): Promise<PixelSize | null> {
  try {
    const { stdout } = await runCommand(sipsPath, [
      "--getProperty",
      "pixelWidth",
      "--getProperty",
      "pixelHeight",
      filePath
    ]);
    return parseSipsPixelSize(stdout);
  } catch {
    return null;
  }
}
