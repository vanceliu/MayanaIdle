import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBuffDamageReduction, calculateMonsterAttack } from '../combat';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

const NOW = 500_000;

function character(): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 10, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 500, maxHp: 500,
    attackMin: 100, attackMax: 100, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function armor(defense: number): EquipmentInstance {
  return {
    templateId: 50, name: '鎧甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    smallMonsterDamage: 0, largeMonsterDamage: 0, defense, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function buffFrom(skillId: string): ActiveEffect {
  const t = getSkillTemplate(skillId)!;
  return {
    id: `buff-${skillId}`, sourceSkillId: skillId, sourceSkillName: t.name,
    category: t.buffCategory ?? skillId, type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [],
    startTime: NOW, duration: t.buffDuration ?? 15_000,
    tags: [], name: t.name, description: '',
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不迴避、不格擋
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getBuffDamageReduction', () => {
  it('沒有減傷 buff 時為 0', () => {
    expect(getBuffDamageReduction([])).toBe(0);
  });

  it('讀取各技能的減傷值', () => {
    expect(getBuffDamageReduction([buffFrom('iron-shield')])).toBe(20);
    expect(getBuffDamageReduction([buffFrom('sanctuary')])).toBe(25);
    expect(getBuffDamageReduction([buffFrom('holy-domain')])).toBe(30);
  });

  it('多個減傷 buff 同類加算', () => {
    expect(getBuffDamageReduction([buffFrom('iron-shield'), buffFrom('holy-domain')])).toBe(50);
  });

  it('過期的 buff 不計入', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 999_999);
    expect(getBuffDamageReduction([buffFrom('iron-shield')])).toBe(0);
  });

  it('怪物身上的效果不計入', () => {
    const onMonster: ActiveEffect = { ...buffFrom('iron-shield'), target: 'monster' };
    expect(getBuffDamageReduction([onMonster])).toBe(0);
  });
});

describe('§ 21.5 減傷：防禦與 buff 類間乘算', () => {
  it('無防禦時，鋼鐵護盾 20% 直接減兩成', () => {
    const char = character();
    const base = calculateMonsterAttack(monster(), char, [], [], 0);
    const buffed = calculateMonsterAttack(monster(), char, [], [buffFrom('iron-shield')], 0);

    expect(base.damage).toBe(100);
    expect(buffed.damage).toBe(80);
  });

  it('防禦 50% 搭配鋼鐵護盾 20% → 承受 50% × 80% = 40%', () => {
    const char = character();
    const gear = [armor(50)];
    const base = calculateMonsterAttack(monster(), char, gear, [], 0);
    const buffed = calculateMonsterAttack(monster(), char, gear, [buffFrom('iron-shield')], 0);

    expect(base.damage).toBe(50);
    expect(buffed.damage).toBe(40);
  });

  it('防禦達上限 75% 時 buff 減傷仍完整生效（不被上限排擠）', () => {
    const char = character();
    const gear = [armor(90)]; // 超過 75 上限
    const base = calculateMonsterAttack(monster(), char, gear, [], 0);
    const buffed = calculateMonsterAttack(monster(), char, gear, [buffFrom('holy-domain')], 0);

    expect(base.damage).toBe(25);
    expect(buffed.damage).toBe(17); // floor(25 × 0.7)
  });

  it('聖域 25% 減傷生效（原本寫成 defense 百分比而完全無效）', () => {
    const char = character();
    const buffed = calculateMonsterAttack(monster(), char, [], [buffFrom('sanctuary')], 0);
    expect(buffed.damage).toBe(75);
  });

  it('傷害最低為 1', () => {
    const char = character();
    const weak = { ...monster(), attackMin: 1, attackMax: 1 };
    const result = calculateMonsterAttack(weak, char, [armor(90)], [buffFrom('holy-domain')], 0);
    expect(result.damage).toBe(1);
  });
});
