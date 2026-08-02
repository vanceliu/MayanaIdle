import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { CURRENT_DATA_VERSION } from '../../config';
import { purgeOutdatedData } from '../dataVersionPurge';

/**
 * 提高 CURRENT_DATA_VERSION 即淘汰所有舊角色（見 `config.ts`）。
 * 重點在附屬資料必須一起清乾淨 —— 留下孤兒列會讓新角色（相同自增 id）撿到舊角色的裝備。
 */

const OUTDATED = CURRENT_DATA_VERSION - 1;

async function addCharacter(userId: number, dataVersion: number | undefined, uuid: string) {
  const id = await db.characters.add({
    uuid, userId, name: `角色${uuid}`, className: 'knight', level: 1, exp: 0, expToNext: 100,
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
    dataVersion,
  } as Parameters<typeof db.characters.add>[0]);
  return id as number;
}

describe('dataVersionPurge', () => {
  beforeEach(async () => {
    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('清除過期角色與其裝備、背包、個人倉庫', async () => {
    const charId = await addCharacter(1, OUTDATED, 'uuid-old');
    await db.equipmentInstances.add({ templateId: 1, ownerId: charId, equipped: true, quality: 0, enhancement: 0, affixes: [] } as never);
    await db.characterBag.add({ characterId: charId, name: '紅藥水', type: 'potion', amount: 3 });
    await db.characterStorage.add({ characterId: charId, name: '鐵礦', type: 'material', amount: 1 });
    await db.warehouses.add({ userId: 1, name: '鐵礦', type: 'material', amount: 1, storageType: 'personal', characterId: charId });

    const removed = await purgeOutdatedData();

    expect(removed).toBe(1);
    expect(await db.characters.count()).toBe(0);
    expect(await db.equipmentInstances.count()).toBe(0);
    expect(await db.characterBag.count()).toBe(0);
    expect(await db.characterStorage.count()).toBe(0);
    expect(await db.warehouses.count()).toBe(0);
  });

  it('沒有 dataVersion 欄位的角色也視為過期', async () => {
    await addCharacter(1, undefined, 'uuid-none');
    expect(await purgeOutdatedData()).toBe(1);
    expect(await db.characters.count()).toBe(0);
  });

  it('版本相符的角色不受影響', async () => {
    await addCharacter(1, CURRENT_DATA_VERSION, 'uuid-new');
    expect(await purgeOutdatedData()).toBe(0);
    expect(await db.characters.count()).toBe(1);
  });

  it('帳號下所有角色都被淘汰時，共用倉庫一併清除', async () => {
    await addCharacter(1, OUTDATED, 'uuid-a');
    await addCharacter(1, OUTDATED, 'uuid-b');
    await db.warehouses.add({ userId: 1, name: 'gold', type: 'gold', amount: 9999, storageType: 'shared' });
    await db.equipmentInstances.add({ templateId: 1, ownerId: 1, inStorage: true, storageType: 'shared', equipped: false, quality: 0, enhancement: 0, affixes: [] } as never);

    await purgeOutdatedData();

    expect(await db.warehouses.count()).toBe(0);
    expect(await db.equipmentInstances.count()).toBe(0);
  });

  it('帳號還有未過期角色時，共用倉庫必須保留', async () => {
    await addCharacter(1, OUTDATED, 'uuid-old');
    await addCharacter(1, CURRENT_DATA_VERSION, 'uuid-keep');
    await db.warehouses.add({ userId: 1, name: 'gold', type: 'gold', amount: 9999, storageType: 'shared' });

    await purgeOutdatedData();

    expect(await db.characters.count()).toBe(1);
    expect(await db.warehouses.count()).toBe(1);
  });

  it('清除該角色的 localStorage 殘留，其他鍵不動', async () => {
    const charId = await addCharacter(1, OUTDATED, 'uuid-old');
    localStorage.setItem(`mayana_prefs_${charId}`, '{}');
    localStorage.setItem('mayana_stats_upload_uuid-old', '{"at":1,"sig":"x"}');
    localStorage.setItem('mayana_leaderboard_snapshot', 'keep');

    await purgeOutdatedData();

    expect(localStorage.getItem(`mayana_prefs_${charId}`)).toBeNull();
    expect(localStorage.getItem('mayana_stats_upload_uuid-old')).toBeNull();
    expect(localStorage.getItem('mayana_leaderboard_snapshot')).toBe('keep');
  });

  it('不同帳號的資料互不影響', async () => {
    await addCharacter(1, OUTDATED, 'uuid-old');
    await addCharacter(2, CURRENT_DATA_VERSION, 'uuid-other-user');
    await db.warehouses.add({ userId: 2, name: 'gold', type: 'gold', amount: 500, storageType: 'shared' });

    await purgeOutdatedData();

    expect(await db.characters.count()).toBe(1);
    expect(await db.warehouses.where('userId').equals(2).count()).toBe(1);
  });
});
