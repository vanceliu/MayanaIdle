import { describe, it, expect } from 'vitest';
import { FAILURE_RESET_MS, LOCK_MS, LoginThrottle, MAX_FAILURES } from '../loginThrottle';

/** 登入嘗試限制（`97-selfhosted-server.md` § 97.5） */
describe('登入嘗試限制', () => {
  function setup() {
    let now = 1_000_000;
    const throttle = new LoginThrottle(() => now);
    return { throttle, advance: (ms: number) => { now += ms; } };
  }

  it('同 IP 失敗 5 次鎖 15 分鐘', () => {
    const { throttle, advance } = setup();
    expect(MAX_FAILURES).toBe(5);
    expect(LOCK_MS).toBe(15 * 60 * 1000);
    for (let i = 0; i < 4; i++) throttle.recordFailure('1.1.1.1');
    expect(throttle.lockedFor('1.1.1.1')).toBe(0);
    throttle.recordFailure('1.1.1.1');
    expect(throttle.lockedFor('1.1.1.1')).toBe(LOCK_MS);
    expect(throttle.lockedFor('2.2.2.2')).toBe(0);
    advance(LOCK_MS);
    expect(throttle.lockedFor('1.1.1.1')).toBe(0);
  });

  it('解鎖後重新計數', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 5; i++) throttle.recordFailure('ip');
    advance(LOCK_MS);
    throttle.recordFailure('ip');
    expect(throttle.lockedFor('ip')).toBe(0);
  });

  it('成功即歸零', () => {
    const { throttle } = setup();
    for (let i = 0; i < 4; i++) throttle.recordFailure('ip');
    throttle.recordSuccess('ip');
    for (let i = 0; i < 4; i++) throttle.recordFailure('ip');
    expect(throttle.lockedFor('ip')).toBe(0);
  });

  it('距上次失敗超過 15 分鐘歸零', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i++) throttle.recordFailure('ip');
    advance(FAILURE_RESET_MS + 1);
    throttle.recordFailure('ip');
    expect(throttle.lockedFor('ip')).toBe(0);
  });
});

describe('進行中的嘗試計入上限', () => {
  function setup() {
    let now = 1_000_000;
    const throttle = new LoginThrottle(() => now);
    return { throttle, advance: (ms: number) => { now += ms; } };
  }

  it('同 IP 同時最多 5 個進行中', () => {
    const { throttle } = setup();
    const started = Array.from({ length: 30 }, () => throttle.begin('ip')).filter(Boolean).length;

    expect(started).toBe(MAX_FAILURES);
    expect(throttle.begin('other')).toBe(true);
  });

  it('失敗數 + 進行中合計不超過 5', () => {
    const { throttle } = setup();
    for (let i = 0; i < 3; i++) throttle.recordFailure('ip');

    expect(throttle.begin('ip')).toBe(true);
    expect(throttle.begin('ip')).toBe(true);
    expect(throttle.begin('ip')).toBe(false);
  });

  it('5 個進行中全部失敗即鎖定', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i++) throttle.begin('ip');
    for (let i = 0; i < 5; i++) throttle.finish('ip', 'failure');

    expect(throttle.lockedFor('ip')).toBe(LOCK_MS);
    expect(throttle.begin('ip')).toBe(false);
  });

  it('中性結束釋出名額，不計失敗', () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i++) throttle.begin('ip');
    throttle.finish('ip', 'neutral');

    expect(throttle.begin('ip')).toBe(true);
    for (let i = 0; i < 5; i++) throttle.finish('ip', 'neutral');
    for (let i = 0; i < 5; i++) expect(throttle.begin('ip')).toBe(true);
  });

  it('成功歸零失敗數，但保留其他進行中的計數', () => {
    const { throttle } = setup();
    for (let i = 0; i < 3; i++) throttle.recordFailure('ip');
    throttle.begin('ip');
    throttle.begin('ip');
    throttle.finish('ip', 'success');

    // 剩 1 個進行中、失敗數歸零 → 還能再開 4 個
    const started = Array.from({ length: 10 }, () => throttle.begin('ip')).filter(Boolean).length;
    expect(started).toBe(4);
  });

  it('距上次失敗超過 15 分鐘，舊失敗不再佔名額', () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i++) throttle.recordFailure('ip');
    advance(FAILURE_RESET_MS + 1);

    const started = Array.from({ length: 10 }, () => throttle.begin('ip')).filter(Boolean).length;
    expect(started).toBe(MAX_FAILURES);
  });
});
