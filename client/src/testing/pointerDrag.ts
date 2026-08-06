import { fireEvent } from '@testing-library/react';

/**
 * 指標拖放的測試替身（`stores/dragStore.ts`）。
 *
 * 落點靠 `document.elementFromPoint()` 判定，而 **jsdom 沒有版面計算**，
 * 那個函式永遠回 null —— 不換掉它，任何拖放測試都會判成「沒放到東西上」。
 *
 * 這裡改成「指定座標對應到哪個元素」的查表，測試只要說
 * 「從這一格拖到那一格」，不必假造版面。
 */

/** 之後每次 `elementFromPoint` 都回傳這個元素，直到再次呼叫或還原 */
let targetEl: Element | null = null;
let original: typeof document.elementFromPoint | undefined;

function ensureStub(): void {
  if (original) return;
  original = document.elementFromPoint?.bind(document);
  document.elementFromPoint = () => targetEl;
}

/** 還原 `elementFromPoint`，避免測試之間互相污染 */
export function restoreElementFromPoint(): void {
  if (!original) return;
  document.elementFromPoint = original;
  original = undefined;
  targetEl = null;
}

/** 指定「指標現在正壓在哪個元素上」 */
export function pointAt(el: Element | null): void {
  ensureStub();
  targetEl = el;
}

/**
 * 完整走一次拖放：從 `from` 按下、移動到 `to`、在 `to` 上放開。
 *
 * 位移刻意拉到 40px —— 來源要超過 `CLICK_SLOP`（8px）才會從「點擊」轉成拖曳。
 */
export function dragTo(from: Element, to: Element): void {
  ensureStub();
  pointAt(from);
  fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse' });
  pointAt(to);
  // 事件一律派給來源：拖曳期間指標被來源 capture 住，目標收不到任何 pointer 事件
  fireEvent.pointerMove(from, { clientX: 40, clientY: 40, pointerId: 1, pointerType: 'mouse' });
  fireEvent.pointerUp(from, { clientX: 40, clientY: 40, pointerId: 1, pointerType: 'mouse' });
}

/** 只起手不放開（驗證拖曳中的視覺狀態） */
export function dragStart(from: Element): void {
  ensureStub();
  pointAt(from);
  fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse' });
  fireEvent.pointerMove(from, { clientX: 40, clientY: 40, pointerId: 1, pointerType: 'mouse' });
}
