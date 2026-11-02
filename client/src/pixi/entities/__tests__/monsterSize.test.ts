/** 怪物球大小依體型（`25-monster-system.md` § 25.2.1） */
import { describe, it, expect } from 'vitest';
import { TILE_H } from '../../utils/isometric';
import { MONSTER_RADIUS, MonsterEntity, monsterCenterLift, monsterTopLift } from '../MonsterEntity';

describe('怪物球大小', () => {
  it('半徑：小型 TILE_H × 0.45、大型 TILE_H × 0.75', () => {
    expect(MONSTER_RADIUS.small).toBeCloseTo(TILE_H * 0.45);
    expect(MONSTER_RADIUS.large).toBeCloseTo(TILE_H * 0.75);
  });

  it('小型不位移；大型球頂上移兩倍半徑差、球心上移一倍', () => {
    const diff = MONSTER_RADIUS.large - MONSTER_RADIUS.small;
    expect(monsterTopLift('small')).toBe(0);
    expect(monsterCenterLift('small')).toBe(0);
    expect(monsterTopLift('large')).toBeCloseTo(diff * 2);
    expect(monsterCenterLift('large')).toBeCloseTo(diff);
  });

  it('不看 Boss：小型 Boss 是小球、大型一般怪是大球', () => {
    const boss = new MonsterEntity('b', true, 'small');
    const mob = new MonsterEntity('m', false, 'large');
    expect(boss.radius).toBeCloseTo(MONSTER_RADIUS.small);
    expect(mob.radius).toBeCloseTo(MONSTER_RADIUS.large);
    expect(mob.container.getLocalBounds().height).toBeGreaterThan(boss.container.getLocalBounds().height);
    boss.destroy();
    mob.destroy();
  });

  it('實體先建、體型後補：補上大型後球變大', () => {
    const m = new MonsterEntity('m');
    const before = m.container.getLocalBounds().height;
    m.setSize('large');
    expect(m.monsterSize).toBe('large');
    expect(m.container.getLocalBounds().height).toBeGreaterThan(before);
    m.destroy();
  });
});
