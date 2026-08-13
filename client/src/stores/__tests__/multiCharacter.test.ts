import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useTalentStore } from '../talentStore';
import { STARTING_SLOT_COUNT } from '../../models/talent';
import { STARTING_LAYOUT } from '../../db/seed/talentSeeds';
import { useGameStore } from '../gameStore';
import { createDefaultAppearance, normalizeAppearance } from '../../models/appearance';

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

    /** 角色選擇畫面要列出屬性：建角配點 + Lv.51+ 配點（§ 20.10，不含裝備／buff） */
    it('summary 帶上建角配點與升級配點的合計', async () => {
      await useGameStore.getState().createCharacter('Hero1', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;
      const created = useGameStore.getState().character!;
      // 模擬 Lv.51+ 配點：bonusAttributes 也要算進角色卡的數字
      await db.characters.update(charId, {
        bonusAttributes: { ...created.bonusAttributes, VIT: created.bonusAttributes.VIT + 3 },
      });

      await useGameStore.getState().loadCharacterList();
      const summary = useGameStore.getState().characterList.find(c => c.id === charId)!;

      expect(summary.attributes.STR).toBe(created.baseAttributes.STR + created.bonusAttributes.STR);
      expect(summary.attributes.VIT).toBe(created.baseAttributes.VIT + created.bonusAttributes.VIT + 3);
    });

    it('summary 的屬性不含裝備加成', async () => {
      await useGameStore.getState().createCharacter('Geared', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;
      const created = useGameStore.getState().character!;
      const ownStr = created.baseAttributes.STR + created.bonusAttributes.STR;

      // 身上帶 +STR 裝備也不該讓角色卡的數字變動
      useGameStore.setState({
        equippedGear: { rightHand: { bonusAttributes: { STR: 5 } } },
      } as never);
      await useGameStore.getState().loadCharacterList();

      const summary = useGameStore.getState().characterList.find(c => c.id === charId)!;
      expect(summary.attributes.STR).toBe(ownStr);
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

    // 創角就要有天賦格，不是等下次載入角色才補
    it('創角時就把起始天賦裝在身上', async () => {
      await useGameStore.getState().createCharacter('Fresh', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;
      await vi.waitFor(async () => {
        expect(await db.talentSlots.where('characterId').equals(charId).count())
          .toBe(STARTING_SLOT_COUNT);
      });
      const affixes = await db.talentAffixes.where('characterId').equals(charId).toArray();
      expect(affixes).toHaveLength(STARTING_LAYOUT.length);
      // 全部鑲在天賦格上，不是躺在背包
      expect(affixes.every(a => a.slotId !== null)).toBe(true);
    });

    /* characterId 會被重用，殘留資料會被下一隻角色撿走 */
    it('刪角色時一併清掉天賦格、鑲材與信件', async () => {
      await useGameStore.getState().createCharacter('TalentDel', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
      const charId = useGameStore.getState().character!.id!;

      await useTalentStore.getState().grantStartingIfEmpty(charId);
      await db.mailbox.add({
        characterId: charId, sourceKey: 'k', title: 't', items: [],
        createdAt: 1, claimedAt: null,
      });
      expect(await db.talentSlots.where('characterId').equals(charId).count()).toBeGreaterThan(0);

      await useGameStore.getState().deleteCharacter(charId);

      expect(await db.talentSlots.where('characterId').equals(charId).count()).toBe(0);
      expect(await db.talentAffixes.where('characterId').equals(charId).count()).toBe(0);
      expect(await db.mailbox.where('characterId').equals(charId).count()).toBe(0);
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

  /**
   * 外觀（`04-character.md` § 4.10）跟著角色列走。
   * 建角時沒寫進去的話，後面的匯出、封存、畫面全都拿不到 ——
   * 而且不會有任何錯誤，只是每個人長一樣。
   */
  describe('角色外觀', () => {
    it('建角時把選好的外觀寫進角色列', async () => {
      await useGameStore.getState().initUser();
      const appearance = {
        ...createDefaultAppearance(),
        hair: 'braid' as const,
        skin: '#7c4f2c',
        eyeColor: '#e3c765',
        lash: { on: 1 as const, len: 22, curl: 16, w: 60 },
        tune: { braid: { front: 40 } },
      };

      await useGameStore.getState().createCharacter(
        '造型師', 'thief',
        { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        appearance,
      );

      const rows = await db.characters.toArray();
      expect(rows.at(-1)!.appearance).toEqual(appearance);
    });

    it('沒指定外觀時給預設值，不是 undefined —— 沒有外觀就畫不出角色', async () => {
      await useGameStore.getState().initUser();
      await useGameStore.getState().createCharacter(
        '路人', 'knight',
        { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      );

      const row = (await db.characters.toArray()).at(-1)!;
      expect(row.appearance).toEqual(createDefaultAppearance());
    });

    it('外觀壞掉時收成合法值再寫進去，不讓壞資料進 DB', async () => {
      await useGameStore.getState().initUser();
      await useGameStore.getState().createCharacter(
        '怪咖', 'elf',
        { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        { hair: 'afro', skin: 'red', lash: { on: 1, len: 9999 } } as never,
      );

      const appearance = (await db.characters.toArray()).at(-1)!.appearance!;
      expect(normalizeAppearance(appearance)).toEqual(appearance);
      expect(appearance.hair).toBe(createDefaultAppearance().hair);
      expect(appearance.lash.len).toBe(34);
    });

    it('兩隻角色的外觀互相獨立', async () => {
      await useGameStore.getState().initUser();
      const attrs = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
      await useGameStore.getState().createCharacter('甲', 'knight', attrs);
      await useGameStore.getState().createCharacter('乙', 'thief', attrs);

      const rows = await db.characters.toArray();
      const [a, b] = rows.slice(-2);
      a.appearance!.tune.twin = { front: 60 };
      await db.characters.put(a);

      expect((await db.characters.get(b.id!))!.appearance!.tune).toEqual({});
    });
  });

});
