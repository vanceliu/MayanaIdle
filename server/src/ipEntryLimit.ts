/**
 * 同 IP 同時在場（`97-selfhosted-server.md` § 97.5）：同一 IP 同時在遊戲中的帳號數有上限。
 * 在遊戲中的帳號由呼叫端從在線連線算出；這裡只保存進場中的帳號，計入上限。
 */
export const MAX_IN_GAME_ACCOUNTS_PER_IP = 2;

export class IpEntryLimit {
  /** IP → 進場中的帳號 → 進行中的進場數 */
  private readonly entering = new Map<string, Map<number, number>>();

  /** 開始一次進場：其他帳號（在遊戲中 ∪ 進場中）達上限回 false；回 true 後必須以 `finish` 結束 */
  begin(ip: string, userId: number, inGameUserIds: Iterable<number>): boolean {
    const others = new Set(inGameUserIds);
    const entering = this.entering.get(ip);
    if (entering) for (const id of entering.keys()) others.add(id);
    others.delete(userId);
    if (others.size >= MAX_IN_GAME_ACCOUNTS_PER_IP) return false;
    const map = entering ?? new Map<number, number>();
    map.set(userId, (map.get(userId) ?? 0) + 1);
    this.entering.set(ip, map);
    return true;
  }

  finish(ip: string, userId: number): void {
    const map = this.entering.get(ip);
    if (!map) return;
    const n = (map.get(userId) ?? 0) - 1;
    if (n > 0) map.set(userId, n);
    else map.delete(userId);
    if (map.size === 0) this.entering.delete(ip);
  }
}
