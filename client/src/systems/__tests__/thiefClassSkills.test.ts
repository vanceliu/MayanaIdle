/**
 * 盜賊職業魔法（`23-class-magic.md` § 23.7）：煙霧彈改版、背刺突進、毒霧、閃避反擊。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { consumeEvadeCharge } from '../combat';
import { processMonsterAttack, processPlayerAttack } from '../arpgEventHandler';
import { applyMonsterAttacks } from '../combatLoop';
import { createMapInstance, attachInstance } from '../mapInstance';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { defaultSession } from '../../stores/session';
import { getSkillTemplate } from '../../models/skillTemplate';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { Character } from '../../models/character';
import type { MonsterInstance, MonsterAttackType } from '../../models/monster';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';
import type { MapData } from '../../models/mapControl';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 950_000;

function thief(): Character {
  return {
    userId: 1, id: 1, name: 'Thief', className: 'thief', level: 70, exp: 0, expToNext: 1_000_000,
    hp: 800, maxHp: 800, mp: 300, maxMp: 300,
    baseAttributes: { STR: 18, AGI: 25, VIT: 14, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW,
  };
}

function monster(attackType: MonsterAttackType = 'melee', hp = 99999): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: hp, maxHp: 99999,
    attackMin: 60, attackMax: 60, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType, attackRange: attackType === 'melee' ? 1.5 : 8, attackInterval: 100_000,
  };
}

function smokeBomb(): ActiveEffect {
  const t = getSkillTemplate('smoke-bomb')!;
  return {
    id: 'buff-smoke', sourceSkillId: 'smoke-bomb', sourceSkillName: t.name, category: t.buffCategory!,
    type: 'buff', target: 'player', modifiers: [], startTime: NOW, duration: t.buffDuration!,
    tags: [], name: t.name, description: '', evadeCharges: 1,
  };
}

const skillOf = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });
const mapMonsters = [{ id: 'm1', position: { x: 6, y: 5 }, isBoss: false }] as unknown as MapMonster[];

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  useGameStore.setState({ character: thief(), skills: [], equippedGear: {}, activeEffects: [], combatLogs: [], bagItems: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('盜賊技能定義', () => {
  it('職業魔法共 7 級', () => {
    expect(CLASS_SKILLS.filter(s => s.className === 'thief').map(s => [s.classLevel, s.requiredLevel, s.id])).toEqual([
      [1, 10, 'envenom'], [2, 20, 'deadly-strike'], [3, 30, 'smoke-bomb'], [4, 40, 'precision-strike'],
      [5, 50, 'backstab'], [6, 60, 'poison-mist'], [7, 70, 'dodge-counter'],
    ]);
  });

  it('煙霧彈：MP 20、冷卻 20s、10 秒內絕對迴避 1 次，不再加迴避率', () => {
    const s = getSkillTemplate('smoke-bomb')!;
    expect(s).toMatchObject({ mpCost: 20, cooldown: 20000, buffDuration: 10000, evadeCharges: 1 });
    expect(s.buffModifiers ?? []).toEqual([]);
  });

  it('背刺：射程 8、突進，仍是 5 級', () => {
    expect(getSkillTemplate('backstab')).toMatchObject({ range: 8, dash: true, level: 5 });
  });

  it('毒霧：MP 30、冷卻 30s、自身 5 格、每秒 70% 物理、10 秒、與淬毒同一種毒', () => {
    expect(getSkillTemplate('poison-mist')).toMatchObject({
      mpCost: 30, cooldown: 30000, aoeCenter: 'self', aoeRadius: 5, dotOnly: true,
      applyDebuff: { category: 'poisoned', dotDamagePercent: 0.7, dotInterval: 1000, dotDuration: 10000 },
    });
    expect(getSkillTemplate('envenom')!.onHitDebuff!.category).toBe('poisoned');
  });

  it('閃避反擊是被動', () => {
    expect(getSkillTemplate('dodge-counter')).toMatchObject({ type: 'passive', counterOnDodge: true });
  });

  it('被動技能不能從快捷列施放', () => {
    useGameStore.setState({ skills: [skillOf('dodge-counter')] });
    expect(useGameStore.getState().castQuickSlotSkill('dodge-counter')).toBe(false);
  });
});

describe('煙霧彈絕對迴避', () => {
  it('consumeEvadeCharge：扣 1 次，用完移除；沒有就回 null', () => {
    expect(consumeEvadeCharge([smokeBomb()], NOW + 100)).toEqual([]);
    expect(consumeEvadeCharge([], NOW + 100)).toBeNull();
    expect(consumeEvadeCharge([smokeBomb()], NOW + 20_000)).toBeNull();
  });

  it('本來會中的一擊變成 MISS，第二擊照常命中', () => {
    useGameStore.setState({ activeEffects: [smokeBomb()] });
    const hit = () => processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1' },
      {
        character: useGameStore.getState().character!, equippedGear: [], activeEffects: useGameStore.getState().activeEffects,
        skills: [], monsterInstances: new Map([['m1', monster()]]), mapMonsters,
      },
    )!;
    const first = hit();
    expect(first.isDodged).toBe(true);
    expect(first.damage).toBe(0);
    expect(useGameStore.getState().activeEffects).toEqual([]);
    const second = hit();
    expect(second.isDodged).toBe(false);
    expect(second.damage).toBeGreaterThan(0);
  });
});

describe('毒霧', () => {
  function cast(activeEffects: ActiveEffect[] = []) {
    const skill = skillOf('poison-mist');
    const character = thief();
    useGameStore.setState({ character, skills: [skill], activeEffects, combatLogs: [] });
    const target = monster();
    const r = processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'poison-mist' }, targetMonsterIds: ['m1'], skill },
      { character, equippedGear: [], activeEffects, skills: [skill], monsterInstances: new Map([['m1', target]]), mapMonsters },
    );
    return { r, target };
  }

  it('沒有直接傷害，只上 10 秒的毒', () => {
    const { r, target } = cast();
    expect(r.damages[0].damage).toBe(0);
    expect(target.currentHp).toBe(99999);
    const poison = useGameStore.getState().activeEffects.filter(e => e.category === 'poisoned' && e.targetMonsterId === 'm1');
    expect(poison).toHaveLength(1);
    expect(poison[0].duration).toBe(10000);
    expect(poison[0].dot!.damage).toBeGreaterThan(0);
  });

  it('已中毒的怪不再施加、不刷新時間', () => {
    const existing: ActiveEffect = {
      id: 'old', sourceSkillId: 'envenom', sourceSkillName: '淬毒', category: 'poisoned', type: 'debuff',
      target: 'monster', targetMonsterId: 'm1', dot: { damage: 3, element: 'none', interval: 1000, totalDuration: 5000 },
      startTime: NOW, duration: 5000, tags: ['poisoned'], name: '中毒', description: '',
    };
    cast([existing]);
    const poison = useGameStore.getState().activeEffects.filter(e => e.category === 'poisoned' && e.targetMonsterId === 'm1');
    expect(poison).toHaveLength(1);
    expect(poison[0].id).toBe('old');
  });
});

describe('閃避反擊', () => {
  const MAP: MapData = {
    id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 5, y: 5 }, autoSpawn: false,
    tiles: Array.from({ length: 12 }, () => Array(12).fill(0)),
  };

  function setup(attackType: MonsterAttackType, monsterPos = { x: 6, y: 5 }, learned = true) {
    const instance = createMapInstance('test', useMapMonsterStore);
    attachInstance(defaultSession, instance);
    const mapMonster: MapMonster = {
      id: 'm1', position: monsterPos, targetPosition: { x: 5, y: 5 },
      speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
      lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false, attackRange: 1.5,
    };
    useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
    useMapControlStore.setState({
      currentMap: MAP, playerPosition: { x: 5, y: 5 }, prevPlayerPosition: { x: 5, y: 5 },
      currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
    });
    useGameStore.setState({
      character: thief(), skills: learned ? [skillOf('dodge-counter')] : [], activeEffects: [smokeBomb()],
      equippedGear: {}, combatLogs: [], bagItems: [],
    });
    const inst = monster(attackType);
    defaultSession.combat.monsterInstances.set('m1', inst);
    return { instance, inst };
  }

  it('近戰怪攻擊 MISS 時反擊一次普攻', () => {
    const { instance } = setup('melee');
    const visuals = applyMonsterAttacks(instance, [{ type: 'monster_attack', monsterId: 'm1', attackType: 'melee' }]);
    expect(visuals.find(v => v.kind === 'monster_attack')).toMatchObject({ isDodged: true });
    const counter = visuals.find(v => v.kind === 'player_attack') as Extract<typeof visuals[number], { kind: 'player_attack' }>;
    expect(counter).toBeDefined();
    expect(counter.result.skillUsed).toBeUndefined();
    expect(counter.result.damages.map(d => d.targetId)).toEqual(['m1']);
    expect(useGameStore.getState().combatLogs.some(l => l.text === '閃避反擊！')).toBe(true);
  });

  it('遠程怪攻擊 MISS 不反擊', () => {
    const { instance, inst } = setup('ranged', { x: 6, y: 5 });
    const visuals = applyMonsterAttacks(instance, [{ type: 'monster_attack', monsterId: 'm1', attackType: 'ranged' }]);
    expect(visuals.some(v => v.kind === 'player_attack')).toBe(false);
    expect(inst.currentHp).toBe(99999);
  });

  it('不在武器射程內不反擊', () => {
    const { instance, inst } = setup('melee', { x: 8, y: 5 });
    applyMonsterAttacks(instance, [{ type: 'monster_attack', monsterId: 'm1', attackType: 'melee' }]);
    expect(inst.currentHp).toBe(99999);
  });

  it('沒學被動不反擊', () => {
    const { instance, inst } = setup('melee', { x: 6, y: 5 }, false);
    applyMonsterAttacks(instance, [{ type: 'monster_attack', monsterId: 'm1', attackType: 'melee' }]);
    expect(inst.currentHp).toBe(99999);
  });
});
