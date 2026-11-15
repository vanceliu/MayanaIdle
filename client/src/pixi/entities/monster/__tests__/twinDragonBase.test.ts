/** 雙頭龍 img2img 底圖（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { BoundsContext } from '../../pawn/__tests__/boundsContext';
import { drawMonsterBase } from '../monsterBase';
import { PAWN_BASE_SIZE } from '../pawnBase';
import { drawTwinDragonBase } from '../twinDragonBase';
import { drawWyvernBase } from '../wyvernBase';

const COLORS = { body: '#c8502e', belly: '#ecd2a0', wing: '#a83e26', horn: '#e8dfc0' };

describe('drawTwinDragonBase', () => {
  it('三視圖落在畫布內、無 NaN', () => {
    const ctx = new BoundsContext();
    drawTwinDragonBase(ctx, COLORS);
    expect(ctx.badValues).toEqual([]);
    expect(ctx.left).toBeGreaterThan(0);
    expect(ctx.right).toBeLessThan(PAWN_BASE_SIZE.width);
    expect(ctx.top).toBeGreaterThan(0);
    expect(ctx.bottom).toBeLessThan(PAWN_BASE_SIZE.height);
  });

  it("shape 'twin-dragon' 分派到雙頭龍底圖，與 Wyvern 底圖不同", () => {
    const twin = new BoundsContext();
    drawMonsterBase(twin, { shape: 'twin-dragon', ...COLORS });
    const direct = new BoundsContext();
    drawTwinDragonBase(direct, COLORS);
    const wyvern = new BoundsContext();
    drawWyvernBase(wyvern, COLORS);
    expect([twin.left, twin.right, twin.top, twin.bottom]).toEqual([direct.left, direct.right, direct.top, direct.bottom]);
    expect(twin.right - twin.left).not.toBeCloseTo(wyvern.right - wyvern.left);
  });
});
