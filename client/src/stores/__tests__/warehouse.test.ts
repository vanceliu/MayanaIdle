import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore } from '../gameStore';

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

describe('Warehouse (account-level storage)', () => {
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

  it('should share warehouse across characters', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };

    // Create character A
    await useGameStore.getState().createCharacter('CharA', 'knight', attrs);
    useGameStore.getState().character!.id!;

    // Deposit materials and gold into warehouse, then logout (saves to DB)
    useGameStore.setState({
      storedMaterials: [{ name: '鐵礦石', type: 'material', amount: 5 }],
      warehouseGold: 1000,
    });
    await useGameStore.getState().logout();

    // Create character B
    await useGameStore.getState().createCharacter('CharB', 'elf', attrs);
    const charBId = useGameStore.getState().character!.id!;
    await useGameStore.getState().logout();

    // Select character B — warehouse should be shared (loaded from DB by userId)
    await useGameStore.getState().selectCharacter(charBId);
    expect(useGameStore.getState().warehouseGold).toBe(1000);
    expect(useGameStore.getState().storedMaterials).toContainEqual({ name: '鐵礦石', type: 'material', amount: 5 });
  });

  it('should persist warehouse gold through save/load', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
    await useGameStore.getState().createCharacter('GoldTest', 'knight', attrs);
    const charId = useGameStore.getState().character!.id!;

    useGameStore.setState({ warehouseGold: 2500 });
    await useGameStore.getState().logout();

    // Re-select same character
    await useGameStore.getState().selectCharacter(charId);
    expect(useGameStore.getState().warehouseGold).toBe(2500);
  });

  it('should not delete warehouse when character is deleted', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
    await useGameStore.getState().createCharacter('Deletable', 'knight', attrs);
    const charId = useGameStore.getState().character!.id!;

    // Set warehouse state and save
    useGameStore.setState({ warehouseGold: 3000 });
    await useGameStore.getState().logout();

    // Delete the character
    await useGameStore.getState().deleteCharacter(charId);

    // Verify warehouse still in DB
    const userId = useGameStore.getState().userId!;
    const rows = await db.warehouses.where('userId').equals(userId).toArray();
    const goldRow = rows.find(r => r.type === 'gold');
    expect(goldRow).toBeDefined();
    expect(goldRow!.amount).toBe(3000);
  });
});
