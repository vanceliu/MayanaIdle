import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetTestDb } from '../../testing/testDb';
import { useGameStore, talentInitReady } from '../gameStore';
import { defaultSession } from '../session';
import { tickPlayerPre, SAVE_FLUSH_MS } from '../../systems/gameLoop';

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

/**
 * 存檔改為 dirty 標記 ＋ 每 5 秒 flush（`97-selfhosted-server.md` § 97.4）。
 *
 * 原本每殺一隻怪就寫一次盤，而一次寫入是角色列＋整份背包＋兩個倉庫、各自提交。
 * 這支測試釘住三件事：標記不寫、週期才寫、強制立刻寫。
 */
function setGold(gold: number) {
  const char = useGameStore.getState().character!;
  useGameStore.setState({ character: { ...char, gold } });
}

describe('存檔 flush 週期', () => {
  let characterId: number;

  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Flusher', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    characterId = useGameStore.getState().character!.id!;
    await talentInitReady();
    // 先把建角留下的寫入排空，之後的差異才是這支測試造成的
    await useGameStore.getState().flushSaveNow();
    defaultSession.loop.saveAcc = 0;
    defaultSession.loop.saveDirty = false;
  });

  it('saveState() 只標記，不立刻寫盤', async () => {
    setGold(4321);
    useGameStore.getState().saveState();

    expect(defaultSession.loop.saveDirty).toBe(true);
    expect((await db.characters.get(characterId))!.gold).not.toBe(4321);
  });

  it('累積滿 5 秒就落地，並清掉 dirty', async () => {
    setGold(4321);
    useGameStore.getState().saveState();

    tickPlayerPre(SAVE_FLUSH_MS, defaultSession);
    // flush 是非同步的，等它走完
    await defaultSession.loop.saveQueue;

    expect((await db.characters.get(characterId))!.gold).toBe(4321);
    expect(defaultSession.loop.saveDirty).toBe(false);
  });

  it('沒有 dirty 就不會白寫', async () => {
    let writes = 0;
    const real = db.characters.update.bind(db.characters);
    db.characters.update = ((...args: Parameters<typeof real>) => { writes++; return real(...args); }) as typeof real;

    tickPlayerPre(SAVE_FLUSH_MS, defaultSession);
    await defaultSession.loop.saveQueue;
    db.characters.update = real;

    expect(writes).toBe(0);
  });

  it('flushSaveNow() 立刻落地，不必等週期', async () => {
    setGold(999);
    await useGameStore.getState().flushSaveNow();

    expect((await db.characters.get(characterId))!.gold).toBe(999);
  });

  it('內容沒變的表不重寫（背包只在變動時才 replace）', async () => {
    // 基準線先讓背包有東西，否則「沒變」與「本來就空」分不出來
    useGameStore.setState({ bagItems: [{ itemId: 1, name: '紅色藥水', type: 'potion', amount: 3 }] as never });
    await useGameStore.getState().flushSaveNow();

    let bagWrites = 0;
    // `replaceBag` 一律先 removeWhere 再逐筆 add，攔它就看得到有沒有真的重寫
    const real = db.characterBag.removeWhere.bind(db.characterBag);
    db.characterBag.removeWhere = ((...args: Parameters<typeof real>) => { bagWrites++; return real(...args); }) as typeof real;

    // 只改金幣：背包內容沒變，不該重寫背包
    setGold(555);
    await useGameStore.getState().flushSaveNow();
    const afterUnchangedBag = bagWrites;

    // 背包真的變了才重寫
    useGameStore.setState({ bagItems: [{ itemId: 1, name: '紅色藥水', type: 'potion', amount: 2 }] as never });
    await useGameStore.getState().flushSaveNow();
    db.characterBag.removeWhere = real;

    expect(afterUnchangedBag).toBe(0);
    expect(bagWrites).toBeGreaterThan(0);
  });
});
