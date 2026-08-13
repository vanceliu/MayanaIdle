import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 背包格子的詳情框（`35-inventory-constraints.md` § 35.6.4）。
 *
 * 兩條規則都在這裡實作，一般分頁與天賦分頁共用同一份：
 * - **Portal 至 body**：留在面板裡會被面板的堆疊脈絡與 `overflow` 裁掉
 * - **自動偵測邊界翻轉**：貼近下緣時往上彈，貼近右緣時靠右對齊
 */

/** 觸發元素與視窗的交界資料，只取用得到的欄位 */
export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** 與觸發元素的間距 */
const GAP = 8;
/** 貼邊時保留的邊距 */
const EDGE = 4;

/**
 * 詳情框的落點。預設貼在格子下方；下方放不下就翻到上方。
 *
 * 純函式，量測與渲染都在外面 —— 邊界翻轉是最容易只在特定螢幕高度才出錯的東西，
 * 抽出來才測得到。
 */
export function placeBagTooltip(anchor: AnchorRect, size: Size, viewport: Viewport): { x: number; y: number } {
  let x = anchor.left;
  if (x + size.width > viewport.width - EDGE) x = anchor.right - size.width;
  if (x < EDGE) x = EDGE;

  let y = anchor.bottom + GAP;
  if (y + size.height > viewport.height - EDGE) {
    const above = anchor.top - GAP - size.height;
    // 上方也放不下時貼齊下緣，寧可蓋住格子也不要溢出畫面
    y = above >= EDGE ? above : Math.max(EDGE, viewport.height - EDGE - size.height);
  }
  return { x, y };
}

export function BagTooltip({ anchor, children }: { anchor: AnchorRect; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  /* 量到真實高度才決定翻不翻。`useLayoutEffect` 在繪製前跑完，不會閃 */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(placeBagTooltip(
      anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      className="bag-tooltip"
      style={{ left: pos?.x ?? anchor.left, top: pos?.y ?? anchor.bottom + GAP, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** 從觸發元素取錨點。`getBoundingClientRect` 已含 `zoom` 縮放後的實際位置 */
export function anchorOf(el: HTMLElement): AnchorRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}
