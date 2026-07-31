import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCombatBonuses, getSkillCooldownReduction, calculatePlayerAttack, calculateSkillAttack } from '../combat';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import type { Affix } from '../../models/affix';

const NOW = 400_000;

function character(): Character {
  return {
    name: 'Tester', className: 'thief', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: 15, AGI: 15, VIT: 15, SPI: 10, INT: 20, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 5000, maxHp: 5000,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function gearWith(affixes: Affix[]): EquipmentInstance {
  return {
    templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
    affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function buffFrom(skillId: string): ActiveEffect {
  const t = getSkillTemplate(skillId)!;
  return {
    id: `buff-${skillId}`, sourceSkillId: skillId, sourceSkillName: t.name,
    category: t.buffCategory ?? skillId, type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [],
    startTime: NOW, duration: t.buffDuration ?? 300_000,
    tags: [], name: t.name, description: '',
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§ 21.3 詞綴與 buff 合流', () => {
  it('沒有 buff 時等同純詞綴加成', () => {
    const gear = [gearWith([{ type: 'crit_rate', tier: 3, value: 12 }])];
    expect(getCombatBonuses(gear, []).crit_rate).toBe(12);
  });

  it('爆擊率：詞綴 + 精準打擊 buff 加總', () => {
    const gear = [gearWith([{ type: 'crit_rate', tier: 3, value: 12 }])];
    expect(getCombatBonuses(gear, [buffFrom('precision-strike')]).crit_rate).toBe(22);
  });

  it('爆擊傷害：詞綴 + 致命一擊 buff 加總', () => {
    const gear = [gearWith([{ type: 'crit_damage', tier: 2, value: 9 }])];
    expect(getCombatBonuses(gear, [buffFrom('deadly-strike')]).crit_damage).toBe(59);
  });

  it('技能元素傷害：詞綴 + 元素增幅 buff 加總', () => {
    const gear = [gearWith([{ type: 'skill_elemental', tier: 1, value: 5 }])];
    expect(getCombatBonuses(gear, [buffFrom('element-boost')]).skill_elemental).toBe(30);
  });

  it('冷卻縮減：詞綴 + 冷卻縮減 buff 加總，上限仍為 50%', () => {
    const gear = [gearWith([{ type: 'cooldown_reduction', tier: 4, value: 15 }])];
    expect(getSkillCooldownReduction(gear, [buffFrom('cd-reduce')])).toBe(35);

    const heavy = [gearWith([{ type: 'cooldown_reduction', tier: 7, value: 40 }])];
    expect(getSkillCooldownReduction(heavy, [buffFrom('cd-reduce')])).toBe(50);
  });

  it('過期的 buff 不計入', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 999_999);
    const gear = [gearWith([{ type: 'crit_rate', tier: 3, value: 12 }])];
    expect(getCombatBonuses(gear, [buffFrom('precision-strike')]).crit_rate).toBe(12);
  });

  it('怪物身上的 debuff 不會被誤算成角色 buff', () => {
    const monsterBuff: ActiveEffect = { ...buffFrom('deadly-strike'), target: 'monster' };
    expect(getCombatBonuses([gearWith([])], [monsterBuff]).crit_damage).toBe(0);
  });
});

describe('buff 加成實際影響傷害', () => {
  it('致命一擊提高爆擊倍率', () => {
    // random 0.01：命中且必定爆擊
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const char = character();
    const gear = [gearWith([])];

    const base = calculatePlayerAttack(char, gear[0], monster(), gear, [], 0);
    const buffed = calculatePlayerAttack(char, gear[0], monster(), gear, [buffFrom('deadly-strike')], 0);

    expect(base.isCritical).toBe(true);
    expect(buffed.isCritical).toBe(true);
    expect(buffed.damage).toBeGreaterThan(base.damage);
  });

  it('元素增幅提高元素技能傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不爆擊
    const char = character();
    const gear = [gearWith([])];

    const base = calculateSkillAttack(char, 50, 'fire', monster(), gear, '火球', [], 0);
    const buffed = calculateSkillAttack(char, 50, 'fire', monster(), gear, '火球', [buffFrom('element-boost')], 0);

    expect(buffed.damage).toBeGreaterThan(base.damage);
  });

  it('元素增幅不影響無屬性技能', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const char = character();
    const gear = [gearWith([])];

    const base = calculateSkillAttack(char, 50, 'none', monster(), gear, '究極光裂術', [], 0);
    const buffed = calculateSkillAttack(char, 50, 'none', monster(), gear, '究極光裂術', [buffFrom('element-boost')], 0);

    expect(buffed.damage).toBe(base.damage);
  });
});

describe('強化冷卻縮減（元素師 4，取代連鎖詠唱）', () => {
  it('定義為冷卻 -40% / 30s，與冷卻縮減同 category 互斥', () => {
    const s = getSkillTemplate('greater-cd-reduce')!;
    expect(s).toMatchObject({ name: '強化冷卻縮減', level: 4, type: 'buff', mpCost: 40, cooldown: 90_000, buffDuration: 30_000 });
    expect(s.buffModifiers).toEqual([{ stat: 'cooldown_reduction', value: 40, isPercent: true }]);
    expect(s.buffCategory).toBe(getSkillTemplate('cd-reduce')!.buffCategory);
  });

  it('連鎖詠唱已移除', () => {
    expect(getSkillTemplate('chain-cast')).toBeNull();
  });

  it('冷卻縮減效果生效且受 50% 上限', () => {
    const gear = [gearWith([])];
    expect(getSkillCooldownReduction(gear, [buffFrom('greater-cd-reduce')])).toBe(40);

    const withAffix = [gearWith([{ type: 'cooldown_reduction', tier: 4, value: 15 }])];
    expect(getSkillCooldownReduction(withAffix, [buffFrom('greater-cd-reduce')])).toBe(50);
  });
});
