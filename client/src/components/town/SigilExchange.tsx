import { useState } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import {
  SIGIL_DEFINITIONS,
  SIGIL_EXCHANGE_FEE_COUNT,
  SIGIL_EXCHANGE_FEE_TYPES,
  SIGIL_EXCHANGE_INPUT_COUNT,
  SIGIL_EXCHANGE_TYPES,
  checkSigilExchange,
  type SigilCounts,
  type SigilType,
} from '../../models/sigil';
import { getBagItemAmount } from '../../models/bagItem';
import { sigilDisplay } from './sigilDisplay';

function total(counts: SigilCounts): number {
  return Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
}

/** 印記師「兌換印記」分頁（`13-town.md` § 13.13.2、`46-sigil.md` § 46.13） */
export function SigilExchange() {
  const bagItems = useGameStore(s => s.bagItems);
  const [target, setTarget] = useState<SigilType>(SIGIL_EXCHANGE_TYPES[0]);
  const [inputs, setInputs] = useState<SigilCounts>({});
  const [fee, setFee] = useState<SigilCounts>({});
  /** 上一次兌換的結果；任何選取變動就清掉，改顯示判定原因 */
  const [result, setResult] = useState<CraftResult | null>(null);

  const held = Object.fromEntries(
    SIGIL_DEFINITIONS.map(d => [d.type, getBagItemAmount(bagItems, d.itemId)]),
  ) as Record<SigilType, number>;
  const check = checkSigilExchange(target, inputs, fee, held);
  const blocked = check.ok ? null : check.reason;

  async function handleExchange() {
    const settled = useGameStore.getState().exchangeSigils(target, inputs, fee);
    const result = await settled;
    setResult(result);
    if (!result.ok) return;
    setInputs({});
    setFee({});
  }

  function renderCountGroup(
    title: string,
    types: readonly SigilType[],
    counts: SigilCounts,
    setCounts: (next: SigilCounts) => void,
    required: number,
  ) {
    const sum = total(counts);
    return (
      <>
        <p className="sigil-section-title">{title}（已選 {sum} / {required}）</p>
        <div className="sigil-exchange-counts">
          {types.map(type => {
            const info = sigilDisplay(type);
            const n = counts[type] ?? 0;
            const change = (delta: number) => {
              setCounts({ ...counts, [type]: n + delta });
              setResult(null);
            };
            return (
              <div
                key={type}
                className="sigil-exchange-row"
                data-testid={`sigil-exchange-row-${type}`}
                style={info.color ? ({ '--sigil-color': info.color } as React.CSSProperties) : undefined}
              >
                <span className="sigil-choice-dot" />
                <span className="sigil-exchange-name">{info.name}</span>
                <span className="sigil-choice-count">持有 {held[type]}</span>
                <button type="button" aria-label={`減少${info.name}`} disabled={n <= 0} onClick={() => change(-1)}>−</button>
                <span className="sigil-exchange-amount">{n}</span>
                <button
                  type="button"
                  aria-label={`增加${info.name}`}
                  disabled={sum >= required || n >= held[type]}
                  onClick={() => change(1)}
                >＋</button>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sigil-exchange-body">
        <p className="sigil-section-title">兌換目標</p>
        <div className="sigil-choices">
          {SIGIL_EXCHANGE_TYPES.map(type => {
            const info = sigilDisplay(type);
            return (
              <button
                key={type}
                type="button"
                className={`sigil-choice${type === target ? ' is-selected' : ''}`}
                style={info.color ? ({ '--sigil-color': info.color } as React.CSSProperties) : undefined}
                onClick={() => { setTarget(type); setResult(null); }}
              >
                <span className="sigil-choice-dot" />
                {info.name}
                <span className="sigil-choice-count">×{held[type]}</span>
              </button>
            );
          })}
        </div>

        {renderCountGroup('材料', SIGIL_EXCHANGE_TYPES, inputs, setInputs, SIGIL_EXCHANGE_INPUT_COUNT)}
        {renderCountGroup('手續費', SIGIL_EXCHANGE_FEE_TYPES, fee, setFee, SIGIL_EXCHANGE_FEE_COUNT)}

        <p className="sigil-cost">
          消耗：材料 ×{SIGIL_EXCHANGE_INPUT_COUNT}（{SIGIL_EXCHANGE_TYPES.map(t => sigilDisplay(t).name).join('／')} 任意混搭）
          ＋ 手續費 ×{SIGIL_EXCHANGE_FEE_COUNT}（{SIGIL_EXCHANGE_FEE_TYPES.map(t => sigilDisplay(t).name).join('＋')} 合計）
          　獲得：{sigilDisplay(target).name} ×1　必定成功
        </p>
      </div>

      <div className="sigil-footer">
        <span className={`sigil-footer-msg${(result ? !result.ok : blocked != null) ? ' is-error' : ''}`}>
          {result?.message ?? blocked ?? ''}
        </span>
        <button className="sigil-apply" onClick={handleExchange} disabled={blocked != null}>
          兌換
        </button>
      </div>
    </>
  );
}
