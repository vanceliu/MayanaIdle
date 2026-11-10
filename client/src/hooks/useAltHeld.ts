import { useSyncExternalStore } from 'react';

/**
 * 目前是否按住 Alt（Mac 為 Option），裝備 tooltip 顯示數值區間用（`34-ui-guidelines.md` § 34.2）。
 *
 * - 全域監聽在第一次訂閱時掛上、不再移除：tooltip 開啟前就按住的 Alt 也要算到
 * - Alt 單鍵的預設行為一律擋掉：Windows 瀏覽器／Electron 會把焦點移到選單列
 * - `pointermove` 以 `altKey` 校正；視窗失焦一律視為放開（Alt+Tab 切走收不到 keyup）
 */

let held = false;
let installed = false;
const listeners = new Set<() => void>();

function setHeld(next: boolean): void {
  if (next === held) return;
  held = next;
  for (const l of listeners) l();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Alt') return;
  e.preventDefault();
  setHeld(true);
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key !== 'Alt') return;
  e.preventDefault();
  setHeld(false);
}

function onPointerMove(e: PointerEvent): void {
  setHeld(e.altKey);
}

function onBlur(): void {
  setHeld(false);
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('blur', onBlur);
}

function subscribe(onChange: () => void): () => void {
  install();
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribe, () => held, () => false);
}

/** 測試用：回到未按住 */
export function resetAltHeld(): void {
  held = false;
}
