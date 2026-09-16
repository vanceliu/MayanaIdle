import { describe, it, expect } from 'vitest';
import { createLoopState } from '../session';
import { waitForPendingDrops, talentInitReady } from '../gameStore';
import type { Session } from '../session';

/**
 * 掉落／存檔／天賦初始化這三條佇列**每個 session 一份**（`97-selfhosted-server.md` § 97.6）。
 *
 * 放在模組層的話 server 上全服共用一條：一個人的掉落結算會卡住另一個人的存檔，
 * 而它們都在 `await` 持久層。這支測試擋的就是「又被搬回模組層」。
 */
function fakeSession(): Session {
  return { loop: createLoopState() } as Session;
}

describe('每個 session 一份的佇列', () => {
  it('一個 session 的掉落佇列卡住，不影響另一個', async () => {
    const a = fakeSession();
    const b = fakeSession();
    let release!: () => void;
    a.loop.dropQueue = new Promise<void>(res => { release = res; });

    let aDone = false;
    void waitForPendingDrops(a).then(() => { aDone = true; });
    await waitForPendingDrops(b);

    expect(aDone).toBe(false);
    release();
    await waitForPendingDrops(a);
    expect(aDone).toBe(true);
  });

  it('天賦初始化也是各等各的', async () => {
    const a = fakeSession();
    const b = fakeSession();
    let release!: () => void;
    a.loop.talentInit = new Promise<void>(res => { release = res; });

    let aDone = false;
    void talentInitReady(a).then(() => { aDone = true; });
    await talentInitReady(b);

    expect(aDone).toBe(false);
    release();
    await talentInitReady(a);
    expect(aDone).toBe(true);
  });

  it('新建的 loop state 三條佇列都是獨立的物件', () => {
    const a = createLoopState();
    const b = createLoopState();
    expect(a.dropQueue).not.toBe(b.dropQueue);
    expect(a.saveQueue).not.toBe(b.saveQueue);
    expect(a.talentInit).not.toBe(b.talentInit);
  });
});
