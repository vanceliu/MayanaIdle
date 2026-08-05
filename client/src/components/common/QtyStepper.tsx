/**
 * 數量步進器：[−10] [−] [輸入框] [+] [+10]（可選 [全部]）
 * 商店買賣、倉庫存取共用，讓數量可以直接打字、也可以用按鈕微調。
 *
 * 購物車模式（§ 34.1 底部動作列）傳 `min={0}`：數量可歸零表示「這一列不結帳」，
 * 動作按鈕只有面板底部那一顆。
 */

/** 單筆操作的預設上限，避免輸入框被貼上超長數字 */
export const DEFAULT_MAX_QTY = 999;

/** 實際可用的上限：不得超過持有量 / 可負擔量，也不得超過 hardCap，且不低於 min */
export function qtyLimit(max: number, hardCap = DEFAULT_MAX_QTY, min = 1): number {
  return Math.max(min, Math.min(max, hardCap));
}

/** 把輸入框的原始字串轉成實際可用的數量（空白 / 非法值一律當 min） */
export function parseQty(raw: string, max: number, hardCap = DEFAULT_MAX_QTY, min = 1): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(n, qtyLimit(max, hardCap, min));
}

export interface QtyStepperProps {
  /** 輸入框的原始字串（允許暫時為空，方便使用者刪掉重打） */
  value: string;
  /** 此筆操作允許的最大數量（買：買得起的量；賣／存／取：持有量） */
  max: number;
  onChange: (next: string) => void;
  /** 用於 aria-label 前綴，讓每一列的輸入框可被個別定位 */
  label: string;
  /** 單筆操作硬上限，預設 999；倉庫等不需要額外上限時可傳 Infinity */
  hardCap?: number;
  /** 允許的最小數量，預設 1；購物車模式傳 0 讓玩家可以取消選取 */
  min?: number;
  /** 顯示「全部」鈕：把數量一次拉到上限（只改數量，不執行動作） */
  showMax?: boolean;
}

export function QtyStepper({
  value,
  max,
  onChange,
  label,
  hardCap = DEFAULT_MAX_QTY,
  min = 1,
  showMax = false,
}: QtyStepperProps) {
  const limit = qtyLimit(max, hardCap, min);
  const qty = parseQty(value, max, hardCap, min);

  function step(delta: number) {
    onChange(String(Math.max(min, Math.min(qty + delta, limit))));
  }

  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-btn qty-btn-wide"
        aria-label={`${label} 減少十個`}
        onClick={() => step(-10)}
        disabled={qty <= min}
      >
        −10
      </button>
      <button
        type="button"
        className="qty-btn"
        aria-label={`${label} 減少數量`}
        onClick={() => step(-1)}
        disabled={qty <= min}
      >
        −
      </button>
      <input
        className="qty-input"
        type="text"
        inputMode="numeric"
        aria-label={`${label} 數量`}
        value={value}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '');
          if (digits === '') return onChange('');
          onChange(String(Math.min(Number.parseInt(digits, 10), limit)));
        }}
        onBlur={() => onChange(String(qty))}
      />
      <button
        type="button"
        className="qty-btn"
        aria-label={`${label} 增加數量`}
        onClick={() => step(1)}
        disabled={qty >= limit}
      >
        +
      </button>
      <button
        type="button"
        className="qty-btn qty-btn-wide"
        aria-label={`${label} 增加十個`}
        onClick={() => step(10)}
        disabled={qty >= limit}
      >
        +10
      </button>
      {showMax && (
        <button
          type="button"
          className="qty-btn qty-btn-wide"
          aria-label={`${label} 全部`}
          onClick={() => onChange(String(limit))}
          disabled={qty >= limit}
        >
          全部
        </button>
      )}
    </div>
  );
}
