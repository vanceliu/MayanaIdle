import { useCallback, useEffect, useRef } from 'react';

/**
 * 長按＝右鍵（行動裝置支援，`47-mobile.md`）。
 *
 * 背包與快捷格的次要動作（設快捷鍵／丟棄／清除）本來只有右鍵入口，
 * 手機沒有右鍵，這些功能在觸控裝置上等於不存在。
 *
 * **右鍵路徑照舊保留**：桌機玩家的肌肉記憶不該因為要支援手機而改掉。
 * 兩條路徑進到同一個 handler，收到的是同一組座標。
 */

/** 觸發長按所需的按壓時間（ms）。iOS 的系統長按約 500ms，跟著它玩家才不會覺得慢或誤觸 */
export const LONG_PRESS_MS = 500;

/** 按壓期間容許的手指位移（px）。超過就當成捲動／拖曳，取消長按 */
const MOVE_TOLERANCE = 10;

export interface LongPressPoint {
  clientX: number;
  clientY: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /**
   * 這一輪按壓已經以長按觸發過。
   *
   * 呼叫端在 pointerup 執行主要動作（使用／裝備）前**必須先問這個** ——
   * Android Chrome 長按後照樣補一發 pointerup，不擋就變成
   * 「開完選單順手把藥水喝掉」。旗標在下一次 pointerdown 才歸零。
   */
  didFire: () => boolean;
}

/**
 * @param onTrigger 長按或右鍵時呼叫，帶著觸發點的視窗座標
 * @param enabled   false 時完全不掛（例如空格子沒有次要動作）
 */
export function useLongPress(
  onTrigger: (point: LongPressPoint) => void,
  enabled = true,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * 長按已經觸發過。用來擋掉隨後的 `click` 語意 ——
   * Android Chrome 在長按後仍會補一發 pointerup，沒有這個旗標的話
   * 「長按開選單」會順手把底下的物品也用掉。
   */
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    originRef.current = null;
  }, []);

  // 元件卸載時計時器還在跑，就會對已經不存在的面板開選單
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    // 只有主鍵按壓才起算：右鍵有自己的 contextmenu 路徑，中鍵不該觸發
    if (e.button !== 0) return;
    firedRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY };
    const point = { clientX: e.clientX, clientY: e.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      clear();
      onTrigger(point);
    }, LONG_PRESS_MS);
  }, [enabled, onTrigger, clear]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_TOLERANCE) clear();
  }, [clear]);

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    clear();
    onTrigger({ clientX: e.clientX, clientY: e.clientY });
  }, [enabled, onTrigger, clear]);

  const didFire = useCallback(() => firedRef.current, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, didFire };
}
