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
