import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MediaProbe } from "../src/modules/live-asset/application/live-asset.ports.js";
import { EmbeddedMotionPhotoExtractor } from "../src/modules/live-asset/infrastructure/embedded-motion-photo-extractor.js";
import type { VideoMetadata } from "../src/modules/live-asset/domain/live-asset.types.js";
import { AppError } from "../src/shared/errors/app-error.js";

const directories: string[] = [];
const metadata: VideoMetadata = {
  durationMs: 1800,
  width: 1080,
  height: 1920,
  rotation: 0,
  videoCodec: "h264",
  hasAudio: true
};
const acceptingProbe: MediaProbe = { probeVideo: async () => metadata };

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "motion-photo-extractor-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("embedded motion photo extractor", () => {
  it("splits an appended ISO BMFF video from one JPEG file", async () => {
    const directory = await workspace();
    const imageBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(28), Buffer.from([0xff, 0xd9])]);
    const videoBytes = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 1, 2, 3, 4]);
    const sourcePath = path.join(directory, "motion-photo.jpg");
    const stillPath = path.join(directory, "still.jpg");
    const motionPath = path.join(directory, "motion.mp4");
    await writeFile(sourcePath, Buffer.concat([imageBytes, videoBytes]));

    const result = await new EmbeddedMotionPhotoExtractor(acceptingProbe).extract({
      sourcePath,
      stillFormat: "jpeg",
      stillDestination: stillPath,
      motionDestination: motionPath
    });

    expect(result.strategy).toBe("ftyp-scan");
    expect(result.videoOffset).toBe(imageBytes.length);
    expect(await readFile(stillPath)).toEqual(imageBytes);
    expect(await readFile(motionPath)).toEqual(videoBytes);
  });

  it("rejects a normal static JPEG in strict single-file mode", async () => {
    const directory = await workspace();
    const sourcePath = path.join(directory, "static.jpg");
    await writeFile(sourcePath, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32), Buffer.from([0xff, 0xd9])]));

    await expect(new EmbeddedMotionPhotoExtractor(acceptingProbe).extract({
      sourcePath,
      stillFormat: "jpeg",
      stillDestination: path.join(directory, "still.jpg"),
      motionDestination: path.join(directory, "motion.mp4")
    })).rejects.toMatchObject<AppError>({ code: "MOTION_TRACK_NOT_FOUND" });
  });
});
