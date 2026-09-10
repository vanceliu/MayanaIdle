/**
 * 線上模式的時鐘（`97-selfhosted-server.md` § 97.6）。
 *
 * client 不跑模擬，沒有人推進本機時鐘 —— 沒有這條對時，`gameNow()` 永遠是 0，
 * 冷卻指針、停留時間、buff 倒數全部算不出來，而且**不會有任何錯誤訊息**。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyServerMessage, mirrorGameNow } from '../mirror';
import { TICK_MS, setClockSource } from '../../core/clock';
import type { ServerMessage } from '../protocol';

function heartbeat(now: number): ServerMessage {
  return { t: 'combat', now, instances: [], targetMonsterId: null, cast: {} };
}

describe('線上模式對時', () => {
  let wall = 0;

  beforeEach(() => {
    wall = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // 測試環境的時鐘來源由 `testing/setupRng.ts` 設定，用完要還回去
    setClockSource(() => Date.now());
  });

  it('心跳到達時對上 server 的遊戲時間', () => {
    applyServerMessage(heartbeat(60_000));
    expect(mirrorGameNow()).toBe(60_000);
  });

  it('兩個心跳之間以真實時間往前推', () => {
    applyServerMessage(heartbeat(60_000));
    wall += 100;
    expect(mirrorGameNow()).toBe(60_100);
    wall += 100;
    expect(mirrorGameNow()).toBe(60_200);
  });

  it('心跳晚到就停在一個 tick 的邊界，不會越過下一個 tick', () => {
    applyServerMessage(heartbeat(60_000));
    wall += TICK_MS * 3;
    expect(mirrorGameNow()).toBe(60_000 + TICK_MS);
  });

  it('下一個心跳接上去，時間不倒退', () => {
    applyServerMessage(heartbeat(60_000));
    wall += 350;
    const before = mirrorGameNow();
    applyServerMessage(heartbeat(60_300));
    expect(mirrorGameNow()).toBeGreaterThanOrEqual(before);
  });

  it('技能冷卻剩餘時間會隨著心跳遞減', () => {
    // 技能在 server 的 59_000 用掉，冷卻 2 秒
    const lastUsedAt = 59_000;
    const cooldown = 2_000;
    const remaining = () => Math.max(0, lastUsedAt + cooldown - mirrorGameNow());

    applyServerMessage(heartbeat(59_300));
    expect(remaining()).toBe(1_700);
    applyServerMessage(heartbeat(60_600));
    expect(remaining()).toBe(400);
    applyServerMessage(heartbeat(61_200));
    expect(remaining()).toBe(0);
  });
});
