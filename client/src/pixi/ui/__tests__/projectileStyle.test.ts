import { describe, it, expect } from 'vitest';
import {
  ELEMENT_COLORS,
  NO_ELEMENT_PROJECTILE_COLOR,
  getElementProjectileColor,
  getMonsterProjectileStyle,
} from '../projectileStyle';
import { MONSTER_SEEDS } from '../../../db/seed/monsterSeeds';
import type { ElementType } from '../../../models/monster';

const ELEMENTS: ElementType[] = ['fire', 'ice', 'wind', 'earth', 'light', 'dark', 'none'];

describe('投射物顏色只看元素（§ 42.4）', () => {
  it('無元素 = 白色', () => {
    expect(NO_ELEMENT_PROJECTILE_COLOR).toBe(0xffffff);
    expect(ELEMENT_COLORS.none).toBe(NO_ELEMENT_PROJECTILE_COLOR);
    expect(getElementProjectileColor('none')).toBe(0xffffff);
    expect(getElementProjectileColor(undefined)).toBe(0xffffff);
    expect(getElementProjectileColor('')).toBe(0xffffff);
  });

  it('未知元素退回白色而非給出 undefined', () => {
    expect(getElementProjectileColor('plasma')).toBe(0xffffff);
  });

  it('每個元素都有顏色，且除無屬性外彼此不重複', () => {
    for (const e of ELEMENTS) expect(ELEMENT_COLORS[e], e).toBeTypeOf('number');
    const colored = ELEMENTS.filter(e => e !== 'none').map(e => ELEMENT_COLORS[e]);
    expect(new Set(colored).size).toBe(colored.length);
  });

  it('不分敵我：同元素的玩家與怪物攻擊同色', () => {
    // 怪物魔法彈與玩家技能都走同一張表，因此同元素必然同色
    for (const e of ELEMENTS) {
      expect(getMonsterProjectileStyle('magic', e).color, e).toBe(getElementProjectileColor(e));
    }
  });
});

describe('怪物投射物外型（§ 42.4）', () => {
  it('遠程物理：白色箭矢，不受怪物元素影響', () => {
    // 妖魔神射手是風屬性，但物理普攻沒有元素 → 仍是白箭
    expect(getMonsterProjectileStyle('ranged', 'wind')).toEqual({
      shape: 'arrow',
      color: 0xffffff,
    });
    expect(getMonsterProjectileStyle('ranged', 'dark')).toEqual({
      shape: 'arrow',
      color: 0xffffff,
    });
  });

  it('遠程魔法：彈丸，依怪物元素上色', () => {
    expect(getMonsterProjectileStyle('magic', 'ice')).toEqual({
      shape: 'circle',
      color: ELEMENT_COLORS.ice,
    });
    expect(getMonsterProjectileStyle('magic', 'dark')).toEqual({
      shape: 'circle',
      color: ELEMENT_COLORS.dark,
    });
  });

  it('遠程魔法且無元素 → 白色彈丸', () => {
    expect(getMonsterProjectileStyle('magic', 'none').color).toBe(0xffffff);
    expect(getMonsterProjectileStyle('magic', undefined).color).toBe(0xffffff);
  });

  it('不再有寫死的紅色：任何 seed 組合都不會產出舊的 0xff6b6b', () => {
    const ranged = MONSTER_SEEDS.filter(m => m.attackType === 'ranged' || m.attackType === 'magic');
    expect(ranged.length).toBeGreaterThan(0);
    for (const m of ranged) {
      const { color } = getMonsterProjectileStyle(m.attackType, m.element);
      expect(color, m.name).not.toBe(0xff6b6b);
      expect(color, m.name).toBe(
        m.attackType === 'magic' ? ELEMENT_COLORS[m.element] : 0xffffff,
      );
    }
  });
});
