import { setRandomSource } from '../core/rng';
import { setClockSource } from '../core/clock';
import { defaultSession } from '../stores/session';
import { MemoryRepository } from '../db/memoryRepository';
import '../models/mapSource.vite';

// 正式路徑的持久層在 server；測試用記憶體實作頂上（`18-data-schema.md` § 18.12）
defaultSession.repo = new MemoryRepository();

/** 測試以 `vi.spyOn(Math, 'random')` 與 fake timers 控制亂數與時間；正式路徑為 seeded PRNG 與遊戲迴圈推進的時鐘 */
setRandomSource(() => Math.random());
setClockSource(() => Date.now());
