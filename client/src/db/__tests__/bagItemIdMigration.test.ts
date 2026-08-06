import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../database';
import { getItemById } from '../../models/items';

/**
 * Dexie v15：背包／倉庫改以 `itemTemplateId` 為鍵（`99-ai-constraints.md` § 99.1）。
 *
 * 規格（使用者決策）：**只有名稱、沒有 id 的舊列直接廢棄**，不做名稱回填。
 * 有 id 的列則對齊 seed，把 `name` 與 `type` 重寫成當下的值。
 */
describe('背包改以道具 id 為鍵的遷移（Dexie v15）', () => {
  const DB_NAME = 'MayanaIdleDB';

  beforeEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
  });

  /** 以 v14 的結構寫入舊資料，再讓正式的 `db` 跑升級 */
  async function seedLegacyRows(rows: Record<string, unknown>[]) {
    const legacy = new Dexie(DB_NAME);
    legacy.version(14).stores({
      characterBag: '++id, characterId, name, type',
      characterStorage: '++id, characterId, name, type',
      warehouses: '++id, userId, name, type, storageType, characterId',
    });
    await legacy.open();
    await legacy.table('characterBag').bulkAdd(rows);
    legacy.close();
  }

  it('沒有 itemTemplateId 的舊列直接廢棄', async () => {
    await seedLegacyRows([
      { characterId: 1, name: '紅色藥水', type: 'potion', amount: 5 },
      { characterId: 1, name: '銀礦石', type: 'material', itemTemplateId: 11, amount: 3 },
    ]);

    await db.open();
    const rows = await db.characterBag.where('characterId').equals(1).toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0].itemTemplateId).toBe(11);
  });

  it('id 已不在 seed 的列也廢棄', async () => {
    await seedLegacyRows([
      { characterId: 2, name: '早就刪掉的道具', type: 'material', itemTemplateId: 99999, amount: 1 },
    ]);

    await db.open();
    expect(await db.characterBag.where('characterId').equals(2).count()).toBe(0);
  });

  it('有 id 的列把名稱與分類對齊 seed（清掉舊名與錯誤分類）', async () => {
    // 精鍊印記（id 10）在 v14 之前叫「強化石」且歸類 material
    await seedLegacyRows([
      { characterId: 3, name: '強化石', type: 'material', itemTemplateId: 10, amount: 4 },
    ]);

    await db.open();
    const [row] = await db.characterBag.where('characterId').equals(3).toArray();

    expect(row.itemTemplateId).toBe(10);
    expect(row.name).toBe(getItemById(10)!.name);
    expect(row.type).toBe('scroll');
    expect(row.amount).toBe(4);
  });

  it('倉庫的金幣列不受影響（沒有對應道具）', async () => {
    const legacy = new Dexie(DB_NAME);
    legacy.version(14).stores({
      characterBag: '++id, characterId, name, type',
      characterStorage: '++id, characterId, name, type',
      warehouses: '++id, userId, name, type, storageType, characterId',
    });
    await legacy.open();
    await legacy.table('warehouses').add({
      userId: 1, name: 'gold', type: 'gold', amount: 12345, storageType: 'shared',
    });
    legacy.close();

    await db.open();
    const rows = await db.warehouses.where('userId').equals(1).toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(12345);
  });
});
