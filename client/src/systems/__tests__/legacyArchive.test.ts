import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { CURRENT_DATA_VERSION } from '../../config';
import { purgeOutdatedData } from '../dataVersionPurge';
import { listArchives, parseCharacterPayload, parseSharedWarehousePayload, deleteArchive } from '../legacyArchive';
import { loadTemplateCache } from '../templateSync';

/**
 * 遺產封存（§ 45）：被 dataVersion 淘汰的角色必須先轉成純文字快照才刪除。
 */

const OUTDATED = CURRENT_DATA_VERSION - 1;

async function addOutdatedCharacter(userId = 1, name = '老兵') {
  return await db.characters.add({
    uuid: 'uuid-legacy', userId, name, className: 'knight', level: 42, exp: 500, expToNext: 900,
    hp: 250, maxHp: 300, mp: 40, maxMp: 50,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 4, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 2, gold: 12345,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [{ id: 'wind_blade', name: '風刃', level: 3 }],
    quests: [], areaEnteredAt: 0, createdAt: 1000,
    dataVersion: OUTDATED,
  } as unknown as Parameters<typeof db.characters.add>[0]) as number;
}

describe('遺產封存', () => {
  beforeEach(async () => {
    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('淘汰角色前會寫入快照，且原資料被刪除', async () => {
    await addOutdatedCharacter();

    await purgeOutdatedData();

    expect(await db.characters.count()).toBe(0);
    const archives = await listArchives(1);
    expect(archives).toHaveLength(1);
    expect(archives[0].label).toBe('老兵');
    expect(archives[0].level).toBe(42);
    expect(archives[0].dataVersion).toBe(OUTDATED);
  });

  it('payload 存成字串而非物件（型別脫鉤）', async () => {
    await addOutdatedCharacter();
    await purgeOutdatedData();

    const [archive] = await listArchives(1);
    expect(typeof archive.payload).toBe('string');
  });

  it('快照包含角色完整狀態與已學習技能', async () => {
    const charId = await addOutdatedCharacter();
    await db.characterBag.add({ characterId: charId, name: '紅藥水', type: 'potion', amount: 7 });
    await db.characterStorage.add({ characterId: charId, name: '鐵礦', type: 'material', amount: 3 });
    localStorage.setItem(`mayana_prefs_${charId}`, JSON.stringify({
      statistics: { monstersKilled: 8888, bossesKilled: 12 },
      guildProgress: { points: 350 },
    }));

    await purgeOutdatedData();

    const [archive] = await listArchives(1);
    const payload = parseCharacterPayload(archive)!;

    expect(payload.character.name).toBe('老兵');
    expect(payload.character.gold).toBe(12345);
    expect(payload.character.baseAttributes.STR).toBe(14);
    expect(payload.skills).toEqual([{ id: 'wind_blade', name: '風刃', level: 3 }]);
    expect(payload.bagItems).toEqual([{ name: '紅藥水', type: 'potion', amount: 7 }]);
    expect(payload.personalStorageItems).toEqual([{ name: '鐵礦', type: 'material', amount: 3 }]);
    expect(payload.statistics?.monstersKilled).toBe(8888);
    expect(payload.contribution).toBe(350);
  });

  it('裝備快照帶著詞綴的中文顯示文字（封存當下算好，不依賴日後的詞綴定義）', async () => {
    const charId = await addOutdatedCharacter();
    const templateId = await db.equipmentTemplates.add({
      name: '鋼劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
      smallMonsterDamage: 20, largeMonsterDamage: 25, price: 1000,
    } as unknown as Parameters<typeof db.equipmentTemplates.add>[0]) as number;
    await loadTemplateCache();
    await db.equipmentInstances.add({
      templateId, ownerId: charId, equipped: true, quality: 10, enhancement: 7,
      affixes: [
        { type: 'attack_power', tier: 4, value: 12 },
        { type: 'immune_poison', tier: 0, value: 0 },
      ],
    } as unknown as Parameters<typeof db.equipmentInstances.add>[0]);

    await purgeOutdatedData();

    const payload = parseCharacterPayload((await listArchives(1))[0])!;
    expect(payload.equipped).toHaveLength(1);
    const [weapon] = payload.equipped;
    expect(weapon.name).toBe('鋼劍');
    // 品質 10% 讓 12 變成 13（getEffectiveAffixValue）
    expect(weapon.affixes[0].display).toBe('攻擊力 +13% (T4)');
    expect(weapon.affixes[1].display).toBe('[特殊] 毒免疫');
    // type/tier/value 仍保留，日後要重新計算也有原始資料
    expect(weapon.affixes[0]).toMatchObject({ type: 'attack_power', tier: 4, value: 12 });
  });

  it('沒有 prefs 時統計為 null，讓遺產頁顯示「—」而不是 0', async () => {
    await addOutdatedCharacter();
    await purgeOutdatedData();

    const payload = parseCharacterPayload((await listArchives(1))[0])!;
    expect(payload.statistics).toBeNull();
    expect(payload.contribution).toBeNull();
  });

  it('共用倉庫被清除時另存一筆帳號層級快照', async () => {
    await addOutdatedCharacter();
    await db.warehouses.add({ userId: 1, name: 'gold', type: 'gold', amount: 50000, storageType: 'shared' });
    await db.warehouses.add({ userId: 1, name: '鐵礦', type: 'material', amount: 9, storageType: 'shared' });

    await purgeOutdatedData();

    const archives = await listArchives(1);
    const shared = archives.find(a => a.type === 'sharedWarehouse');
    expect(shared).toBeDefined();

    const payload = parseSharedWarehousePayload(shared!)!;
    expect(payload.gold).toBe(50000);
    expect(payload.items).toEqual([{ name: '鐵礦', type: 'material', amount: 9 }]);
    expect(await db.warehouses.count()).toBe(0);
  });

  it('帳號還有存活角色時不封存共用倉庫', async () => {
    await addOutdatedCharacter();
    await db.characters.add({
      uuid: 'uuid-alive', userId: 1, name: '新兵', className: 'thief', level: 1, exp: 0, expToNext: 100,
      hp: 30, maxHp: 30, mp: 10, maxMp: 10,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      unspentAttributePoints: 0, gold: 0,
      currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
      currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
      dataVersion: CURRENT_DATA_VERSION,
    } as Parameters<typeof db.characters.add>[0]);
    await db.warehouses.add({ userId: 1, name: 'gold', type: 'gold', amount: 50000, storageType: 'shared' });

    await purgeOutdatedData();

    const archives = await listArchives(1);
    expect(archives.filter(a => a.type === 'sharedWarehouse')).toHaveLength(0);
    expect(await db.warehouses.count()).toBe(1);
  });

  it('可手動刪除單筆遺產', async () => {
    await addOutdatedCharacter();
    await purgeOutdatedData();

    const [archive] = await listArchives(1);
    await deleteArchive(archive.id!);

    expect(await listArchives(1)).toHaveLength(0);
  });

  it('payload 損毀時回傳 null 而不是拋錯', async () => {
    await db.legacyArchives.add({
      userId: 1, type: 'character', label: '壞掉的紀錄', dataVersion: 1, archivedAt: 1, payload: '{ not json',
    });
    const [archive] = await listArchives(1);
    expect(parseCharacterPayload(archive)).toBeNull();
  });
});
