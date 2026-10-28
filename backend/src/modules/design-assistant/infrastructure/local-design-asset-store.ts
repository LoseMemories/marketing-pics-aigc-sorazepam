import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DesignAssetStore } from "../application/design-assistant.ports.js";
import type { LiveAssetRecord } from "../../live-asset/domain/live-asset.types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class LocalDesignAssetStore implements DesignAssetStore {
  private readonly assetsRoot: string;

  constructor(
    dataRoot: string,
    /** selfies 目录：博客文案与照片同名（<key>.md）。 */
    private readonly selfiesRoot?: string
  ) {
    this.assetsRoot = path.join(dataRoot, "live-assets");
  }

  /** 文案源：asset 的 source.assetIdentifier 形如 `selfies:<key>`，读同名 md。 */
  async readCopySource(id: string): Promise<string> {
    if (!this.selfiesRoot) return "";
    const asset = await this.findAsset(id);
    const identifier = asset?.source.assetIdentifier ?? "";
    const match = /^selfies:(.+)$/.exec(identifier);
    if (!match?.[1]) return "";
    const key = match[1];
    // 防目录穿越：只允许文件名本身
    if (key.includes("/") || key.includes("\\") || key.startsWith(".")) return "";
    for (const extension of [".md", ".txt"]) {
      try {
        const content = await readFile(path.join(this.selfiesRoot, `${key}${extension}`), "utf8");
        return content.trim().slice(0, 4000);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return "";
  }

  async findAsset(id: string): Promise<LiveAssetRecord | null> {
    if (!uuidPattern.test(id)) return null;
    try {
      return JSON.parse(
        await readFile(path.join(this.assetsRoot, id, "metadata.json"), "utf8")
      ) as LiveAssetRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async readPoster(id: string): Promise<Buffer> {
    this.assertId(id);
    return readFile(path.join(this.assetsRoot, id, "preview", "poster.jpg"));
  }

  async readAnalysis<T>(id: string, name: string): Promise<T | null> {
    this.assertId(id);
    try {
      const content = await readFile(path.join(this.assetsRoot, id, "analysis", `${name}.json`), "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeAnalysis(id: string, name: string, value: unknown): Promise<void> {
    this.assertId(id);
    if (!/^[a-z-]+$/.test(name)) throw new Error("Unsafe analysis name");
    const directory = path.join(this.assetsRoot, id, "analysis");
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, `${name}.json`);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private assertId(id: string): void {
    if (!uuidPattern.test(id)) throw new Error("Unsafe live asset id");
  }
}
