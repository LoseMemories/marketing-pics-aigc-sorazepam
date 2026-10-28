import { createHash } from "node:crypto";
import { copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readSipsPixelSize, type PixelSize } from "../../../shared/media/image-dimensions.js";
import { runCommand } from "../../../shared/media/command-runner.js";
import { toLiveAssetDto } from "../domain/live-asset.js";
import type {
  LiveAssetDto,
  LiveAssetRecord,
  StoredSourceFile
} from "../domain/live-asset.types.js";
import type {
  LiveAssetRepository,
  MediaProbe,
  PreviewTranscoder
} from "../application/live-asset.ports.js";

const stillExtensions = new Set([".heic", ".heif"]);
const motionExtensions = new Set([".mov", ".mp4"]);

/** 预览生成规则变更时递增，旧缓存会重新生成。 */
export const PREVIEW_PIPELINE_VERSION = 2;

export type PhotoLibraryStatus = "processing" | "ready" | "failed";

export interface PhotoLibraryItemDto {
  key: string;
  title: string;
  status: PhotoLibraryStatus;
  photoWidth?: number;
  photoHeight?: number;
  asset?: LiveAssetDto;
  message?: string;
}

export interface PhotoLibraryFileNamePair {
  key: string;
  stillName: string;
  motionName: string;
}

/**
 * 将目录中的文件名按同名（忽略大小写）配对成实况图：HEIC 主图 + MOV 视频轨。
 */
export function pairPhotoLibraryFiles(
  fileNames: readonly string[]
): PhotoLibraryFileNamePair[] {
  const stills = new Map<string, string>();
  const motions = new Map<string, string>();

  for (const fileName of fileNames) {
    const extension = path.extname(fileName).toLowerCase();
    const key = path.basename(fileName, path.extname(fileName));
    if (!key || key.startsWith(".")) continue;
    const normalizedKey = key.toLowerCase();
    if (stillExtensions.has(extension)) stills.set(normalizedKey, fileName);
    else if (motionExtensions.has(extension)) motions.set(normalizedKey, fileName);
  }

  const pairs: PhotoLibraryFileNamePair[] = [];
  for (const [normalizedKey, stillName] of stills) {
    const motionName = motions.get(normalizedKey);
    if (!motionName) continue;
    pairs.push({
      key: path.basename(stillName, path.extname(stillName)),
      stillName,
      motionName
    });
  }
  return pairs.sort((left, right) => right.key.localeCompare(left.key));
}

/**
 * 由一个稳定的种子（文件名）派生 UUID，保证多次启动时资源 ID 不变，转码结果可复用。
 */
export function stableAssetId(seed: string): string {
  const hex = createHash("sha256").update(`selfies:${seed}`).digest("hex");
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

interface LibraryEntry {
  key: string;
  title: string;
  id: string;
  stillPath: string;
  motionPath: string;
  status: PhotoLibraryStatus;
  claimed: boolean;
  size?: PixelSize;
  asset?: LiveAssetDto;
  message?: string;
}

export interface LocalPhotoLibraryOptions {
  selfiesRoot: string;
  repository: LiveAssetRepository;
  mediaProbe: MediaProbe;
  transcoder: PreviewTranscoder;
  sipsPath: string;
  concurrency?: number;
}

export class LocalPhotoLibrary {
  private entries?: LibraryEntry[];
  private scanning?: Promise<LibraryEntry[]>;
  private importRun?: Promise<void>;
  private readonly concurrency: number;

  constructor(private readonly options: LocalPhotoLibraryOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? 2);
  }

  async list(options: { refresh?: boolean } = {}): Promise<PhotoLibraryItemDto[]> {
    if (options.refresh) {
      this.entries = undefined;
      this.scanning = undefined;
      this.importRun = undefined;
    }
    const entries = await this.ensureScanned();
    void this.startImport();
    return entries.map((entry) => this.toDto(entry));
  }

  private toDto(entry: LibraryEntry): PhotoLibraryItemDto {
    return {
      key: entry.key,
      title: entry.title,
      status: entry.status,
      ...(entry.size ? { photoWidth: entry.size.width, photoHeight: entry.size.height } : {}),
      ...(entry.asset ? { asset: entry.asset } : {}),
      ...(entry.message ? { message: entry.message } : {})
    };
  }

  private async ensureScanned(): Promise<LibraryEntry[]> {
    this.scanning ??= this.scan();
    return this.scanning;
  }

  private async scan(): Promise<LibraryEntry[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.options.selfiesRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.entries = [];
        return this.entries;
      }
      throw error;
    }

    const entries: LibraryEntry[] = pairPhotoLibraryFiles(fileNames).map((pair) => ({
      key: pair.key,
      title: pair.key,
      id: stableAssetId(pair.key),
      stillPath: path.join(this.options.selfiesRoot, pair.stillName),
      motionPath: path.join(this.options.selfiesRoot, pair.motionName),
      status: "processing",
      claimed: false
    }));

    await this.hydrate(entries);
    this.entries = entries;
    return entries;
  }

  private async hydrate(entries: readonly LibraryEntry[]): Promise<void> {
    await mapWithConcurrency(entries, 4, async (entry) => {
      const record = await this.options.repository.findById(entry.id);
      const [posterPath, motionPath] = record
        ? await Promise.all([
            this.options.repository.resolvePreview(entry.id, "poster.jpg"),
            this.options.repository.resolvePreview(entry.id, "motion.mp4")
          ])
        : [null, null];

      if (
        record &&
        posterPath &&
        motionPath &&
        record.preview.pipelineVersion === PREVIEW_PIPELINE_VERSION
      ) {
        // 海报在生成时已烘焙方向，其像素尺寸即浏览器显示尺寸。
        entry.size =
          (await readSipsPixelSize(this.options.sipsPath, posterPath)) ?? {
            width: record.media.width,
            height: record.media.height
          };
        await this.ensurePreview(entry.id, posterPath);
        entry.asset = toLiveAssetDto(record);
        entry.status = "ready";
        return;
      }

      const size = await readSipsPixelSize(this.options.sipsPath, entry.stillPath);
      if (size) entry.size = size;
    });
  }

  private async ensurePreview(id: string, posterPath: string): Promise<void> {
    const thumb = await this.options.repository.resolvePreview(id, "thumb.jpg");
    if (!thumb) {
      await this.createThumbnail(posterPath, path.join(path.dirname(posterPath), "thumb.jpg"));
    }
  }

  private async createThumbnail(posterPath: string, thumbPath: string): Promise<void> {
    try {
      await runCommand(this.options.sipsPath, [
        "--resampleHeightWidthMax",
        "640",
        "--setProperty",
        "format",
        "jpeg",
        posterPath,
        "--out",
        thumbPath
      ]);
    } catch {
      await copyFile(posterPath, thumbPath);
    }
  }

  private startImport(): Promise<void> {
    this.importRun ??= this.runImports();
    return this.importRun;
  }

  private async runImports(): Promise<void> {
    const entries = this.entries ?? [];
    await mapWithConcurrency(entries, this.concurrency, async (entry) => {
      if (entry.status === "ready" || entry.claimed) return;
      entry.claimed = true;
      await this.importOne(entry);
    });
  }

  private async importOne(entry: LibraryEntry): Promise<void> {
    try {
      const workspace = await this.createWorkspace(entry.id);
      const stillSourcePath = workspace.originalPath("heic");
      const motionSourcePath = path.join(workspace.sourceDirectory, "motion.mov");
      await Promise.all([
        copyFile(entry.stillPath, stillSourcePath),
        copyFile(entry.motionPath, motionSourcePath)
      ]);

      const media = await this.options.mediaProbe.probeVideo(motionSourcePath);
      const [original, pairedMotion, stillStat] = await Promise.all([
        this.describe(entry, "original", stillSourcePath, entry.stillPath, "image/heic", "heic"),
        this.describe(entry, "motion", motionSourcePath, entry.motionPath, "video/quicktime", "mov"),
        stat(entry.stillPath)
      ]);

      await this.options.transcoder.createPoster(stillSourcePath, "heic", workspace.posterPath);
      await this.createThumbnail(
        workspace.posterPath,
        path.join(workspace.previewDirectory, "thumb.jpg")
      );
      await this.options.transcoder.createMotionPreview(motionSourcePath, workspace.motionPreviewPath);

      const posterSize = await readSipsPixelSize(this.options.sipsPath, workspace.posterPath);
      if (posterSize) entry.size = posterSize;

      const record: LiveAssetRecord = {
        id: entry.id,
        platformHint: "apple",
        status: "ready",
        source: { original, pairedMotion, assetIdentifier: `selfies:${entry.key}` },
        derived: { still: original, motion: pairedMotion },
        containerExtraction: {
          strategy: "apple-paired-resource",
          videoOffset: 0,
          videoLength: pairedMotion.byteLength,
          xmpDetected: false
        },
        preview: {
          posterRelativePath: `${entry.id}/preview/poster.jpg`,
          motionRelativePath: `${entry.id}/preview/motion.mp4`,
          pipelineVersion: PREVIEW_PIPELINE_VERSION
        },
        media,
        createdAt: stillStat.mtime.toISOString()
      };

      await this.options.repository.save(record);
      entry.asset = toLiveAssetDto(record);
      entry.status = "ready";
      delete entry.message;
    } catch (error) {
      entry.status = "failed";
      entry.message = error instanceof Error ? error.message : "实况图处理失败。";
      await this.options.repository.remove(entry.id);
    }
  }

  private async createWorkspace(id: string) {
    try {
      return await this.options.repository.createWorkspace(id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await this.options.repository.remove(id);
      return this.options.repository.createWorkspace(id);
    }
  }

  private describe(
    entry: LibraryEntry,
    kind: "original" | "motion",
    absolutePath: string,
    sourcePath: string,
    mimeType: string,
    format: "heic" | "mov"
  ): Promise<StoredSourceFile> {
    return this.options.repository.describeFile({
      id: entry.id,
      kind,
      absolutePath,
      originalName: path.basename(sourcePath),
      mimeType,
      format
    });
  }
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
}
