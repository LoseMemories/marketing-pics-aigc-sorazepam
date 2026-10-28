import type { PhotoLibraryItem } from "./photo-library.types";

export const TARGET_ROW_HEIGHT = 172;
export const ROW_GAP = 10;
export const FALLBACK_CONTAINER_WIDTH = 520;

export interface FlowTile {
  item: PhotoLibraryItem;
  width: number;
  height: number;
}

export interface FlowRow {
  tiles: FlowTile[];
}

export type AspectSource = Pick<PhotoLibraryItem, "photoWidth" | "photoHeight">;

export function photoAspect(item: AspectSource): number {
  if (item.photoWidth && item.photoHeight) return item.photoWidth / item.photoHeight;
  return 3 / 4;
}

/**
 * 行式瀑布流：按每张照片自身比例累加宽度，排满一行后等比缩放该行，
 * 使每行宽度恰好填满容器，而每张照片的宽高仍严格等于原图比例。
 */
export function buildPhotoFlow(
  entries: readonly PhotoLibraryItem[],
  width: number,
  options: { targetRowHeight?: number; gap?: number } = {}
): FlowRow[] {
  const targetRowHeight = options.targetRowHeight ?? TARGET_ROW_HEIGHT;
  const gap = options.gap ?? ROW_GAP;
  const usable = width > 0 ? width : FALLBACK_CONTAINER_WIDTH;

  const packed: Array<Array<{ item: PhotoLibraryItem; aspect: number }>> = [];
  let current: Array<{ item: PhotoLibraryItem; aspect: number }> = [];
  let aspectSum = 0;

  for (const item of entries) {
    const aspect = photoAspect(item);
    const candidateWidth = (aspectSum + aspect) * targetRowHeight + gap * current.length;
    if (current.length > 0 && candidateWidth > usable) {
      packed.push(current);
      current = [{ item, aspect }];
      aspectSum = aspect;
      continue;
    }
    current.push({ item, aspect });
    aspectSum += aspect;
  }
  if (current.length > 0) packed.push(current);

  return packed.map((row, index) => {
    const totalAspect = row.reduce((sum, entry) => sum + entry.aspect, 0);
    const available = usable - gap * (row.length - 1);
    const isLastRow = index === packed.length - 1;
    // 末行不再拉伸放大，保持基准行高，避免个别照片被放得过大。
    const height = isLastRow
      ? targetRowHeight
      : Math.min(available / totalAspect, targetRowHeight * 1.6);
    return {
      tiles: row.map((entry) => ({
        item: entry.item,
        width: Math.round(entry.aspect * height),
        height: Math.round(height)
      }))
    };
  });
}
