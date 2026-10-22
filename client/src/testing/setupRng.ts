import { setRandomSource } from '../core/rng';
import { setClockSource } from '../core/clock';
import { defaultSession } from '../stores/session';
import { MemoryRepository } from '../db/memoryRepository';
import '../models/mapSource.vite';

// node 環境沒有 localStorage；`MemoryRepository` 的偏好鍵沿用 localStorage（`18-data-schema.md` § 18.6）
if (typeof globalThis.localStorage === 'undefined') {
  let store = new Map<string, string>();
  const memoryStorage = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store = new Map(); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true });
}

// 正式路徑的持久層在 server；測試用記憶體實作頂上（`18-data-schema.md` § 18.12）
defaultSession.repo = new MemoryRepository();

/** 測試以 `vi.spyOn(Math, 'random')` 與 fake timers 控制亂數與時間；正式路徑為 seeded PRNG 與遊戲迴圈推進的時鐘 */
setRandomSource(() => Math.random());
setClockSource(() => Date.now());
