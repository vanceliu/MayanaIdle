/**
 * 法杖魔攻（`06-equipment-requirement.md`「法杖魔攻」、`21-combat-formula.md` § 21.4）。
 */
import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { getSkillSideValue, getTotalMagicAttack, MAGIC_ATTACK_PERCENT_PER_POINT } from '../combat';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import type { Character } from '../../models/character';

const seeds = EQUIPMENT_SEEDS as EquipmentTemplate[];
const byName = (name: string) => seeds.find(t => t.name === name)!;

/** 文件錨點：單手 T1~T7、雙手 T2~T7 */
const ANCHOR = {
  staff: [1.6, 9.6, 11.2, 14.4, 16.0, 17.6, 24.0],
  twoHandStaff: [null, 13.6, 16.2, 20.4, 23.0, 25.6, 35.0],
} as const;

function instance(t: EquipmentTemplate, enhancement = 0): EquipmentInstance {
  return { ...t, templateId: t.id!, quality: 0, enhancement, affixes: [], ownerId: 1, equipped: true } as EquipmentInstance;
}

function mage(): Character {
  return {
    name: 'T', className: 'elementalist', level: 1, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
    baseAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'x', currentZone: 'x', currentRegion: 'x', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

describe('法杖魔攻', () => {
  it('匯率每點 +2.5%', () => {
    expect(MAGIC_ATTACK_PERCENT_PER_POINT).toBe(2.5);
  });

  it('每階魔攻最高的那把等於錨點；同階魔攻越高普攻越低，普攻兩兩不同', () => {
    for (const type of ['staff', 'twoHandStaff'] as const) {
      for (let tier = 1; tier <= 7; tier++) {
        const list = seeds.filter(t => t.type === type && t.tier === tier);
        if (list.length === 0) continue;
        expect(Math.max(...list.map(t => t.magicAttack!)), `${type} T${tier}`).toBe(ANCHOR[type][tier - 1]);
        const sorted = [...list].sort((a, b) => b.magicAttack! - a.magicAttack!);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].magicAttack!, `${type} T${tier}`).toBeLessThan(sorted[i - 1].magicAttack!);
          expect(sorted[i].smallMonsterDamage!, `${type} T${tier}`).toBeGreaterThan(sorted[i - 1].smallMonsterDamage!);
          expect(sorted[i].largeMonsterDamage).toBe(sorted[i].smallMonsterDamage);
        }
      }
    }
  });

  it('T7：智力型／攻擊型魔攻最高、輔助型居中、物理型普攻最高', () => {
    expect([byName('星辰權杖'), byName('創世權杖'), byName('虹光權杖')].map(t => [t.smallMonsterDamage, t.magicAttack]))
      .toEqual([[17, 24], [18, 21.9], [19, 20.6]]);
    expect([byName('創世長杖'), byName('永恆長杖'), byName('神諭長杖')].map(t => [t.smallMonsterDamage, t.magicAttack]))
      .toEqual([[23, 35], [25, 32], [26, 30]]);
  });

  it('T7 單手杖＋創世之書與雙手杖的裝備魔攻相同（+8 強化）', () => {
    const oneHand = getTotalMagicAttack([instance(byName('星辰權杖'), 8), instance(byName('創世之書'))]);
    const twoHand = getTotalMagicAttack([instance(byName('創世長杖'), 8)]);
    expect(oneHand).toBe(39);
    expect(twoHand).toBe(39);
  });

  it('小數魔攻以十分位計算，不因浮點誤差少 1', () => {
    // 21.9 + 11 + 4 = 36.9 → +92.25%：57 × 1.9225 = 109.58 → 109
    const gear = [instance(byName('創世權杖'), 8), instance(byName('創世之書'))];
    expect(getTotalMagicAttack(gear)).toBe(36.9);
    expect(getSkillSideValue(mage(), 57, gear, [])).toBe(109);
    // 39 → ×1.975：57 × 1.975 = 112.575 → 112
    expect(getSkillSideValue(mage(), 57, [instance(byName('創世長杖'), 8)], [])).toBe(112);
  });
});
