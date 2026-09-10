import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';
import { defaultSession } from '../session';
import { ensureInstance } from '../../systems/mapInstance';
import { createDefaultStatistics } from '../../models/statistics';
import type { MonsterInstance } from '../../models/monster';

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
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

/** `97-selfhosted-server.md` § 97.7.1 掉落與經驗分配：經驗平分、掉落只給接收者 */
function deadMonster(): MonsterInstance {
  return {
    templateId: 1, name: '測試怪物', level: 5, currentHp: 0, maxHp: 100, attackMin: 1, attackMax: 2, defense: 0,
    exp: 100, race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

describe('processMonsterDeath 的隊伍選項', () => {
  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, combatLogs: [], activeEffects: [], bagItems: [], inventory: [], equippedGear: {}, statistics: createDefaultStatistics() });
    ensureInstance(defaultSession);
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('隊員', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;
    useGameStore.setState({ character: { ...char, currentArea: 'dawn-plains', currentRegion: 'dawn-plains', expToNext: 1_000_000 } });
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  it('expDivisor 平分經驗：2 人各得 100×3÷2', () => {
    const char = useGameStore.getState().character!;
    const result = processMonsterDeath(
      () => useGameStore.getState(), s => useGameStore.setState(s), [deadMonster()], 0, { ...char }, [], [],
      defaultSession, { expDivisor: 2, withDrops: true, instanceKills: 1 },
    );
    expect(result.char.exp - char.exp).toBe(150);
    expect(result.char.areaKills).toBe(1);
    expect(result.logs.some(l => l.text.includes('獲得 150 經驗值'))).toBe(true);
  });

  it('withDrops=false：不掉金幣、不掉物品、不掉天賦格，但擊殺統計照計', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const char = useGameStore.getState().character!;
    const goldBefore = char.gold;
    processMonsterDeath(
      () => useGameStore.getState(), s => useGameStore.setState(s), [deadMonster()], 0, { ...char }, [], [],
      defaultSession, { expDivisor: 1, withDrops: false, instanceKills: 1 },
    );
    await waitForPendingDrops();
    const after = useGameStore.getState();
    expect(after.character!.gold).toBe(goldBefore);
    expect(after.combatLogs.some(l => l.type === 'loot')).toBe(false);
    expect(after.statistics.monstersKilled).toBe(1);
    expect(after.statistics.totalGoldEarned).toBe(0);
  });

  it('withDrops=true 且亂數全中：接收者拿到掉落', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const char = useGameStore.getState().character!;
    processMonsterDeath(
      () => useGameStore.getState(), s => useGameStore.setState(s), [deadMonster()], 0, { ...char }, [], [],
      defaultSession, { expDivisor: 1, withDrops: true, instanceKills: 1 },
    );
    await waitForPendingDrops();
    const after = useGameStore.getState();
    expect(after.combatLogs.some(l => l.type === 'loot')).toBe(true);
  });

  it('沒有選項時：擊殺數以角色 areaKills +1，並同步到一人實例', () => {
    const char = { ...useGameStore.getState().character!, areaKills: 9 };
    const result = processMonsterDeath(() => useGameStore.getState(), s => useGameStore.setState(s), [deadMonster()], 0, char, [], []);
    expect(result.char.areaKills).toBe(10);
    expect(defaultSession.instance.kills).toBe(10);
  });
});
