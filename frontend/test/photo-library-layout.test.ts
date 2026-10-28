import { describe, expect, it } from "vitest";
import {
  buildPhotoFlow,
  photoAspect
} from "../src/features/photo-library/model/photo-library.layout";
import type { PhotoLibraryItem } from "../src/features/photo-library/model/photo-library.types";

function item(key: string, width: number, height: number): PhotoLibraryItem {
  return { key, title: key, status: "ready", photoWidth: width, photoHeight: height };
}

const landscape = () => item("landscape", 4032, 3024);
const portrait = () => item("portrait", 4284, 5712);

const sample: PhotoLibraryItem[] = [
  item("p1", 4284, 5712),
  item("p2", 4470, 5712),
  item("l1", 4032, 3024),
  item("l2", 4032, 3024),
  item("l3", 5712, 4284),
  item("l4", 4032, 3024),
  item("l5", 4032, 3024),
  item("l6", 4032, 3024),
  item("l7", 4032, 3024),
  item("l8", 4032, 3024),
  item("l9", 4032, 3024)
];

describe("photoAspect", () => {
  it("取照片自身比例", () => {
    expect(photoAspect(landscape())).toBeCloseTo(4 / 3, 5);
    expect(photoAspect(portrait())).toBeCloseTo(4284 / 5712, 5);
  });

  it("缺少尺寸时回退为 3:4", () => {
    expect(photoAspect({})).toBeCloseTo(3 / 4, 5);
  });
});

describe("buildPhotoFlow", () => {
  it("每张图宽高严格等于自身比例", () => {
    const rows = buildPhotoFlow(sample, 530);
    for (const row of rows) {
      for (const tile of row.tiles) {
        expect(tile.width / tile.height).toBeCloseTo(photoAspect(tile.item), 1);
      }
    }
  });

  it("除末行外每行宽度填满容器", () => {
    const width = 530;
    const rows = buildPhotoFlow(sample, width);
    rows.slice(0, -1).forEach((row) => {
      const total = row.tiles.reduce((sum, tile) => sum + tile.width, 0) + 10 * (row.tiles.length - 1);
      expect(Math.abs(total - width)).toBeLessThanOrEqual(3);
    });
  });

  it("同比例素材不会退化成等高网格：行高随内容变化", () => {
    const rows = buildPhotoFlow(sample, 530);
    const heights = new Set(rows.map((row) => row.tiles[0]?.height));
    expect(rows.length).toBeGreaterThan(2);
    expect(heights.size).toBeGreaterThan(1);
  });

  it("宽度变化时重新排布且不溢出", () => {
    for (const width of [320, 530, 860]) {
      const rows = buildPhotoFlow(sample, width);
      rows.forEach((row) => {
        const total = row.tiles.reduce((sum, tile) => sum + tile.width, 0) + 10 * (row.tiles.length - 1);
        expect(total).toBeLessThanOrEqual(width + 3);
      });
    }
  });

  it("容器宽度未知时使用回退宽度", () => {
    const rows = buildPhotoFlow(sample, 0);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.tiles.length).toBeGreaterThan(0);
  });
});
