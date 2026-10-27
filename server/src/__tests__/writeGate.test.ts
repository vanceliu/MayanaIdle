import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';

/** 寫入關卡（`97-selfhosted-server.md` § 97.4「寫入策略」）：別人的交易回滾不得帶走自己的寫入 */

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

describe('SQLite 寫入關卡', () => {
  let db: DatabaseSync;
  let repo: SqliteRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
  });

  const prefs = (id: number) => repo.getCharacterPrefs(id);

  it('兩條呼叫鏈的交易同時進行，一筆失敗不帶走另一筆', async () => {
    const gate = deferred();
    const failing = repo.transaction(async () => {
      await repo.putCharacterPrefs(1, { from: 'A' });
      await gate.promise;
      throw new Error('A 失敗');
    });
    const other = repo.transaction(async () => {
      await repo.putCharacterPrefs(2, { from: 'B' });
    });
    gate.resolve();

    await expect(failing).rejects.toThrow('A 失敗');
    await other;
    expect(await prefs(1)).toBeNull();
    expect(await prefs(2)).toEqual({ from: 'B' });
  });

  it('交易開著時其他呼叫鏈的單筆寫入排在其後，不被回滾', async () => {
    const gate = deferred();
    const failing = repo.transaction(async () => {
      await repo.putCharacterPrefs(1, { from: 'A' });
      await gate.promise;
      throw new Error('A 失敗');
    });
    const outside = repo.putBagLayout(9, { slot: 1 });
    gate.resolve();

    await expect(failing).rejects.toThrow('A 失敗');
    await outside;
    expect(await repo.getBagLayout(9)).toEqual({ slot: 1 });
  });

  it('帳號寫入在別人的交易開著時也不被回滾', async () => {
    const auth = new AuthService(db);
    const user = await auth.register('alice', 'password1');
    const gate = deferred();
    const failing = repo.transaction(async () => {
      await repo.putCharacterPrefs(1, { from: 'A' });
      await gate.promise;
      throw new Error('A 失敗');
    });
    const issuing = auth.issueSession(user.id);
    gate.resolve();

    await expect(failing).rejects.toThrow('A 失敗');
    const token = await issuing;
    expect(auth.resolveSession(token)?.id).toBe(user.id);
  });

  it('同一呼叫鏈的巢狀寫入仍併入外層交易，外層失敗一起回滾', async () => {
    await expect(repo.transaction(async () => {
      await repo.replaceBag(5, [{ characterId: 5, itemTemplateId: 1, amount: 3 } as never]);
      await repo.transaction(async () => {
        await repo.putCharacterPrefs(5, { nested: true });
      });
      throw new Error('外層失敗');
    })).rejects.toThrow('外層失敗');

    expect(await repo.listBag(5)).toEqual([]);
    expect(await prefs(5)).toBeNull();
  });

  it('交易依序執行：後到的交易等前一筆結束才 BEGIN', async () => {
    const order: string[] = [];
    const gate = deferred();
    const first = repo.transaction(async () => {
      order.push('A begin');
      await gate.promise;
      order.push('A end');
    });
    const second = repo.transaction(async () => {
      order.push('B begin');
    });
    await Promise.resolve();
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['A begin', 'A end', 'B begin']);
  });
});
