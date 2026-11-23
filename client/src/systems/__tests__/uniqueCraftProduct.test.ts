import { describe, it, expect, beforeEach } from 'vitest';
import { reseed } from '../../core/rng';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentTemplate } from '../../models/equipment';
import {
  BONUS_ATTRIBUTE_VALUE, getAffixCategoryForSlot, getAffixTierTable, isSpecialAffixType, isTierlessAffixType, type AffixType,
} from '../../models/affix';
import { getAbilityClassPool, getAbilityCommonPool, getAbilityDefinition } from '../../models/ability';
import { UNIQUE_CRAFT_AFFIX_TIERS, type UniqueCraftTier } from '../../models/uniqueCraft';
import { loadTemplateCache } from '../templateSync';
import { rollUniqueCraftProduct } from '../crafting';

/** 製作品 (獨) 的詞綴與隨機技能（`06-equipment-acquire.md` § 6A.6、`07-affix-ability.md` § 7S.2） */

const craftable = (pred: (t: EquipmentTemplate) => boolean) => EQUIPMENT_SEEDS.filter(t => t.uniqueCraftMaterials && pred(t));
const ROLLS = 400;

beforeEach(async () => { await loadTemplateCache(); });

describe('詞綴 Tier 依裝備階級固定分配', () => {
  for (const tier of [4, 5, 6] as UniqueCraftTier[]) {
    it(`T${tier}：4 條不重複、無特殊詞綴，T6 條數固定、其餘 T5，數值在該 Tier 範圍內`, () => {
      const { highCount } = UNIQUE_CRAFT_AFFIX_TIERS[tier];
      const recipes = craftable(t => t.tier === tier);
      for (let seed = 1; seed <= ROLLS; seed++) {
        reseed(seed);
        const recipe = recipes[seed % recipes.length];
        const category = getAffixCategoryForSlot(recipe.slot, recipe.type);
        const affixes = rollUniqueCraftProduct(recipe, 'knight').affixes!;
        expect(affixes).toHaveLength(4);
        expect(new Set(affixes.map(a => a.type)).size).toBe(4);
        expect(affixes.some(a => isSpecialAffixType(a.type))).toBe(false);
        const tiered = affixes.filter(a => !isTierlessAffixType(a.type));
        expect(tiered.filter(a => a.tier === 6)).toHaveLength(Math.min(highCount, tiered.length));
        expect(tiered.filter(a => a.tier !== 6).every(a => a.tier === 5)).toBe(true);
        for (const a of tiered) {
          const range = getAffixTierTable(a.type as AffixType, category)[a.tier - 1];
          expect(a.value).toBeGreaterThanOrEqual(range.min);
          expect(a.value).toBeLessThanOrEqual(range.max);
        }
        for (const a of affixes.filter(x => x.type === 'bonus_attribute')) expect(a.value).toBe(BONUS_ATTRIBUTE_VALUE);
      }
    });
  }

  it('T5 的 T6 條在 4 條中均等抽（各位置約 1/4）', () => {
    const recipes = craftable(t => t.tier === 5 && t.type === 'armor');
    const hits = [0, 0, 0, 0];
    let total = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      reseed(seed);
      const affixes = rollUniqueCraftProduct(recipes[seed % recipes.length], 'knight').affixes!;
      if (affixes.some(a => isTierlessAffixType(a.type))) continue;
      total++;
      affixes.forEach((a, i) => { if (a.tier === 6) hits[i]++; });
    }
    for (const h of hits) expect(h / total).toBeGreaterThan(0.2);
    for (const h of hits) expect(h / total).toBeLessThan(0.3);
  });
});

describe('隨機技能 100%，池取製作角色', () => {
  it('T3+ 武器、項鍊、戒指一定帶；防具不帶', () => {
    const withAbility = craftable(t => getAbilityCommonPool(t).length > 0);
    expect(withAbility.some(t => t.slot === 'necklace' || t.slot === 'ring1')).toBe(true);
    for (const [i, recipe] of withAbility.entries()) {
      reseed(i + 1);
      expect(rollUniqueCraftProduct(recipe, 'knight').ability, recipe.name).toBeDefined();
    }
    for (const recipe of craftable(t => getAbilityCommonPool(t).length === 0)) {
      expect(rollUniqueCraftProduct(recipe, 'knight').ability, recipe.name).toBeUndefined();
    }
  });

  it('製作角色能裝備時共通池與職業池都會出，數值為抽出值（不固定最弱）', () => {
    const recipe = craftable(t => t.slot === 'rightHand' && getAbilityClassPool(t, 'knight').length > 0)[0];
    const pools = new Set<string>();
    const values = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      reseed(seed);
      const ability = rollUniqueCraftProduct(recipe, 'knight').ability!;
      pools.add(getAbilityDefinition(ability.type)!.pool);
      if (getAbilityDefinition(ability.type)!.pool === 'common') values.add(JSON.stringify(ability));
      expect([...getAbilityCommonPool(recipe), ...getAbilityClassPool(recipe, 'knight')]).toContain(ability.type);
    }
    expect(pools).toEqual(new Set(['common', 'knight']));
    expect(values.size).toBeGreaterThan(getAbilityCommonPool(recipe).length);
  });

  it('製作角色不能裝備時一律取共通池', () => {
    const recipe = craftable(t => t.slot === 'rightHand' && !!t.requiredClass?.length && !t.requiredClass.includes('knight'))[0];
    for (let seed = 1; seed <= 100; seed++) {
      reseed(seed);
      const ability = rollUniqueCraftProduct(recipe, 'knight').ability!;
      expect(getAbilityDefinition(ability.type)!.pool).toBe('common');
    }
  });
});
