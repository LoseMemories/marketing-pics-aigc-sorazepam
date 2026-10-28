import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../src/shared/errors/app-error.js";
import { validateMotionFile, validateStillFile } from "../src/modules/live-asset/domain/media-validation.js";

const temporaryDirectories: string[] = [];

async function fixture(name: string, bytes: readonly number[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "marketing-photo-test-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  await writeFile(filePath, Buffer.from(bytes));
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("media validation", () => {
  it("accepts a JPEG only when extension and signature agree", async () => {
    const temporaryPath = await fixture("photo.jpg", [0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      validateStillFile(
        {
          temporaryPath,
          originalName: "photo.jpg",
          mimeType: "image/jpeg",
          byteLength: 4
        },
        100
      )
    ).resolves.toBe("jpeg");
  });

  it("rejects an image whose claimed extension disagrees with its signature", async () => {
    const temporaryPath = await fixture("photo.png", [0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      validateStillFile(
        {
          temporaryPath,
          originalName: "photo.png",
          mimeType: "image/png",
          byteLength: 4
        },
        100
      )
    ).rejects.toMatchObject<AppError>({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("accepts a MOV resource exported by PhotoKit", async () => {
    const temporaryPath = await fixture("motion.mov", [
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20
    ]);
    await expect(
      validateMotionFile(
        {
          temporaryPath,
          originalName: "IMG_0001.MOV",
          mimeType: "video/quicktime",
          byteLength: 12
        },
        100
      )
    ).resolves.toBe("mov");
  });
});
