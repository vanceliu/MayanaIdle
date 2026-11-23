/**
 * 獨特魔物擊殺結算（`25-monster-system.md` § 25.13）：
 * 掉落走自己的表（rank 'unique'）、天賦格走獨特魔物掉率、統計記入 `uniqueMonstersKilled` 而非 `bossesKilled`。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import type { DropResult } from '../../systems/drops';
import type { MonsterInstance, MonsterRank } from '../../models/monster';
import { createDefaultStatistics } from '../../models/statistics';

const rollDropsMock = vi.fn(async (..._args: unknown[]): Promise<DropResult> => ({ gold: 0, items: [] }));
const rollBossDropsMock = vi.fn(async (..._args: unknown[]): Promise<DropResult> => ({ gold: 0, items: [] }));
const talentRanks: MonsterRank[] = [];

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: (...args: unknown[]) => rollDropsMock(...args),
    rollBossDrops: (...args: unknown[]) => rollBossDropsMock(...args),
  };
});

vi.mock('../../systems/talentDrops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/talentDrops')>('../../systems/talentDrops');
  return {
    ...actual,
    rollTalentSlotDrop: (_areaLevel: number, rank: MonsterRank) => {
      talentRanks.push(rank);
      return null;
    },
  };
});

import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

function deadMonster(over: Partial<MonsterInstance>): MonsterInstance {
  return {
    templateId: 227, name: '冰牙狼王', level: 33, currentHp: -1, maxHp: 992,
    attackMin: 46, attackMax: 54, defense: 28, exp: 440,
    race: 'normal', size: 'large', element: 'ice', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200, _processed: false,
    ...over,
  };
}

async function kill(monster: MonsterInstance) {
  const char = useGameStore.getState().character!;
  const inField = { ...char, currentArea: 'snow-field', currentRegion: 'snow-field', currentFloor: null };
  useGameStore.setState({ phase: 'combat', character: inField, activeEffects: [] });
  processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [monster],
    0,
    inField as any,
    [],
    [],
  );
  await waitForPendingDrops();
}

describe('獨特魔物擊殺結算', () => {
  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    rollDropsMock.mockClear();
    rollBossDropsMock.mockClear();
    talentRanks.length = 0;
    useGameStore.setState({
      phase: 'title', userId: null, characterList: [], character: null, equippedGear: {},
      inventory: [], bagItems: [], skills: [], storedEquipment: [], storedMaterials: [], warehouseGold: 0,
      scriptRules: [], quickSlots: [null, null, null, null, null], combatLogs: [], gameLoopId: null,
      regenActive: false, activeEffects: [], statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('Unique', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    useGameStore.setState({ statistics: createDefaultStatistics() });
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  it('獨特魔物：只查自己的表（rank unique），不走區域掉落池', async () => {
    await kill(deadMonster({ isUnique: true }));
    expect(rollDropsMock).not.toHaveBeenCalled();
    expect(rollBossDropsMock).toHaveBeenCalledTimes(1);
    const args = rollBossDropsMock.mock.calls[0];
    expect(args[0]).toBe('冰牙狼王');
    expect(args[7]).toBe('unique');
    expect(talentRanks).toEqual(['unique']);
  });

  it('獨特魔物計入 uniqueMonstersKilled 與 monstersKilled，不計 bossesKilled', async () => {
    await kill(deadMonster({ isUnique: true }));
    const stats = useGameStore.getState().statistics;
    expect(stats.uniqueMonstersKilled).toBe(1);
    expect(stats.bossesKilled).toBe(0);
    expect(stats.monstersKilled).toBe(1);
  });

  it('Boss 計入 bossesKilled，不計 uniqueMonstersKilled；掉落 rank boss', async () => {
    await kill(deadMonster({ name: '雪地之主', isBoss: true }));
    const stats = useGameStore.getState().statistics;
    expect(stats.bossesKilled).toBe(1);
    expect(stats.uniqueMonstersKilled).toBe(0);
    expect(rollBossDropsMock.mock.calls[0][7]).toBe('boss');
    expect(talentRanks).toEqual(['boss']);
  });

  it('一般怪走區域掉落池', async () => {
    await kill(deadMonster({ name: '雪狼' }));
    expect(rollBossDropsMock).not.toHaveBeenCalled();
    expect(rollDropsMock).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().statistics.uniqueMonstersKilled).toBe(0);
    expect(talentRanks).toEqual(['normal']);
  });
});
