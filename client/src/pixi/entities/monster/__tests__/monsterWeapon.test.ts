/** 怪物遠程物理的武器演出（`48-vfx.md` § 48.6.5） */
import { describe, expect, it } from 'vitest';
import { WEAPON_ART, WEAPON_MATERIAL_COLOR, weaponMuzzle, weaponPlaybackMs } from '../../pawn/weaponGeometry';
import { ELEMENT_COLORS } from '../../../ui/projectileStyle';
import {
  MONSTER_THROW_AXE_MOTION,
  monsterAxeColor,
  monsterGemColor,
  monsterWeaponAttack,
  monsterWeaponMaterial,
  monsterWeaponMuzzle,
  monsterWeaponStrikeMs,
} from '../monsterWeapon';

describe('材質依怪物等級', () => {
  it.each([
    [1, 'iron'], [39, 'iron'], [40, 'silver'], [49, 'silver'],
    [50, 'mithril'], [59, 'mithril'], [60, 'orichalcum'], [100, 'orichalcum'],
  ] as const)('Lv%i → %s', (level, material) => {
    expect(monsterWeaponMaterial(level)).toBe(material);
  });

  it('寶珠色＝攻擊元素的投射物色', () => {
    expect(monsterGemColor('dark')).toBe(`#${ELEMENT_COLORS.dark.toString(16).padStart(6, '0')}`);
    expect(monsterGemColor('none')).toBe('#ffffff');
  });

  it('飛斧斧刃色＝材質色', () => {
    expect(monsterAxeColor('silver')).toBe(Number.parseInt(WEAPON_MATERIAL_COLOR.silver.slice(1), 16));
  });
});

describe('武器與揮法', () => {
  it('弓、雙手杖沿用玩家揮法；擲斧用單手斧造型＋擲斧揮法', () => {
    expect(monsterWeaponAttack('bow', 'iron', 90, 1200)).toMatchObject({ type: 'bow', motion: undefined });
    expect(monsterWeaponAttack('twoHandStaff', 'iron', 90, 1200, '#9933ff'))
      .toMatchObject({ type: 'twoHandStaff', motion: undefined, gemColor: '#9933ff' });
    expect(monsterWeaponAttack('throwAxe', 'iron', 90, 1200)).toMatchObject({ type: 'axe', motion: MONSTER_THROW_AXE_MOTION });
  });

  it('投射物出發時點＝演出長度 × 放箭／脫手時點，攻速高時跟著壓縮', () => {
    const bow = WEAPON_ART.bow.motion;
    expect(monsterWeaponStrikeMs('bow', 1200)).toBeCloseTo(weaponPlaybackMs(bow, 1200) * bow.tStrike);
    expect(monsterWeaponStrikeMs('throwAxe', 300)).toBeLessThan(monsterWeaponStrikeMs('throwAxe', 1200));
  });

  it('出發點套用掛點的縮放與抬高', () => {
    const base = weaponMuzzle(WEAPON_ART.bow, 90);
    const muzzle = monsterWeaponMuzzle('bow', 90, { lift: 4, scale: 2 });
    expect(muzzle.x).toBeCloseTo(base.x * 2);
    expect(muzzle.y).toBeCloseTo(base.y * 2 - 4);
  });
});
