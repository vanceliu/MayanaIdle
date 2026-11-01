/**
 * 怪物強化詞綴的戰鬥結算（`25-monster-system.md` § 25.12.3）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMonsterAttack, processPlayerAttack } from '../arpgEventHandler';
import { calculateThornsDamage } from '../combat';
import { tickCombat, tickInstanceCombat } from '../combatLoop';
import { createMapInstance, attachInstance, ensureInstance } from '../mapInstance';
import { createMonsterCombatContext } from '../monsterCombatFSM';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useTalentStore } from '../../stores/talentStore';
import { defaultSession } from '../../stores/session';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { MapData } from '../../models/mapControl';
import type { TalentSlot } from '../../models/talent';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 50_000;

function character(over: Partial<Character> = {}): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 40,
    exp: 0, expToNext: 1_000_000, hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 30, AGI: 10, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: NOW, createdAt: NOW,
    ...over,
  };
}

function monster(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 500, maxHp: 1000,
    attackMin: 50, attackMax: 50, defense: 0, exp: 10,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...over,
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('嗜血', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不迴避、不觸發 debuff
  });

  function attack(inst: MonsterInstance) {
    const ch = character();
    useGameStore.setState({ character: ch, activeEffects: [], combatLogs: [] });
    const result = processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1' },
      { character: ch, equippedGear: [], activeEffects: [], skills: [], monsterInstances: new Map([['m1', inst]]), mapMonsters },
    )!;
    return { result, ch };
  }

  it('回復實際扣到角色 HP 的 20%', () => {
    const inst = monster({ affixes: ['bloodthirst'] });
    const { result, ch } = attack(inst);
    const hpLost = 500 - ch.hp;
    expect(result.damage).toBe(hpLost);
    expect(inst.currentHp).toBe(500 + Math.floor(hpLost * 0.2));
  });

  it('沒有嗜血不回復', () => {
    const inst = monster();
    attack(inst);
    expect(inst.currentHp).toBe(500);
  });

  it('日誌寫「詞綴 原名」', () => {
    const { result } = attack(monster({ affixes: ['bloodthirst', 'frenzy'] }));
    expect(result.log.text).toMatch(/^嗜血 狂暴 哥布林 造成/);
  });
});

describe('護盾', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // 命中
  });

  it('角色傷害先扣護盾，HP 不動', () => {
    const inst = monster({ currentHp: 1000, shieldMax: 200, shieldRemaining: 200 });
    const ch = character();
    useGameStore.setState({ character: ch, activeEffects: [], combatLogs: [], skills: [] });
    const result = processPlayerAttack(
      { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
      { character: ch, equippedGear: [], activeEffects: [], skills: [], monsterInstances: new Map([['m1', inst]]), mapMonsters },
    );
    const dealt = result.damages[0].damage;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(200);
    expect(inst.shieldRemaining).toBe(200 - dealt);
    expect(inst.currentHp).toBe(1000);
  });
});

describe('荊棘反彈對角色的傷害', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('物理減傷，最低 1', () => {
    expect(calculateThornsDamage(30, [], [])).toBeGreaterThanOrEqual(1);
    expect(calculateThornsDamage(0, [], [])).toBe(0);
  });

  it('無敵時為 0', () => {
    const invincible = {
      id: 'inv', sourceSkillId: 'x', sourceSkillName: 'x', category: 'inv', type: 'buff' as const, target: 'player' as const,
      startTime: NOW - 10, duration: 10_000, tags: [], name: '無敵', description: '', invincible: true,
    };
    expect(calculateThornsDamage(100, [], [invincible])).toBe(0);
  });
});

const NORMAL_ATTACK_SLOT: TalentSlot = {
  id: 1, characterId: 1, tier: 1, assignedType: 'combat', templateId: 'default',
  order: 0, enabled: true, conditions: [null], action: { ruleId: 'normal_attack', params: null },
};

const MAP: MapData = {
  id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 5, y: 5 }, autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

function setupField(inst: MonsterInstance, hp = 500) {
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  attachInstance(defaultSession, createMapInstance('test', useMapMonsterStore));
  const mapMonster: MapMonster = {
    id: 'm1', position: { x: 6, y: 5 }, targetPosition: { x: 5, y: 5 },
    speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false, attackRange: 1.5,
  };
  useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: MAP, playerPosition: { x: 5, y: 5 }, prevPlayerPosition: { x: 5, y: 5 },
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
  });
  useGameStore.setState({
    character: character({ hp, maxHp: 500 }), equippedGear: {}, inventory: [], bagItems: [],
    activeEffects: [], combatLogs: [], skills: [],
  });
  useTalentStore.setState({ slots: [NORMAL_ATTACK_SLOT] });
  defaultSession.combat.monsterInstances.set('m1', inst);
  defaultSession.combat.engine.monsters.set('m1', {
    instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
    attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
  });
  defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
  defaultSession.combat.engine.playerCtx.attackTimer = 100_000;
}

function tickUntilPlayerAttack() {
  for (let i = 0; i < 12; i++) {
    const visuals = tickCombat(300, defaultSession);
    const attack = visuals.find(v => v.kind === 'player_attack');
    if (attack) return { attack, visuals };
  }
  return null;
}

describe('荊棘（戰鬥迴圈）', () => {
  it('每下命中反彈，角色扣血並寫日誌', () => {
    setupField(monster({ currentHp: 99_999, maxHp: 99_999, attackInterval: 100_000, affixes: ['thorns'] }));
    const hit = tickUntilPlayerAttack();
    expect(hit).not.toBeNull();
    const hp = useGameStore.getState().character!.hp;
    expect(hp).toBeLessThan(500);
    const logs = useGameStore.getState().combatLogs.map(l => l.text);
    expect(logs.some(t => /^荊棘 哥布林 反彈 \d+ 點傷害$/.test(t))).toBe(true);
  });

  it('沒有荊棘不反彈', () => {
    setupField(monster({ currentHp: 99_999, maxHp: 99_999, attackInterval: 100_000 }));
    expect(tickUntilPlayerAttack()).not.toBeNull();
    expect(useGameStore.getState().character!.hp).toBe(500);
  });

  it('可致死：反彈打死角色會傳回城鎮', () => {
    setupField(monster({ currentHp: 99_999, maxHp: 99_999, attackInterval: 100_000, affixes: ['thorns'] }), 1);
    expect(tickUntilPlayerAttack()).not.toBeNull();
    const logs = useGameStore.getState().combatLogs.map(l => l.text);
    expect(logs.some(t => t.startsWith('你倒下了'))).toBe(true);
  });
});

describe('再生（戰鬥迴圈）', () => {
  it('每 6 秒回最大 HP 的 2%', () => {
    const inst = monster({ currentHp: 500, maxHp: 1000, attackInterval: 100_000, affixes: ['regen'] });
    setupField(inst);
    // 只推進實例層（怪物），玩家不出手
    tickInstanceCombat(5999, ensureInstance(defaultSession));
    expect(inst.currentHp).toBe(500);
    tickInstanceCombat(1, ensureInstance(defaultSession));
    expect(inst.currentHp).toBe(520);
  });
});
