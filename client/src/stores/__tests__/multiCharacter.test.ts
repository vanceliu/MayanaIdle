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

  /** § 37.4.3：排行榜寫入密鑰。建角時本機產生，舊角色首次上傳時補發（TOFU） */
  describe('authToken', () => {
    it('建立角色時就產生密鑰，不需要連線', async () => {
      await useGameStore.getState().createCharacter('Keyed', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;

      const char = (await db.characters.get(charId))!;
      expect(char.authToken).toBeTruthy();
      // 與 uuid 是兩個不同的值：uuid 公開、密鑰機密
      expect(char.authToken).not.toBe(char.uuid);
    });

    it('每個角色的密鑰各自獨立', async () => {
      const attrs = { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 };
      await useGameStore.getState().createCharacter('A', 'knight', attrs);
      const a = (await db.characters.get(useGameStore.getState().character!.id!))!;
      await useGameStore.getState().createCharacter('B', 'knight', attrs);
      const b = (await db.characters.get(useGameStore.getState().character!.id!))!;

      expect(a.authToken).not.toBe(b.authToken);
    });

    it('ensureAuthToken 對已有密鑰的角色回傳原本那把', async () => {
      await useGameStore.getState().createCharacter('Keyed', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;
      const original = (await db.characters.get(charId))!.authToken;

      expect(await useGameStore.getState().ensureAuthToken()).toBe(original);
    });

    it('舊角色沒有密鑰時補發並寫回 DB（TOFU）', async () => {
      await useGameStore.getState().createCharacter('Legacy', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;
      // 模擬此機制上線前建立的角色
      await db.characters.update(charId, { authToken: undefined });
      useGameStore.setState({ character: { ...useGameStore.getState().character!, authToken: undefined } });

      const issued = await useGameStore.getState().ensureAuthToken();

      expect(issued).toBeTruthy();
      expect((await db.characters.get(charId))!.authToken).toBe(issued);
      expect(useGameStore.getState().character!.authToken).toBe(issued);
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
