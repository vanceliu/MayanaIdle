/**
 * 印記不佔背包格（`35-inventory-constraints.md` § 35.20）
 *
 * 印記走獨立分頁、完全不進格數體系，所以每個「背包已滿就擋下」的入口都要放行 ——
 * 這裡守住掉落與任務獎勵兩條會靜默丟東西的路徑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import type { DropResult } from '../../systems/drops';
import { createDefaultStatistics } from '../../models/statistics';
import { getItemId } from '../../models/items';

const rollDropsMock = vi.fn(async (): Promise<DropResult> => ({ gold: 0, items: [] }));

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: () => rollDropsMock(),
    rollBossDrops: () => rollDropsMock(),
  };
});

import { useGameStore, processMonsterDeath, waitForPendingDrops, getBagUsedSlots } from '../gameStore';
import { fillerBagItems } from '../../testing/bagFixtures';

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

const deadMonster = {
  templateId: 1,
  name: '不死殭屍王',
  level: 40,
  currentHp: -1,
  maxHp: 100,
  attackMin: 1,
  attackMax: 2,
  defense: 0,
  exp: 10,
  race: 'normal' as const,
  size: 'small' as const,
  element: 'none' as const,
  isBoss: true,
  attackType: 'melee' as const,
  attackRange: 1.5,
  attackInterval: 1000,
  _processed: false,
};

async function killMonster() {
  const char = useGameStore.getState().character!;
  const inCombat = { ...char, currentArea: 'meadow', currentRegion: 'meadow' };
  useGameStore.setState({ phase: 'combat', character: inCombat, activeEffects: [] });

  processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [{ ...deadMonster }],
    0,
    inCombat as any,
    [],
    [],
  );
  await waitForPendingDrops();
}

/** 掉落一個道具（非裝備）的假結果 */
function itemDrop(name: string, amount: number): DropResult {
  return {
    gold: 0,
    items: [{ name, type: 'scroll', amount, itemTemplateId: getItemId(name)! } as any],
  };
}

describe('印記不佔格（§ 35.20）', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    rollDropsMock.mockReset();
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
      combatLogs: [],
      activeEffects: [],
      statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('SigilTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  it('背包塞滿時，印記照樣收得到', async () => {
    // 非印記把 60 格塞滿 —— 一般道具此時會被丟棄
    useGameStore.setState({ bagItems: fillerBagItems(60), inventory: [] });
    rollDropsMock.mockResolvedValue(itemDrop('混沌印記', 2));

    await killMonster();

    const state = useGameStore.getState();
    expect(state.bagItems.find(b => b.name === '混沌印記')?.amount).toBe(2);
    expect(state.combatLogs.some(l => l.text.includes('背包已滿'))).toBe(false);
  });

  it('同一個滿背包，非印記的新道具仍然被擋', async () => {
    useGameStore.setState({ bagItems: fillerBagItems(60), inventory: [] });
    rollDropsMock.mockResolvedValue(itemDrop('薄暮村回城卷軸', 1));

    await killMonster();

    const state = useGameStore.getState();
    expect(state.bagItems.find(b => b.name === '薄暮村回城卷軸')).toBeUndefined();
    expect(state.combatLogs.some(l => l.text.includes('背包已滿'))).toBe(true);
  });

  it('收了印記之後，已用格數不變', async () => {
    useGameStore.setState({ bagItems: fillerBagItems(60), inventory: [] });
    const before = (() => {
      const s = useGameStore.getState();
      return getBagUsedSlots(s.bagItems, s.inventory, s.equippedGear);
    })();
    rollDropsMock.mockResolvedValue(itemDrop('工藝印記', 5));

    await killMonster();

    const state = useGameStore.getState();
    expect(state.bagItems.find(b => b.name === '工藝印記')?.amount).toBe(5);
    expect(getBagUsedSlots(state.bagItems, state.inventory, state.equippedGear)).toBe(before);
  });

  it('任務獎勵是印記時，背包滿了照樣交得了任務', async () => {
    const state = useGameStore.getState();
    const quest = {
      id: 'q-sigil', title: '測試', description: '', difficulty: 'D' as const,
      type: 'errand' as const, targetArea: 'meadow', targetCount: 1, currentCount: 1,
      // completeQuest 只受理 status === 'completable' 的任務
      status: 'completable' as const,
      reward: { type: 'quality-stone' as const, itemId: getItemId('工藝印記')!, amount: 3 },
      contributionPoints: 1, townId: 'dawn-village' as const,
    };
    useGameStore.setState({
      bagItems: fillerBagItems(60),
      inventory: [],
      adventurerQuests: [quest as any],
    });

    state.completeAdventurerQuest('q-sigil');

    const after = useGameStore.getState();
    expect(after.bagItems.find(b => b.name === '工藝印記')?.amount).toBe(3);
  });
});
