/**
 * T7 掉落統計（`docs/design/37-statistics.md` § 37.1、§ 37.3）
 *
 * 兩件事必須守住：
 * 1. 武器／防具依**裝備類型**分計 —— 盾牌／魔導書／臂甲佔手部欄位但算防具
 * 2. 背包滿而被丟棄的 T7 **仍然計數** —— 記錄的是運氣，不是持有數
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import type { DropResult } from '../../systems/drops';
import type { EquipmentInstance } from '../../models/equipment';
import { createDefaultStatistics } from '../../models/statistics';

const rollDropsMock = vi.fn(async (): Promise<DropResult> => ({ gold: 0, items: [] }));

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

function makeInstance(overrides: Partial<EquipmentInstance>): EquipmentInstance {
  return {
    id: 1,
    templateId: 1,
    name: '測試裝備',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: false,
    ...overrides,
  } as EquipmentInstance;
}

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

/** 觸發一次「怪物死亡 → 掉落 → 統計」的完整流程 */
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

describe('T7 掉落統計', () => {
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
      scriptRules: [],
      quickSlots: [null, null, null, null, null],
      combatLogs: [],
      gameLoopId: null,
      hpRegenId: null,
      mpRegenId: null,
      activeEffects: [],
      statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('T7Test', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    useGameStore.setState({ statistics: createDefaultStatistics() });
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  it('T7 武器計入 tier7WeaponsLooted', async () => {
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [{
        name: '終焉巨劍', type: 'equipment', amount: 1, equipmentTier: 7,
        equipmentInstance: makeInstance({ name: '終焉巨劍', type: 'twoHandSword', slot: 'rightHand', isTwoHanded: true }),
      }],
    });

    await killMonster();

    const stats = useGameStore.getState().statistics;
    expect(stats.tier7WeaponsLooted).toBe(1);
    expect(stats.tier7ArmorsLooted).toBe(0);
  });

  it('T7 盾牌／魔導書／臂甲雖佔手部欄位，計入 tier7ArmorsLooted', async () => {
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [
        { name: 'T7 盾', type: 'equipment', amount: 1, equipmentTier: 7,
          equipmentInstance: makeInstance({ id: 1, name: 'T7 盾', type: 'shield', slot: 'leftHand' }) },
        { name: 'T7 魔導書', type: 'equipment', amount: 1, equipmentTier: 7,
          equipmentInstance: makeInstance({ id: 2, name: 'T7 魔導書', type: 'magicBook', slot: 'leftHand' }) },
        { name: 'T7 臂甲', type: 'equipment', amount: 1, equipmentTier: 7,
          equipmentInstance: makeInstance({ id: 3, name: 'T7 臂甲', type: 'armGuard', slot: 'leftHand' }) },
      ],
    });

    await killMonster();

    const stats = useGameStore.getState().statistics;
    expect(stats.tier7ArmorsLooted).toBe(3);
    expect(stats.tier7WeaponsLooted).toBe(0);
  });

  it('T7 身體防具計入 tier7ArmorsLooted', async () => {
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [{
        name: 'T7 鎧甲', type: 'equipment', amount: 1, equipmentTier: 7,
        equipmentInstance: makeInstance({ name: 'T7 鎧甲', type: 'armor' as any, slot: 'chest' }),
      }],
    });

    await killMonster();

    expect(useGameStore.getState().statistics.tier7ArmorsLooted).toBe(1);
  });

  it('T6 以下不計數', async () => {
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [{
        name: 'T6 劍', type: 'equipment', amount: 1, equipmentTier: 6,
        equipmentInstance: makeInstance({ name: 'T6 劍' }),
      }],
    });

    await killMonster();

    const stats = useGameStore.getState().statistics;
    expect(stats.tier7WeaponsLooted).toBe(0);
    expect(stats.tier7ArmorsLooted).toBe(0);
  });

  it('背包滿而被丟棄的 T7 仍然計數', async () => {
    // 基礎 50 格，塞滿 60 種素材確保容量已滿
    useGameStore.setState({
      bagItems: Array.from({ length: 60 }, (_, i) => ({ name: `素材${i}`, type: 'material' as const, amount: 1 })),
    });
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [{
        name: '終焉巨劍', type: 'equipment', amount: 1, equipmentTier: 7,
        equipmentInstance: makeInstance({ name: '終焉巨劍', type: 'twoHandSword', slot: 'rightHand', isTwoHanded: true }),
      }],
    });

    await killMonster();

    const state = useGameStore.getState();
    expect(state.combatLogs.some(l => l.text.includes('背包已滿'))).toBe(true);
    expect(state.inventory.some(e => e.name === '終焉巨劍')).toBe(false);
    expect(state.statistics.tier7WeaponsLooted).toBe(1);
  });
});
