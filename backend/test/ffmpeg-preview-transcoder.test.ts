import { describe, expect, it } from "vitest";
import { assertSipsRasterOutput } from "../src/modules/live-asset/infrastructure/ffmpeg-preview-transcoder.js";

describe("assertSipsRasterOutput", () => {
  it("accepts a rendered JPEG with positive dimensions", () => {
    expect(() => assertSipsRasterOutput("pixelWidth: 2000\npixelHeight: 1500\n")).not.toThrow();
  });

  it("rejects a metadata-only JPEG", () => {
    expect(() => assertSipsRasterOutput("pixelWidth: <nil>\npixelHeight: <nil>\n"))
      .toThrow(/without decodable pixel dimensions/);
  });
});
