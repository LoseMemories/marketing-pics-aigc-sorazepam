import { describe, expect, it } from "vitest";
import { scanLivePhotoFiles } from "../src/features/live-upload/model/live-photo-folder";

function file(name: string, relativePath = name): File {
  const value = new File([name], name);
  Object.defineProperty(value, "webkitRelativePath", { value: relativePath });
  return value;
}

describe("scanLivePhotoFiles", () => {
  it("pairs an Apple still and MOV with the same basename", () => {
    const result = scanLivePhotoFiles([
      file("IMG_1234.HEIC", "Export/IMG_1234.HEIC"),
      file("IMG_1234.MOV", "Export/IMG_1234.MOV"),
      file("IMG_1234.AAE", "Export/IMG_1234.AAE")
    ]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({ displayName: "IMG_1234" });
    expect(result.incompleteCount).toBe(0);
  });

  it("does not pair identical basenames from different nested folders", () => {
    const result = scanLivePhotoFiles([
      file("IMG_0001.HEIC", "A/IMG_0001.HEIC"),
      file("IMG_0001.MOV", "B/IMG_0001.MOV")
    ]);
    expect(result.pairs).toHaveLength(0);
    expect(result.incompleteCount).toBe(2);
  });
});
