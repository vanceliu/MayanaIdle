import { describe, it, expect } from 'vitest';
import { calculateHealAmount, getBaseMagicAttack } from '../combat';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterInstance } from '../../models/monster';

/**
 * 治癒公式（`21-combat-formula.md` § 21.4c）。
 *
 * 治癒與傷害**共用同一段技能側計算**，差別只有「沒有元素克制」與
 * 「最後的乘區是治癒效果% 而非技能元素傷害%」。這一份把兩件事釘住：
 * 1. 校準點（有效 INT 18、裝備魔攻 0）確實持平改版前的固定回復量
 * 2. 治癒與傷害不會各自漂移 —— 兩者在同條件下必須算出同一個技能側數值
 */

function char(int: number): Character {
  return {
    userId: 1, name: 'T', className: 'priest', level: 50, exp: 0, expToNext: 100,
    hp: 1, maxHp: 9999, mp: 999, maxMp: 999,
    baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: int, CHA: 1 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

/** 只提供魔攻的副手，用來測乘區 */
function book(magicAttack: number): EquipmentInstance {
  return {
    templateId: 1, name: '測試魔導書', type: 'magicBook', slot: 'leftHand', isTwoHanded: false,
    magicAttack, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const powerOf = (id: string) =>
  SKILL_CATALOG.find(s => s.id === id)?.power
  ?? CLASS_SKILLS.find(c => c.id === id)!.skill.power;

describe('治癒的校準點（§ 21.4c）', () => {
  /**
   * 改版前六招是固定回復量，改版後以「有效 INT 18、裝備魔攻 0」為校準點持平。
   * 這些數字若動了，代表 INT 係數或魔攻匯率被改過而沒有重新縮 power 表。
   */
  const CALIBRATION: Record<string, number> = {
    'heal': 35, 'mid-heal': 70, 'great-heal': 150, 'full-heal': 500,
    'high-heal': 400, 'group-heal': 200,
  };

  it('有效 INT 18、無裝備魔攻時，六招回復量持平改版前的固定值', () => {
    for (const [id, expected] of Object.entries(CALIBRATION)) {
      expect(calculateHealAmount(char(18), powerOf(id), []), id).toBe(expected);
    }
  });

  it('智力提高就回得更多', () => {
    const p = powerOf('full-heal');
    expect(calculateHealAmount(char(34), p, [])).toBeGreaterThan(calculateHealAmount(char(18), p, []));
  });

  it('奇數智力取最小偶數（與傷害同一條規則）', () => {
    const p = powerOf('full-heal');
    expect(calculateHealAmount(char(19), p, [])).toBe(calculateHealAmount(char(18), p, []));
  });
});

describe('治癒與傷害共用技能側計算', () => {
  const monster = { element: 'none' } as MonsterInstance;

  /**
   * 治癒是無屬性、對自己施放，因此不吃元素克制；在「目標無屬性」的條件下
   * 傷害的元素克制同樣是 0，兩者必須算出完全相同的技能側數值。
   * 對不上就代表有人把公式各展開了一份。
   */
  it('同條件下治癒量等於基礎魔攻（元素克制皆為 0）', () => {
    for (const gear of [[], [book(4)], [book(15)]]) {
      for (const int of [10, 18, 34, 42]) {
        const c = char(int);
        expect(calculateHealAmount(c, 81, gear), `INT${int}`)
          .toBe(getBaseMagicAttack(c, 81, 'none', monster, gear, []));
      }
    }
  });

  it('裝備魔攻的乘區對治癒同樣生效（每 1 點 +6.5%）', () => {
    const c = char(18);
    const p = powerOf('full-heal');
    const without = calculateHealAmount(c, p, []);
    const withBook = calculateHealAmount(c, p, [book(15)]);
    // 魔攻 15 → 技能攻擊力那一段 ×1.975；INT 加成不吃乘區，所以總量不會剛好 ×1.975
    expect(withBook).toBeGreaterThan(without);
    expect(withBook - without).toBe(Math.floor(p * 1.975) - p);
  });
});

describe('治癒技能的資料一致性', () => {
  it('六招治癒都有 power，且沒有殘留的固定回復量欄位', () => {
    const heals = [...SKILL_CATALOG, ...CLASS_SKILLS.map(c => c.skill)]
      .filter(s => s.type === 'heal');
    expect(heals).toHaveLength(6);
    for (const s of heals) {
      expect(s.power, s.id).toBeGreaterThan(0);
      expect('healAmount' in s, s.id).toBe(false);
    }
  });
});
