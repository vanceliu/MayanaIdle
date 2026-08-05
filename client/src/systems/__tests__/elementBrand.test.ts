/**
 * 元素刻印（`07-affix.md` § 7.4）。
 *
 * 武器元素的唯一來源。抽到刻印當下從六種元素均等隨機決定一個，之後不變；
 * 沒有刻印的武器是無屬性，既不吃刻印乘區，也不吃 § 42.2 的克制 +3。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BRAND_ELEMENTS, generateAffixes, formatAffixDisplay,
  AFFIX_DEFINITIONS, getAffixPoolForSlot, type Affix,
} from '../../models/affix';
import { calculatePlayerAttack, calculateSkillAttack, getWeaponElement } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

function char(): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 1_000_000,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: 14, AGI: 10, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function dummy(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '木樁', level: 50, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

function sword(affixes: Affix[] = []): EquipmentInstance {
  return {
    templateId: 1, name: '測試劍', type: 'sword', slot: 'rightHand',
    isTwoHanded: false, smallMonsterDamage: 20, largeMonsterDamage: 20,
    quality: 0, enhancement: 0, affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const brand = (value: number, element?: string): Affix =>
  ({ type: 'element_brand', tier: 5, value, ...(element ? { element: element as never } : {}) });

afterEach(() => { vi.restoreAllMocks(); });

describe('元素刻印的生成', () => {
  it('抽到刻印時一定帶著六種元素其中之一', () => {
    for (let seed = 0; seed < 200; seed++) {
      const affixes = generateAffixes('weapon', 60, 4, false);
      const b = affixes.find(a => a.type === 'element_brand');
      if (!b) continue;
      expect(b.element).toBeDefined();
      expect(BRAND_ELEMENTS).toContain(b.element!);
    }
  });

  it('六種元素都抽得到，且不會抽到「無」', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000 && seen.size < BRAND_ELEMENTS.length; i++) {
      const b = generateAffixes('weapon', 60, 4, false).find(a => a.type === 'element_brand');
      if (b?.element) seen.add(b.element);
    }
    expect([...seen].sort()).toEqual([...BRAND_ELEMENTS].sort());
    expect(seen.has('none')).toBe(false);
  });

  it('只有元素刻印與元素侵蝕帶 element 欄位', () => {
    for (let i = 0; i < 200; i++) {
      for (const a of generateAffixes('weapon', 60, 4, false)) {
        if (a.type !== 'element_brand' && a.type !== 'element_erosion') {
          expect(a.element).toBeUndefined();
        }
      }
    }
  });

  it('一件武器最多只有一個刻印（詞綴不可重複）', () => {
    for (let i = 0; i < 200; i++) {
      const n = generateAffixes('weapon', 60, 4, false).filter(a => a.type === 'element_brand').length;
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('刻印是武器專屬，防具／盾牌／飾品的池裡沒有', () => {
    for (const cat of ['armor', 'shield', 'accessory'] as const) {
      expect(getAffixPoolForSlot(cat).map(d => d.type)).not.toContain('element_brand');
    }
    expect(getAffixPoolForSlot('weapon').map(d => d.type)).toContain('element_brand');
  });

  it('取代了舊的「普攻元素傷害」，武器詞綴為 8 種（刻印＋侵蝕）', () => {
    const weaponAffixes = AFFIX_DEFINITIONS.filter(d => d.category.includes('weapon'));
    expect(weaponAffixes).toHaveLength(8);
    const types = weaponAffixes.map(d => d.type);
    expect(types).not.toContain('attack_elemental');
    expect(types).toContain('element_brand');
    expect(types).toContain('element_erosion');
  });
});

describe('getWeaponElement', () => {
  it('刻印是武器元素的唯一來源', () => {
    expect(getWeaponElement(sword([brand(15, 'fire')]))).toBe('fire');
  });

  it('沒有刻印的武器是無屬性', () => {
    expect(getWeaponElement(sword())).toBeUndefined();
    expect(getWeaponElement(null)).toBeUndefined();
  });

  it('其他詞綴不會賦予元素', () => {
    expect(getWeaponElement(sword([{ type: 'attack_power', tier: 5, value: 15 }]))).toBeUndefined();
  });
});

describe('刻印在普攻的效果', () => {
  it('沒有刻印就吃不到乘區', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 必命中、不暴擊（爆率 5%）
    const m = dummy();
    const plain = sword();
    // 基傷 20 + STR 加成 7 = 27
    expect(calculatePlayerAttack(char(), plain, m, [plain]).damage).toBe(27);
  });

  it('有刻印就吃到乘區', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const m = dummy();
    const w = sword([brand(15, 'fire')]);
    // floor(27 × 1.15) = 31
    expect(calculatePlayerAttack(char(), w, m, [w]).damage).toBe(31);
  });

  it('刻印的元素克制目標時額外 +3（§ 42.2）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const wind = dummy({ element: 'wind' });   // 火克風
    const ice = dummy({ element: 'ice' });     // 火不克冰
    const w = sword([brand(15, 'fire')]);
    const countered = calculatePlayerAttack(char(), w, wind, [w]).damage;
    const neutral = calculatePlayerAttack(char(), w, ice, [w]).damage;
    // 克制的 +3 在乘區之前：floor((27 + 3) × 1.15) = 34 vs floor(27 × 1.15) = 31
    expect(countered).toBe(34);
    expect(neutral).toBe(31);
  });

  it('沒有刻印就拿不到克制加成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const w = sword();
    expect(calculatePlayerAttack(char(), w, dummy({ element: 'wind' }), [w]).damage)
      .toBe(calculatePlayerAttack(char(), w, dummy({ element: 'ice' }), [w]).damage);
  });
});

describe('刻印不進魔法公式（§ 21.4）', () => {
  it('刻印的% 不影響技能傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const m = dummy();
    const plain = sword();
    const branded = sword([brand(20, 'fire')]);
    expect(calculateSkillAttack(char(), 40, 'none', m, [branded]).damage)
      .toBe(calculateSkillAttack(char(), 40, 'none', m, [plain]).damage);
  });
});

describe('顯示', () => {
  it('刻印的名稱帶出屬性', () => {
    expect(formatAffixDisplay(brand(15, 'fire'))).toBe('元素刻印（火） +15% (T5)');
  });

  it('品質放大刻印數值', () => {
    expect(formatAffixDisplay(brand(20, 'dark'), 20)).toBe('元素刻印（暗） +24% (T5)');
  });

  it('其他詞綴不顯示屬性', () => {
    expect(formatAffixDisplay({ type: 'attack_power', tier: 5, value: 15 })).toBe('攻擊力 +15% (T5)');
  });
});
