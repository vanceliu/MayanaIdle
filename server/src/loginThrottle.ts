/**
 * 登入嘗試限制（`97-selfhosted-server.md` § 97.5）：依來源 IP 計數，登入與救援碼重設共用。
 */
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const FAILURE_RESET_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
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

  recordFailure(ip: string): void {
    const now = this.now();
    this.prune(now);
    const entry = this.entries.get(ip) ?? { failures: 0, lastFailureAt: 0, lockedUntil: 0 };
    if (now - entry.lastFailureAt > FAILURE_RESET_MS) entry.failures = 0;
    entry.failures++;
    entry.lastFailureAt = now;
    if (entry.failures >= MAX_FAILURES) {
      entry.failures = 0;
      entry.lockedUntil = now + LOCK_MS;
    }
    this.entries.set(ip, entry);
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.lastFailureAt > FAILURE_RESET_MS) this.entries.delete(ip);
    }
  }
}
