/** 第三代背景 render 地圖專用圖集（`38-map-control.md` § 38.9「第三代實作限制」） */
import { describe, expect, it } from 'vitest';
import { MAP_ATLAS_PADDING, packCells } from '../mapAtlas';

describe('packCells', () => {
  it('同頁 frame 互不重疊、留間距，頁面涵蓋所有 frame', () => {
    const sizes = Array.from({ length: 40 }, (_, i) => ({ width: 130 + (i % 3) * 7, height: 100 + (i % 4) * 5 }));
    const { pages, cells } = packCells(sizes, 512);
    expect(cells).toHaveLength(40);
    cells.forEach((a, i) => {
      expect(a).toMatchObject(sizes[i]);
      expect(a.x + a.width + MAP_ATLAS_PADDING).toBeLessThanOrEqual(pages[a.page].width);
      expect(a.y + a.height + MAP_ATLAS_PADDING).toBeLessThanOrEqual(pages[a.page].height);
      expect(pages[a.page].width).toBeLessThanOrEqual(512);
      expect(pages[a.page].height).toBeLessThanOrEqual(512);
      for (const b of cells) {
        if (a === b || a.page !== b.page) continue;
        const apartX = a.x + a.width + MAP_ATLAS_PADDING <= b.x || b.x + b.width + MAP_ATLAS_PADDING <= a.x;
        const apartY = a.y + a.height + MAP_ATLAS_PADDING <= b.y || b.y + b.height + MAP_ATLAS_PADDING <= a.y;
        expect(apartX || apartY).toBe(true);
      }
    });
  });

  it('一頁放不下時開新頁', () => {
    const { pages } = packCells(Array.from({ length: 40 }, () => ({ width: 130, height: 100 })), 512);
    expect(pages.length).toBeGreaterThan(1);
  });

  it('單格超過上限時報錯', () => {
    expect(() => packCells([{ width: 600, height: 10 }], 512)).toThrow(/超過圖集上限/);
  });
});
