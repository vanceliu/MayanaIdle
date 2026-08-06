import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore } from '../gameStore';
import { bagItem } from '../../testing/bagFixtures';

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

describe('Dual Warehouse System (personal + shared)', () => {
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
      personalStoredEquipment: [],
      personalStoredMaterials: [],
      scriptRules: [],
      quickSlots: [null, null, null, null, null],
      combatLogs: [],
      gameLoopId: null,
      hpRegenId: null,
      mpRegenId: null,
    });
    await useGameStore.getState().initUser();
  });

  it('shared warehouse equipment is visible to all characters', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
    const userId = useGameStore.getState().userId!;

    // Create character A
    await useGameStore.getState().createCharacter('CharA', 'knight', attrs);
    const charAId = useGameStore.getState().character!.id!;

    // Add equipment to shared warehouse via DB
    const equipId = await db.equipmentInstances.add({
      templateId: 1,
      name: '鐵劍',
      type: 'weapon',
      slot: 'rightHand',
      attackMin: 10,
      attackMax: 20,
      defense: 0,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: userId,
      equipped: false,
      inStorage: true,
      storageType: 'shared',
    } as any);

    await useGameStore.getState().logout();

    // Create character B
    await useGameStore.getState().createCharacter('CharB', 'elf', attrs);
    const charBId = useGameStore.getState().character!.id!;
    await useGameStore.getState().logout();

    // Select character B — should see shared warehouse equipment
    await useGameStore.getState().selectCharacter(charBId);
    const sharedEquip = useGameStore.getState().storedEquipment;
    expect(sharedEquip.length).toBe(1);
    expect(sharedEquip[0].name).toBe('鐵劍');

    await useGameStore.getState().logout();

    // Select character A — should also see the same shared warehouse equipment
    await useGameStore.getState().selectCharacter(charAId);
    const sharedEquipA = useGameStore.getState().storedEquipment;
    expect(sharedEquipA.length).toBe(1);
    expect(sharedEquipA[0].id).toBe(equipId);
  });

  it('personal warehouse equipment is only visible to owning character', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };

    // Create character A
    await useGameStore.getState().createCharacter('CharA', 'knight', attrs);
    const charAId = useGameStore.getState().character!.id!;

    // Add equipment to personal warehouse via DB
    await db.equipmentInstances.add({
      templateId: 1,
      name: '個人鐵劍',
      type: 'weapon',
      slot: 'rightHand',
      attackMin: 10,
      attackMax: 20,
      defense: 0,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: charAId,
      equipped: false,
      inStorage: true,
      storageType: 'personal',
    } as any);

    await useGameStore.getState().logout();

    // Create character B
    await useGameStore.getState().createCharacter('CharB', 'elf', attrs);
    const charBId = useGameStore.getState().character!.id!;
    await useGameStore.getState().logout();

    // Select character B — should NOT see personal warehouse of A
    await useGameStore.getState().selectCharacter(charBId);
    expect(useGameStore.getState().personalStoredEquipment.length).toBe(0);
    expect(useGameStore.getState().storedEquipment.length).toBe(0);

    await useGameStore.getState().logout();

    // Select character A — should see personal warehouse
    await useGameStore.getState().selectCharacter(charAId);
    const personal = useGameStore.getState().personalStoredEquipment;
    expect(personal.length).toBe(1);
    expect(personal[0].name).toBe('個人鐵劍');
  });

  it('shared warehouse materials persist across characters', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };

    // Create character A, deposit shared materials
    await useGameStore.getState().createCharacter('CharA', 'knight', attrs);
    useGameStore.setState({
      storedMaterials: [bagItem('銀礦石', 10)],
    });
    await useGameStore.getState().logout();

    // Create character B
    await useGameStore.getState().createCharacter('CharB', 'elf', attrs);
    const charBId = useGameStore.getState().character!.id!;
    await useGameStore.getState().logout();

    // Select character B — should see shared materials
    await useGameStore.getState().selectCharacter(charBId);
    expect(useGameStore.getState().storedMaterials).toContainEqual(bagItem('銀礦石', 10));
  });

  it('personal warehouse materials are character-specific', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };

    // Create character A, deposit personal materials
    await useGameStore.getState().createCharacter('CharA', 'knight', attrs);
    const charAId = useGameStore.getState().character!.id!;
    useGameStore.setState({
      personalStoredMaterials: [bagItem('破碎獸牙', 3)],
    });
    await useGameStore.getState().logout();

    // Create character B
    await useGameStore.getState().createCharacter('CharB', 'elf', attrs);
    const charBId = useGameStore.getState().character!.id!;
    await useGameStore.getState().logout();

    // Select character B — should NOT see A's personal materials
    await useGameStore.getState().selectCharacter(charBId);
    expect(useGameStore.getState().personalStoredMaterials.length).toBe(0);

    await useGameStore.getState().logout();

    // Select character A — should see personal materials
    await useGameStore.getState().selectCharacter(charAId);
    expect(useGameStore.getState().personalStoredMaterials).toContainEqual(bagItem('破碎獸牙', 3));
  });

  it('deleting character should NOT affect shared warehouse', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
    const userId = useGameStore.getState().userId!;

    await useGameStore.getState().createCharacter('ToDelete', 'knight', attrs);
    const charId = useGameStore.getState().character!.id!;

    // Put equipment in shared warehouse
    await db.equipmentInstances.add({
      templateId: 1,
      name: '共用裝備',
      type: 'weapon',
      slot: 'rightHand',
      attackMin: 5,
      attackMax: 10,
      defense: 0,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: userId,
      equipped: false,
      inStorage: true,
      storageType: 'shared',
    } as any);

    useGameStore.setState({
      storedMaterials: [bagItem('銀礦石', 5)],
      warehouseGold: 2000,
    });
    await useGameStore.getState().logout();

    // Delete character
    await useGameStore.getState().deleteCharacter(charId);

    // Verify shared warehouse data still in DB
    const warehouseRows = await db.warehouses.where('userId').equals(userId).toArray();
    expect(warehouseRows.find(r => r.type === 'gold')?.amount).toBe(2000);
    expect(warehouseRows.find(r => r.name === '銀礦石')?.amount).toBe(5);

    const sharedEquip = await db.equipmentInstances
      .where('ownerId').equals(userId)
      .filter(i => i.storageType === 'shared')
      .toArray();
    expect(sharedEquip.length).toBe(1);
  });

  it('gold is only stored in shared warehouse', async () => {
    const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };

    await useGameStore.getState().createCharacter('GoldTest', 'knight', attrs);
    const charId = useGameStore.getState().character!.id!;

    useGameStore.setState({ warehouseGold: 5000 });
    await useGameStore.getState().logout();

    await useGameStore.getState().selectCharacter(charId);
    expect(useGameStore.getState().warehouseGold).toBe(5000);
  });
});
