/**
 * 試驗場木樁零產出（`docs/design/50-training-ground.md` § 50.1、§ 50.4.1）。
 *
 * 這是硬性限制而不是調校項：一旦木樁給經驗或掉東西，它就變成零風險的掛機
 * 刷怪點，與 `26-spawn-pressure.md` 的刷怪經濟直接衝突；而殺敵數會上傳排行榜
 * （`37-statistics.md` § 37.4），被木樁灌爆就再也修不回來。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import type { DropResult } from '../../systems/drops';
import type { MonsterInstance } from '../../models/monster';
import { createDefaultStatistics } from '../../models/statistics';

const rollDropsMock = vi.fn(async (): Promise<DropResult> => ({ gold: 999, items: [] }));

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: () => rollDropsMock(),
    rollBossDrops: () => rollDropsMock(),
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
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

function makeMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 0,
    name: '木樁',
    level: 40,
    currentHp: -1,
    maxHp: 100,
    attackMin: 0,
    attackMax: 0,
    defense: 0,
    // 刻意給一個大的經驗值：如果哪天守門被拿掉，測試要立刻炸開而不是差一點點
    exp: 5000,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1200,
    _processed: false,
    ...overrides,
  };
}

async function kill(monster: MonsterInstance) {
  const char = useGameStore.getState().character!;
  useGameStore.setState({ phase: 'combat', character: char, activeEffects: [] });
  const result = processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [monster],
    0,
    { ...char },
    [],
    [],
  );
  await waitForPendingDrops();
  return result;
}

describe('木樁擊殺不結算（§ 50.4.1）', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    rollDropsMock.mockReset();
    rollDropsMock.mockResolvedValue({ gold: 999, items: [] });
    useGameStore.setState({
      phase: 'title', userId: null, characterList: [], character: null,
      equippedGear: {}, inventory: [], bagItems: [], skills: [],
      storedEquipment: [], storedMaterials: [], warehouseGold: 0,
      scriptRules: [], quickSlots: [null, null, null, null, null],
      combatLogs: [], gameLoopId: null, hpRegenId: null, mpRegenId: null,
      activeEffects: [], statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('DummyTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    useGameStore.setState({ statistics: createDefaultStatistics() });
  });

  afterEach(async () => {
    await waitForPendingDrops();
  });

  it('不給經驗、不給金幣、不寫日誌', async () => {
    const before = useGameStore.getState().character!;
    const result = await kill(makeMonster({ isTrainingDummy: true }));

    expect(result.char.exp).toBe(before.exp);
    expect(result.char.level).toBe(before.level);
    expect(result.char.gold).toBe(before.gold);
    expect(result.logs).toHaveLength(0);
    expect(rollDropsMock).not.toHaveBeenCalled();
  });

  it('不累加殺敵數等統計欄位（那些數字會上傳排行榜）', async () => {
    await kill(makeMonster({ isTrainingDummy: true }));
    const stats = useGameStore.getState().statistics;
    expect(stats.monstersKilled).toBe(0);
    expect(stats.bossesKilled).toBe(0);
  });

  it('Boss 型木樁一樣不結算 —— 旗標優先於 isBoss', async () => {
    await kill(makeMonster({ isTrainingDummy: true, isBoss: true }));
    expect(useGameStore.getState().statistics.bossesKilled).toBe(0);
    expect(rollDropsMock).not.toHaveBeenCalled();
  });

  it('對照組：一般怪照常結算，證明守門擋的是旗標不是整條流程', async () => {
    const before = useGameStore.getState().character!;
    const result = await kill(makeMonster());

    expect(result.char.exp).toBeGreaterThan(before.exp);
    expect(result.logs.length).toBeGreaterThan(0);
    expect(useGameStore.getState().statistics.monstersKilled).toBe(1);
  });
});
