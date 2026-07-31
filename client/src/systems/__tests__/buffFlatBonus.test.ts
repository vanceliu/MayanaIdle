import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBuffFlatBonus, getRangedAttackBonus, calculatePlayerAttack } from '../combat';
import { getSkillTemplate } from '../../models/skillTemplate';
import { applyPlayerBuff } from '../playerDebuffSystem';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

const NOW = 300_000;

function character(): Character {
  return {
    name: 'Tester', className: 'elementalist', level: 40, exp: 0, expToNext: 100,
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
    templateId: 1, name: '哥布林', level: 40, currentHp: 500, maxHp: 500,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function weapon(): EquipmentInstance {
  return {
    templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function buffFrom(skillId: string): ActiveEffect {
  const t = getSkillTemplate(skillId)!;
  return {
    id: `buff-${skillId}`, sourceSkillId: skillId, sourceSkillName: t.name,
    category: t.buffCategory ?? skillId, type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [],
    startTime: NOW, duration: t.buffDuration ?? 600_000,
    tags: [], name: t.name, description: t.buffEffect ?? '',
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('替換後的輔助魔法定義', () => {
  it('保護罩：1 級、防禦 +2、600s、獨立 category', () => {
    const s = getSkillTemplate('protect-shield')!;
    expect(s).toMatchObject({ name: '保護罩', level: 1, type: 'buff', mpCost: 10, buffDuration: 600_000, buffCategory: 'protect-shield' });
    expect(s.buffModifiers).toEqual([{ stat: 'defense', value: 2, isPercent: false }]);
  });

  it('高級魔法盔甲：9 級、防禦 +10、與魔法盔甲同 category', () => {
    const s = getSkillTemplate('greater-magic-armor')!;
    expect(s).toMatchObject({ name: '高級魔法盔甲', level: 9, type: 'buff', mpCost: 70, buffDuration: 600_000 });
    expect(s.buffModifiers).toEqual([{ stat: 'defense', value: 10, isPercent: false }]);
    expect(s.buffCategory).toBe(getSkillTemplate('magic-armor')!.buffCategory);
  });

  it('祝福魔法武器：6 級、命中 +10 額外攻擊 +5、與祝福武器同 category', () => {
    const s = getSkillTemplate('bless-magic-weapon')!;
    expect(s).toMatchObject({ name: '祝福魔法武器', level: 6, type: 'buff', mpCost: 40, buffDuration: 600_000 });
    expect(s.buffModifiers).toEqual([
      { stat: 'hit', value: 10, isPercent: false },
      { stat: 'extra_attack', value: 5, isPercent: false },
    ]);
    expect(s.buffCategory).toBe(getSkillTemplate('bless-weapon')!.buffCategory);
  });


  it('詛咒移至 7 級並強化為攻擊力 -20%', () => {
    const s = getSkillTemplate('curse')!;
    expect(s.level).toBe(7);
    expect(s.applyDebuff?.modifiers).toEqual([{ stat: 'attack', value: -20, isPercent: true }]);
  });

  it('被移除的傳送類技能已不存在', () => {
    expect(getSkillTemplate('teleport')).toBeNull();
    expect(getSkillTemplate('mass-teleport')).toBeNull();
    expect(getSkillTemplate('recovery')).toBeNull();
  });
});

describe('同 category 互斥', () => {
  it('高級魔法盔甲覆蓋魔法盔甲', () => {
    const result = applyPlayerBuff([buffFrom('magic-armor')], buffFrom('greater-magic-armor'), NOW);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].sourceSkillId).toBe('greater-magic-armor');
  });

  it('祝福魔法武器覆蓋祝福武器', () => {
    const result = applyPlayerBuff([buffFrom('bless-weapon')], buffFrom('bless-magic-weapon'), NOW);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].sourceSkillId).toBe('bless-magic-weapon');
  });

  it('保護罩與魔法盔甲可並存', () => {
    const result = applyPlayerBuff([buffFrom('magic-armor')], buffFrom('protect-shield'), NOW);
    expect(result.effects).toHaveLength(2);
  });
});

describe('buff 固定值加成實際生效', () => {
  it('getBuffFlatBonus 只計入未過期的角色 buff', () => {
    const b = buffFrom('bless-magic-weapon');
    expect(getBuffFlatBonus([b], 'hit')).toBe(10);
    expect(getBuffFlatBonus([b], 'extra_attack')).toBe(5);

    vi.spyOn(Date, 'now').mockReturnValue(NOW + 700_000);
    expect(getBuffFlatBonus([b], 'hit')).toBe(0);
  });

  it('額外攻擊 +5 反映在普攻傷害上', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const base = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [], 0);
    const buffed = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [buffFrom('bless-magic-weapon')], 0);

    expect(base.hit).toBe(true);
    expect(buffed.hit).toBe(true);
    expect(buffed.damage - base.damage).toBe(5);
  });

  it('命中 +10 提高命中率（原本會 MISS 的骰值變成命中）', () => {
    const char = character();
    // 基礎命中率 = 80 + floor(effAGI/3) + 0(無 attackSuccess) + 0(同等級) - 5
    const withoutBuff = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [], 0);
    expect(withoutBuff).toBeDefined();

    // 取一個介於「無 buff 命中率」與「+10 後命中率」之間的骰值
    vi.spyOn(Math, 'random').mockReturnValue(0.88);
    const miss = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [], 0);
    const hit = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [buffFrom('bless-magic-weapon')], 0);

    expect(miss.hit).toBe(false);
    expect(hit.hit).toBe(true);
  });
});

describe('遠程攻擊加成（鷹眼）', () => {
  function bow(): EquipmentInstance {
    return {
      templateId: 9, name: '短弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
      smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
      affixes: [], ownerId: 1, equipped: true,
    } as EquipmentInstance;
  }

  it('裝備弓時遠攻 +3 加進基礎攻擊力', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const base = calculatePlayerAttack(char, bow(), monster(), [bow()], [], 0);
    const buffed = calculatePlayerAttack(char, bow(), monster(), [bow()], [buffFrom('hawk-eye')], 0);

    expect(buffed.damage - base.damage).toBe(3);
  });

  it('近戰武器不吃遠攻加成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const base = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [], 0);
    const buffed = calculatePlayerAttack(char, weapon(), monster(), [weapon()], [buffFrom('hawk-eye')], 0);

    // 鷹眼的命中 +5 仍生效，但傷害不變
    expect(buffed.damage).toBe(base.damage);
  });

  it('getRangedAttackBonus 只認弓', () => {
    const effects = [buffFrom('hawk-eye')];
    expect(getRangedAttackBonus(bow(), effects)).toBe(3);
    expect(getRangedAttackBonus(weapon(), effects)).toBe(0);
    expect(getRangedAttackBonus(null, effects)).toBe(0);
  });
});

describe('攻擊力% 與普攻元素傷害% 對遠程同樣生效', () => {
  function bow(element?: string): EquipmentInstance {
    return {
      templateId: 9, name: '短弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
      smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
      element, affixes: [], ownerId: 1, equipped: true,
    } as EquipmentInstance;
  }

  function withAffix(w: EquipmentInstance, type: string, value: number): EquipmentInstance {
    return { ...w, affixes: [{ type: type as never, tier: 3, value }] };
  }

  it('攻擊力詞綴對弓生效', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const plain = [bow()];
    const buffed = [withAffix(bow(), 'attack_power', 20)];

    const base = calculatePlayerAttack(char, plain[0], monster(), plain, [], 0);
    const boosted = calculatePlayerAttack(char, buffed[0], monster(), buffed, [], 0);
    expect(boosted.damage).toBeGreaterThan(base.damage);
  });

  it('普攻元素傷害詞綴對有屬性的弓生效', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const fireBow = [withAffix(bow('fire'), 'attack_elemental', 20)];
    const plainFireBow = [bow('fire')];

    const base = calculatePlayerAttack(char, plainFireBow[0], monster(), plainFireBow, [], 0);
    const boosted = calculatePlayerAttack(char, fireBow[0], monster(), fireBow, [], 0);
    expect(boosted.damage).toBeGreaterThan(base.damage);
  });

  it('無屬性弓不吃普攻元素傷害詞綴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const plain = [bow()];
    const withElem = [withAffix(bow(), 'attack_elemental', 20)];

    const base = calculatePlayerAttack(char, plain[0], monster(), plain, [], 0);
    const same = calculatePlayerAttack(char, withElem[0], monster(), withElem, [], 0);
    expect(same.damage).toBe(base.damage);
  });
});
