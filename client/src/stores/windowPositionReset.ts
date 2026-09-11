/**
 * 「重設視窗位置」的廣播（`16-tech-frontend-architecture.md` § 32.15）。
 *
 * 浮動面板的位置在 `panelWindowStore`，但戰鬥紀錄視窗與隊伍 HUD 各自記在
 * 自己的 localStorage 鍵裡 —— 重設鈕只清得到前者的話，玩家按了會發現
 * 「有些視窗回去了，有些沒有」。
 *
 * 誰記自己的位置，誰就負責在收到廣播時清掉自己那一份；
 * 這裡只負責把事件發出去，不必集中維護一張鍵清單。
 */
const RESET_EVENT = 'mayana:reset-window-positions';

export function emitWindowPositionReset(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RESET_EVENT));
}

/** 回傳取消訂閱函式，直接當 effect 的 cleanup 用 */
export function onWindowPositionReset(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(RESET_EVENT, handler);
  return () => window.removeEventListener(RESET_EVENT, handler);
}
