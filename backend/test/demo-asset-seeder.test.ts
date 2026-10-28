import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DemoAssetSeeder } from "../src/modules/live-asset/infrastructure/demo-asset-seeder.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("DemoAssetSeeder", () => {
  it("registers a bundled demo as a normal ready live asset", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "marketing-photo-demo-test-"));
    temporaryDirectories.push(dataRoot);
    const entries = await new DemoAssetSeeder(
      dataRoot,
      path.resolve(process.cwd(), "demo-assets")
    ).seed(["aurora"]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.asset).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      status: "ready"
    });
    const metadata = JSON.parse(
      await readFile(
        path.join(dataRoot, "live-assets", entries[0]!.asset.id, "metadata.json"),
        "utf8"
      )
    ) as { containerExtraction: { strategy: string } };
    expect(metadata.containerExtraction.strategy).toBe("demo-seed");
    await expect(
      stat(path.join(dataRoot, "live-assets", entries[0]!.asset.id, "preview", "motion.mp4"))
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
  });
});
