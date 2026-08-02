import { useCallback, useLayoutEffect, useRef } from 'react';

/** 判定「拉桿在底部」的容許誤差（px）。捲動位置可能是小數，需留極小容許值。 */
const BOTTOM_TOLERANCE_PX = 4;

/**
 * Log 視窗自動捲動：拉桿在底部時跟隨最新內容，被手動拉離底部後就不再搶位置，
 * 直到使用者自己把拉桿拉回底部才恢復跟隨。
 *
 * @param content 內容依賴（傳整個 log 陣列，不可傳 length —— log 有筆數上限，
 *                填滿後 length 不再變動會導致自動捲動失效）
 */
export function useAutoScrollLog<T extends HTMLElement = HTMLDivElement>(content: unknown) {
  const ref = useRef<T>(null);
  // 預設跟隨：使用者尚未動過拉桿時，視窗應停在最新一筆。
  const stickToBottom = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom <= BOTTOM_TOLERANCE_PX;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  return { ref, onScroll };
}
