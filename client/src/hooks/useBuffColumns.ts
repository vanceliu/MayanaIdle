import { useLayoutEffect, useState, type RefObject } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * BuffBar 兩欄排列（`24-buff-debuff.md` § 24.8.1）。
 * 座標一律是 `getBoundingClientRect()` 的視窗 px（已含 `--ui-scale`）。
 */

/** 欄數上限 */
export const BUFF_COLUMN_COUNT = 2;

export interface BuffColumnMetrics {
  /** BuffBar 上緣 */
  top: number;
  /** 往下排的界線 */
  bottom: number;
  /** 一格的高度 */
  slotHeight: number;
  /** 格與格的間距 */
  gap: number;
}

/** 每欄格數：上緣到界線放得下幾格，至少 1 */
export function buffRowsPerColumn({ top, bottom, slotHeight, gap }: BuffColumnMetrics): number {
  const pitch = slotHeight + gap;
  if (pitch <= 0) return 1;
  return Math.max(1, Math.floor((bottom - top + gap) / pitch));
}

/** 兩欄放不下時，最後一格改成 `+N`（N＝沒顯示的個數） */
export function splitBuffOverflow<T>(slots: T[], rowsPerColumn: number): { visible: T[]; overflow: number } {
  const capacity = rowsPerColumn * BUFF_COLUMN_COUNT;
  if (slots.length <= capacity) return { visible: slots, overflow: 0 };
  return { visible: slots.slice(0, capacity - 1), overflow: slots.length - (capacity - 1) };
}

export interface Span {
  left: number;
  right: number;
}

export interface LogBox extends Span {
  top: number;
  height: number;
}

/**
 * 往下排的界線：戰鬥紀錄與 BuffBar 兩欄的橫向範圍重疊、且在 BuffBar 下方時取它的上緣，
 * 否則取下方 HUD 帶的上緣。
 */
export function buffBottomLimit(barTop: number, columns: Span, log: LogBox | null, bandTop: number): number {
  if (log && log.height > 0 && log.left < columns.right && log.right > columns.left && log.top > barTop) {
    return Math.min(log.top, bandTop);
  }
  return bandTop;
}

function readLogBox(): LogBox | null {
  const el = document.querySelector('.combat-log-window');
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return { left: box.left, right: box.right, top: box.top, height: box.height };
}

function readBandTop(): number {
  const band = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-band-bottom'));
  return window.innerHeight - (Number.isFinite(band) ? band : 0);
}

/**
 * 量測每欄格數；量不到（沒有格子、jsdom）時回 null，由呼叫端排成單欄。
 * 每次 render 都重量：BuffBar 每秒重繪一次，拖動戰鬥紀錄、改變視窗大小最晚一秒內跟上。
 */
export function useBuffRowsPerColumn(barRef: RefObject<HTMLElement | null>): number | null {
  const uiScale = useSettingsStore(s => s.uiScale);
  const [rows, setRows] = useState<number | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const slot = bar?.querySelector('.buff-icon');
    if (!bar || !slot) return;
    const barBox = bar.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    if (slotBox.height <= 0) return;

    const gap = (parseFloat(getComputedStyle(bar).rowGap) || 0) * uiScale;
    const columns = { left: barBox.left, right: barBox.left + slotBox.width * BUFF_COLUMN_COUNT + gap };
    const bottom = buffBottomLimit(barBox.top, columns, readLogBox(), readBandTop());
    const next = buffRowsPerColumn({ top: barBox.top, bottom, slotHeight: slotBox.height, gap });
    if (next !== rows) setRows(next);
  });

  return rows;
}
