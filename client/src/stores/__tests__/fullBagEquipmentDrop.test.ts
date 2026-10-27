/**
 * 背包已滿時的裝備掉落（`docs/design/35-inventory-constraints.md` § 35.3.1）
 *
 * 被丟棄的裝備不可留在 DB —— 載入角色讀的是 DB，留著就會在下次載入時全部回到背包。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, resetTestDb } from '../../testing/testDb';
import type { DropResult, DroppedItem } from '../../systems/drops';
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

import {
  useGameStore, processMonsterDeath, waitForPendingDrops, planDropIntake, getBagMaxSlots, getBagUsedSlots,
} from '../gameStore';
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

/** `rollDrops` 的裝備掉落格式：實例尚未寫入 DB（無 id），另附 DB 紀錄 */
function equipmentDrop(name: string, ownerId: number): DroppedItem {
  const record = { templateId: 1, slot: 'rightHand' as const, quality: 0, enhancement: 0, affixes: [], ownerId, equipped: false };
  return {
    name,
    type: 'equipment',
    amount: 1,
    equipmentRecord: record,
    equipmentInstance: { ...record, name, type: 'sword', isTwoHanded: false } as unknown as EquipmentInstance,
  };
}

const deadMonster = {
  templateId: 1,
  name: '史萊姆',
  level: 5,
  currentHp: -1,
  maxHp: 100,
  attackMin: 1,
  attackMax: 2,
  defense: 0,
  exp: 10,
  race: 'normal' as const,
  size: 'small' as const,
  element: 'none' as const,
  isBoss: false,
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

/** 把背包塞到只剩 `free` 格 */
function fillBagLeaving(free: number) {
  const s = useGameStore.getState();
  const open = getBagMaxSlots(s.equippedGear) - getBagUsedSlots(s.bagItems, s.inventory, s.equippedGear);
  useGameStore.setState({ bagItems: [...s.bagItems, ...fillerBagItems(open - free)] });
}

async function droppedRowsOf(ownerId: number) {
  return (await db.equipmentInstances.toArray()).filter(r => r.ownerId === ownerId && r.templateId === 1 && !r.equipped);
}

describe('背包已滿時的裝備掉落', () => {
  let charId: number;

  beforeEach(async () => {
    resetTestDb();
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
      regenActive: false,
      activeEffects: [],
      statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('BagFull', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    charId = useGameStore.getState().character!.id!;
    await db.equipmentInstances.clear();
  });

  it('背包滿：裝備被丟棄，DB 不留紀錄', async () => {
    fillBagLeaving(0);
    rollDropsMock.mockResolvedValue({ gold: 0, items: [equipmentDrop('丟棄劍', charId)] });

    await killMonster();

    const state = useGameStore.getState();
    expect(state.combatLogs.some(l => l.text === '背包已滿，丟棄劍 被丟棄')).toBe(true);
    expect(state.inventory.some(e => e.name === '丟棄劍')).toBe(false);
    expect(await droppedRowsOf(charId)).toHaveLength(0);
  });

  it('有空位：收下的裝備寫入 DB，背包裡的實例帶 DB id', async () => {
    fillBagLeaving(5);
    rollDropsMock.mockResolvedValue({ gold: 0, items: [equipmentDrop('收下劍', charId)] });

    await killMonster();

    const kept = useGameStore.getState().inventory.find(e => e.name === '收下劍');
    const rows = await droppedRowsOf(charId);
    expect(rows).toHaveLength(1);
    expect(kept?.id).toBe(rows[0].id);
  });

  it('只剩 1 格掉 2 件：第一件收下、第二件丟棄，DB 只有 1 筆', async () => {
    fillBagLeaving(1);
    rollDropsMock.mockResolvedValue({
      gold: 0,
      items: [equipmentDrop('第一把', charId), equipmentDrop('第二把', charId)],
    });

    await killMonster();

    const state = useGameStore.getState();
    expect(state.inventory.some(e => e.name === '第一把')).toBe(true);
    expect(state.inventory.some(e => e.name === '第二把')).toBe(false);
    expect(await droppedRowsOf(charId)).toHaveLength(1);
  });
});

describe('planDropIntake', () => {
  const material = (itemTemplateId: number): DroppedItem =>
    ({ name: `素材${itemTemplateId}`, type: 'material', itemTemplateId, amount: 1 });

  it('依順序扣格：裝備與新種類各佔 1 格，滿了之後一律 false', () => {
    const bag = fillerBagItems(58);
    const fits = planDropIntake([equipmentDrop('A', 1), material(9001), equipmentDrop('B', 1)], bag, [], {});
    expect(fits).toEqual([true, true, false]);
  });

  it('背包已有的堆疊品不佔新格，滿了照樣收', () => {
    const bag = fillerBagItems(60);
    expect(planDropIntake([material(-1)], bag, [], {})).toEqual([true]);
  });

  it('同一批掉落中第二份同種素材不再佔格', () => {
    const bag = fillerBagItems(59);
    expect(planDropIntake([material(9001), material(9001), material(9002)], bag, [], {})).toEqual([true, true, false]);
  });
});
