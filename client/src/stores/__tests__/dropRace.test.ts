import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore } from '../gameStore';
import type { BagItem } from '../gameStore';
import { bagItem, bagItemById } from '../../testing/bagFixtures';

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

describe('Multi-monster drop race condition', () => {
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
      storedEquipment: [],
      storedMaterials: [],
      warehouseGold: 0,
      scriptRules: [],
      quickSlots: [null, null, null, null, null],
      combatLogs: [],
      gameLoopId: null,
      hpRegenId: null,
      mpRegenId: null,
    });
    await useGameStore.getState().initUser();
  });

  it('should accumulate drops from multiple monsters without losing items', async () => {
    await useGameStore.getState().createCharacter('DropTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);

    // Simulate the dropQueue pattern used in combat.
    // Two monsters die — each produces drops that must be applied sequentially.
    interface DropResult {
      gold: number;
      items: { itemTemplateId?: number; name: string; type: string; amount: number }[];
    }

    /** 掉落物帶的是 `itemTemplateId`（`systems/drops.ts` 的格式），不是背包格 */
    const asDrop = (item: ReturnType<typeof bagItem>) =>
      ({ itemTemplateId: item.itemId, name: item.name, type: item.type, amount: item.amount });

    const monster1Drops: DropResult = {
      gold: 1000,
      items: [asDrop(bagItem('工藝印記', 2)), asDrop(bagItem('紅色藥水', 1))],
    };

    const monster2Drops: DropResult = {
      gold: 2000,
      items: [asDrop(bagItem('工藝印記', 3)), asDrop(bagItem('精鍊印記', 1))],
    };

    function applyDrops(drops: DropResult) {
      const state2 = get();
      if (!state2.character) return;
      let char2 = { ...state2.character };
      const newBag: BagItem[] = state2.bagItems.map(b => ({ ...b }));

      char2.gold += drops.gold;
      for (const item of drops.items) {
        if (item.type === 'potion' || item.type === 'material' || item.type === 'scroll') {
          const existing = newBag.find(b => b.itemId === item.itemTemplateId);
          if (existing) existing.amount += item.amount;
          else if (item.itemTemplateId != null) newBag.push(bagItemById(item.itemTemplateId, item.amount));
        }
      }

      set({ character: char2, bagItems: newBag });
    }

    // Queued processing (correct behavior)
    let dropQueue: Promise<void> = Promise.resolve();

    dropQueue = dropQueue.then(async () => {
      await Promise.resolve(); // simulate async rollDrops
      applyDrops(monster1Drops);
    });

    dropQueue = dropQueue.then(async () => {
      await Promise.resolve(); // simulate async rollDrops
      applyDrops(monster2Drops);
    });

    await dropQueue;

    const state = get();

    // Gold: 100 (starting) + 1000 (monster1) + 2000 (monster2) = 3100
    expect(state.character!.gold).toBe(3100);

    // 工藝印記: 2 (monster1) + 3 (monster2) = 5
    const qualityStone = state.bagItems.find(b => b.name === '工藝印記');
    expect(qualityStone).toBeDefined();
    expect(qualityStone!.amount).toBe(5);

    // 精鍊印記: 1 (monster2 only)
    const enhanceStone = state.bagItems.find(b => b.name === '精鍊印記');
    expect(enhanceStone).toBeDefined();
    expect(enhanceStone!.amount).toBe(1);

    // 紅色藥水: 10 (initial from createCharacter) + 1 (from monster1 drop) = 11
    const redPotion = state.bagItems.find(b => b.name === '紅色藥水');
    expect(redPotion).toBeDefined();
    expect(redPotion!.amount).toBe(11);
  });

  it('should lose items if drops are NOT queued (demonstrates the bug)', async () => {
    await useGameStore.getState().createCharacter('RaceTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);

    const monster1Drops = {
      gold: 1000,
      items: [bagItem('工藝印記', 2)],
    };

    const monster2Drops = {
      gold: 2000,
      items: [bagItem('工藝印記', 3)],
    };

    // Non-queued (parallel) processing — simulates the old broken behavior
    // Both read the same snapshot BEFORE either writes
    const snapshot1 = get();
    const snapshot2 = get();

    // Monster 1 applies on snapshot1
    const char1 = { ...snapshot1.character!, gold: snapshot1.character!.gold + monster1Drops.gold };
    const bag1: BagItem[] = snapshot1.bagItems.map(b => ({ ...b }));
    bag1.push(bagItem('工藝印記', 2));

    // Monster 2 applies on snapshot2 (same stale state!)
    const char2 = { ...snapshot2.character!, gold: snapshot2.character!.gold + monster2Drops.gold };
    const bag2: BagItem[] = snapshot2.bagItems.map(b => ({ ...b }));
    bag2.push(bagItem('工藝印記', 3));

    // Both write — second one wins, first is lost
    set({ character: char1, bagItems: bag1 });
    set({ character: char2, bagItems: bag2 });

    const state = get();
    // Bug: gold is only 2100 instead of 3100 (monster1's gold lost)
    expect(state.character!.gold).toBe(2100);
    // Bug: 品質石 is only 3 instead of 5 (monster1's drops lost)
    expect(state.bagItems.find(b => b.name === '工藝印記')!.amount).toBe(3);
  });
});
