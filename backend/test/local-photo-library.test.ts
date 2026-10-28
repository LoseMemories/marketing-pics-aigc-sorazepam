import { describe, expect, it } from "vitest";
import {
  pairPhotoLibraryFiles,
  stableAssetId
} from "../src/modules/live-asset/infrastructure/local-photo-library.js";

describe("pairPhotoLibraryFiles", () => {
  it("按同名配对 HEIC 主图与 MOV 视频轨", () => {
    const pairs = pairPhotoLibraryFiles([
      "IMG_0244.HEIC",
      "IMG_0244.MOV",
      "IMG_0262.HEIC",
      "IMG_0262.MOV"
    ]);

    expect(pairs).toEqual([
      { key: "IMG_0262", stillName: "IMG_0262.HEIC", motionName: "IMG_0262.MOV" },
      { key: "IMG_0244", stillName: "IMG_0244.HEIC", motionName: "IMG_0244.MOV" }
    ]);
  });

  it("忽略扩展名大小写差异与无关文件", () => {
    const pairs = pairPhotoLibraryFiles([
      "Live_2026.heic",
      "live_2026.mov",
      "only-photo.HEIC",
      "only-motion.MOV",
      ".DS_Store",
      "readme.txt"
    ]);

    expect(pairs).toEqual([
      { key: "Live_2026", stillName: "Live_2026.heic", motionName: "live_2026.mov" }
    ]);
  });

  it("缺少主图时不产生配对", () => {
    expect(pairPhotoLibraryFiles(["IMG_0001.MOV"])).toEqual([]);
  });
});

describe("stableAssetId", () => {
  it("生成合法 UUID 且同一文件名结果稳定", () => {
    const first = stableAssetId("IMG_0244");
    expect(first).toBe(stableAssetId("IMG_0244"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("不同文件名得到不同 ID", () => {
    expect(stableAssetId("IMG_0244")).not.toBe(stableAssetId("IMG_0262"));
  });
});
