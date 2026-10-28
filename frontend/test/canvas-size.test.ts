import { describe, expect, it } from "vitest";
import {
  calculateCanvasBackingSize,
  calculateContainedContentRect
} from "../src/features/canvas-renderer/runtime/canvas-renderer";

describe("canvas backing size", () => {
  it("caps pixel density while retaining CSS dimensions", () => {
    expect(calculateCanvasBackingSize(320, 180, 4)).toEqual({
      cssWidth: 320,
      cssHeight: 180,
      pixelWidth: 960,
      pixelHeight: 540,
      pixelRatio: 3
    });
  });
});

describe("contained media coordinates", () => {
  it("maps a portrait image into the centered visible rectangle", () => {
    expect(calculateContainedContentRect(900, 600, 300, 600)).toEqual({
      x: 300,
      y: 0,
      width: 300,
      height: 600
    });
  });

  it("maps a landscape image into the centered visible rectangle", () => {
    expect(calculateContainedContentRect(600, 600, 800, 400)).toEqual({
      x: 0,
      y: 150,
      width: 600,
      height: 300
    });
  });
});
