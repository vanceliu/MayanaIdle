import { useState } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import {
  SIGIL_DEFINITIONS,
  SIGIL_EXCHANGE_FEE_COUNT,
  SIGIL_EXCHANGE_FEE_TYPES,
  SIGIL_EXCHANGE_INPUT_COUNT,
  SIGIL_EXCHANGE_TYPES,
  checkSigilExchange,
  getDefaultSigilExchangeFee,
  type SigilCounts,
  type SigilType,
} from '../../models/sigil';
import { getBagItemAmount } from '../../models/bagItem';
import { sigilDisplay } from './sigilDisplay';

function total(counts: SigilCounts): number {
  return Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
}

function heldSigils(bagItems: Parameters<typeof getBagItemAmount>[0]): Record<SigilType, number> {
  return Object.fromEntries(
    SIGIL_DEFINITIONS.map(d => [d.type, getBagItemAmount(bagItems, d.itemId)]),
  ) as Record<SigilType, number>;
}

type Step = { label: string; delta: number | 'fill' };
const MATERIAL_STEPS: Step[] = [{ label: '−', delta: -1 }, { label: '＋', delta: 1 }];
/** § 13.13.2 手續費一整行：−10／−／數量／＋／＋10／填滿 */
const FEE_STEPS: Step[] = [
  { label: '−10', delta: -10 }, { label: '−', delta: -1 },
  { label: '＋', delta: 1 }, { label: '＋10', delta: 10 }, { label: '填滿', delta: 'fill' },
];

function stepLabel(step: Step, name: string): string {
  if (step.delta === 'fill') return `用${name}填滿`;
  const verb = step.delta > 0 ? '增加' : '減少';
  return Math.abs(step.delta) === 1 ? `${verb}${name}` : `${verb} ${Math.abs(step.delta)} 個${name}`;
}

function stepTitle(step: Step, name: string, required: number): string {
  if (step.delta === 'fill') return `用${name}補到合計 ${required} 個（持有不足時補到持有數為止）`;
  return step.delta > 0 ? `${name} +${step.delta}` : `${name} −${-step.delta}`;
}

/** 印記師「兌換印記」分頁（`13-town.md` § 13.13.2、`46-sigil.md` § 46.13） */
export function SigilExchange() {
  const bagItems = useGameStore(s => s.bagItems);
  const [target, setTarget] = useState<SigilType>(SIGIL_EXCHANGE_TYPES[0]);
  const [inputs, setInputs] = useState<SigilCounts>({});
  const [fee, setFee] = useState<SigilCounts>(() => getDefaultSigilExchangeFee(heldSigils(bagItems)));
  /** 上一次兌換的結果；任何選取變動就清掉，改顯示判定原因 */
  const [result, setResult] = useState<CraftResult | null>(null);

  const held = heldSigils(bagItems);
  const check = checkSigilExchange(target, inputs, fee, held);
  const blocked = check.ok ? null : check.reason;

  async function handleExchange() {
    const settled = useGameStore.getState().exchangeSigils(target, inputs, fee);
    const result = await settled;
    setResult(result);
    if (!result.ok) return;
    setInputs({});
    setFee(getDefaultSigilExchangeFee(heldSigils(useGameStore.getState().bagItems)));
  }

  function renderCountGroup(
    title: string,
    types: readonly SigilType[],
    counts: SigilCounts,
    setCounts: (next: SigilCounts) => void,
    required: number,
    steps: Step[],
  ) {
    const sum = total(counts);
    const wide = steps.length > MATERIAL_STEPS.length;
    return (
      <>
        <p className="sigil-section-title">{title}（已選 {sum} / {required}）</p>
        <div className={`sigil-exchange-counts${wide ? ' is-full-row' : ''}`}>
          {types.map(type => {
            const info = sigilDisplay(type);
            const n = counts[type] ?? 0;
            const ceiling = Math.min(held[type], n + (required - sum));
            const targetOf = (step: Step) => (step.delta === 'fill'
              ? ceiling
              : Math.max(0, Math.min(n + step.delta, ceiling)));
            const renderStep = (step: Step) => {
              const next = targetOf(step);
              return (
                <button
                  key={step.label}
                  type="button"
                  className={step.label.length > 1 ? 'is-wide' : undefined}
                  aria-label={stepLabel(step, info.name)}
                  title={stepTitle(step, info.name, required)}
                  disabled={next === n}
                  onClick={() => { setCounts({ ...counts, [type]: next }); setResult(null); }}
                >{step.label}</button>
              );
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
                {steps.filter(s => s.delta !== 'fill' && s.delta < 0).map(renderStep)}
                <span className="sigil-exchange-amount">{n}</span>
                {steps.filter(s => s.delta === 'fill' || s.delta > 0).map(renderStep)}
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

        {renderCountGroup('材料', SIGIL_EXCHANGE_TYPES, inputs, setInputs, SIGIL_EXCHANGE_INPUT_COUNT, MATERIAL_STEPS)}
        {renderCountGroup('手續費', SIGIL_EXCHANGE_FEE_TYPES, fee, setFee, SIGIL_EXCHANGE_FEE_COUNT, FEE_STEPS)}

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
