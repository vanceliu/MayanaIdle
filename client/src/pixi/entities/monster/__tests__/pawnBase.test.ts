/** 人形怪物 img2img 底圖（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { MONSTER_RAW } from '../../../../../scripts/comfy/monsterPostprocess.mjs';
import { drawPawn } from '../../pawn/drawPawn';
import { PAWN_DIRECTION_BY_ID, PAWN_GEOM } from '../../pawn/geometry';
import { BoundsContext } from '../../pawn/__tests__/boundsContext';
import {
  PAWN_BASE_GROUND_Y,
  PAWN_BASE_OUTLINE,
  PAWN_BASE_SCALE,
  PAWN_BASE_SIZE,
  PAWN_BASE_VIEWS,
  drawPawnBase,
  pawnBaseLook,
} from '../pawnBase';

const COLORS = { skin: '#7cc04a', cloth: '#7a5232' };

describe('pawnBase', () => {
  it('畫布尺寸同 AI 原圖', () => {
    expect(PAWN_BASE_SIZE).toEqual(MONSTER_RAW);
  });

  it('三個視圖各自落在畫布三等分內、不出界、無 NaN', () => {
    const third = PAWN_BASE_SIZE.width / 3;
    const geom = { ...PAWN_GEOM, scale: PAWN_BASE_SCALE, outline: PAWN_BASE_OUTLINE, shadow: 0 };
    PAWN_BASE_VIEWS.forEach(({ direction, x }, i) => {
      const ctx = new BoundsContext();
      drawPawn(ctx, x, PAWN_BASE_GROUND_Y, PAWN_DIRECTION_BY_ID[direction], pawnBaseLook(COLORS), geom);
      expect(ctx.badValues).toEqual([]);
      expect(ctx.left).toBeGreaterThan(third * i);
      expect(ctx.right).toBeLessThan(third * (i + 1));
      expect(ctx.top).toBeGreaterThan(0);
      expect(ctx.bottom).toBeLessThan(PAWN_BASE_SIZE.height);
    });
  });

  it('預設禿頭；指定髮型時頭部輪廓用該髮型與髮色、畫得出來', () => {
    expect(pawnBaseLook(COLORS).hair).toBe('bald');
    const hooded = pawnBaseLook({ ...COLORS, hair: 'long', hairColor: '#4e3b2a' });
    expect([hooded.hair, hooded.hairColor]).toEqual(['long', '#4e3b2a']);
    const ctx = new BoundsContext();
    drawPawnBase(ctx, { ...COLORS, hair: 'long', hairColor: '#4e3b2a' });
    expect(ctx.badValues).toEqual([]);
  });

  it('依序畫正面、右、背面', () => {
    expect(PAWN_BASE_VIEWS.map(v => v.direction)).toEqual(['front', 'right', 'back']);
    expect(() => drawPawnBase(new BoundsContext(), COLORS)).not.toThrow();
  });
});
