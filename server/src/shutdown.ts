/**
 * 關服倒數（`97-selfhosted-server.md` § 97.8）。
 *
 * 按下 graceful shutdown 不會立刻斷線：先給在線玩家一段時間自己收尾，
 * 期間拒絕新連線、持續廣播剩餘秒數，時間到才真的關。不可取消。
 */
export const SHUTDOWN_COUNTDOWN_SECONDS = 60;

/** 廣播的剩餘秒數。60 秒那則由倒數開始時送出 */
export const SHUTDOWN_ANNOUNCE_AT: readonly number[] = [30, 20, 10, 5, 4, 3, 2, 1];
