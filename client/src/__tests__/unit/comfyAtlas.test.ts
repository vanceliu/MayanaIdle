/** 第三代背景 render 主題圖集打包（`38-map-control.md` § 38.9「第三代實作限制」） */
import { describe, expect, it } from 'vitest';
import { ATLAS_PADDING, packAtlas } from '../../../scripts/comfy/atlas.mjs';
import { createImage } from '../../../scripts/comfy/postprocess.mjs';

function solid(width: number, height: number, value: number) {
  const image = createImage(width, height);
  image.data.fill(value);
  return image;
}

describe('packAtlas', () => {
  const entries = [
    { name: 'ground', image: solid(256, 256, 10) },
    { name: 'tree_0', image: solid(112, 140, 20) },
    { name: 'tuft_0', image: solid(40, 30, 30) },
    { name: 'water', image: solid(256, 256, 40) },
    { name: 'rock_0', image: solid(88, 60, 50) },
  ];
  const { image, frames } = packAtlas(entries, { width: 512 });

  it('每個 frame 尺寸同原圖、在圖集內', () => {
    for (const { name, image: source } of entries) {
      const frame = frames[name];
      expect(frame).toMatchObject({ w: source.width, h: source.height });
      expect(frame.x).toBeGreaterThanOrEqual(ATLAS_PADDING);
      expect(frame.y).toBeGreaterThanOrEqual(ATLAS_PADDING);
      expect(frame.x + frame.w + ATLAS_PADDING).toBeLessThanOrEqual(image.width);
      expect(frame.y + frame.h + ATLAS_PADDING).toBeLessThanOrEqual(image.height);
    }
  });

  it('frame 之間至少隔 ATLAS_PADDING', () => {
    const list = Object.values(frames);
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        const apartX = a.x + a.w + ATLAS_PADDING <= b.x || b.x + b.w + ATLAS_PADDING <= a.x;
        const apartY = a.y + a.h + ATLAS_PADDING <= b.y || b.y + b.h + ATLAS_PADDING <= a.y;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it('像素複製到 frame 位置，間距保持透明', () => {
    for (const { name, image: source } of entries) {
      const { x, y, w, h } = frames[name];
      for (const [px, py] of [[x, y], [x + w - 1, y + h - 1]]) {
        expect(image.data[(py * image.width + px) * 4]).toBe(source.data[0]);
      }
    }
    const { x, y } = frames.ground;
    expect(image.data[((y - 1) * image.width + x) * 4 + 3]).toBe(0);
  });

  it('寬度放不下時報錯', () => {
    expect(() => packAtlas([{ name: 'wide', image: solid(600, 10, 0) }], { width: 512 })).toThrow(/超過圖集寬度/);
  });
});
