/**
 * 登入嘗試限制（`97-selfhosted-server.md` § 97.5）：依來源 IP 計數，登入與救援碼重設共用。
 * 進行中的嘗試計入上限：失敗數 + 進行中達 `MAX_FAILURES` 時，新嘗試直接拒絕。
 */
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const FAILURE_RESET_MS = 15 * 60 * 1000;

export type AttemptOutcome = 'success' | 'failure' | 'neutral';

interface Entry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
  inFlight: number;
}

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** 鎖定中回傳剩餘毫秒，否則 0 */
  lockedFor(ip: string): number {
    const entry = this.entries.get(ip);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - this.now());
  }

  /** 開始一次嘗試：鎖定中或失敗數 + 進行中已達上限回 false；回 true 後必須以 `finish` 結束 */
  begin(ip: string): boolean {
    const now = this.now();
    const entry = this.entries.get(ip) ?? emptyEntry();
    if (entry.lockedUntil > now) return false;
    const failures = now - entry.lastFailureAt > FAILURE_RESET_MS ? 0 : entry.failures;
    if (failures + entry.inFlight >= MAX_FAILURES) return false;
    entry.inFlight++;
    this.entries.set(ip, entry);
    return true;
  }

  /** 結束 `begin` 開始的嘗試；`neutral` 不計成功也不計失敗 */
  finish(ip: string, outcome: AttemptOutcome): void {
    const entry = this.entries.get(ip);
    if (entry) entry.inFlight = Math.max(0, entry.inFlight - 1);
    if (outcome === 'success') this.recordSuccess(ip);
    else if (outcome === 'failure') this.recordFailure(ip);
    else if (entry && isIdle(entry, this.now())) this.entries.delete(ip);
  }

  recordFailure(ip: string): void {
    const now = this.now();
    this.prune(now);
    const entry = this.entries.get(ip) ?? emptyEntry();
    if (now - entry.lastFailureAt > FAILURE_RESET_MS) entry.failures = 0;
    entry.failures++;
    entry.lastFailureAt = now;
    if (entry.failures >= MAX_FAILURES) {
      entry.failures = 0;
      entry.lockedUntil = now + LOCK_MS;
    }
    this.entries.set(ip, entry);
  }

  /** 成功即歸零；同 IP 仍有進行中的嘗試時保留其計數 */
  recordSuccess(ip: string): void {
    const entry = this.entries.get(ip);
    if (!entry || entry.inFlight === 0) {
      this.entries.delete(ip);
      return;
    }
    entry.failures = 0;
    entry.lastFailureAt = 0;
    entry.lockedUntil = 0;
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.entries) {
      if (isIdle(entry, now)) this.entries.delete(ip);
    }
  }
}

function emptyEntry(): Entry {
  return { failures: 0, lastFailureAt: 0, lockedUntil: 0, inFlight: 0 };
}

function isIdle(entry: Entry, now: number): boolean {
  return entry.inFlight === 0 && entry.lockedUntil <= now && now - entry.lastFailureAt > FAILURE_RESET_MS;
}
