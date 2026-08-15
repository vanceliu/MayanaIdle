/**
 * 交付型任務的交付流程（`36-quest-system.md` § 36.11）
 *
 * 交付型不累積進度，可交付與否看當下背包；按下交付才扣除。
 * 這裡守的是「扣了東西卻沒給獎勵」與「沒扣東西就給獎勵」兩個方向。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { createDefaultStatistics } from '../../models/statistics';
import { makeBagItem, getBagItemAmount } from '../../models/bagItem';
import type { AdventurerQuest } from '../../models/adventurerQuest';

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

import { useGameStore } from '../gameStore';

/** 破碎獸牙（id 19）交 5 個，換 210 金幣 */
function deliverQuest(overrides: Partial<AdventurerQuest> = {}): AdventurerQuest {
  return {
    id: 'deliver-1',
    type: 'deliver',
    difficulty: 'D',
    status: 'active',
    title: '工坊補給',
    description: '請交出 **破碎獸牙** **5 個**。',
    targetArea: '',
    targetItemId: 19,
    targetCount: 5,
    currentCount: 0,
    reward: { type: 'gold', amount: 210 },
    contributionPoints: 23,
    ...overrides,
  };
}

describe('交付型任務的交付（§ 36.11）', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({
      phase: 'title',
      userId: null,
      characterList: [],
      character: null,
      equippedGear: {},
      inventory: [],
      bagItems: [],
      skills: [],
      combatLogs: [],
      activeEffects: [],
      adventurerQuests: [],
      guildProgress: { rank: 'F', points: 0 },
      statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('DeliverTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('背包足量：扣掉交出去的數量、拿到獎勵與貢獻', () => {
    const goldBefore = useGameStore.getState().character!.gold;
    useGameStore.setState({
      adventurerQuests: [deliverQuest()],
      bagItems: [makeBagItem(19, 7)!],
    });

    useGameStore.getState().completeAdventurerQuest('deliver-1');

    const state = useGameStore.getState();
    expect(getBagItemAmount(state.bagItems, 19)).toBe(2);
    expect(state.character!.gold).toBe(goldBefore + 210);
    expect(state.guildProgress.points).toBe(23);
    expect(state.adventurerQuests).toHaveLength(0);
  });

  it('背包不足：不扣、不給、任務留著', () => {
    const goldBefore = useGameStore.getState().character!.gold;
    useGameStore.setState({
      adventurerQuests: [deliverQuest()],
      bagItems: [makeBagItem(19, 4)!],
    });

    useGameStore.getState().completeAdventurerQuest('deliver-1');

    const state = useGameStore.getState();
    expect(getBagItemAmount(state.bagItems, 19)).toBe(4);
    expect(state.character!.gold).toBe(goldBefore);
    expect(state.guildProgress.points).toBe(0);
    expect(state.adventurerQuests).toHaveLength(1);
  });

  it('交付印記：交出精鍊印記換到突破印記', () => {
    useGameStore.setState({
      adventurerQuests: [deliverQuest({
        id: 'sigil-1',
        type: 'sigil',
        difficulty: 'S',
        targetItemId: 10,
        targetCount: 50,
        reward: { type: 'breakthrough-sigil', itemId: 150, amount: 1 },
      })],
      bagItems: [makeBagItem(10, 50)!],
    });

    useGameStore.getState().completeAdventurerQuest('sigil-1');

    const state = useGameStore.getState();
    expect(getBagItemAmount(state.bagItems, 10)).toBe(0);
    expect(getBagItemAmount(state.bagItems, 150)).toBe(1);
    expect(state.adventurerQuests).toHaveLength(0);
  });
});
