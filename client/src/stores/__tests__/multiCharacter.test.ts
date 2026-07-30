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

describe('Multi-character system', () => {
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

  describe('initUser', () => {
    it('should create a user on first call', () => {
      expect(useGameStore.getState().userId).not.toBeNull();
      expect(useGameStore.getState().userId).toBeGreaterThan(0);
    });

    it('should return same user on subsequent calls', async () => {
      const firstId = useGameStore.getState().userId;
      await useGameStore.getState().initUser();
      expect(useGameStore.getState().userId).toBe(firstId);
    });
  });

  describe('loadCharacterList', () => {
    it('should return empty list when no characters exist', async () => {
      await useGameStore.getState().loadCharacterList();
      expect(useGameStore.getState().characterList).toHaveLength(0);
      expect(useGameStore.getState().phase).toBe('characterSelect');
    });

    it('should list created characters', async () => {
      await useGameStore.getState().createCharacter('Hero1', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      await useGameStore.getState().createCharacter('Hero2', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      await useGameStore.getState().loadCharacterList();

      const list = useGameStore.getState().characterList;
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('Hero1');
      expect(list[1].name).toBe('Hero2');
    });
  });

  describe('createCharacter', () => {
    it('should set userId on character', async () => {
      await useGameStore.getState().createCharacter('TestChar', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const char = useGameStore.getState().character;
      expect(char).not.toBeNull();
      expect(char!.userId).toBe(useGameStore.getState().userId);
    });

    it('should enforce max 4 characters', async () => {
      const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
      await useGameStore.getState().createCharacter('C1', 'knight', attrs);
      await useGameStore.getState().createCharacter('C2', 'elf', attrs);
      await useGameStore.getState().createCharacter('C3', 'thief', attrs);
      await useGameStore.getState().createCharacter('C4', 'priest', attrs);

      // 5th character should be blocked
      await useGameStore.getState().createCharacter('C5', 'elementalist', attrs);
      const count = await db.characters.where('userId').equals(useGameStore.getState().userId!).count();
      expect(count).toBe(4);
    });
  });

  describe('selectCharacter', () => {
    it('should load character data and set phase to explore', async () => {
      await useGameStore.getState().createCharacter('SelectMe', 'thief', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;

      // Simulate logout
      useGameStore.setState({ character: null, phase: 'characterSelect' });

      await useGameStore.getState().selectCharacter(charId);
      expect(useGameStore.getState().character).not.toBeNull();
      expect(useGameStore.getState().character!.name).toBe('SelectMe');
      expect(useGameStore.getState().phase).toBe('explore');
    });
  });

  describe('deleteCharacter', () => {
    it('should remove character and update list', async () => {
      await useGameStore.getState().createCharacter('ToDelete', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;

      await useGameStore.getState().deleteCharacter(charId);
      const list = useGameStore.getState().characterList;
      expect(list).toHaveLength(0);

      const dbChar = await db.characters.get(charId);
      expect(dbChar).toBeUndefined();
    });

    it('should not affect warehouse when deleting character', async () => {
      await useGameStore.getState().createCharacter('WareTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;

      // Deposit gold to warehouse
      useGameStore.setState({ warehouseGold: 500 });

      await useGameStore.getState().deleteCharacter(charId);
      expect(useGameStore.getState().warehouseGold).toBe(500);
    });
  });

  describe('logout', () => {
    it('should save state and return to character select', async () => {
      await useGameStore.getState().createCharacter('LogoutTest', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      expect(useGameStore.getState().phase).toBe('explore');

      await useGameStore.getState().logout();
      expect(useGameStore.getState().phase).toBe('characterSelect');
      expect(useGameStore.getState().character).toBeNull();
      expect(useGameStore.getState().characterList).toHaveLength(1);
    });
  });
});
