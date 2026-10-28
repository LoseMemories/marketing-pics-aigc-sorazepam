import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../../shared/errors/app-error.js";
import type {
  MediaProbe,
  MotionPhotoExtraction,
  MotionPhotoExtractor
} from "../application/live-asset.ports.js";

const ftypMarker = Buffer.from("ftyp", "ascii");

export async function scanFtypCandidates(filePath: string): Promise<number[]> {
  const positions = new Set<number>();
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let processed = 0;
  for await (const rawChunk of stream) {
    const chunk = rawChunk as Buffer;
    const data = Buffer.concat([carry, chunk]);
    const baseOffset = processed - carry.length;
    let cursor = 0;
    while (cursor < data.length) {
      const markerIndex = data.indexOf(ftypMarker, cursor);
      if (markerIndex < 0) break;
      const boxStart = baseOffset + markerIndex - 4;
      if (boxStart >= 0) positions.add(boxStart);
      cursor = markerIndex + ftypMarker.length;
    }
    processed += chunk.length;
    carry = data.subarray(Math.max(0, data.length - 7));
  }
  return [...positions].sort((left, right) => right - left);
}

async function readPrefix(filePath: string, maxBytes = 2 * 1024 * 1024): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    const buffer = Buffer.alloc(Math.min(fileStat.size, maxBytes));
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function copyRange(source: string, destination: string, start: number, end: number): Promise<void> {
  await pipeline(createReadStream(source, { start, end }), createWriteStream(destination));
}

function offsetsFromXmp(text: string, fileSize: number): number[] {
  const offsets = new Set<number>();
  const patterns = [
    /(?:MicroVideoOffset|MotionPhotoVideoOffset)\s*=\s*["'](\d+)["']/gi,
    /Item:Length\s*=\s*["'](\d+)["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const length = Number.parseInt(match[1] ?? "0", 10);
      const offset = fileSize - length;
      if (length > 16 && offset > 16 && offset < fileSize) offsets.add(offset);
    }
  }
  return [...offsets];
}

async function isFtypAt(filePath: string, offset: number): Promise<boolean> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(8);
    const result = await handle.read(buffer, 0, buffer.length, offset);
    return result.bytesRead === 8 && buffer.subarray(4, 8).equals(ftypMarker);
  } finally {
    await handle.close();
  }
}

export class EmbeddedMotionPhotoExtractor implements MotionPhotoExtractor {
  constructor(private readonly mediaProbe: MediaProbe) {}

  async extract(input: {
    sourcePath: string;
    stillFormat: "jpeg" | "heic" | "avif";
    stillDestination: string;
    motionDestination: string;
  }): Promise<MotionPhotoExtraction> {
    const fileStat = await stat(input.sourcePath);
    const prefix = await readPrefix(input.sourcePath);
    const metadataText = prefix.toString("latin1");
    const xmpDetected = /MotionPhoto|MicroVideo|GCamera|Container:Item/i.test(metadataText);
    const xmpOffsets = offsetsFromXmp(metadataText, fileStat.size);
    const scannedOffsets = await scanFtypCandidates(input.sourcePath);
    const validXmpOffsets: number[] = [];
    for (const offset of xmpOffsets) {
      if (await isFtypAt(input.sourcePath, offset)) validXmpOffsets.push(offset);
    }
    const candidates = [...new Set([...validXmpOffsets, ...scannedOffsets])].filter(
      (offset) => offset > 16 && offset < fileStat.size - 8
    );
    if (candidates.length === 0) {
      throw new AppError(
        "MOTION_TRACK_NOT_FOUND",
        "该文件不包含可提取的视频轨。严格单文件模式不接受独立 Apple HEIC。",
        422
      );
    }

    const candidatePath = `${input.motionDestination}.candidate`;
    for (const offset of candidates) {
      await rm(candidatePath, { force: true });
      await copyRange(input.sourcePath, candidatePath, offset, fileStat.size - 1);
      try {
        const media = await this.mediaProbe.probeVideo(candidatePath);
        await rename(candidatePath, input.motionDestination);
        await copyRange(input.sourcePath, input.stillDestination, 0, offset - 1);
        const upperMetadata = metadataText.toUpperCase();
        const platformHint = upperMetadata.includes("HUAWEI")
          ? "harmony"
          : xmpDetected
            ? "android"
            : "unknown";
        return {
          stillPath: input.stillDestination,
          motionPath: input.motionDestination,
          motionFormat: "mp4",
          platformHint,
          strategy: validXmpOffsets.includes(offset) ? "xmp-offset" : "ftyp-scan",
          videoOffset: offset,
          videoLength: fileStat.size - offset,
          xmpDetected,
          media
        };
      } catch {
        // Try the next candidate; an image container can contain its own ftyp box.
      }
    }
    await rm(candidatePath, { force: true });
    throw new AppError(
      "MOTION_TRACK_CORRUPTED",
      "发现疑似视频数据，但无法解码为完整的视频轨。",
      422
    );
  }
}
