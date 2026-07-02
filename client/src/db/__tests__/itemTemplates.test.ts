import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database';
import { seedDatabase, resetSeedState, ITEM_DEFINITIONS } from '../seed';
import { getItemById, getItemDefinition } from '../../models/items';

describe('itemTemplates', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
  });

  describe('seed 正確性', () => {
    it('DB itemTemplates 數量與 ITEM_DEFINITIONS 一致', async () => {
      const dbCount = await db.itemTemplates.count();
      expect(dbCount).toBe(ITEM_DEFINITIONS.length);
    });

    it('所有 ITEM_DEFINITIONS 都已寫入 DB', async () => {
      const dbItems = await db.itemTemplates.toArray();
      const dbIds = new Set(dbItems.map(t => t.id));
      for (const def of ITEM_DEFINITIONS) {
        expect(dbIds.has(def.id), `id ${def.id} (${def.name}) not in DB`).toBe(true);
      }
    });

    it('DB 中的資料與 ITEM_DEFINITIONS 完全一致', async () => {
      for (const def of ITEM_DEFINITIONS) {
        const dbItem = await db.itemTemplates.get(def.id);
        expect(dbItem).toBeDefined();
        expect(dbItem!.name).toBe(def.name);
        expect(dbItem!.category).toBe(def.category);
      }
    });
  });

  describe('id 唯一性', () => {
    it('ITEM_DEFINITIONS 中所有 id 不重複', () => {
      const ids = ITEM_DEFINITIONS.map(d => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('ITEM_DEFINITIONS 中所有 name 不重複', () => {
      const names = ITEM_DEFINITIONS.map(d => d.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('lookup 正確性', () => {
    it('getItemById 能正確查到每筆道具', () => {
      for (const def of ITEM_DEFINITIONS) {
        const result = getItemById(def.id);
        expect(result).toBeDefined();
        expect(result!.name).toBe(def.name);
        expect(result!.category).toBe(def.category);
      }
    });

    it('getItemDefinition (by name) 能正確查到每筆道具', () => {
      for (const def of ITEM_DEFINITIONS) {
        const result = getItemDefinition(def.name);
        expect(result).toBeDefined();
        expect(result!.id).toBe(def.id);
      }
    });

    it('getItemById 對不存在的 id 回傳 undefined', () => {
      expect(getItemById(99999)).toBeUndefined();
    });

    it('getItemDefinition 對不存在的 name 回傳 undefined', () => {
      expect(getItemDefinition('不存在的道具')).toBeUndefined();
    });
  });
});
