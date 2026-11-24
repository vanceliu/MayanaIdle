import type { ReactNode } from 'react';

/**
 * 背包格的共用設定（`35-inventory-constraints.md` § 35.21.3）。
 * 一般背包、印記抽屜、天賦分頁共用；列高與格子外觀在 `App.css` 的 `.bag-grid` / `.bag-cell`。
 */

export const BAG_COLUMNS = 5;

/** 補滿空格到指定列數 */
export function padToRows<T>(items: T[], minRows: number): (T | null)[] {
  const rows = Math.max(minRows, Math.ceil(items.length / BAG_COLUMNS));
  const total = rows * BAG_COLUMNS;
  return [...items, ...Array<null>(Math.max(0, total - items.length)).fill(null)];
}

/** 幾列才裝得下這麼多格 */
export function rowsForSlots(slots: number): number {
  return Math.ceil(slots / BAG_COLUMNS);
}

/** 格子網格本體 */
export function BagGrid({ children }: { children: ReactNode }) {
  return (
    <div className="bag-grid" style={{ gridTemplateColumns: `repeat(${BAG_COLUMNS}, 1fr)` }}>
      {children}
    </div>
  );
}
