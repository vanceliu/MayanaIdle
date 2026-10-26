/**
 * T7 獨有詞綴的凍結、同類去重與常駐數值接入（`07-affix-tier7.md` § 7T.2／§ 7T.3）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Character } from '../../models/character';
import { getTotalAttributes } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import type { UniqueAffix } from '../../models/uniqueAffix';
import type { Affix } from '../../models/affix';
import {
  getEffectiveGear,
  getSuppressedUniqueGear,
  isUniqueAffixSuppressed,
  suppressDuplicateUniqueAffixes,
} from '../gear';
import {
  getAffixBonusesFromGear,
  getTotalDefense,
  getPlayerDodgeRate,
  getPlayerBlockRate,
  getTotalMagicResist,
  DODGE_RATE_CAP,
  BLOCK_RATE_CAP,
} from '../combat';
import { rollMonsterDebuff } from '../playerDebuffSystem';
import type { MonsterInstance } from '../../models/monster';

afterEach(() => { vi.restoreAllMocks(); });

function char(over: Partial<Character> = {}): Character {
  return {
    name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 10, AGI: 0, VIT: 10, SPI: 0, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
    ...over,
  };
}

let nextId = 1;
function item(slot: string, uniqueAffix?: UniqueAffix, extra: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: nextId++, templateId: 1, name: slot, type: 'armor', slot, isTwoHanded: false,
    defense: 0, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...(uniqueAffix ? { uniqueAffix } : {}), ...extra,
  } as EquipmentInstance;
}

const buff = (stat: string, value: number, isPercent = false): ActiveEffect => ({
  id: stat, sourceSkillId: stat, sourceSkillName: stat, category: stat, type: 'buff', target: 'player',
  modifiers: [{ stat, value, isPercent }], startTime: 0, duration: Number.MAX_SAFE_INTEGER, tags: [], name: stat, description: '',
});

describe('同類去重（§ 7T.3）', () => {
  it('數值最高者生效，其餘拿掉獨有詞綴', () => {
    const helmet = item('helmet', { type: 'extra_defense', value: 10 });
    const chest = item('chest', { type: 'extra_defense', value: 6 });
    const out = suppressDuplicateUniqueAffixes([chest, helmet]);
    expect(out.find(g => g.slot === 'helmet')!.uniqueAffix).toEqual({ type: 'extra_defense', value: 10 });
    expect(out.find(g => g.slot === 'chest')!.uniqueAffix).toBeUndefined();
  });

  it('同值依部位順序取第一件（頭盔先於胸甲、戒指 1 先於戒指 2）', () => {
    const chest = item('chest', { type: 'evasion', value: 8 });
    const helmet = item('helmet', { type: 'evasion', value: 8 });
    expect([...getSuppressedUniqueGear([chest, helmet])]).toEqual([chest]);

    const ring2 = item('ring2', { type: 'immune_all', value: 0 });
    const ring1 = item('ring1', { type: 'immune_all', value: 0 });
    expect([...getSuppressedUniqueGear([ring2, ring1])]).toEqual([ring2]);
  });

  it('不同種類互不影響', () => {
    const gear = [item('helmet', { type: 'evasion', value: 8 }), item('chest', { type: 'drop_rate', value: 60 })];
    expect(suppressDuplicateUniqueAffixes(gear)).toBe(gear);
  });

  it('素質需求未滿足的件凍結，不參與比較，讓位給次高者', () => {
    const c = char();
    const heavy = item('helmet', { type: 'extra_defense', value: 10 }, { requiredAttributes: { STR: 24 } });
    const light = item('chest', { type: 'extra_defense', value: 6 });
    const eff = getEffectiveGear(c, [], [heavy, light]) as EquipmentInstance[];
    expect(eff[0].uniqueAffix).toBeUndefined();
    expect(eff[1].uniqueAffix).toEqual({ type: 'extra_defense', value: 6 });
    expect(getTotalDefense(eff)).toBe(6);
  });

  it('UI 劃線判定：落敗者 true、勝者與凍結件 false', () => {
    const c = char();
    const a = item('helmet', { type: 'evasion', value: 9 });
    const b = item('chest', { type: 'evasion', value: 7 });
    const gear = { helmet: a, chest: b };
    expect(isUniqueAffixSuppressed(c, [], gear, a)).toBe(false);
    expect(isUniqueAffixSuppressed(c, [], gear, b)).toBe(true);

    const frozen = item('helmet', { type: 'evasion', value: 9 }, { requiredAttributes: { STR: 99 } });
    expect(isUniqueAffixSuppressed(c, [], { helmet: frozen, chest: b }, frozen)).toBe(false);
    expect(isUniqueAffixSuppressed(c, [], { helmet: frozen, chest: b }, b)).toBe(false);
  });

  it('沒穿著的件不判定', () => {
    const a = item('helmet', { type: 'evasion', value: 9 });
    expect(isUniqueAffixSuppressed(char(), [], {}, a)).toBe(false);
  });
});

describe('全屬性（§ 7T.6）', () => {
  it('兩件只算數值高的那件，六項各加', () => {
    const c = char();
    const neck = item('necklace', { type: 'all_attributes', value: 2 });
    const ring = item('ring1', { type: 'all_attributes', value: 1 });
    const eff = getEffectiveGear(c, [], [neck, ring]) as EquipmentInstance[];
    const attrs = getTotalAttributes(c, [], eff);
    expect(attrs.STR).toBe(12);
    expect(attrs.CHA).toBe(12);
  });

  it('計入素質需求的最小固定點，且只算一件', () => {
    const c = char({ baseAttributes: { STR: 21, AGI: 0, VIT: 10, SPI: 0, INT: 10, CHA: 10 } });
    const neck = item('necklace', { type: 'all_attributes', value: 2 });
    const ring = item('ring1', { type: 'all_attributes', value: 2 });
    const needs23 = item('helmet', undefined, { requiredAttributes: { STR: 23 }, affixes: [{ type: 'defense', tier: 1, value: 3 } as Affix] });
    const needs25 = item('chest', undefined, { requiredAttributes: { STR: 25 }, affixes: [{ type: 'defense', tier: 1, value: 3 } as Affix] });
    const eff = getEffectiveGear(c, [], [neck, ring, needs23, needs25]) as EquipmentInstance[];
    expect(eff[2].affixes).toHaveLength(1);
    expect(eff[3].affixes).toHaveLength(0);
  });
});

describe('常駐數值接入', () => {
  it('爆擊率／爆擊傷害／攻速／掉寶／魔抗／迴避與一般詞綴加算', () => {
    const weapon = item('rightHand', { type: 'crit_rate', value: 22 }, { affixes: [{ type: 'crit_rate', tier: 5, value: 15 }] });
    const helmet = item('helmet', { type: 'drop_rate', value: 80 }, { affixes: [{ type: 'drop_rate', tier: 1, value: 3 }] });
    const ring = item('ring1', { type: 'magic_resist', value: 12 });
    const chest = item('chest', { type: 'evasion', value: 9 }, { affixes: [{ type: 'evasion', tier: 7, value: 7 }] });
    const b = getAffixBonusesFromGear([weapon, helmet, ring, chest]);
    expect(b.crit_rate).toBe(37);
    expect(b.drop_rate).toBe(83);
    expect(b.magic_resist).toBe(12);
    expect(b.evasion).toBe(16);
  });

  it('額外防禦計入裝備防禦', () => {
    expect(getTotalDefense([item('chest', { type: 'extra_defense', value: 7 }, { defense: 10 })])).toBe(17);
  });

  it('迴避：詞綴與 buff 進迴避率，上限 35%', () => {
    const c = char(); // 騎士基礎 5、AGI 0
    expect(getPlayerDodgeRate(c, [item('chest', { type: 'evasion', value: 10 })])).toBe(15);
    expect(getPlayerDodgeRate(c, [item('chest', undefined, { affixes: [{ type: 'evasion', tier: 4, value: 4 }] })])).toBe(9);
    expect(getPlayerDodgeRate(c, [], [buff('evasion', 10, true)])).toBe(15);
    expect(getPlayerDodgeRate(c, [item('chest', { type: 'evasion', value: 10 })], [buff('evasion', 40, true)])).toBe(DODGE_RATE_CAP);
  });

  it('格擋：buff 加在副手格擋上，上限 50%', () => {
    const shield = item('leftHand', undefined, { type: 'shield', blockRate: 18 } as Partial<EquipmentInstance>);
    expect(getPlayerBlockRate([shield], [buff('block_rate', 10)])).toBe(28);
    expect(getPlayerBlockRate([shield], [buff('block_rate', 40)])).toBe(BLOCK_RATE_CAP);
  });

  it('受擊魔抗 buff 進魔法抗性總值', () => {
    const c = char();
    expect(getTotalMagicResist(c, [], [buff('magic_resist', 15)]) - getTotalMagicResist(c, [], [])).toBe(15);
  });
});

describe('全免疫', () => {
  const monster = {
    templateId: 1, name: '毒蛇', level: 60, currentHp: 1, maxHp: 1, attackMin: 10, attackMax: 10,
    defense: 0, exp: 1, race: 'animal', size: 'small', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    debuffs: [{ type: 'stun', chance: 100 }, { type: 'poison', chance: 100 }, { type: 'bleed', chance: 100 }, { type: 'weaken', chance: 100 }],
  } as unknown as MonsterInstance;

  it('中毒、流血、暈眩全部跳過，其他 debuff 照常判定', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const neck = item('necklace', { type: 'immune_all', value: 0 });
    const r = rollMonsterDebuff(monster, [neck], [], 0);
    expect(r.type).toBe('weaken');
  });

  it('沒有全免疫時第一條就中', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollMonsterDebuff(monster, [], [], 0).type).toBe('stun');
  });
});
