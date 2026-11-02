/**
 * 懸賞契約的 store 流程（`53-bounty-contract.md`）：簽約、放棄、擊殺計數、組隊暫停、存檔。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb, repo } from '../../testing/testDb';
import type { DropResult, TakeBetterOptions } from '../../systems/drops';
import type { MonsterInstance } from '../../models/monster';
import { createDefaultStatistics } from '../../models/statistics';
import { getBountyTotalPrice, type SignedBounty } from '../../models/bounty';

const rollDropsMock = vi.fn(async (_takeBetter?: TakeBetterOptions): Promise<DropResult> => ({ gold: 0, items: [] }));

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: (...args: unknown[]) => rollDropsMock(args[6] as TakeBetterOptions | undefined),
    rollBossDrops: (...args: unknown[]) => rollDropsMock(args[5] as TakeBetterOptions | undefined),
  };
});

import { useGameStore, processMonsterDeath, waitForPendingDrops, type MonsterDeathOptions } from '../gameStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const SNOW_FIELD = { regionId: 'snow-field', floor: null, areaId: 'snow-field' };

function wolf(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '雪狼', level: 32, currentHp: 0, maxHp: 100,
    attackMin: 1, attackMax: 1, defense: 0, exp: 10,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

function signedWolf(overrides: Partial<SignedBounty> = {}): SignedBounty {
  return {
    id: 'b1', kind: 'monster', areaId: 'snow-field', monsterName: '雪狼',
    targetKills: 2, priceLevel: 30, kills: 0, takeBetter: true, ...overrides,
  };
}

async function kill(monster: MonsterInstance, options: MonsterDeathOptions = {}) {
  const char = useGameStore.getState().character!;
  processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [monster], 0, { ...char }, [], [], undefined, { killArea: SNOW_FIELD, ...options },
  );
  await waitForPendingDrops();
}

describe('懸賞契約 store', () => {
  beforeEach(async () => {
    resetTestDb();
    rollDropsMock.mockClear();
    useGameStore.setState({
      phase: 'title', userId: null, characterList: [], character: null,
      equippedGear: {}, inventory: [], bagItems: [], skills: [],
      combatLogs: [], activeEffects: [], statistics: createDefaultStatistics(),
      bountyBoards: {}, bountyContracts: [],
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('Bounty', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;
    useGameStore.setState({ character: { ...char, currentArea: 'neutral-town', gold: 1_000_000 } });
  });

  afterEach(async () => {
    await waitForPendingDrops();
  });

  it('簽約扣款、該格留空；放棄不退款', () => {
    const store = useGameStore.getState();
    store.ensureBountyBoards();
    const board = useGameStore.getState().bountyBoards['neutral-town']!;
    expect(Object.keys(useGameStore.getState().bountyBoards)).toHaveLength(4);
    const target = board.slots[0]!;
    const price = getBountyTotalPrice(target.priceLevel, true)!;

    useGameStore.getState().signBounty(target.id, true);
    let state = useGameStore.getState();
    expect(state.character!.gold).toBe(1_000_000 - price);
    expect(state.bountyBoards['neutral-town']!.slots[0]).toBeNull();
    expect(state.bountyContracts).toMatchObject([{ id: target.id, kills: 0, takeBetter: true }]);

    // 同一張不能再簽
    useGameStore.getState().signBounty(target.id, false);
    expect(useGameStore.getState().bountyContracts).toHaveLength(1);

    useGameStore.getState().abandonBounty(target.id);
    state = useGameStore.getState();
    expect(state.bountyContracts).toHaveLength(0);
    expect(state.character!.gold).toBe(1_000_000 - price);
  });

  it('未過更新時刻不重抽', () => {
    useGameStore.getState().ensureBountyBoards();
    const before = useGameStore.getState().bountyBoards;
    useGameStore.getState().ensureBountyBoards();
    expect(useGameStore.getState().bountyBoards).toBe(before);
  });

  it('擊殺契約對象計數，加購者擲掉落時帶掉兩次取比較好；達標移除', async () => {
    useGameStore.setState({ bountyContracts: [signedWolf()] });
    await kill(wolf());
    expect(useGameStore.getState().bountyContracts[0].kills).toBe(1);
    expect(rollDropsMock.mock.calls[0][0]).toBeDefined();

    await kill(wolf({ name: '雪人' }));
    expect(useGameStore.getState().bountyContracts[0].kills).toBe(1);
    expect(rollDropsMock.mock.calls[1][0]).toBeUndefined();

    await kill(wolf());
    const state = useGameStore.getState();
    expect(state.bountyContracts).toHaveLength(0);
    expect(state.combatLogs.some(l => l.text.startsWith('懸賞契約完成'))).toBe(true);
  });

  it('組隊時暫停：不計數、不掉兩次', async () => {
    useGameStore.setState({ bountyContracts: [signedWolf()] });
    await kill(wolf(), { bountyActive: false });
    expect(useGameStore.getState().bountyContracts[0].kills).toBe(0);
    expect(rollDropsMock.mock.calls[0][0]).toBeUndefined();
  });

  it('清單、已簽契約與比較設定存進角色偏好', async () => {
    useGameStore.getState().ensureBountyBoards();
    useGameStore.setState({ bountyContracts: [signedWolf()] });
    useGameStore.getState().setBountyCompare({ affixTypes: ['crit_rate'], order: [] });
    await useGameStore.getState().flushSaveNow();
    const prefs = await repo.getCharacterPrefs(useGameStore.getState().character!.id!) as Record<string, any>;
    expect(prefs.bountyContracts).toMatchObject([{ id: 'b1' }]);
    expect(prefs.bountyBoards['neutral-town'].slots).toHaveLength(5);
    expect(prefs.bountyCompare.affixTypes).toEqual(['crit_rate']);
  });
});
