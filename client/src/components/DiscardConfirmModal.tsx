import { useState } from 'react';
import { useGameStore, type PendingDiscard } from '../stores/gameStore';

/**
 * § 35.5.3：丟棄確認。單項（拖到地圖）預設 1，多項（多選，§ 35.1.5）預設持有量；
 * 堆疊物品可選擇數量，裝備固定 1 件。
 */
export function DiscardConfirmModal() {
  const pending = useGameStore(s => s.pendingDiscard);
  const batch = useGameStore(s => s.pendingDiscardBatch);
  if (batch) return <DiscardBatchModal entries={batch} />;
  if (pending) return <DiscardSingleModal pending={pending} />;
  return null;
}

function entryKey(entry: PendingDiscard): string {
  return entry.kind === 'equipment' ? `e${entry.equipmentId}` : `b${entry.itemId}`;
}

function isStackable(entry: PendingDiscard): boolean {
  return entry.kind === 'bag' && entry.maxAmount > 1;
}

/** 換一組丟棄對象時重置數量 */
function useAmountsFor<T>(key: string, initial: () => T): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(() => ({ key, value: initial() }));
  const value = state.key === key ? state.value : initial();
  if (state.key !== key) setState({ key, value });
  const set = (next: T | ((prev: T) => T)) =>
    setState(s => ({ key, value: typeof next === 'function' ? (next as (prev: T) => T)(s.value) : next }));
  return [value, set];
}

function DiscardSingleModal({ pending }: { pending: PendingDiscard }) {
  const cancelDiscard = useGameStore(s => s.cancelDiscard);
  const confirmDiscard = useGameStore(s => s.confirmDiscard);
  const [amount, setAmount] = useAmountsFor(entryKey(pending), () => 1);
  const stackable = isStackable(pending);

  return (
    <DiscardFrame
      onCancel={cancelDiscard}
      onConfirm={() => confirmDiscard(amount)}
      confirmLabel={`丟棄${stackable && amount > 1 ? ` ×${amount}` : ''}`}
    >
      <p className="discard-target">
        {pending.name}
        {stackable && <span className="discard-owned">（持有 {pending.maxAmount}）</span>}
      </p>
      {stackable && (
        <div className="discard-amount-row">
          <label htmlFor="discard-amount">丟棄數量</label>
          <AmountControls id="discard-amount" max={pending.maxAmount} value={amount} onChange={setAmount} />
        </div>
      )}
    </DiscardFrame>
  );
}

function DiscardBatchModal({ entries }: { entries: PendingDiscard[] }) {
  const cancelDiscard = useGameStore(s => s.cancelDiscard);
  const confirmDiscardBatch = useGameStore(s => s.confirmDiscardBatch);
  const [amounts, setAmounts] = useAmountsFor(entries.map(entryKey).join('|'), () => entries.map(e => e.maxAmount));
  const setAt = (i: number, n: number) => setAmounts(prev => prev.map((a, j) => (j === i ? n : a)));

  return (
    <DiscardFrame
      onCancel={cancelDiscard}
      onConfirm={() => confirmDiscardBatch(amounts)}
      confirmLabel={`丟棄 ${entries.length} 項`}
    >
      <ul className="discard-batch-list">
        {entries.map((entry, i) => (
          <li key={entryKey(entry)} className="discard-batch-row">
            <span className="discard-target">
              {entry.name}
              {isStackable(entry) && <span className="discard-owned">（持有 {entry.maxAmount}）</span>}
            </span>
            {isStackable(entry) && (
              <AmountControls
                id={`discard-amount-${entryKey(entry)}`}
                label={`${entry.name} 丟棄數量`}
                max={entry.maxAmount}
                value={amounts[i]}
                onChange={n => setAt(i, n)}
              />
            )}
          </li>
        ))}
      </ul>
    </DiscardFrame>
  );
}

function DiscardFrame({ onCancel, onConfirm, confirmLabel, children }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={() => onCancel()}>
      <div className="modal-content discard-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">丟棄物品</span>
        </div>
        <div className="discard-body">
          {children}
          <p className="discard-warning">丟棄後無法復原。</p>
        </div>
        <div className="discard-actions">
          <button className="btn-secondary" onClick={() => onCancel()}>取消</button>
          <button className="btn-danger" onClick={() => onConfirm()}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** 數量選擇器：±、直接輸入、「全部」，夾在 1~max */
function AmountControls({ id, label, max, value, onChange }: {
  id: string;
  label?: string;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(n, max));
  return (
    <div className="discard-amount-controls">
      <button onClick={() => onChange(clamp(value - 1))} disabled={value <= 1}>−</button>
      <input
        id={id}
        aria-label={label}
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || 1))}
      />
      <button onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>＋</button>
      <button className="discard-all" onClick={() => onChange(max)}>全部</button>
    </div>
  );
}
