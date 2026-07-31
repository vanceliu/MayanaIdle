import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { absorbWithShield } from '../combat';
import { processMonsterAttack, processPlayerAttack } from '../arpgEventHandler';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 800_000;

function character(): Character {
  return {
    name: 'Priest', className: 'priest', level: 50, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 300, maxMp: 300,
    baseAttributes: { STR: 10, AGI: 10, VIT: 20, SPI: 25, INT: 20, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(attack = 40): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 999, maxHp: 999,
    attackMin: attack, attackMax: attack, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function shieldBuff(remaining = 100): ActiveEffect {
  const t = getSkillTemplate('holy-shield')!;
  return {
    id: 'buff-holy-shield', sourceSkillId: 'holy-shield', sourceSkillName: t.name,
    category: 'holy-shield', type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [],
    startTime: NOW, duration: t.buffDuration ?? 20_000,
    tags: [], name: t.name, description: '',
    shieldRemaining: remaining,
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不迴避、不格擋
  useGameStore.setState({
    character: character(), skills: [], equippedGear: {}, activeEffects: [], combatLogs: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('absorbWithShield', () => {
  it('沒有護盾時傷害原樣通過', () => {
    const r = absorbWithShield(50, [], NOW + 100);
    expect(r).toMatchObject({ damage: 50, absorbed: 0, broken: false });
  });

  it('護盾足夠時完全吸收，剩餘量遞減', () => {
    const r = absorbWithShield(30, [shieldBuff(100)], NOW + 100);
    expect(r.damage).toBe(0);
    expect(r.absorbed).toBe(30);
    expect(r.broken).toBe(false);
    expect(r.effects[0].shieldRemaining).toBe(70);
  });

  it('護盾不足時吸收剩餘量，其餘穿透並破裂', () => {
    const r = absorbWithShield(120, [shieldBuff(100)], NOW + 100);
    expect(r.damage).toBe(20);
    expect(r.absorbed).toBe(100);
    expect(r.broken).toBe(true);
    expect(r.effects.some(e => e.category === 'holy-shield')).toBe(false);
  });

  it('剛好耗盡時傷害為 0 但護盾破裂', () => {
    const r = absorbWithShield(100, [shieldBuff(100)], NOW + 100);
    expect(r.damage).toBe(0);
    expect(r.absorbed).toBe(100);
    expect(r.broken).toBe(true);
    expect(r.effects).toHaveLength(0);
  });

  it('過期的護盾不吸收', () => {
    const r = absorbWithShield(50, [shieldBuff(100)], NOW + 30_000);
    expect(r.damage).toBe(50);
    expect(r.absorbed).toBe(0);
  });

  it('傷害為 0 時不消耗護盾', () => {
    const r = absorbWithShield(0, [shieldBuff(100)], NOW + 100);
    expect(r.absorbed).toBe(0);
    expect(r.effects[0].shieldRemaining).toBe(100);
  });

  it('不影響非護盾的 buff', () => {
    const other: ActiveEffect = { ...shieldBuff(100), id: 'other', category: 'defense-buff', shieldRemaining: undefined };
    const r = absorbWithShield(50, [other], NOW + 100);
    expect(r.damage).toBe(50);
    expect(r.effects).toHaveLength(1);
  });
});

describe('聖光護盾實戰', () => {
  it('施放後 buff 帶有 shieldRemaining 100', () => {
    const skill = { ...getSkillTemplate('holy-shield')!, lastUsedAt: 0 } as Skill;
    useGameStore.setState({ skills: [skill] });
    processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'holy-shield' }, targetMonsterIds: [], skill },
      {
        character: useGameStore.getState().character!, equippedGear: [], activeEffects: [],
        skills: [skill], monsterInstances: new Map(), mapMonsters: [] as unknown as MapMonster[],
      },
    );
    const buff = useGameStore.getState().activeEffects.find(e => e.category === 'holy-shield');
    expect(buff?.shieldRemaining).toBe(100);
  });

  it('怪物攻擊被護盾吸收，角色不掉血', () => {
    useGameStore.setState({ activeEffects: [shieldBuff(100)] });
    const char = useGameStore.getState().character!;

    const result = processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1' },
      {
        character: char, equippedGear: [], activeEffects: useGameStore.getState().activeEffects,
        skills: [], monsterInstances: new Map([['m1', monster(40)]]), mapMonsters,
      },
    );

    expect(result?.damage).toBe(0);
    expect(char.hp).toBe(500);
    expect(result?.shieldLog?.text).toContain('吸收 40');
    expect(useGameStore.getState().activeEffects[0].shieldRemaining).toBe(60);
  });

  it('護盾破裂後溢出的傷害仍會扣血', () => {
    useGameStore.setState({ activeEffects: [shieldBuff(10)] });
    const char = useGameStore.getState().character!;

    const result = processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1' },
      {
        character: char, equippedGear: [], activeEffects: useGameStore.getState().activeEffects,
        skills: [], monsterInstances: new Map([['m1', monster(40)]]), mapMonsters,
      },
    );

    expect(result?.damage).toBe(30);
    expect(char.hp).toBe(470);
    expect(result?.shieldLog?.text).toContain('破裂');
    expect(useGameStore.getState().activeEffects).toHaveLength(0);
  });
});
