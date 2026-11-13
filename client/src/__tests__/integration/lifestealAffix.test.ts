/**
 * 普攻回血／技能回血（`07-affix.md` § 7.9）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../../systems/arpgEventHandler';
import { AFFIX_POOLS, getAffixTierTable, type Affix } from '../../models/affix';
import { getUniqueAffixDefinition } from '../../models/uniqueAffix';
import { instantiateSkill, type Skill } from '../../models/skill';
import { CLASS_SKILLS } from '../../models/classSkills';
import { useGameStore } from '../../stores/gameStore';
import { defaultSession } from '../../stores/session';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 900_000;

function knight(hp = 100): Character {
  return {
    name: 'Tester', className: 'knight', level: 60, exp: 0, expToNext: 100,
    hp, maxHp: 1000, mp: 400, maxMp: 400,
    baseAttributes: { STR: 20, AGI: 0, VIT: 15, SPI: 10, INT: 30, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 60, currentHp: 99999, maxHp: 99999,
    attackMin: 60, attackMax: 60, defense: 20, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function weapon(affixes: Affix[], type = 'sword'): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type, slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const attackLs = (value: number): Affix => ({ type: 'attack_lifesteal', tier: 7, value });
const skillLs = (value: number): Affix => ({ type: 'skill_lifesteal', tier: 7, value });

/** m2 在 m1 的 2 格內 */
const POSITIONS: Record<string, { x: number; y: number }> = { m1: { x: 5, y: 5 }, m2: { x: 7, y: 5 } };

function attack(gear: EquipmentInstance[], targetIds: string[], skill?: Skill, extra: string[] = []) {
  const gs = useGameStore.getState();
  const ids = [...targetIds, ...extra];
  const mapMonsters = ids.map(id => ({ id, position: POSITIONS[id], isBoss: false })) as unknown as MapMonster[];
  return processPlayerAttack(
    {
      type: 'player_attack',
      action: skill ? { type: 'skill', skillId: skill.id } : { type: 'normal_attack' },
      targetMonsterIds: targetIds,
      ...(skill ? { skill } : {}),
    },
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: skill ? [skill] : [],
      monsterInstances: new Map(ids.map(id => [id, monster()])), mapMonsters,
    },
  );
}

const expected = (damages: { hits: { damage: number; isMiss: boolean }[] }[], percent: number) =>
  damages.flatMap(d => d.hits).filter(h => !h.isMiss).reduce((s, h) => s + Math.floor(h.damage * percent / 100), 0);

const hpNow = () => useGameStore.getState().character!.hp;

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  defaultSession.loop.abilityCombo = undefined;
  defaultSession.loop.abilityFocus = undefined;
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('詞綴池與階級表', () => {
  it('武器池：普攻回血走 P6、技能回血走 P2', () => {
    expect(AFFIX_POOLS.weapon.attack_lifesteal).toBe('P6');
    expect(AFFIX_POOLS.weapon.skill_lifesteal).toBe('P2');
    expect(getAffixTierTable('attack_lifesteal', 'weapon')[0]).toMatchObject({ min: 0.1, max: 6 });
    expect(getAffixTierTable('attack_lifesteal', 'weapon')[6]).toMatchObject({ min: 36.1, max: 42 });
    expect(getAffixTierTable('skill_lifesteal', 'weapon')[6]).toMatchObject({ min: 12.1, max: 14 });
  });

  it('武器池：最大 HP／MP 走防具 HP 表 × 2（T7 180~200），回血／回魔走 N4（T7 25~28）', () => {
    expect(getAffixTierTable('max_hp', 'weapon')[6]).toMatchObject({ min: 180, max: 200 });
    expect(getAffixTierTable('max_mp', 'weapon')[0]).toMatchObject({ min: 30, max: 40 });
    expect(getAffixTierTable('hp_regen', 'weapon')[0]).toMatchObject({ min: 1, max: 4 });
    expect(getAffixTierTable('mp_regen', 'weapon')[6]).toMatchObject({ min: 25, max: 28 });
    expect(getAffixTierTable('max_hp', 'helmChest')[6]).toMatchObject({ min: 90, max: 100 });
  });

  it('T7 獨有詞綴命中回血／命中回魔為 10~25', () => {
    expect(getUniqueAffixDefinition('hit_heal')!.range).toEqual([10, 25]);
    expect(getUniqueAffixDefinition('hit_mana')!.range).toEqual([10, 25]);
  });
});

describe('普攻回血', () => {
  it('每下命中回復 floor(該下最終傷害 × X%)，技能回血不作用於普攻', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([attackLs(40), skillLs(14)])], ['m1']);
    const heal = expected(r.damages, 40);
    expect(heal).toBeGreaterThan(0);
    expect(hpNow()).toBe(100 + heal);
    expect(r.logs.some(l => l.text === `普攻回血回復 ${heal} HP`)).toBe(true);
  });

  it('雙持兩下各算一次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([attackLs(40)], 'dualBlade')], ['m1']);
    expect(r.damages[0].hits).toHaveLength(2);
    expect(hpNow()).toBe(100 + expected(r.damages, 40));
  });

  it('普攻擴散打到的周圍目標也各算一次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const splash: Affix = { type: 'attack_splash', tier: 5, value: 30 };
    const r = attack([weapon([attackLs(40), splash])], ['m1'], undefined, ['m2']);
    expect(r.damages.some(d => d.splash && d.targetId === 'm2')).toBe(true);
    expect(hpNow()).toBe(100 + expected(r.damages, 40));
    expect(expected(r.damages, 40)).toBeGreaterThan(expected([r.damages[0]], 40));
  });

  it('回復後不超過有效最大 HP', () => {
    useGameStore.setState({ character: knight(999) });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon([attackLs(42)])], ['m1']);
    expect(hpNow()).toBe(1000);
  });
});

describe('技能回血', () => {
  it('範圍技能逐目標各算一次，普攻回血不作用於技能', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const skill = { ...CLASS_SKILLS.find(s => s.id === 'holy-judgment')!.skill, lastUsedAt: 0 } as Skill;
    const r = attack([weapon([skillLs(14), attackLs(42)])], ['m1', 'm2'], skill);
    const landed = r.damages.filter(d => !d.isMiss);
    expect(landed.length).toBe(2);
    const heal = expected(r.damages, 14);
    expect(heal).toBeGreaterThan(0);
    expect(hpNow()).toBe(100 + heal);
    expect(r.logs.some(l => l.text === `技能回血回復 ${heal} HP`)).toBe(true);
  });

  it('血濺斬擊後的血濺咒殺走普攻公式、吃普攻回血（§ 7S.4 普攻類）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const skill = { ...CLASS_SKILLS.find(s => s.id === 'blood-curse')!.skill, lastUsedAt: 0 } as Skill;
    const w = { ...weapon([attackLs(40), skillLs(14)]), ability: { type: 'blood_slash' as const, params: {} } };
    const r = attack([w], ['m1'], skill);
    const strikes = r.damages.flatMap(d => d.hits);
    expect(strikes).toHaveLength(skill.randomHits!);
    const heal = expected(r.damages, 40);
    expect(heal).toBeGreaterThan(0);
    expect(r.logs.some(l => l.text === `普攻回血回復 ${heal} HP`)).toBe(true);
  });

  it('單體技能用技能回血', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([skillLs(14)])], ['m1'], instantiateSkill('ice-bolt')!);
    expect(hpNow()).toBe(100 + expected(r.damages, 14));
  });
});
