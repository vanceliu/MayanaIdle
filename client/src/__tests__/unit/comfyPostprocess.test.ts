/** AI 地圖素材後處理（`38-map-control.md` § 38.9「素材來源」） */
import { describe, expect, it } from 'vitest';
import {
  boxDownscale,
  createImage,
  cropToContent,
  addOutline,
  keyOutBackground,
  makeSeamless,
  processFloorTexture,
  processObject,
  removeSpecks,
} from '../../../scripts/comfy/postprocess.mjs';
import { FLOOR_PERIOD, FLOOR_TEXELS_PER_TILE } from '../../../scripts/comfy/tileSpec.mjs';
import type { RgbaImage as Img } from '../../../scripts/comfy/postprocess.mjs';

function fill(img: Img, fn: (x: number, y: number) => [number, number, number, number]): Img {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = fn(x, y);
      img.data.set([r, g, b, a], (y * img.width + x) * 4);
    }
  }
  return img;
}

const pixel = (img: Img, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('makeSeamless', () => {
  it('中央不出現錯位圖的十字接縫', () => {
    const size = 64;
    const src = fill(createImage(size, size), (x, y) => [x * 4, y * 4, 0, 255]);
    const out = makeSeamless(src);
    for (let i = 0; i < size; i++) {
      expect(Math.abs(pixel(out, size / 2 - 1, i)[0] - pixel(out, size / 2, i)[0])).toBeLessThan(12);
      expect(Math.abs(pixel(out, i, size / 2 - 1)[1] - pixel(out, i, size / 2)[1])).toBeLessThan(12);
    }
  });


  it('左右、上下邊緣可循環接上', () => {
    const size = 64;
    const src = fill(createImage(size, size), (x, y) => [x * 4, y * 4, 0, 255]);
    const out = makeSeamless(src);
    for (let i = 0; i < size; i++) {
      expect(pixel(out, 0, i)[0]).toBeCloseTo(pixel(out, size - 1, i)[0], -1);
      expect(pixel(out, i, 0)[1]).toBeCloseTo(pixel(out, i, size - 1)[1], -1);
    }
  });
});

describe('boxDownscale', () => {
  it('取面積平均；半透明區塊的 alpha 為平均、顏色不被透明像素拉暗', () => {
    const img = fill(createImage(4, 4), x => (x < 2 ? [200, 100, 0, 255] : [0, 0, 0, 0]));
    const out = boxDownscale(img, 1, 1);
    expect(pixel(out, 0, 0)).toEqual([200, 100, 0, 128]);
  });
});

describe('keyOutBackground + cropToContent', () => {
  it('鍵出背景色，含被物件圍住的背景', () => {
    const img = fill(createImage(20, 20), (x, y) => {
      const inBox = x >= 5 && x < 15 && y >= 5 && y < 15;
      const hole = x >= 9 && x < 11 && y >= 9 && y < 11;
      return inBox && !hole ? [0, 0, 0, 255] : [255, 0, 255, 255];
    });
    const keyed = keyOutBackground(img);
    expect(pixel(keyed, 0, 0)[3]).toBe(0);
    expect(pixel(keyed, 10, 10)[3]).toBe(0);
    expect(pixel(keyed, 6, 6)[3]).toBe(255);
    const cropped = cropToContent(keyed);
    expect([cropped.width, cropped.height]).toEqual([10, 10]);
  });

  it('低彩度背景：與背景相近、未連通外框的物件色保留，被圍住的背景色仍鍵出', () => {
    const img = fill(createImage(20, 20), (x, y) => {
      const inBox = x >= 5 && x < 15 && y >= 5 && y < 15;
      if (!inBox || (x >= 9 && x < 11 && y === 9)) return [178, 125, 135, 255];
      if (x === 5 || x === 14 || y === 5 || y === 14) return [20, 20, 20, 255];
      return [160, 160, 160, 255];
    });
    const keyed = keyOutBackground(img);
    expect(pixel(keyed, 7, 12)[3]).toBe(255);
    expect(pixel(keyed, 9, 9)[3]).toBe(0);
  });

  it('與背景相連、同色相的陰影（色溢）一併鍵出，異色相的物件保留', () => {
    const img = fill(createImage(20, 20), (x, y) => {
      if (y >= 14 && y < 17 && x >= 4 && x < 16) return [120, 50, 90, 255];
      if (x >= 6 && x < 14 && y >= 4 && y < 14) return [190, 160, 120, 255];
      return [181, 59, 110, 255];
    });
    const keyed = keyOutBackground(img);
    expect(pixel(keyed, 10, 15)[3]).toBe(0);
    expect(pixel(keyed, 10, 8)[3]).toBe(255);
  });

  it('貼著背景的混色邊一併鍵出', () => {
    const img = fill(createImage(20, 20), (x, y) => {
      if (y < 3 || y > 16 || x < 10 || x > 16) return [255, 0, 255, 255];
      return x === 10 ? [200, 40, 200, 255] : [0, 80, 0, 255];
    });
    const keyed = keyOutBackground(img);
    expect(pixel(keyed, 10, 10)[3]).toBe(0);
    expect(pixel(keyed, 11, 10)[3]).toBe(255);
  });
});

describe('addOutline', () => {
  it('輪廓外補一圈外框色，畫布四周各擴外框寬，內部不變', () => {
    const img = fill(createImage(20, 20), (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [230, 230, 220, 255] : [0, 0, 0, 0]));
    const outlined = addOutline(img);
    expect([outlined.width, outlined.height]).toEqual([24, 24]);
    expect(pixel(outlined, 6, 12)).toEqual([20, 20, 20, 255]);
    expect(pixel(outlined, 12, 12)).toEqual([230, 230, 220, 255]);
    expect(pixel(outlined, 0, 0)[3]).toBe(0);
  });
});

describe('processObject', () => {
  it('寬度縮到上限內並保留比例', () => {
    const img = fill(createImage(200, 200), (x, y) => (x > 40 && x < 160 && y > 20 && y < 180 ? [60, 120, 40, 255] : [255, 0, 255, 255]));
    const sprite = processObject(img, 48);
    expect(sprite.width).toBe(48);
    expect(sprite.height).toBe(Math.round(159 * 48 / 119));
  });
});

describe('removeSpecks', () => {
  it('刪除遠離主體的小雜點，主體保留', () => {
    const img = fill(createImage(100, 100), (x, y) => ((x >= 20 && x < 80 && y >= 20 && y < 80) || (x === 5 && y === 5) ? [90, 90, 90, 255] : [0, 0, 0, 0]));
    const cleaned = removeSpecks(img);
    expect(pixel(cleaned, 5, 5)[3]).toBe(0);
    expect(pixel(cleaned, 50, 50)[3]).toBe(255);
  });
});

describe('processFloorTexture', () => {
  it('原圖四周的邊框裁掉，不進材質', () => {
    const img = fill(createImage(256, 256), (x, y) => (x < 8 || y < 8 || x >= 248 || y >= 248 ? [255, 255, 255, 255] : [40, 80, 40, 255]));
    const texture = processFloorTexture(img);
    for (let i = 0; i < texture.data.length; i += 4) expect(texture.data[i]).toBe(40);
  });


  it('輸出邊長為 FLOOR_PERIOD × FLOOR_TEXELS_PER_TILE', () => {
    const img = fill(createImage(256, 256), (x, y) => [x, y, 0, 255]);
    const texture = processFloorTexture(img);
    expect([texture.width, texture.height]).toEqual([FLOOR_PERIOD * FLOOR_TEXELS_PER_TILE, FLOOR_PERIOD * FLOOR_TEXELS_PER_TILE]);
  });
});
