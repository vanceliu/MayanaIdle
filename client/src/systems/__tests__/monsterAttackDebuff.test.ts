import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMonsterAttack } from '../arpgEventHandler';
import { useGameStore } from '../../stores/gameStore';
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

const NOW = 50_000;

function testCharacter(): Character {
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

function poisonSnake(): MonsterInstance {
  return {
    templateId: 10, name: '毒蛇', level: 18, currentHp: 100, maxHp: 100,
    attackMin: 40, attackMax: 40, defense: 5, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    debuffs: [{ type: 'poison', chance: 20 }],
  };
}

function immuneArmor(affixType: string): EquipmentInstance {
  return {
    templateId: 99, name: '抗毒鎧甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    smallMonsterDamage: 0, largeMonsterDamage: 0, defense: 5, quality: 0, enhancement: 0,
    affixes: [{ type: affixType as never, tier: 0, value: 0 }],
    ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

/**
 * calculateMonsterAttack 的 random 消耗順序：迴避判定 → 傷害亂數 →（有盾才有的格擋判定）
 * 之後才輪到 debuff 判定，因此以序列最後一個值控制 debuff 是否命中。
 */
function mockRolls(...values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)]);
}

const NO_DODGE = 0.99;
const DAMAGE_ROLL = 0.5;
const DEBUFF_HIT = 0.001;
const DEBUFF_MISS = 0.99;

function runAttack(gear: (EquipmentInstance | null)[], monster: MonsterInstance) {
  const character = testCharacter();
  useGameStore.setState({ character, activeEffects: [], combatLogs: [] });
  return processMonsterAttack(
    { type: 'monster_attack', monsterId: 'm1' },
    {
      character,
      equippedGear: gear,
      activeEffects: [],
      skills: [],
      monsterInstances: new Map([['m1', monster]]),
      mapMonsters,
    },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processMonsterAttack — 角色 debuff 施加', () => {
  it('命中且骰中時將 debuff 寫入 activeEffects 並輸出戰鬥日誌', () => {
    mockRolls(NO_DODGE, DAMAGE_ROLL, DEBUFF_HIT);

    const result = runAttack([], poisonSnake());

    const effects = useGameStore.getState().activeEffects;
    expect(effects).toHaveLength(1);
    expect(effects[0].category).toBe('dot-poison');
    expect(effects[0].target).toBe('player');
    expect(effects[0].dot?.damage).toBe(2); // floor(40 * 0.05)
    expect(result?.debuffLog?.text).toContain('中毒');
  });

  it('未骰中時不施加 debuff', () => {
    mockRolls(NO_DODGE, DAMAGE_ROLL, DEBUFF_MISS);
    const result = runAttack([], poisonSnake());

    expect(useGameStore.getState().activeEffects).toHaveLength(0);
    expect(result?.debuffLog).toBeUndefined();
  });

  it('攻擊被閃避時不判定 debuff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // 必定閃避
    const result = runAttack([], poisonSnake());

    expect(result?.isDodged).toBe(true);
    expect(useGameStore.getState().activeEffects).toHaveLength(0);
  });

  it('裝備毒免疫時完全不會中毒', () => {
    mockRolls(NO_DODGE, DAMAGE_ROLL, DEBUFF_HIT);

    runAttack([immuneArmor('immune_poison')], poisonSnake());
    expect(useGameStore.getState().activeEffects).toHaveLength(0);
  });

  it('無 debuff 能力的怪物不會施加任何狀態', () => {
    mockRolls(NO_DODGE, DAMAGE_ROLL, DEBUFF_HIT);

    const plain = { ...poisonSnake(), debuffs: undefined };
    runAttack([], plain);
    expect(useGameStore.getState().activeEffects).toHaveLength(0);
  });
});
