import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION, currentSchemaVersion, resolveWorldMode } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import type { Character } from '../../../client/src/models/character';

function character(userId: number, name = 'A'): Character {
  return {
    userId, name, className: 'knight', level: 1, exp: 0, expToNext: 10, hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 } as never,
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never,
    unspentAttributePoints: 0, gold: 100, currentArea: 'neutral-town', currentZone: 'z', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 1, uuid: crypto.randomUUID(),
  } as Character;
}

describe('SqliteRepository（18 § 18.12）', () => {
  let repo: SqliteRepository;
  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
  });

  it('遷移到最新版本且冪等', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION });
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(currentSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('角色 CRUD 與 id 回填', async () => {
    const id = await repo.addCharacter(character(1));
    expect(id).toBe(1);
    const c = await repo.getCharacter(id);
    expect(c?.id).toBe(1);
    expect(c?.name).toBe('A');
    await repo.updateCharacter(id, { gold: 999 });
    expect((await repo.getCharacter(id))?.gold).toBe(999);
    expect(await repo.countCharacters(1)).toBe(1);
    await repo.addCharacter(character(1, 'B'));
    expect((await repo.lastCharacter(1))?.name).toBe('B');
    expect((await repo.listCharacters(1)).map(c => c.name)).toEqual(['A', 'B']);
    await repo.deleteCharacter(id);
    expect(await repo.getCharacter(id)).toBeUndefined();
  });

  it('裝備實例依 ownerId 查、共用倉庫過濾', async () => {
    const a = await repo.addEquipment({ templateId: 1, ownerId: 7, equipped: false } as never);
    await repo.addEquipment({ templateId: 2, ownerId: 99, inStorage: true, storageType: 'shared' } as never);
    expect((await repo.listEquipmentByOwner(7)).map(e => e.id)).toEqual([a]);
    expect((await repo.listSharedWarehouseEquipment(99)).length).toBe(1);
    await repo.updateEquipment(a, { enhancement: 3 });
    expect((await repo.listEquipmentByOwner(7))[0].enhancement).toBe(3);
    await repo.deleteCharacterEquipment(7);
    expect(await repo.listEquipmentByOwner(7)).toEqual([]);
  });

  it('背包 replace／setBagItemAmount', async () => {
    await repo.replaceBag(3, [{ characterId: 3, name: 'x', type: 'potion', itemTemplateId: 1, amount: 5 }]);
    expect((await repo.listBag(3))[0].amount).toBe(5);
    await repo.setBagItemAmount(3, 1, 2);
    expect((await repo.listBag(3))[0].amount).toBe(2);
    await repo.setBagItemAmount(3, 1, 0);
    expect(await repo.listBag(3)).toEqual([]);
  });

  it('倉庫金幣 upsert 與共用／個人倉庫分流', async () => {
    await repo.putWarehouseGold(1, 10);
    await repo.putWarehouseGold(1, 20);
    expect(await repo.getWarehouseGold(1)).toBe(20);
    await repo.replaceSharedWarehouse(1, [{ userId: 1, name: 'm', type: 'material', itemTemplateId: 9, amount: 1, storageType: 'shared' }]);
    await repo.replacePersonalWarehouse(5, [{ userId: 1, name: 'p', type: 'material', itemTemplateId: 8, amount: 2, storageType: 'personal', characterId: 5 }]);
    expect((await repo.listSharedWarehouse(1)).map(r => r.name)).toEqual(['m']);
    expect((await repo.listPersonalWarehouse(5)).map(r => r.name)).toEqual(['p']);
  });

  it('信箱唯一鍵與交易回滾', async () => {
    await repo.bulkAddMail([{ characterId: 1, sourceKey: 'k1', title: 't', items: [], createdAt: 1, claimedAt: null }]);
    await expect(repo.transaction(async () => {
      await repo.bulkAddMail([{ characterId: 1, sourceKey: 'k2', title: 't', items: [], createdAt: 1, claimedAt: null }]);
      await repo.bulkAddMail([{ characterId: 1, sourceKey: 'k1', title: 't', items: [], createdAt: 1, claimedAt: null }]);
    })).rejects.toThrow();
    expect((await repo.listMail(1)).map(m => m.sourceKey)).toEqual(['k1']);
  });

  it('偏好、排列、換版戳記', async () => {
    expect(await repo.getCharacterPrefs(1)).toBeNull();
    await repo.putCharacterPrefs(1, { a: 1 });
    expect(await repo.getCharacterPrefs(1)).toEqual({ a: 1 });
    await repo.putBagLayout(1, { 'equip-1': 3 });
    expect(await repo.getBagLayout(1)).toEqual({ 'equip-1': 3 });
    await repo.setMailPurgeVersion(1, '0.6.2');
    expect(await repo.getMailPurgeVersion(1)).toBe('0.6.2');
    await repo.deleteCharacterPrefs(1);
    expect(await repo.getCharacterPrefs(1)).toBeNull();
  });

  it('靜態模板來自 seed', async () => {
    expect((await repo.listEquipmentTemplates()).length).toBeGreaterThan(100);
    expect((await repo.listMonsterTemplates('dawn-plains')).length).toBeGreaterThan(0);
    expect((await repo.listDropTable('dawn-plains')).length).toBeGreaterThan(0);
  });
});

describe('角色名稱唯一性（`19-account-character.md` § 19.4）', () => {
  function character(name: string, userId = 1) {
    return { userId, name, className: 'knight', level: 1, exp: 0, expToNext: 100, hp: 30, maxHp: 30, mp: 10, maxMp: 10,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      unspentAttributePoints: 0, gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0 } as never;
  }

  it('同名（含大小寫不同）建不起來', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    await repo.addCharacter(character('Hero'));

    expect(repo.nameTaken('Hero')).toBe(true);
    expect(repo.nameTaken('hero')).toBe(true);
    expect(repo.nameTaken('別人')).toBe(false);
    // 唯一索引是最後一道：繞過應用層檢查也插不進去
    await expect(repo.addCharacter(character('hero', 2))).rejects.toThrow();
  });

  it('刪掉之後名稱可以再用', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    const id = await repo.addCharacter(character('Hero'));
    await repo.deleteCharacter(id);
    expect(repo.nameTaken('Hero')).toBe(false);
    await expect(repo.addCharacter(character('Hero', 2))).resolves.toBeGreaterThan(0);
  });

});

describe('世界形態鎖定（`97-selfhosted-server.md` § 97.1）', () => {
  it('首次啟動記下形態，之後同一種照常', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(resolveWorldMode(db, 'solo')).toBe('solo');
    expect(resolveWorldMode(db, 'solo')).toBe('solo');
  });

  it('單機世界不能改成開放：直接拋錯，不是照常跑', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    resolveWorldMode(db, 'solo');
    expect(() => resolveWorldMode(db, 'open')).toThrow(/單機世界/);
  });

  it('開放世界同樣不能改回單機', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    resolveWorldMode(db, 'open');
    expect(() => resolveWorldMode(db, 'solo')).toThrow(/不能以單機形態啟動/);
  });
});
