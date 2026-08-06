import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../database';

/**
 * Dexie v16：共用倉庫金幣從 `warehouses` 搬到獨立的 `warehouseGold` 表。
 *
 * `18-data-schema.md` § 18.7 本來就寫「倉庫另有獨立金幣存放欄位」——
 * 實作把它做成 `warehouses` 裡 `type: 'gold'` 的一列，這次是讓實作對齊設計。
 */
describe('倉庫金幣獨立成表的遷移（Dexie v16）', () => {
  const DB_NAME = 'MayanaIdleDB';

  beforeEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
  });

  /** 以 v15 的結構寫入舊資料，再讓正式的 `db` 跑升級 */
  async function seedV15Warehouses(rows: Record<string, unknown>[]) {
    const legacy = new Dexie(DB_NAME);
    legacy.version(15).stores({
      characterBag: '++id, characterId, name, type, itemTemplateId',
      characterStorage: '++id, characterId, name, type, itemTemplateId',
      warehouses: '++id, userId, name, type, storageType, characterId, itemTemplateId',
    });
    await legacy.open();
    await legacy.table('warehouses').bulkAdd(rows);
    legacy.close();
  }

  it('金幣列搬進 warehouseGold 並從 warehouses 移除', async () => {
    await seedV15Warehouses([
      { userId: 1, name: 'gold', type: 'gold', amount: 12345, storageType: 'shared' },
      { userId: 1, name: '銀礦石', type: 'material', itemTemplateId: 11, amount: 3, storageType: 'shared' },
    ]);

    await db.open();

    expect((await db.warehouseGold.get(1))?.amount).toBe(12345);
    const rows = await db.warehouses.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('銀礦石');
  });

  /**
   * 存檔路徑是「整批刪掉再重寫」，中途失敗會留下重複的金幣列。
   * 遷移必須**相加** —— 取第一列會在這種資料上靜默吃掉玩家的錢。
   */
  it('同一帳號有多列金幣時相加，不取第一列', async () => {
    await seedV15Warehouses([
      { userId: 1, name: 'gold', type: 'gold', amount: 500, storageType: 'shared' },
      { userId: 1, name: 'gold', type: 'gold', amount: 700, storageType: 'shared' },
    ]);

    await db.open();

    expect((await db.warehouseGold.get(1))?.amount).toBe(1200);
    expect(await db.warehouses.count()).toBe(0);
  });

  it('不同帳號的金幣各自獨立', async () => {
    await seedV15Warehouses([
      { userId: 1, name: 'gold', type: 'gold', amount: 100, storageType: 'shared' },
      { userId: 2, name: 'gold', type: 'gold', amount: 200, storageType: 'shared' },
    ]);

    await db.open();

    expect((await db.warehouseGold.get(1))?.amount).toBe(100);
    expect((await db.warehouseGold.get(2))?.amount).toBe(200);
  });

  it('沒有金幣列時不建立任何 warehouseGold 列', async () => {
    await seedV15Warehouses([
      { userId: 1, name: '銀礦石', type: 'material', itemTemplateId: 11, amount: 3, storageType: 'shared' },
    ]);

    await db.open();

    expect(await db.warehouseGold.count()).toBe(0);
    expect(await db.warehouses.count()).toBe(1);
  });
});
