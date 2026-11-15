/**
 * 第三代背景 render 的主題圖集（`38-map-control.md` § 38.9「第三代實作限制」）。
 *
 * 影像格式同 `postprocess.mjs`：`{ width, height, data }`（RGBA8888）。
 */
import { createImage } from './postprocess.mjs';

/** 圖集寬度（px）與 frame 間距（px） */
export const ATLAS_WIDTH = 1024;
export const ATLAS_PADDING = 2;

/**
 * 依高度由大到小排成橫列（shelf packing）；每個 frame 四周留 ATLAS_PADDING。
 * 回傳圖集影像與 frames（name → { x, y, w, h }，順序同輸入）。
 */
export function packAtlas(entries, { width = ATLAS_WIDTH, padding = ATLAS_PADDING } = {}) {
  const order = entries.map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.image.height - a.image.height || a.index - b.index);
  const placed = new Map();
  let x = padding, y = padding, rowHeight = 0;
  for (const { name, image } of order) {
    if (image.width + padding * 2 > width) throw new Error(`${name} 寬 ${image.width} 超過圖集寬度 ${width}`);
    if (x + image.width + padding > width) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    placed.set(name, { x, y, w: image.width, h: image.height });
    x += image.width + padding;
    rowHeight = Math.max(rowHeight, image.height);
  }
  const atlas = createImage(width, y + rowHeight + padding);
  for (const { name, image } of order) {
    const frame = placed.get(name);
    for (let row = 0; row < image.height; row++) {
      image.data.copy(atlas.data, ((frame.y + row) * width + frame.x) * 4, row * image.width * 4, (row + 1) * image.width * 4);
    }
  }
  return { image: atlas, frames: Object.fromEntries(entries.map(({ name }) => [name, placed.get(name)])) };
}
