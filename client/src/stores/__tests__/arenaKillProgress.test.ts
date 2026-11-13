/**
 * 競技場擊殺不計任務進度（`55-arena.md` § 55.3）：以擊殺當下的位置判定，
 * 同一 tick 玩家已死亡傳回城鎮時仍算競技場。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import type { DropResult } from '../../systems/drops';
import type { MonsterInstance } from '../../models/monster';
import { createDefaultStatistics } from '../../models/statistics';

const rollQuestMaterialDropMock = vi.fn(() => false);

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  const none = async (): Promise<DropResult> => ({ gold: 0, items: [] });
  return { ...actual, rollDrops: none, rollBossDrops: none };
});

vi.mock('../../systems/questSystem', async () => {
  const actual = await vi.importActual<typeof import('../../systems/questSystem')>('../../systems/questSystem');
  return { ...actual, rollQuestMaterialDrop: () => rollQuestMaterialDropMock() };
});

import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';
import { defaultSession } from '../session';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const monster: MonsterInstance = {
  templateId: 0, name: '測試怪', level: 50, currentHp: -1, maxHp: 100, attackMin: 0, attackMax: 0, defense: 0,
  exp: 10, race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5,
  attackInterval: 1200, _processed: false,
};

async function killAt(regionId: string) {
  const char = useGameStore.getState().character!;
  processMonsterDeath(
    () => useGameStore.getState(), s => useGameStore.setState(s), [{ ...monster }], 0, { ...char }, [], [],
    defaultSession, { killArea: { regionId, floor: null, areaId: regionId } },
  );
  await waitForPendingDrops();
}

describe('競技場擊殺的任務進度', () => {
  beforeEach(async () => {
    resetTestDb();
    rollQuestMaterialDropMock.mockClear();
    useGameStore.setState({
      phase: 'title', userId: null, characterList: [], character: null, equippedGear: {}, inventory: [], bagItems: [],
      skills: [], combatLogs: [], activeEffects: [], statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('ArenaKill', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
  });

  afterEach(async () => {
    await waitForPendingDrops();
  });

  it('在競技場擊殺、結算時已回城：不判定收集任務', async () => {
    useGameStore.setState({ character: { ...useGameStore.getState().character!, currentRegion: 'neutral-town' } });
    await killAt('arena');
    expect(rollQuestMaterialDropMock).not.toHaveBeenCalled();
  });

  it('對照組：一般地圖擊殺照常判定', async () => {
    await killAt('dawn-plains');
    expect(rollQuestMaterialDropMock).toHaveBeenCalledTimes(1);
  });
});
