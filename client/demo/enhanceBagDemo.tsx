/**
 * 背包強化演出（`enhance-fx.html`）：格子與疊層結構照 `BagPanel.tsx`，判定不接遊戲邏輯。
 */
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BagGrid, getShortName, padToRows } from '../src/components/BagGrid';
import { GameIcon } from '../src/components/GameIcon';
import { getEquipIcon } from '../src/models/iconMap';

type FxKind = 'safe' | 'success' | 'fail' | 'still';

interface DemoCell {
  key: FxKind;
  name: string;
  type: string;
  color: string;
  level: number;
  hint: string;
}

const CELLS: DemoCell[] = [
  { key: 'safe', name: '鋼心劍', type: 'sword', color: '#60A5FA', level: 3, hint: '安定值內成功' },
  { key: 'success', name: '破曉之刃', type: 'sword', color: '#FACC15', level: 6, hint: '超過安定值成功' },
  { key: 'fail', name: '獵鷹長弓', type: 'bow', color: '#FB923C', level: 8, hint: '失敗（消失）' },
  { key: 'still', name: '雷霆法杖', type: 'staff', color: '#EF4444', level: 9, hint: '無變化（+10 起）' },
];

const SHARD_INDEXES = [1, 2, 3, 4, 5, 6];
const FX_DURATION_MS = 1500;

interface PlayingFx {
  token: number;
  kind: FxKind;
  rect: { left: number; top: number; width: number; height: number };
  label?: string;
  ghost?: DemoCell;
}

function cellName(c: DemoCell): string {
  return getShortName(`${c.name} +${c.level}`);
}

function fxClass(kind: FxKind): string {
  return kind === 'fail' ? ' enh-shake enh-breaking' : '';
}

function Demo() {
  const [cells, setCells] = useState(CELLS);
  const [fx, setFx] = useState<PlayingFx | null>(null);
  const tokenRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const speed = () => Number((document.getElementById('speed') as HTMLSelectElement | null)?.value ?? 1);

  function play(kind: FxKind, el: HTMLElement) {
    const cell = cells.find(c => c.key === kind) ?? CELLS.find(c => c.key === kind)!;
    document.body.classList.remove('demo-scrubbing');
    const scrubVal = document.getElementById('scrub-val');
    if (scrubVal) scrubVal.textContent = '播放中';
    const box = el.getBoundingClientRect();
    const next = kind === 'safe' || kind === 'success' ? cell.level + 1 : cell.level;
    const label = kind === 'fail' ? undefined : kind === 'still' ? '無變化' : `+${next}`;
    setCells(prev => prev.map(c => c.key !== kind ? c
      : kind === 'fail' ? { ...c, level: -1 } : { ...c, level: next }));
    tokenRef.current += 1;
    setFx({
      token: tokenRef.current, kind,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      label, ghost: kind === 'fail' ? cell : undefined,
    });
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (!document.body.classList.contains('demo-scrubbing')) setFx(null);
    }, FX_DURATION_MS * speed());
  }

  function resetAll() {
    setCells(CELLS);
    setFx(null);
  }

  const visible = cells.filter(c => c.level >= 0);
  const slots = padToRows<DemoCell>(visible, 2);

  return (
    <>
      <div className="demo-bag-wrap">
        <div className="bag-panel">
          <BagGrid>
            {slots.map((c, idx) => c ? (
              <div
                key={c.key}
                className="bag-cell equipment"
                data-demo-fx={c.key}
                title={c.hint}
                onClick={e => play(c.key, e.currentTarget)}
              >
                <GameIcon name={getEquipIcon(c.type)} size={24} color={c.color} />
                <span className="bag-cell-name">{cellName(c)}</span>
              </div>
            ) : <div key={`empty-${idx}`} className="bag-cell empty" />)}
          </BagGrid>
        </div>
        <ul className="demo-legend">
          {CELLS.map(c => (
            <li key={c.key}>
              <button onClick={() => {
                const el = document.querySelector<HTMLElement>(`[data-demo-fx="${c.key}"]`);
                if (el) play(c.key, el);
                else resetAll();
              }}>{c.name}</button>
              {c.hint}
            </li>
          ))}
          <li><button onClick={resetAll}>重置背包</button>失敗的武器會消失，按這裡放回來</li>
        </ul>
      </div>

      {fx && (
        <div
          key={`bag-enh-fx-${fx.token}`}
          className={`bag-enh-fx${fxClass(fx.kind)}`}
          style={{ left: fx.rect.left, top: fx.rect.top, width: fx.rect.width, height: fx.rect.height }}
        >
          {fx.ghost && (
            <>
              <GameIcon name={getEquipIcon(fx.ghost.type)} size={24} color={fx.ghost.color} />
              <span className="bag-cell-name">{cellName(fx.ghost)}</span>
            </>
          )}
          <div className="enh-fx-layer">
            {fx.kind === 'success' && (
              <>
                <div className="enh-flash-gold" />
                <div className="enh-ring" />
                <div className="enh-ring delay" />
              </>
            )}
            {fx.kind === 'fail' && (
              <>
                <div className="enh-flash-red" />
                {SHARD_INDEXES.map(i => <div key={i} className={`enh-shard enh-shard--${i}`} />)}
              </>
            )}
            {fx.kind === 'still' && (
              <>
                <div className="enh-dim" />
                <div className="enh-flash-dull" />
              </>
            )}
            {fx.label && <div className={`enh-float${fx.kind === 'still' ? ' is-still' : ''}`}>{fx.label}</div>}
            <div className="enh-flash-soft" />
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('bag-root')!).render(<StrictMode><Demo /></StrictMode>);
