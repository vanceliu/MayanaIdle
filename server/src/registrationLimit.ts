/**
 * 註冊限制（`97-selfhosted-server.md` § 97.5）：依來源 IP，滾動視窗內建立的帳號數有上限。
 * 進行中的註冊計入上限；只有帳號實際建立才佔用名額。記憶體保存，重啟即清空。
 */
export const MAX_REGISTRATIONS = 2;
export const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

interface Entry {
  createdAt: number[];
  inFlight: number;
}

export class RegistrationLimit {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** 開始一次註冊：已建立 + 進行中達上限回 false；回 true 後必須以 `finish` 結束 */
  begin(ip: string): boolean {
    this.prune();
    const entry = this.current(ip);
    if (entry.createdAt.length + entry.inFlight >= MAX_REGISTRATIONS) return false;
    entry.inFlight++;
    this.entries.set(ip, entry);
    return true;
  }

  /** 結束 `begin` 開始的註冊；`created` 為帳號是否實際建立 */
  finish(ip: string, created: boolean): void {
    const entry = this.current(ip);
    entry.inFlight = Math.max(0, entry.inFlight - 1);
    if (created) entry.createdAt.push(this.now());
    if (entry.inFlight === 0 && entry.createdAt.length === 0) this.entries.delete(ip);
    else this.entries.set(ip, entry);
  }

  /** 名額已滿時距下一個名額釋出的毫秒；只因進行中而滿時回 0 */
  retryAfter(ip: string): number {
    const entry = this.current(ip);
    if (entry.createdAt.length < MAX_REGISTRATIONS) return 0;
    return Math.max(0, entry.createdAt[0] + REGISTRATION_WINDOW_MS - this.now());
  }

  private prune(): void {
    const now = this.now();
    for (const [ip, entry] of this.entries) {
      if (entry.inFlight === 0 && entry.createdAt.every(t => now - t >= REGISTRATION_WINDOW_MS)) this.entries.delete(ip);
    }
  }

  private current(ip: string): Entry {
    const now = this.now();
    const entry = this.entries.get(ip) ?? { createdAt: [], inFlight: 0 };
    entry.createdAt = entry.createdAt.filter(t => now - t < REGISTRATION_WINDOW_MS);
    return entry;
  }
}
