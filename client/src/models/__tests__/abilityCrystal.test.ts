/**
 * 技能結晶與技能更換（`07-affix-ability.md` § 7S.8）。
 */
import { describe, it, expect } from 'vitest';
import {
  yieldsAbilityCrystal, abilityToCrystal, mergeCrystal, addCrystal, crystalImproves, crystalToAbility,
  getCrystalApplyBlock, getCrystalApplyCost, formatCrystalEffect, normalizeAbilityCrystals,
} from '../abilityCrystal';

const T5_SWORD = { slot: 'rightHand', tier: 5, smallMonsterDamage: 20, largeMonsterDamage: 18 }; // 武器值 19
const T7_SWORD = { slot: 'rightHand', tier: 7, smallMonsterDamage: 34, largeMonsterDamage: 32 }; // 武器值 33
const T5_RING = { slot: 'ring1', tier: 5 };
const ELF_BOW = { slot: 'rightHand', tier: 5, smallMonsterDamage: 10, largeMonsterDamage: 10, requiredClass: ['elf'] };

describe('可拆出結晶', () => {
  const ability = { type: 'thorns' as const, params: { percent: 40 } };
  it('只有掉落品', () => {
    expect(yieldsAbilityCrystal({ ability })).toBe(true);
    expect(yieldsAbilityCrystal({ ability, isCraftedGear: true })).toBe(false);
    expect(yieldsAbilityCrystal({ ability, maxAffixTier: 3 })).toBe(false);
    expect(yieldsAbilityCrystal({})).toBe(false);
  });
});

describe('位置換算', () => {
  it('最弱 0、最好 1；↓ 參數反向', () => {
    expect(abilityToCrystal({ type: 'bonus_damage', params: { chance: 5, damage: 19 } }, T5_SWORD)!.positions)
      .toEqual({ chance: 0, damage: 1 });
    expect(abilityToCrystal({ type: 'combo_strike', params: { every: 5, bonus: 30 } }, T5_SWORD)!.positions)
      .toEqual({ every: 1, bonus: 0.5 });
    expect(abilityToCrystal({ type: 'rage', params: { decay: 15 } }, T5_RING)!.positions).toEqual({ decay: 0 });
  });

  it('秒數依 step 換算', () => {
    const crystal = abilityToCrystal({ type: 'binding_arrow_boost', params: { cooldown: 1500, root: 3000 } }, ELF_BOW)!;
    expect(crystal.positions).toEqual({ cooldown: 0.5, root: 1 });
    expect(crystalToAbility(crystal, ELF_BOW)!.params).toEqual({ cooldown: 1500, root: 3000 });
  });

  it('武器值參數依目標的武器值換算', () => {
    const crystal = abilityToCrystal({ type: 'bonus_damage', params: { chance: 10, damage: 12 } }, T5_SWORD)!;
    expect(crystal.positions.damage).toBe(0.5);
    expect(crystalToAbility(crystal, T7_SWORD)!.params).toEqual({ chance: 10, damage: 19 });
  });

  it('無參數技能', () => {
    const crystal = abilityToCrystal({ type: 'arrow_rain_boost', params: {} }, ELF_BOW)!;
    expect(crystal.positions).toEqual({});
    expect(crystalToAbility(crystal, ELF_BOW)).toEqual({ type: 'arrow_rain_boost', params: {} });
  });
});

describe('合併', () => {
  const a = { type: 'bonus_damage' as const, positions: { chance: 0.8, damage: 0.2 } };
  const b = { type: 'bonus_damage' as const, positions: { chance: 0.4, damage: 0.6 } };

  it('每個參數各取較好', () => {
    expect(mergeCrystal(a, b).positions).toEqual({ chance: 0.8, damage: 0.6 });
  });

  it('清單依種類合併；新種類加在最後', () => {
    const thorns = { type: 'thorns' as const, positions: { percent: 0.5 } };
    expect(addCrystal([a, thorns], b)).toEqual([{ type: 'bonus_damage', positions: { chance: 0.8, damage: 0.6 } }, thorns]);
    expect(addCrystal([thorns], a)).toEqual([thorns, a]);
  });

  it('有任一參數變好才算更新', () => {
    expect(crystalImproves(a, b)).toBe(true);
    expect(crystalImproves(mergeCrystal(a, b), b)).toBe(false);
    expect(crystalImproves(undefined, b)).toBe(true);
  });
});

describe('套用限制與費用', () => {
  const weapon = { type: 'bonus_damage' as const, positions: { chance: 1, damage: 1 } };
  const ring = { type: 'thorns' as const, positions: { percent: 1 } };
  const knightWeapon = { type: 'rend_boost' as const, positions: { percent: 1 } };

  it('武器池只套武器、飾品池只套項鍊戒指', () => {
    expect(getCrystalApplyBlock(weapon, {}, T5_SWORD)).toBeNull();
    expect(getCrystalApplyBlock(weapon, {}, T5_RING)).toBe('wrongGroup');
    expect(getCrystalApplyBlock(ring, {}, { slot: 'necklace', tier: 4 })).toBeNull();
    expect(getCrystalApplyBlock(ring, {}, { slot: 'helmet', tier: 5 })).toBe('notAbilitySlot');
    expect(getCrystalApplyBlock(ring, {}, { slot: 'ring1', tier: 2 })).toBe('notAbilitySlot');
  });

  it('製作品、身上的裝備不能套用', () => {
    expect(getCrystalApplyBlock(weapon, { isCraftedGear: true }, T5_SWORD)).toBe('crafted');
    expect(getCrystalApplyBlock(weapon, { equipped: true }, T5_SWORD)).toBe('equipped');
  });

  it('職業技能：目標要是該職業可裝備', () => {
    expect(getCrystalApplyBlock(knightWeapon, {}, T5_SWORD)).toBeNull();
    expect(getCrystalApplyBlock(knightWeapon, {}, ELF_BOW)).toBe('classCannotEquip');
  });

  it('費用 1,500,000 × 階級', () => {
    expect(getCrystalApplyCost(3)).toBe(4_500_000);
    expect(getCrystalApplyCost(7)).toBe(10_500_000);
  });
});

describe('結晶敘述', () => {
  it('固定區間代入數值，武器值參數顯示位置', () => {
    expect(formatCrystalEffect({ type: 'bonus_damage', positions: { chance: 0.6, damage: 0.5 } }))
      .toBe('命中 8% (5 ~ 10%) 機率追加 50% (5 ~ 武器值) 傷害');
  });
});

describe('存檔讀回', () => {
  it('剔除不認得的種類與參數、位置夾在 0~1、同種類合併', () => {
    expect(normalizeAbilityCrystals([
      { type: 'bonus_damage', positions: { chance: 2, damage: -1, junk: 0.5 } },
      { type: 'removed_ability', positions: { x: 1 } },
      { type: 'bonus_damage', positions: { chance: 0.2, damage: 0.4 } },
      null,
      { type: 'thorns' },
    ])).toEqual([
      { type: 'bonus_damage', positions: { chance: 1, damage: 0.4 } },
      { type: 'thorns', positions: { percent: 0 } },
    ]);
    expect(normalizeAbilityCrystals(undefined)).toEqual([]);
  });
});
