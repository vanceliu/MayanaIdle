import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTE_CAP,
  ATTRIBUTE_KEYS,
  getGearAttributeBonus,
  getTotalAttributes,
} from '../../models/character';
import type { Attributes, Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterInstance } from '../../models/monster';
import { calculatePlayerAttack, calculateSkillAttack, getSkillCooldownReduction, COOLDOWN_REDUCTION_CAP } from '../combat';
import { tryLevelUp } from '../levelUp';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_SKILLS } from '../../models/classSkills';

/** § 6.8 額外屬性的中文顯示名 → Attributes key */
const ZH_TO_KEY: Record<string, keyof Attributes> = {
  力量: 'STR', 敏捷: 'AGI', 體質: 'VIT', 精神: 'SPI', 智力: 'INT', 魅力: 'CHA',
};

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 1_000_000,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
    ...overrides,
  };
}

function createItem(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '測試武器', type: 'sword', slot: 'rightHand',
    isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 10,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  };
}

function createMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '木樁', level: 50, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

describe('裝備額外屬性 seed 資料一致性', () => {
  const withEither = EQUIPMENT_SEEDS.filter(t => t.bonusStats || t.bonusAttributes);

  it('有資料可測（避免測試在 seed 清空時假性通過）', () => {
    expect(withEither.length).toBeGreaterThan(0);
  });

  it('bonusStats 與 bonusAttributes 必定成對出現', () => {
    const mismatched = withEither.filter(t => !t.bonusStats || !t.bonusAttributes);
    expect(mismatched.map(t => t.name)).toEqual([]);
  });

  it('bonusAttributes 與 bonusStats 顯示字串完全對應', () => {
    const bad: string[] = [];
    for (const t of withEither) {
      // 格式為「力量+2」或「力量+2、敏捷-1」（一正一負）
      const expected: Record<string, number> = {};
      for (const part of t.bonusStats!.split('、')) {
        const m = /^(.+?)([+-]\d+)$/.exec(part);
        if (!m) { bad.push(`${t.name}：無法解析 ${part}`); break; }
        const key = ZH_TO_KEY[m[1]];
        if (!key) { bad.push(`${t.name}：未知屬性 ${m[1]}`); break; }
        expected[key] = Number(m[2]);
      }
      if (Object.keys(expected).length) expect(t.bonusAttributes, t.name).toEqual(expected);
    }
    expect(bad).toEqual([]);
  });

  it('遵守 § 6A.8.8：一正一負、正 ≤ +2、負 ≥ −2', () => {
    for (const t of withEither) {
      const values = Object.values(t.bonusAttributes!) as number[];
      const positives = values.filter(v => v > 0);
      const negatives = values.filter(v => v < 0);
      expect(values.length, `${t.name} 最多兩個屬性`).toBeLessThanOrEqual(2);
      expect(positives.length, `${t.name} 必須恰有一個正屬性`).toBe(1);
      expect(negatives.length, `${t.name} 最多一個負屬性`).toBeLessThanOrEqual(1);
      expect(positives[0], `${t.name} 正屬性上限 +2`).toBeLessThanOrEqual(2);
      if (negatives.length) {
        expect(negatives[0], `${t.name} 負屬性下限 −2`).toBeGreaterThanOrEqual(-2);
      }
    }
  });
});

describe('getGearAttributeBonus', () => {
  it('加總所有部位的同一屬性', () => {
    const gear = [
      createItem({ bonusAttributes: { STR: 2 } }),
      createItem({ slot: 'chest', bonusAttributes: { STR: 1 } }),
      createItem({ slot: 'boots', bonusAttributes: { AGI: 2 } }),
      null,
    ];
    expect(getGearAttributeBonus(gear, 'STR')).toBe(3);
    expect(getGearAttributeBonus(gear, 'AGI')).toBe(2);
    expect(getGearAttributeBonus(gear, 'INT')).toBe(0);
  });

  it('沒有 bonusAttributes 的裝備貢獻 0', () => {
    expect(getGearAttributeBonus([createItem()], 'STR')).toBe(0);
  });
});

describe('getTotalAttributes 的裝備來源', () => {
  it('傳入裝備時加上額外屬性', () => {
    const char = createCharacter();
    const gear = [createItem({ bonusAttributes: { STR: 2 } })];
    expect(getTotalAttributes(char, [], gear).STR).toBe(16);
  });

  it('不傳裝備時維持原本行為（配點上限檢查與升級成長依賴此點）', () => {
    const char = createCharacter();
    expect(getTotalAttributes(char).STR).toBe(14);
    expect(getTotalAttributes(char, []).STR).toBe(14);
  });

  it('裝備額外屬性不受 35 點上限限制', () => {
    const char = createCharacter({
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 17, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    });
    expect(getTotalAttributes(char).STR).toBe(ATTRIBUTE_CAP);
    const gear = [createItem({ bonusAttributes: { STR: 2 } })];
    expect(getTotalAttributes(char, [], gear).STR).toBe(ATTRIBUTE_CAP + 2);
  });

  it('與 buff 相加，不互相取代', () => {
    const char = createCharacter();
    const gear = [createItem({ bonusAttributes: { STR: 2 } })];
    const buff = {
      id: 'b', sourceSkillId: 'strength-boost', sourceSkillName: '力量提升',
      category: 'str-buff', type: 'buff' as const, target: 'player' as const,
      modifiers: [{ stat: 'str', value: 5, isPercent: false }],
      startTime: Date.now(), duration: 600_000, tags: [], name: '力量提升', description: '',
    };
    expect(getTotalAttributes(char, [buff], gear).STR).toBe(14 + 2 + 5);
  });

  it('六項屬性都吃得到裝備加成', () => {
    const char = createCharacter();
    for (const key of ATTRIBUTE_KEYS) {
      const gear = [createItem({ bonusAttributes: { [key]: 2 } })];
      const before = getTotalAttributes(char)[key];
      expect(getTotalAttributes(char, [], gear)[key]).toBe(before + 2);
    }
  });
});

describe('裝備額外屬性在戰鬥中生效', () => {
  it('STR +2 讓物理普攻多 1 點（每 2 點 +1）', () => {
    // STR 14 → 有效 14 → +7；STR 16 → 有效 16 → +8
    const char = createCharacter();
    const monster = createMonster();
    const plain = createItem();
    const buffed = createItem({ bonusAttributes: { STR: 2 } });

    // 命中/暴擊固定：命中必中、不暴擊
    const seq = [0, 0.99];
    let i = 0;
    const orig = Math.random;
    Math.random = () => seq[i++ % seq.length];
    try {
      const a = calculatePlayerAttack(char, plain, monster, [plain]);
      i = 0;
      const b = calculatePlayerAttack(char, buffed, monster, [buffed]);
      expect(b.damage - a.damage).toBe(1);
    } finally {
      Math.random = orig;
    }
  });

  it('INT +2 讓技能傷害多 9.5% 技能威力', () => {
    // § 20.6：INT 每 2 點 +9.5% → INT 10 → ×0.475；INT 12 → ×0.57
    // § 21.4：基礎魔攻 = floor(技能攻擊力 × (1 + 魔攻×6.5/100)) + INT加成（測試裝備無魔攻）
    //   INT 10 → 100 + 47 = 147
    //   INT 12 → 100 + 57 = 157
    const char = createCharacter();
    const monster = createMonster();
    const plain = createItem();
    const buffed = createItem({ bonusAttributes: { INT: 2 } });

    const orig = Math.random;
    Math.random = () => 0.99; // 不暴擊
    try {
      const a = calculateSkillAttack(char, 100, 'none', monster, [plain]);
      const b = calculateSkillAttack(char, 100, 'none', monster, [buffed]);
      expect(a.damage).toBe(147);
      expect(b.damage).toBe(157);
    } finally {
      Math.random = orig;
    }
  });
});

describe('裝備額外屬性不影響升級成長', () => {
  it('升級 HP/MP 成長只看 baseAttributes + bonusAttributes', () => {
    // VIT 16 → 成長 random(10, 13)，穿 +2 VIT 裝也不該變成 random(12, 15)
    const char = createCharacter({ level: 50, exp: 10, expToNext: 10 });
    const results = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const before = createCharacter({ level: 50, exp: 10, expToNext: 10 });
      results.add(tryLevelUp(before).maxHp - before.maxHp);
    }
    expect(Math.min(...results)).toBeGreaterThanOrEqual(char.baseAttributes.VIT - 6);
    expect(Math.max(...results)).toBeLessThanOrEqual(char.baseAttributes.VIT - 3);
  });
});

describe('§ 20.6 INT 的兩個作用', () => {
  it('技能傷害：每 2 點 +9.5%（奇數取最小偶數）', () => {
    const monster = createMonster();
    const gear = [createItem()];
    const orig = Math.random;
    Math.random = () => 0.99; // 不暴擊
    try {
      // 技能威力 100，INT 0 / 20 / 21（有效 20）/ 34（屬性上限 35 的有效值）
      // § 20.6：每 2 點 +9.5%；§ 21.4：基礎魔攻 = floor(技能攻擊力 × (1 + 魔攻×6.5/100)) + INT加成
      const at = (int: number) => calculateSkillAttack(
        createCharacter({ baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: int, CHA: 1 } }),
        100, 'none', monster, gear,
      ).damage;
      expect(at(0)).toBe(100);   // 100 + 0
      expect(at(20)).toBe(195);  // 20 / 2 × 0.095 = ×0.95 → 100 + 95
      expect(at(21)).toBe(195);  // 有效 20，與 20 相同
      expect(at(34)).toBe(261);  // 34 / 2 × 0.095 = ×1.615 → 100 + 161
    } finally {
      Math.random = orig;
    }
  });

  it('冷卻縮減：每 2 點 +1%，與詞綴/buff 加總後受 50% 上限', () => {
    const gear = [createItem()];
    const at = (int: number) => getSkillCooldownReduction(
      createCharacter({ baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: int, CHA: 1 } }),
      gear,
    );
    expect(at(0)).toBe(0);
    expect(at(20)).toBe(10);
    expect(at(21)).toBe(10);   // 有效 20
    expect(at(40)).toBe(20);
    // 極端值仍受上限
    expect(at(200)).toBe(COOLDOWN_REDUCTION_CAP);
  });

  it('裝備的 INT 額外屬性同時餵給傷害與冷卻縮減', () => {
    const base = createCharacter({ baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 18, CHA: 1 } });
    const plain = [createItem()];
    const withInt = [createItem({ bonusAttributes: { INT: 2 } })];
    expect(getSkillCooldownReduction(base, plain)).toBe(9);
    expect(getSkillCooldownReduction(base, withInt)).toBe(10);
  });
});

describe('§ 22 / § 23 技能威力調整後的資料一致性', () => {
  it('基礎魔法的攻擊技能威力皆為調整後的值', () => {
    // INT 係數 9.5%／2 點 ＋ 魔攻匯率 6.5%／點，技能攻擊力表配合縮放至
    // 「智力 50%／技能 25%／魔攻 25%」（§ 21.4）。倍率 ×0.7128，取整用 floor
    const expected: Record<string, number> = {
      'wind-blade': 7, 'ice-bolt': 7, 'flame-arrow': 13, 'holy-bolt': 13,
      'ice-lance': 27, 'flame-pillar': 27, 'meteor-shower': 44,
      'divine-thunder': 53, 'apocalypse-flame': 53, 'ultimate-ray': 57,
    };
    for (const [id, power] of Object.entries(expected)) {
      expect(SKILL_CATALOG.find(s => s.id === id)?.power, id).toBe(power);
    }
  });

  it('基礎魔法的最高與最低威力落在 7 ~ 57', () => {
    const powers = SKILL_CATALOG.filter(s => s.type === 'attack' && s.power > 0).map(s => s.power);
    expect(Math.min(...powers)).toBe(7);
    expect(Math.max(...powers)).toBe(57);
  });

  it('所有職業攻擊魔法與基礎魔法同步縮放（§ 23.7.1）', () => {
    const power = (id: string) => CLASS_SKILLS.find(s => s.id === id)!.skill.power;
    expect(power('mana-drain')).toBe(13);
    expect(power('element-storm')).toBe(53);
    expect(power('holy-judgment')).toBe(37);
    expect(power('arrow-rain')).toBe(37);
    /*
     * 騎士與盜賊的職業魔法**豁免縮放**（§ 23.7.1）：他們裝備魔攻為 0、有效 INT 只有 10，
     * 吃不到被放大的魔攻乘區與 INT 加成，跟著縮表是純削弱。
     * DPS 驗證顯示豁免後兩者各回升約 +1%，職業差距由 1.80× 收斂到 1.70×。
     */
    expect(power('vengeance')).toBe(84);
    expect(power('backstab')).toBe(104);
  });

  it('物理快照三招也同步縮放（§ 21.4a）', () => {
    const power = (id: string) => CLASS_SKILLS.find(s => s.id === id)!.skill.power;
    expect(power('shield-bash')).toBe(32);
    expect(power('taunt')).toBe(65);
    // 裂傷斬同樣豁免 § 23.7.1 的縮放，但**後續另行調整為 50／流血 70%**
    // （技能攻擊力是常數、流血跟著裝備成長，81 在低等級占即時傷害八成）。
    // 這條測的是「有沒有被縮表」，不是現行值 —— 現行值由
    // `physicalSnapshotSkill.test.ts` 把守。
    expect(power('rend')).toBe(50);
  });
});
