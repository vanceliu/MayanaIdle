import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, talentInitReady } from '../gameStore';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

/** 測試用的金幣哨兵值，彼此可區分即可 */
const GOLD_DRAIN = 111;
const GOLD_FIRST = 222;
const GOLD_SECOND = 333;
const GOLD_FAILED = 444;
const GOLD_RECOVERED = 555;

function setGold(gold: number) {
  const char = useGameStore.getState().character!;
  useGameStore.setState({ character: { ...char, gold } });
}

/**
 * 存檔序列化（`18-data-schema.md`）：`saveGame` 是佇列入口，
 * 寫入順序等於呼叫順序，且單次失敗不卡死後續。
 */
describe('存檔佇列', () => {
  let characterId: number;
  let realUpdate: typeof db.characters.update;

  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Saver', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    // 迴圈會在測試中途插入自己的存檔，會干擾寫入計數
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();

    characterId = useGameStore.getState().character!.id!;
    realUpdate = db.characters.update.bind(db.characters) as typeof db.characters.update;

    // 天賦／信箱初始化也會存檔，要等它做完才輪得到計數
    await talentInitReady();

    // 佇列是模組層共用的：先排空建角留下的存檔，否則會混進本測試的計數
    setGold(GOLD_DRAIN);
    useGameStore.getState().saveState();
    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.gold).toBe(GOLD_DRAIN);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('兩次存檔交錯時，最終落地的是最後呼叫的那一份', async () => {
    const gate = deferred();
    let delayNext = true;
    let done = 0;
    vi.spyOn(db.characters, 'update').mockImplementation((async (key: number, changes: object) => {
      // 第一筆卡住，讓後呼叫的那筆有機會先寫完（沒有佇列時就會這樣）
      if (delayNext) { delayNext = false; await gate.promise; }
      const r = await realUpdate(key, changes);
      done++;
      return r;
    }) as unknown as typeof db.characters.update);

    setGold(GOLD_FIRST);
    useGameStore.getState().saveState();
    setGold(GOLD_SECOND);
    useGameStore.getState().saveState();

    await vi.waitFor(() => {
      expect(db.characters.update).toHaveBeenCalled();
    });
    gate.resolve();

    // 兩筆都寫完才看結果：只等「出現 GOLD_SECOND」會被中間態矇混過去
    await vi.waitFor(() => {
      expect(done).toBe(2);
    });
    expect((await db.characters.get(characterId))!.gold).toBe(GOLD_SECOND);
  });

  it('前一次存檔失敗後，下一次仍寫得進去', async () => {
    let failNext = true;
    vi.spyOn(db.characters, 'update').mockImplementation((async (key: number, changes: object) => {
      if (failNext) { failNext = false; throw new Error('write failed'); }
      return realUpdate(key, changes);
    }) as unknown as typeof db.characters.update);

    setGold(GOLD_FAILED);
    useGameStore.getState().saveState();
    await vi.waitFor(() => {
      expect(db.characters.update).toHaveBeenCalledTimes(1);
    });

    setGold(GOLD_RECOVERED);
    useGameStore.getState().saveState();

    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.gold).toBe(GOLD_RECOVERED);
    });
  });
});
