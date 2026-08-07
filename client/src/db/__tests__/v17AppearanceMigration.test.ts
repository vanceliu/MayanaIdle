import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../database';
import { resetSeedState } from '../seed';
import { CURRENT_DATA_VERSION } from '../../config';
import {
  createDefaultAppearance,
  normalizeAppearance,
  DEFAULT_APPEARANCE,
} from '../../models/appearance';

/**
 * v16 的舊角色沒有 `appearance` 欄位。升到 v17 後必須補上預設外觀 ——
 * 補不到的話那隻角色的外觀是 `undefined`，畫面上就沒有角色可畫，
 * 而且不會有任何錯誤訊息（`18-data-schema.md` § 18.7）。
 */
describe('v16 舊存檔升級到 v17（角色外觀）', () => {
  const DB_NAME = 'MayanaIdleDB';

  beforeEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    resetSeedState();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    resetSeedState();
  });

  /** 以 v16 的結構寫入兩隻沒有外觀的舊角色 */
  async function seedV16Players() {
    const legacy = new Dexie(DB_NAME);
    legacy.version(16).stores({
      characters: '++id, name, className, createdAt, userId, uuid',
      users: '++id',
      equipmentTemplates: '++id, name, type, slot, acquireType',
      equipmentInstances: '++id, templateId, ownerId, equipped',
      characterBag: '++id, characterId, name, type, itemTemplateId',
      characterStorage: '++id, characterId, name, type, itemTemplateId',
      warehouses: '++id, userId, name, type, storageType, characterId, itemTemplateId',
      warehouseGold: 'userId',
    });
    await legacy.open();

    await legacy.table('users').add({ id: 1, createdAt: 0 });
    for (const [id, name, className] of [[1, '老玩家', 'knight'], [2, '二號', 'elf']] as const) {
      await legacy.table('characters').add({
        id, uuid: `uuid-${id}`, userId: 1, name, className,
        level: 40, exp: 0, expToNext: 100, hp: 500, maxHp: 500, mp: 100, maxMp: 100,
        baseAttributes: { STR: 20, AGI: 10, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        unspentAttributePoints: 0, gold: 12345,
        currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
        currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
        dataVersion: CURRENT_DATA_VERSION,
      });
    }
    legacy.close();
  }

  it('每一隻舊角色都補到預設外觀', async () => {
    await seedV16Players();
    await db.open();

    for (const id of [1, 2]) {
      const char = await db.characters.get(id);
      expect(char!.appearance).toEqual(createDefaultAppearance());
    }
  });

  it('補上的外觀通得過驗證', async () => {
    await seedV16Players();
    await db.open();

    const appearance = (await db.characters.get(1))!.appearance;
    expect(normalizeAppearance(appearance)).toEqual(appearance);
  });

  it('兩隻角色的 tune 不是同一個物件 —— 改一隻不會動到另一隻', async () => {
    await seedV16Players();
    await db.open();

    const a = (await db.characters.get(1))!;
    a.appearance!.tune.twin = { front: 40 };
    await db.characters.put(a);

    expect((await db.characters.get(2))!.appearance!.tune).toEqual({});
  });

  it('角色的其餘欄位不受影響', async () => {
    await seedV16Players();
    await db.open();

    const char = (await db.characters.get(1))!;
    expect(char.name).toBe('老玩家');
    expect(char.gold).toBe(12345);
    expect(char.level).toBe(40);
    expect(char.uuid).toBe('uuid-1');
  });

  it('已經有外觀的角色不會被覆寫', async () => {
    await seedV16Players();
    await db.open();

    const custom = { ...DEFAULT_APPEARANCE, hair: 'twinlong' as const, tune: {} };
    await db.characters.update(1, { appearance: custom });
    db.close();
    await db.open();

    expect((await db.characters.get(1))!.appearance!.hair).toBe('twinlong');
  });
});
