import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, type PlayerSession } from '../playerSession';
import { addBagItem } from '../../../client/src/models/bagItem';

/** 建角與選角一樣讀入帳號的帳號倉庫（`19-account-character.md` § 19.7） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;
const USER_ID = 1;

describe('建角讀入帳號倉庫', () => {
  let repo: SqliteRepository;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
  });

  function freshConnection(): PlayerSession {
    const s = createPlayerSession(repo, '127.0.0.1', () => {});
    s.userId = USER_ID;
    s.game.setState({ userId: USER_ID });
    return s;
  }

  async function seedSharedWarehouse(): Promise<void> {
    const first = freshConnection();
    await first.game.getState().createCharacter('First', 'knight', ATTRS);
    first.game.setState({ warehouseGold: 500, storedMaterials: addBagItem([], 1, 7) });
    await first.game.getState().logout();
  }

  it('新連線建角，新角色看得到帳號倉庫', async () => {
    await seedSharedWarehouse();

    const s = freshConnection();
    await s.game.getState().createCharacter('Second', 'knight', ATTRS);

    expect(s.game.getState().warehouseGold).toBe(500);
    expect(s.game.getState().storedMaterials).toEqual(addBagItem([], 1, 7));
  });

  it('新角色存檔後，帳號倉庫內容不變', async () => {
    await seedSharedWarehouse();

    const s = freshConnection();
    await s.game.getState().createCharacter('Second', 'knight', ATTRS);
    await s.game.getState().flushSaveNow();

    expect(await repo.getWarehouseGold(USER_ID)).toBe(500);
    const rows = await repo.listSharedWarehouse(USER_ID);
    expect(rows.map(r => [r.itemTemplateId, r.amount])).toEqual([[1, 7]]);
  });

  it('新角色的個人倉庫是空的，不沿用同連線上一隻角色的', async () => {
    const s = freshConnection();
    await s.game.getState().createCharacter('First', 'knight', ATTRS);
    s.game.setState({ personalStoredMaterials: addBagItem([], 1, 3) });
    await s.game.getState().logout();

    await s.game.getState().createCharacter('Second', 'knight', ATTRS);

    expect(s.game.getState().personalStoredMaterials).toEqual([]);
    expect(s.game.getState().personalStoredEquipment).toEqual([]);
  });
});
