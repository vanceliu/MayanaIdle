/**
 * SQLite 寫入關卡（`97-selfhosted-server.md` § 97.4「寫入策略」）。
 *
 * 全 server 共用一條連線，交易的 BEGIN 會跨 await 開著；
 * 這段期間其他呼叫鏈的寫入一律排在交易之後，不得併入（否則會被別人的 ROLLBACK 帶走）。
 * 只有同一呼叫鏈內的巢狀呼叫直接併入。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSync } from 'node:sqlite';

export class WriteGate {
  private readonly db: DatabaseSync;
  private readonly context = new AsyncLocalStorage<true>();
  private queue: Promise<void> = Promise.resolve();
  /** BEGIN 到 COMMIT／ROLLBACK 之間為 true */
  private open = false;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** 多語句交易，fn 內可 await；同一呼叫鏈內的巢狀呼叫直接併入 */
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    return this.enqueue(async () => {
      this.db.exec('BEGIN');
      this.open = true;
      try {
        const result = await this.context.run(true, fn);
        this.db.exec('COMMIT');
        return result;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      } finally {
        this.open = false;
      }
    });
  }

  /** 同步寫入：在交易內直接執行；沒有交易開著時立即執行；別人的交易開著時排在其後 */
  write<T>(fn: () => T): Promise<T> {
    if (this.context.getStore() || !this.open) {
      try {
        return Promise.resolve(fn());
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return this.enqueue(async () => fn());
  }

  /** 多語句的同步寫入，整批成立或整批不成立 */
  atomic<T>(fn: () => T): Promise<T> {
    return this.write(() => {
      this.db.exec('SAVEPOINT gate_atomic');
      try {
        const result = fn();
        this.db.exec('RELEASE gate_atomic');
        return result;
      } catch (e) {
        this.db.exec('ROLLBACK TO gate_atomic');
        this.db.exec('RELEASE gate_atomic');
        throw e;
      }
    });
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.then(() => {}, () => {});
    return next;
  }
}

const gates = new WeakMap<DatabaseSync, WriteGate>();

/** 同一條連線只能有一個關卡，否則彼此看不到對方的交易 */
export function writeGateOf(db: DatabaseSync): WriteGate {
  let gate = gates.get(db);
  if (!gate) gates.set(db, (gate = new WriteGate(db)));
  return gate;
}
