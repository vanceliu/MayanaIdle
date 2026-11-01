/**
 * 怪物強化詞綴的擊殺獎勵（`25-monster-system.md` § 25.12.4）：
 * 掉落倍率乘在掉寶倍率；金幣與經驗倍率乘在金幣與經驗；日誌怪物名寫「詞綴 原名」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import type { DropBonuses, DropResult } from '../../systems/drops';
import type { MonsterInstance } from '../../models/monster';
import { createDefaultStatistics } from '../../models/statistics';

const rollDropsMock = vi.fn(async (_bonuses?: DropBonuses): Promise<DropResult> => ({ gold: 0, items: [] }));

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: (_area: string, _owner: number, bonuses?: DropBonuses) => rollDropsMock(bonuses),
    rollBossDrops: (_name: string, _owner: number, _level: number, bonuses?: DropBonuses) => rollDropsMock(bonuses),
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

function makeMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 10, currentHp: 0, maxHp: 100,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1000,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

async function kill(monster: MonsterInstance) {
  const char = useGameStore.getState().character!;
  const result = processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [monster], 0, { ...char }, [], [],
  );
  await waitForPendingDrops();
  return result;
}

function expGained(logs: { text: string }[]): number {
  const line = logs.find(l => /^獲得 \d+ 經驗值$/.test(l.text));
  return Number(line!.text.match(/\d+/)![0]);
}

describe('強化詞綴的擊殺獎勵', () => {
  beforeEach(async () => {
    resetTestDb();
    rollDropsMock.mockClear();
    useGameStore.setState({
      phase: 'title', userId: null, characterList: [], character: null,
      equippedGear: {}, inventory: [], bagItems: [], skills: [],
      combatLogs: [], activeEffects: [], statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('AffixReward', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    useGameStore.setState({ phase: 'combat', activeEffects: [] });
  });

  afterEach(async () => {
    await waitForPendingDrops();
  });

  it('經驗乘上金幣與經驗倍率', async () => {
    const plain = expGained((await kill(makeMonster())).logs);
    const affixed = expGained((await kill(makeMonster({ affixes: ['giant', 'regen', 'gale', 'thorns'] }))).logs);
    expect(affixed).toBe(Math.floor(plain * 1.1));
  });

  it('掉寶與金幣倍率帶給掉落擲骰', async () => {
    await kill(makeMonster({ affixes: ['giant'] }));
    expect(rollDropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ affix_drop_mult: 1.25, affix_gold_mult: 1.05 }));
    await kill(makeMonster({ affixes: ['giant', 'regen', 'gale', 'thorns'] }));
    expect(rollDropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ affix_drop_mult: 2, affix_gold_mult: 1.1 }));
    await kill(makeMonster());
    expect(rollDropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ affix_drop_mult: 1, affix_gold_mult: 1 }));
  });

  it('擊敗日誌寫「詞綴 原名」', async () => {
    const result = await kill(makeMonster({ affixes: ['venom'], venom: 'bleed' }));
    expect(result.logs.some(l => l.text === '撕裂 哥布林 被擊敗！')).toBe(true);
  });
});
