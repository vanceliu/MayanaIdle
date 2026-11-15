/** 怪物 AI 美術的顯示外框（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { ART_OUTLINE_COLOR, ART_OVERSAMPLE, bakeOutlinedCanvas, outlineOffsets, outlinedArtLayout, paintOutlinedArt, paintSilhouette, type OutlineContext } from '../artOutline';

class RecordingContext implements OutlineContext {
  globalCompositeOperation = 'source-over';
  fillStyle: unknown = '#000';
  readonly draws: { image: CanvasImageSource; x: number; y: number; width: number; height: number; op: string }[] = [];
  readonly fills: { fill: unknown; op: string }[] = [];
  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void {
    this.draws.push({ image, x, y, width, height, op: this.globalCompositeOperation });
  }
  fillRect(): void {
    this.fills.push({ fill: this.fillStyle, op: this.globalCompositeOperation });
  }
}

const IMAGE = {} as CanvasImageSource;
const SILHOUETTE = {} as CanvasImageSource;

describe('outlinedArtLayout', () => {
  it('依顯示縮放與取樣倍率重新取樣，四周各留外框寬', () => {
    const layout = outlinedArtLayout({ width: 100, height: 128 }, 0.25, 1);
    expect([layout.imageWidth, layout.imageHeight]).toEqual([100 * 0.25 * ART_OVERSAMPLE, 128 * 0.25 * ART_OVERSAMPLE]);
    expect(layout.pad).toBe(ART_OVERSAMPLE);
    expect([layout.width, layout.height]).toEqual([layout.imageWidth + 2 * layout.pad, layout.imageHeight + 2 * layout.pad]);
    expect(layout.spriteScale).toBe(1 / ART_OVERSAMPLE);
  });

  it('錨點對齊原圖底緣中央：顯示時腳底位置不受外框影響', () => {
    const layout = outlinedArtLayout({ width: 80, height: 120 }, 0.3, 1.5);
    expect(layout.anchorX).toBe(0.5);
    expect(layout.height * layout.anchorY).toBeCloseTo(layout.pad + layout.imageHeight);
  });

  it('外框寬以世界像素計：不同縮放的怪物外框貼圖寬相同', () => {
    const small = outlinedArtLayout({ width: 90, height: 128 }, 0.225, 1);
    const large = outlinedArtLayout({ width: 90, height: 128 }, 0.375, 1);
    expect(small.pad * small.spriteScale).toBe(large.pad * large.spriteScale);
  });

  it('外框 0 時不留邊', () => {
    const layout = outlinedArtLayout({ width: 10, height: 10 }, 1, 0);
    expect(layout.pad).toBe(0);
    expect(layout.anchorY).toBe(1);
  });
});

describe('outlineOffsets', () => {
  it('最外圈落在半徑上、每圈至少 8 個方向', () => {
    const offsets = outlineOffsets(3);
    const radii = offsets.map(o => Math.hypot(o.x, o.y));
    expect(Math.max(...radii)).toBeCloseTo(3);
    for (const r of [1, 2, 3]) expect(radii.filter(d => Math.abs(d - r) < 1e-9).length).toBeGreaterThanOrEqual(8);
  });

  it('非整數半徑的最外圈取在半徑上；半徑 0 沒有位移', () => {
    expect(Math.max(...outlineOffsets(2.5).map(o => Math.hypot(o.x, o.y)))).toBeCloseTo(2.5);
    expect(outlineOffsets(0)).toEqual([]);
  });
});

describe('paintSilhouette／paintOutlinedArt', () => {
  it('剪影：畫原圖後以 source-in 填外框色，最後還原合成模式', () => {
    const ctx = new RecordingContext();
    const layout = outlinedArtLayout({ width: 10, height: 10 }, 1, 1);
    paintSilhouette(ctx, IMAGE, layout);
    expect(ctx.draws).toHaveLength(1);
    expect(ctx.fills).toEqual([{ fill: ART_OUTLINE_COLOR, op: 'source-in' }]);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('外框：剪影依每個位移各畫一次，原圖最後畫在 (pad, pad)', () => {
    const ctx = new RecordingContext();
    const layout = outlinedArtLayout({ width: 10, height: 10 }, 1, 0.5);
    paintOutlinedArt(ctx, IMAGE, SILHOUETTE, layout);
    const last = ctx.draws.at(-1)!;
    expect(last).toMatchObject({ image: IMAGE, x: layout.pad, y: layout.pad, width: layout.imageWidth, height: layout.imageHeight });
    expect(ctx.draws.slice(0, -1).every(d => d.image === SILHOUETTE)).toBe(true);
    expect(ctx.draws.length - 1).toBe(outlineOffsets(layout.pad).length);
  });
});

describe('bakeOutlinedCanvas', () => {
  it('剪影畫布為原圖尺寸、成品畫布為 layout 尺寸；外框色可指定', () => {
    const made: { width: number; height: number; ctx: RecordingContext; getContext: () => RecordingContext }[] = [];
    const create = () => {
      const ctx = new RecordingContext();
      const canvas = { width: 0, height: 0, ctx, getContext: () => ctx };
      made.push(canvas);
      return canvas;
    };
    const layout = outlinedArtLayout({ width: 20, height: 30 }, 1, 1);
    const result = bakeOutlinedCanvas(IMAGE, layout, create, '#aa44ff');
    const [silhouette, target] = made;
    expect([silhouette.width, silhouette.height]).toEqual([layout.imageWidth, layout.imageHeight]);
    expect(silhouette.ctx.fills[0].fill).toBe('#aa44ff');
    expect(result).toBe(target);
    expect([target.width, target.height]).toEqual([layout.width, layout.height]);
    expect(target.ctx.draws.at(-1)!.image).toBe(IMAGE);
  });
});
