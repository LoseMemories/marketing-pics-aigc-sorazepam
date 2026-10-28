import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { moveFile, sha256File } from "../../../shared/filesystem/file-utils.js";
import type {
  AssetWorkspace,
  LiveAssetRepository,
  StoreSourceInput
} from "../application/live-asset.ports.js";
import type { LiveAssetRecord, StoredSourceFile } from "../domain/live-asset.types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceExtension(input: StoreSourceInput): string {
  if ((input.kind === "still" || input.kind === "original") && input.format === "jpeg") return "jpg";
  return input.format;
}

export class LocalAssetRepository implements LiveAssetRepository {
  private readonly assetsRoot: string;

  constructor(private readonly dataRoot: string) {
    this.assetsRoot = path.join(dataRoot, "live-assets");
  }

  async ensureReady(): Promise<void> {
    await Promise.all([
      mkdir(this.assetsRoot, { recursive: true }),
      mkdir(path.join(this.dataRoot, "incoming"), { recursive: true })
    ]);
  }

  async createWorkspace(id: string): Promise<AssetWorkspace> {
    this.assertSafeId(id);
    const rootPath = path.join(this.assetsRoot, id);
    const sourceDirectory = path.join(rootPath, "source");
    const derivedDirectory = path.join(rootPath, "derived");
    const previewDirectory = path.join(rootPath, "preview");
    await mkdir(rootPath, { recursive: false });
    await mkdir(sourceDirectory, { recursive: false });
    await mkdir(derivedDirectory, { recursive: false });
    await mkdir(previewDirectory, { recursive: false });
    return {
      rootPath,
      sourceDirectory,
      derivedDirectory,
      previewDirectory,
      originalPath: (format) => path.join(sourceDirectory, `original.${format === "jpeg" ? "jpg" : format}`),
      derivedStillPath: (format) => path.join(derivedDirectory, `still.${format === "jpeg" ? "jpg" : format}`),
      derivedMotionPath: path.join(derivedDirectory, "motion.mp4"),
      posterPath: path.join(previewDirectory, "poster.jpg"),
      motionPreviewPath: path.join(previewDirectory, "motion.mp4")
    };
  }

  async storeSource(
    input: StoreSourceInput
  ): Promise<{ file: StoredSourceFile; absolutePath: string }> {
    this.assertSafeId(input.id);
    const extension = sourceExtension(input);
    const directory = input.location ?? (input.kind === "original" ? "source" : "derived");
    const relativePath = `${input.id}/${directory}/${input.kind}.${extension}`;
    const absolutePath = path.join(this.assetsRoot, input.id, directory, `${input.kind}.${extension}`);
    await moveFile(input.temporaryPath, absolutePath);
    const [fileStat, sha256] = await Promise.all([stat(absolutePath), sha256File(absolutePath)]);
    await chmod(absolutePath, 0o444);
    return {
      absolutePath,
      file: {
        kind: input.kind,
        originalName: path.basename(input.originalName),
        mimeType: input.mimeType,
        format: input.format,
        relativePath,
        byteLength: fileStat.size,
        sha256
      }
    };
  }

  async describeFile(
    input: Omit<StoreSourceInput, "temporaryPath"> & { absolutePath: string }
  ): Promise<StoredSourceFile> {
    const [fileStat, sha256] = await Promise.all([
      stat(input.absolutePath),
      sha256File(input.absolutePath)
    ]);
    await chmod(input.absolutePath, 0o444);
    const relativePath = path.relative(this.assetsRoot, input.absolutePath).split(path.sep).join("/");
    return {
      kind: input.kind,
      originalName: path.basename(input.originalName),
      mimeType: input.mimeType,
      format: input.format,
      relativePath,
      byteLength: fileStat.size,
      sha256
    };
  }

  async save(record: LiveAssetRecord): Promise<void> {
    this.assertSafeId(record.id);
    const metadataPath = path.join(this.assetsRoot, record.id, "metadata.json");
    const temporaryPath = `${metadataPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporaryPath, metadataPath);
  }

  async findById(id: string): Promise<LiveAssetRecord | null> {
    if (!uuidPattern.test(id)) return null;
    try {
      const content = await readFile(path.join(this.assetsRoot, id, "metadata.json"), "utf8");
      return JSON.parse(content) as LiveAssetRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (!uuidPattern.test(id)) return;
    await rm(path.join(this.assetsRoot, id), { recursive: true, force: true });
  }

  async resolvePreview(
    id: string,
    filename: "poster.jpg" | "thumb.jpg" | "motion.mp4"
  ): Promise<string | null> {
    if (!uuidPattern.test(id)) return null;
    const filePath = path.join(this.assetsRoot, id, "preview", filename);
    try {
      const fileStat = await stat(filePath);
      return fileStat.isFile() ? filePath : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private assertSafeId(id: string): void {
    if (!uuidPattern.test(id)) {
      throw new Error("Unsafe live asset id");
    }
  }
}
