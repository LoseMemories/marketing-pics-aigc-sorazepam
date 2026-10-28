import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sha256File } from "../../../shared/filesystem/file-utils.js";
import { toLiveAssetDto } from "../domain/live-asset.js";
import type { LiveAssetDto, LiveAssetRecord, StoredSourceFile } from "../domain/live-asset.types.js";

const manifestSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  media: z.object({
    durationMs: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rotation: z.number().int(),
    videoCodec: z.string().min(1),
    hasAudio: z.boolean()
  })
});

export interface DemoAssetEntry {
  slug: string;
  title: string;
  description: string;
  asset: LiveAssetDto;
}

export class DemoAssetSeeder {
  constructor(
    private readonly dataRoot: string,
    private readonly demoRoot: string
  ) {}

  async seed(slugs: readonly string[]): Promise<DemoAssetEntry[]> {
    const entries: DemoAssetEntry[] = [];
    for (const slug of slugs) entries.push(await this.seedOne(slug));
    return entries;
  }

  private async seedOne(slug: string): Promise<DemoAssetEntry> {
    const sourceRoot = path.join(this.demoRoot, slug);
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(sourceRoot, "manifest.json"), "utf8"))
    );
    if (manifest.slug !== slug) throw new Error(`Demo asset slug mismatch: ${slug}`);

    const root = path.join(this.dataRoot, "live-assets", manifest.id);
    const sourceDirectory = path.join(root, "source");
    const previewDirectory = path.join(root, "preview");
    const analysisDirectory = path.join(root, "analysis");
    await Promise.all([
      mkdir(sourceDirectory, { recursive: true }),
      mkdir(previewDirectory, { recursive: true }),
      mkdir(analysisDirectory, { recursive: true })
    ]);

    const posterSource = path.join(sourceRoot, "preview", "poster.jpg");
    const motionSource = path.join(sourceRoot, "preview", "motion.mp4");
    const originalPath = path.join(sourceDirectory, "original.jpg");
    const pairedMotionPath = path.join(sourceDirectory, "motion.mp4");
    const posterPath = path.join(previewDirectory, "poster.jpg");
    const thumbPath = path.join(previewDirectory, "thumb.jpg");
    const motionPath = path.join(previewDirectory, "motion.mp4");
    await Promise.all([
      copyFile(posterSource, originalPath),
      copyFile(motionSource, pairedMotionPath),
      copyFile(posterSource, posterPath),
      copyFile(posterSource, thumbPath),
      copyFile(motionSource, motionPath),
      copyFile(
        path.join(sourceRoot, "analysis", "scene-analysis.json"),
        path.join(analysisDirectory, "scene-analysis.json")
      )
    ]);

    const original = await this.describe(
      originalPath,
      "original",
      "demo-poster.jpg",
      "image/jpeg",
      "jpeg",
      `${manifest.id}/source/original.jpg`
    );
    const pairedMotion = await this.describe(
      pairedMotionPath,
      "motion",
      "demo-motion.mp4",
      "video/mp4",
      "mp4",
      `${manifest.id}/source/motion.mp4`
    );
    const record: LiveAssetRecord = {
      id: manifest.id,
      platformHint: "unknown",
      status: "ready",
      source: { original, pairedMotion, assetIdentifier: `demo:${slug}` },
      derived: { still: original, motion: pairedMotion },
      containerExtraction: {
        strategy: "demo-seed",
        videoOffset: 0,
        videoLength: pairedMotion.byteLength,
        xmpDetected: false
      },
      preview: {
        posterRelativePath: `${manifest.id}/preview/poster.jpg`,
        motionRelativePath: `${manifest.id}/preview/motion.mp4`
      },
      media: manifest.media,
      createdAt: "2026-10-25T00:00:00.000Z"
    };
    await writeFile(path.join(root, "metadata.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return {
      slug: manifest.slug,
      title: manifest.title,
      description: manifest.description,
      asset: toLiveAssetDto(record)
    };
  }

  private async describe(
    filePath: string,
    kind: "original" | "motion",
    originalName: string,
    mimeType: string,
    format: "jpeg" | "mp4",
    relativePath: string
  ): Promise<StoredSourceFile> {
    const fileStat = await stat(filePath);
    return {
      kind,
      originalName,
      mimeType,
      format,
      relativePath,
      byteLength: fileStat.size,
      sha256: await sha256File(filePath)
    };
  }
}
