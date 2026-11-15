/** 怪物 AI 美術的朝向與版面（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { HEALTH_BAR_OFFSET_Y } from '../../../ui/HealthBar';
import { MONSTER_RADIUS, monsterTopLift } from '../../MonsterEntity';
import { TILE_H, TILE_W } from '../../../utils/isometric';
import { MONSTER_ART_SIZE_RATIO, MONSTER_VIEW_BY_DIRECTION, monsterArtScale, monsterArtOutlineColor, monsterArtOverheadLift, monsterArtSize, monsterShadowRadius } from '../monsterArt';

describe('MONSTER_VIEW_BY_DIRECTION', () => {
  it('左右共用側面，只有朝左鏡像', () => {
    expect(MONSTER_VIEW_BY_DIRECTION.right).toEqual({ view: 'side', mirrored: false });
    expect(MONSTER_VIEW_BY_DIRECTION.left).toEqual({ view: 'side', mirrored: true });
    expect(MONSTER_VIEW_BY_DIRECTION.front).toEqual({ view: 'front', mirrored: false });
    expect(MONSTER_VIEW_BY_DIRECTION.back).toEqual({ view: 'back', mirrored: false });
  });
});

describe('monsterArtSize', () => {
  it('依體型的球直徑乘倍率', () => {
    expect(monsterArtSize('small', 1)).toBeCloseTo(MONSTER_RADIUS.small * 2);
    expect(monsterArtSize('large', 1.5)).toBeCloseTo(MONSTER_RADIUS.large * 3);
  });
});

describe('monsterArtScale', () => {
  it('先以最高的視圖對齊顯示高度，三視圖同一比例', () => {
    expect(monsterArtScale([{ width: 80, height: 100 }, { width: 100, height: 128 }, { width: 80, height: 96 }], 64)).toBe(0.5);
  });

  it('寬度在一格內時不影響縮放', () => {
    expect(monsterArtScale([{ width: 60, height: 120 }], 60)).toBe(monsterArtScale([{ width: 120, height: 120 }], 60));
  });

  it('最寬的視圖超過一格時整體縮到一格寬', () => {
    const views = [{ width: 80, height: 100 }, { width: 300, height: 90 }];
    const scale = monsterArtScale(views, 50);
    expect(300 * scale).toBeCloseTo(TILE_W);
    expect(100 * scale).toBeLessThan(50);
  });
});

describe('monsterShadowRadius', () => {
  it('水平直徑＝顯示寬度 × 比例，垂直依等距比例壓扁', () => {
    const { rx, ry } = monsterShadowRadius(40, 0.8);
    expect(rx * 2).toBeCloseTo(32);
    expect(ry / rx).toBeCloseTo(TILE_H / TILE_W);
  });

  it('寬的怪影子較大', () => {
    expect(monsterShadowRadius(60, 0.8).rx).toBeGreaterThan(monsterShadowRadius(30, 0.8).rx);
  });
});

describe('monsterArtOutlineColor', () => {
  it('依強化詞綴數：0 條黑、1～4 條藍黃橙紅，超出範圍取兩端', () => {
    expect([0, 1, 2, 3, 4].map(monsterArtOutlineColor)).toEqual(['#141414', '#60A5FA', '#FACC15', '#FB923C', '#EF4444']);
    expect(monsterArtOutlineColor(-1)).toBe('#141414');
    expect(monsterArtOutlineColor(9)).toBe('#EF4444');
  });
});

describe('monsterArtOverheadLift', () => {
  it('血條落在怪物圖頂（球直徑 × 倍率）上方 3 px，大小型皆同', () => {
    for (const size of ['small', 'large'] as const) {
      const artTop = -2 * MONSTER_RADIUS[size] * MONSTER_ART_SIZE_RATIO[size];
      expect(-monsterTopLift(size) - monsterArtOverheadLift(size) + HEALTH_BAR_OFFSET_Y).toBeCloseTo(artTop - 3);
    }
  });
});
