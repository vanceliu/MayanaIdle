/**
 * 地圖專用圖集（`38-map-control.md` § 38.9「第三代實作限制」）：牆塊與斷柱柱基逐格不同，
 * 地圖載入時以 Canvas 畫進一到數頁圖集，每格一個 frame。
 */
import type { Ctx2D, ScreenRect } from './wallPaint';

/** 圖集單頁邊長上限（px）與 frame 間距（px） */
export const MAP_ATLAS_MAX_SIZE = 2048;
export const MAP_ATLAS_PADDING = 2;

export interface PackedCell { page: number; x: number; y: number; width: number; height: number }

/** 依輸入順序排成橫列（shelf packing），一頁放不下時開新頁 */
export function packCells(sizes: readonly { width: number; height: number }[], maxSize = MAP_ATLAS_MAX_SIZE, padding = MAP_ATLAS_PADDING):
  { pages: { width: number; height: number }[]; cells: PackedCell[] } {
  const pages: { width: number; height: number }[] = [];
  const cells: PackedCell[] = [];
  let x = padding, y = padding, rowHeight = 0;
  const openPage = () => {
    pages.push({ width: 0, height: 0 });
    x = padding;
    y = padding;
    rowHeight = 0;
  };
  for (const { width, height } of sizes) {
    if (width + padding * 2 > maxSize || height + padding * 2 > maxSize) throw new Error(`frame ${width}×${height} 超過圖集上限 ${maxSize}`);
    if (pages.length === 0) openPage();
    if (x + width + padding > maxSize) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    if (y + height + padding > maxSize) openPage();
    const page = pages[pages.length - 1];
    cells.push({ page: pages.length - 1, x, y, width, height });
    x += width + padding;
    rowHeight = Math.max(rowHeight, height);
    page.width = Math.max(page.width, x);
    page.height = Math.max(page.height, y + rowHeight + padding);
  }
  return { pages, cells };
}

/** 一格：螢幕座標範圍（世界像素）與畫法（以螢幕座標作畫） */
export interface AtlasCell {
  rect: ScreenRect;
  draw: (ctx: Ctx2D) => void;
}

/** 依 scale（點陣像素 ÷ 世界像素）把各格畫進圖集頁；每格裁在自己的 frame 內 */
export function bakeMapAtlas(items: readonly AtlasCell[], scale: number): { pages: OffscreenCanvas[]; cells: PackedCell[] } {
  const { pages: sizes, cells } = packCells(items.map(({ rect }) => ({
    width: Math.ceil(rect.width * scale),
    height: Math.ceil(rect.height * scale),
  })));
  const pages = sizes.map(({ width, height }) => new OffscreenCanvas(width, height));
  const contexts = pages.map(page => page.getContext('2d')!);
  items.forEach(({ rect, draw }, i) => {
    const cell = cells[i];
    const ctx = contexts[cell.page];
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.setTransform(scale, 0, 0, scale, cell.x - rect.x * scale, cell.y - rect.y * scale);
    draw(ctx);
    ctx.restore();
  });
  return { pages, cells };
}
