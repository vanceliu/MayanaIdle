/**
 * 商店／倉庫共用的購物車（§ 34.1 底部動作列）
 *
 * 清單列上只有數量步進器，實際動作收成面板底部唯一的一顆按鈕，
 * 金額顯示在按鈕旁邊。未動過的列數量為 0，代表不進結帳。
 */

import { useCallback, useState } from 'react';
import { useTownStore } from '../../stores/townStore';
import { parseQty } from './QtyStepper';

/** 已選的一列：原始項目 + 這次要結帳的數量 */
export interface CartLine<T> {
  key: string;
  item: T;
  qty: number;
}

export interface ShopCart {
  /** 該列輸入框的原始字串（未動過的列為 '0'） */
  raw: (key: string) => string;
  set: (key: string, next: string) => void;
  /** 結帳完成後清空，避免數量殘留在已消失的列上 */
  clear: () => void;
}

export function useShopCart(): ShopCart {
  const [qty, setQty] = useState<Record<string, string>>({});

  const raw = useCallback((key: string) => qty[key] ?? '0', [qty]);
  const set = useCallback((key: string, next: string) => {
    setQty(q => ({ ...q, [key]: next }));
  }, []);
  const clear = useCallback(() => setQty({}), []);

  return { raw, set, clear };
}

/** 單列實際生效的數量（最小 0；空白／非法值視為 0） */
export function cartQty(cart: ShopCart, key: string, max: number, hardCap?: number): number {
  return parseQty(cart.raw(key), max, hardCap, 0);
}

export interface CartLineOptions<T> {
  keyOf: (item: T) => string;
  /** 該列允許的上限（買：買得起的量；賣／存／取：持有量；唯一裝備固定 1） */
  maxOf: (item: T) => number;
  hardCap?: number;
}

/** 從清單挑出數量 > 0 的列，順序與傳入清單一致 */
export function cartLines<T>(cart: ShopCart, items: T[], opts: CartLineOptions<T>): CartLine<T>[] {
  const lines: CartLine<T>[] = [];
  for (const item of items) {
    const key = opts.keyOf(item);
    const qty = cartQty(cart, key, opts.maxOf(item), opts.hardCap);
    if (qty > 0) lines.push({ key, item, qty });
  }
  return lines;
}

/**
 * 底部動作列的摘要文字。
 * `件` 用於唯一裝備（一件就是一件），`個` 用於可堆疊道具（幾種、共幾個）。
 */
export function cartSummary<T>(lines: CartLine<T>[], unit: '個' | '件'): string {
  if (lines.length === 0) return '未選擇任何項目';
  if (unit === '件') return `已選 ${lines.length} 件`;
  const total = lines.reduce((sum, l) => sum + l.qty, 0);
  return `已選 ${lines.length} 種 · 共 ${total} 個`;
}

export interface ShopCartFooterProps {
  /** 已選摘要，通常來自 `cartSummary()` */
  summary: string;
  /** 按鈕旁邊的金額文字（含正負號與 G）；沒有金錢往來時傳 null */
  amount?: string | null;
  /** 動作按鈕文字：購買 / 賣出 / 出售 / 存入 / 取出 */
  actionLabel: string;
  disabled: boolean;
  /** 不能執行的原因（金幣不足、背包欄位不足…），顯示在摘要下方 */
  hint?: string | null;
  onAction: () => void;
}

export function ShopCartFooter({
  summary,
  amount = null,
  actionLabel,
  disabled,
  hint = null,
  onAction,
}: ShopCartFooterProps) {
  const closeFacility = useTownStore(s => s.closeFacility);

  // 按鈕在條件不成立時就是 disabled，因此按得下去代表這次結帳一定成立：
  // 結帳完直接收掉設施視窗，玩家不用再多按一次關閉。
  function handleClick() {
    onAction();
    closeFacility();
  }

  return (
    <div className="shop-cart-footer">
      <div className="shop-cart-info">
        <span className="shop-cart-summary">{summary}</span>
        {hint && <span className="shop-cart-hint">{hint}</span>}
      </div>
      {amount && <span className="shop-cart-amount">{amount}</span>}
      <button
        type="button"
        className="shop-cart-btn"
        onClick={handleClick}
        disabled={disabled}
      >
        {actionLabel}
      </button>
    </div>
  );
}
