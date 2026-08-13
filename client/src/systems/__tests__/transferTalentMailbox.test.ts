import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { purgeOutdatedData } from '../dataVersionPurge';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

/*
 * 共用倉庫裝備的 ownerId 是 userId，與 characterId 撞號（§ 19.7）。
 * 不過濾就會在淘汰角色 1 時把 user 1 的整批共用倉庫刪掉。
 */
describe('資料版本淘汰（§ 19.9）', () => {
  beforeEach(async () => {
    await db.characters.clear();
    await db.equipmentInstances.clear();
    await db.talentSlots.clear();
    await db.mailbox.clear();
    localStorageMock.clear();
  });

  it('不會刪掉共用倉庫的裝備', async () => {
    await db.characters.add({ id: 1, userId: 1, name: '舊', dataVersion: 1 } as never);
    await db.equipmentInstances.add({ ownerId: 1, templateId: 1, storageType: 'shared' } as never);
    await db.equipmentInstances.add({ ownerId: 1, templateId: 2 } as never);

    await purgeOutdatedData();

    const left = await db.equipmentInstances.toArray();
    expect(left).toHaveLength(1);
    expect(left[0].storageType).toBe('shared');
  });

  it('清掉該角色的天賦格與信件', async () => {
    await db.characters.add({ id: 1, userId: 1, name: '舊', dataVersion: 1 } as never);
    await db.talentSlots.add({
      characterId: 1, tier: 1, assignedType: null, templateId: null, order: null, enabled: true,
      conditions: [null], action: null,
    });
    await db.mailbox.add({ characterId: 1, sourceKey: 'k', title: 't', items: [], createdAt: 1, claimedAt: null });

    await purgeOutdatedData();

    expect(await db.talentSlots.count()).toBe(0);
    expect(await db.mailbox.count()).toBe(0);
  });
});
