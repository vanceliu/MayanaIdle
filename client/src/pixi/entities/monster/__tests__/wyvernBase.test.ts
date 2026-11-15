/** Wyvern img2img 底圖與底圖分派（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { BoundsContext } from '../../pawn/__tests__/boundsContext';
import { drawMonsterBase } from '../monsterBase';
import { PAWN_BASE_SIZE } from '../pawnBase';
import { drawWyvernBase } from '../wyvernBase';

const COLORS = { body: '#6e9466', belly: '#c3d6a0', wing: '#557a52', horn: '#e8dfc0' };

describe('drawWyvernBase', () => {
  it('三視圖落在畫布內、無 NaN', () => {
    const ctx = new BoundsContext();
    drawWyvernBase(ctx, COLORS);
    expect(ctx.badValues).toEqual([]);
    expect(ctx.left).toBeGreaterThan(0);
    expect(ctx.right).toBeLessThan(PAWN_BASE_SIZE.width);
    expect(ctx.top).toBeGreaterThan(0);
    expect(ctx.bottom).toBeLessThan(PAWN_BASE_SIZE.height);
  });
});

describe('drawMonsterBase', () => {
  it("shape 'wyvern' 畫 Wyvern，省略時畫角色剪影", () => {
    const wyvern = new BoundsContext();
    drawMonsterBase(wyvern, { shape: 'wyvern', ...COLORS });
    const pawn = new BoundsContext();
    drawMonsterBase(pawn, { skin: '#7cc04a', cloth: '#7a5232' });
    expect(wyvern.badValues).toEqual([]);
    expect(pawn.badValues).toEqual([]);
    expect(wyvern.right - wyvern.left).not.toBeCloseTo(pawn.right - pawn.left);
  });
});
