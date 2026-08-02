import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * § 35.5.3：從背包拖到地圖上後的丟棄確認。
 * 堆疊物品可選擇丟棄數量；裝備固定 1 件。
 */
export function DiscardConfirmModal() {
  const pending = useGameStore(s => s.pendingDiscard);
  const cancelDiscard = useGameStore(s => s.cancelDiscard);
  const confirmDiscard = useGameStore(s => s.confirmDiscard);
  const [amount, setAmount] = useState(1);

  // 換一個丟棄對象時重置數量
  useEffect(() => {
    setAmount(1);
  }, [pending?.name, pending?.equipmentId]);

  if (!pending) return null;

  const stackable = pending.kind === 'bag' && pending.maxAmount > 1;
  const clamp = (n: number) => Math.max(1, Math.min(n, pending.maxAmount));

  return (
    <div className="modal-overlay" onClick={cancelDiscard}>
      <div className="modal-content discard-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">丟棄物品</span>
        </div>

        <div className="discard-body">
          <p className="discard-target">
            {pending.name}
            {stackable && <span className="discard-owned">（持有 {pending.maxAmount}）</span>}
          </p>

          {stackable && (
            <div className="discard-amount-row">
              <label htmlFor="discard-amount">丟棄數量</label>
              <div className="discard-amount-controls">
                <button onClick={() => setAmount(a => clamp(a - 1))} disabled={amount <= 1}>−</button>
                <input
                  id="discard-amount"
                  type="number"
                  min={1}
                  max={pending.maxAmount}
                  value={amount}
                  onChange={e => setAmount(clamp(Number(e.target.value) || 1))}
                />
                <button
                  onClick={() => setAmount(a => clamp(a + 1))}
                  disabled={amount >= pending.maxAmount}
                >
                  ＋
                </button>
                <button className="discard-all" onClick={() => setAmount(pending.maxAmount)}>
                  全部
                </button>
              </div>
            </div>
          )}

          <p className="discard-warning">丟棄後無法復原。</p>
        </div>

        <div className="discard-actions">
          <button className="btn-secondary" onClick={cancelDiscard}>取消</button>
          <button className="btn-danger" onClick={() => confirmDiscard(amount)}>
            丟棄{stackable && amount > 1 ? ` ×${amount}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
