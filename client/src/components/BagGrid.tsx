import type { ReactNode } from 'react';

/**
 * 背包格的共用設定（`35-inventory-constraints.md` § 35.1）。
 *
 * 一般背包、印記抽屜、天賦分頁**都用這裡**。三處各自寫一份欄數與網格樣式的話，
 * 改了一處就會有分頁比別的窄一圈、格子比別的小一號 —— 那正是玩家一眼看得出來的。
 * 列高、格子外觀在 `App.css` 的 `.bag-grid` / `.bag-cell`，同樣只有那一份。
 */

export const BAG_COLUMNS = 5;

/** 格子名稱一律截短，完整名稱走 tooltip —— 長名稱會把格子撐開，整排跟著歪 */
export function getShortName(name: string): string {
  const floorMatch = name.match(/^(.+?)\s*(\d+F)/);
  if (floorMatch) return `${floorMatch[1]}${floorMatch[2]}`;
  if (name.length <= 4) return name;
  return name.slice(0, 4);
}

/**
 * 補滿空格到指定列數。
 *
 * 只畫有東西的格子會變成一排清單，不像背包；列數對齊也讓不同分頁的面板一樣高。
 */
export function padToRows<T>(items: T[], minRows: number): (T | null)[] {
  const rows = Math.max(minRows, Math.ceil(items.length / BAG_COLUMNS));
  const total = rows * BAG_COLUMNS;
  return [...items, ...Array<null>(Math.max(0, total - items.length)).fill(null)];
}

/** 幾列才裝得下這麼多格 */
export function rowsForSlots(slots: number): number {
  return Math.ceil(slots / BAG_COLUMNS);
}

/** 格子網格本體。欄數只在這裡設定一次 */
export function BagGrid({ children }: { children: ReactNode }) {
  return (
    <div className="bag-grid" style={{ gridTemplateColumns: `repeat(${BAG_COLUMNS}, 1fr)` }}>
      {children}
    </div>
  );
}
