import { useRef } from 'react';
import { useDragStore, type DragItem } from '../stores/dragStore';

/**
 * 背包格的「按下 → 拖曳」判定（`35-inventory-constraints.md` § 35.1.4、`47-mobile.md`）。
 *
 * 一般分頁與天賦分頁**共用同一支** —— 各寫一份的結果是兩個分頁的手感不一樣，
 * 而玩家不會知道自己在哪一個分頁。
 */

/** 按下到放開的位移在這個範圍內都算「點擊」，超過就是拖曳的起手（px） */
export const CLICK_SLOP = 8;

interface Press {
  x: number;
  y: number;
  /** 觸控不走拖曳，記著才知道要不要略過 */
  touch: boolean;
}

export type PressDragSource = DragItem;

export interface PressDrag {
  /** 按下：先記著，還不算拖曳 */
  onPointerDown: (e: React.PointerEvent) => void;
  /** 移動：超過容忍距離才轉成拖曳 */
  onPointerMove: (e: React.PointerEvent, source: () => PressDragSource | null) => void;
  /** 放開：回傳這一下算不算「點擊」（拖曳中或位移過大都不算） */
  onPointerUp: (e: React.PointerEvent) => { wasClick: boolean };
  onPointerCancel: () => void;
  /** 這一下按下的起點，供呼叫端做自己的距離判定 */
  press: () => Press | null;
}

export function usePressDrag(onDragStart?: () => void): PressDrag {
  const pressRef = useRef<Press | null>(null);

  return {
    onPointerDown: e => {
      if (e.button !== 0) return;
      pressRef.current = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    },

    /**
     * **必須 `setPointerCapture`**：手指／游標一離開這一格，後續的 move 與 up 就會
     * 派給別的元素，拖曳會在半路斷掉且永遠收不到落點。
     *
     * 觸控不走這條路：長按已經給了次要選單，再讓「按住滑動」變成拖曳，
     * 玩家想捲背包時每次都會抓起一格東西。
     */
    onPointerMove: (e, source) => {
      const press = pressRef.current;
      if (!press) return;
      const dragging = useDragStore.getState().item;
      if (press.touch || dragging) {
        if (dragging) useDragStore.getState().move(e.clientX, e.clientY);
        return;
      }
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= CLICK_SLOP) return;

      const src = source();
      if (!src) return;
      onDragStart?.();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      useDragStore.getState().begin(src, e.clientX, e.clientY);
    },

    onPointerUp: e => {
      const press = pressRef.current;
      pressRef.current = null;
      if (useDragStore.getState().item) return { wasClick: false };
      if (!press) return { wasClick: false };
      // 手一定會抖，給容忍距離；超過就當成拖曳的起手，不算點擊
      return { wasClick: Math.hypot(e.clientX - press.x, e.clientY - press.y) <= CLICK_SLOP };
    },

    onPointerCancel: () => {
      pressRef.current = null;
      useDragStore.getState().cancel();
    },

    press: () => pressRef.current,
  };
}
