import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, rename, unlink } from "node:fs/promises";

export async function moveFile(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") {
      throw error;
    }
    await copyFile(source, target);
    await unlink(source);
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}
