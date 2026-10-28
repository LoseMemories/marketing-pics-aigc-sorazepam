import { open } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../../shared/errors/app-error.js";
import type {
  IncomingUploadFile,
  MotionFormat,
  StillFormat
} from "./live-asset.types.js";

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/avif",
  "application/octet-stream"
]);
const videoMimeTypes = new Set([
  "video/quicktime",
  "video/mp4",
  "application/mp4",
  "application/octet-stream"
]);
async function readHeader(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function validateMotionFile(
  file: IncomingUploadFile,
  maxBytes: number
): Promise<MotionFormat> {
  if (file.byteLength > maxBytes) {
    throw new AppError("FILE_TOO_LARGE", "实况视频资源超过允许大小。", 413, { maxBytes });
  }
  if (!videoMimeTypes.has(file.mimeType)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "实况视频 MIME 类型不受支持。", 415);
  }
  const extension = extensionOf(file.originalName);
  const header = await readHeader(file.temporaryPath);
  if (!isIsoBmff(header) || !["mov", "mp4"].includes(extension)) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "实况视频扩展名与实际容器不匹配，或格式不受支持。",
      415
    );
  }
  return extension as MotionFormat;
}

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase().replace(/^\./, "");
}

function isIsoBmff(header: Buffer): boolean {
  return header.length >= 12 && header.subarray(4, 8).toString("ascii") === "ftyp";
}

export async function validateStillFile(
  file: IncomingUploadFile,
  maxBytes: number
): Promise<StillFormat> {
  if (file.byteLength > maxBytes) {
    throw new AppError("FILE_TOO_LARGE", "实况照片文件超过允许大小。", 413, { maxBytes });
  }
  if (!imageMimeTypes.has(file.mimeType)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "实况照片 MIME 类型不受支持。", 415);
  }

  const extension = extensionOf(file.originalName);
  const header = await readHeader(file.temporaryPath);
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const brand = isIsoBmff(header) ? header.subarray(8, 12).toString("ascii") : "";
  const isHeic = ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  const isAvif = ["avif", "avis"].includes(brand);

  if (isJpeg && ["jpg", "jpeg"].includes(extension)) return "jpeg";
  if (isHeic && ["heic", "heif"].includes(extension)) return "heic";
  if (isAvif && extension === "avif") return "avif";
  throw new AppError(
    "UNSUPPORTED_MEDIA_TYPE",
    "实况照片扩展名与实际文件格式不匹配，或格式不受支持。",
    415
  );
}
