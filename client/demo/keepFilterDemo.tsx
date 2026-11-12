/**
 * 保留條件編輯（`keep-filter.html`）：天賦格列的版面樣本，資料取自 `AFFIX_DEFINITIONS`、`EQUIPMENT_SEEDS`。
 */
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AFFIX_DEFINITIONS } from '../src/models/affix';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { getEquipmentTierColor } from '../src/models/equipmentTier';
import type { EquipmentKeepFilter } from '../src/models/villageScript';

const TYPE_LABELS: Record<string, string> = {
  sword: '單手劍', axe: '單手斧', mace: '鈍器', staff: '法杖', bow: '弓',
  twoHandSword: '雙手劍', twoHandAxe: '雙手斧', twoHandStaff: '雙手法杖', dualBlade: '雙刀', claw: '爪',
  shield: '盾牌', magicBook: '魔法書', armGuard: '臂甲', armor: '防具（含飾品）',
};

interface Option { value: string; label: string; group?: string; color?: string; tier?: number }

const AFFIX_OPTIONS: Option[] = AFFIX_DEFINITIONS.map(a => ({ value: a.type, label: a.name, group: a.group }));
const TYPE_OPTIONS: Option[] = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
const TEMPLATE_OPTIONS: Option[] = EQUIPMENT_SEEDS
  .filter(t => t.acquireType !== 'starter')
  .map(t => ({ value: String(t.id), label: t.name, color: getEquipmentTierColor(t), tier: t.tier }));

const SEARCH_LIMIT = 50;

function summary(selected: string[], options: Option[]): string {
  if (selected.length === 0) return '未選';
  const names = selected.map(v => options.find(o => o.value === v)?.label ?? v);
  return names.length <= 2 ? names.join('、') : `共 ${names.length} 項`;
}

function MultiParam({ label, options, selected, onChange, searchable = false }: {
  label: string; options: Option[]; selected: string[]; onChange: (next: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const matched = options.filter(o => !query || o.label.includes(query));
  const ordered = searchable
    ? [...matched.filter(o => selected.includes(o.value)), ...matched.filter(o => !selected.includes(o.value))]
    : matched;
  const shown = searchable ? ordered.slice(0, SEARCH_LIMIT) : ordered;

  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  for (const o of shown) {
    if (o.group && o.group !== lastGroup) {
      rows.push(<li key={`g-${o.group}`} className="talent-param-multi-group">{o.group}</li>);
      lastGroup = o.group;
    }
    rows.push(
      <li key={o.value}>
        <label>
          <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
          <span style={o.color ? { color: o.color } : undefined}>{o.label}</span>
          {o.tier !== undefined && <span className="talent-param-multi-tier">T{o.tier}</span>}
        </label>
      </li>,
    );
  }

  return (
    <span className="talent-param-multi" ref={ref}>
      {label && <span>{label}</span>}
      <button
        className={`talent-param-multi-btn${selected.length === 0 ? ' is-empty' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {summary(selected, options)} ▾
      </button>
      {open && (
        <div className="talent-param-multi-panel">
          <div className="talent-param-multi-head">
            {searchable && <input placeholder="搜尋名稱" value={query} onChange={e => setQuery(e.target.value)} autoFocus />}
            <button className="talent-param-multi-clear" onClick={() => onChange([])}>清除</button>
          </div>
          <ul className="talent-param-multi-list">
            {rows}
            {searchable && ordered.length > SEARCH_LIMIT && (
              <li className="talent-param-multi-more">還有 {ordered.length - SEARCH_LIMIT} 筆，請輸入名稱縮小範圍</li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}

/** 「本角色穿得起的」兼總開關：勾了才顯示其餘四種，沒勾＝沒有保留條件 */
function KeepFields({ word, keep, patch, setKeep }: {
  word: string; keep: EquipmentKeepFilter | undefined;
  patch: (p: Partial<EquipmentKeepFilter>) => void; setKeep: (k: EquipmentKeepFilter | undefined) => void;
}) {
  const k = keep ?? {};
  return (
    <>
      <label className="talent-param">
        <span>{word}本角色穿得起的</span>
        <input type="checkbox" checked={keep !== undefined}
          onChange={e => setKeep(e.target.checked ? { classUsable: true, affixTierAbove: 5 } : undefined)} />
      </label>
      {keep !== undefined && (
        <>
          <label className="talent-param">
            <span>詞綴 Tier 高於</span>
            <input type="number" min={0} max={7} value={k.affixTierAbove ?? ''}
              onChange={e => patch({ affixTierAbove: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <MultiParam label="帶有詞綴" options={AFFIX_OPTIONS} selected={k.affixTypes ?? []} onChange={v => patch({ affixTypes: v })} />
          <MultiParam label="裝備類型" options={TYPE_OPTIONS} selected={k.equipTypes ?? []} onChange={v => patch({ equipTypes: v })} />
          <MultiParam label="白名單" options={TEMPLATE_OPTIONS} searchable selected={(k.templateIds ?? []).map(String)}
            onChange={v => patch({ templateIds: v.map(Number) })} />
        </>
      )}
    </>
  );
}

function KeepRow({ actionLabel, lead }: { actionLabel: string; lead?: ReactNode }) {
  const [keep, setKeep] = useState<EquipmentKeepFilter | undefined>({ classUsable: true, affixTierAbove: 5 });
  const patch = (p: Partial<EquipmentKeepFilter>) => setKeep(k => ({ ...k, ...p }));
  const word = actionLabel === '存入裝備' ? '存入' : '保留';
  return (
    <>
      <ul className="talent-list">
        <li className="talent-row">
          <span className="talent-row-order">1</span>
          <div className="talent-row-slots">
            <div className="talent-row-conds">
              <div className="talent-slot is-filled"><span className="talent-slot-name">在城鎮／在野外</span></div>
            </div>
            <div className="talent-row-act">
              <span className="talent-row-arrow">→</span>
              <div className="talent-slot is-filled">
                <span className="talent-slot-name">{actionLabel}</span>
                {lead}
                <KeepFields word={word} keep={keep} patch={patch} setKeep={setKeep} />
                <button className="talent-slot-remove" aria-label="清空">✕</button>
              </div>
            </div>
          </div>
        </li>
      </ul>
      <p className="demo-result">存檔內容：{JSON.stringify(keep ?? null)}</p>
    </>
  );
}

const SELL_LEAD = (
  <label className="talent-param">
    <span>Tier 以下</span>
    <input type="number" defaultValue={3} min={1} max={6} />
  </label>
);

const DISMANTLE_LEAD = (
  <>
    <label className="talent-param"><span>Tier 以下</span><input type="number" defaultValue={4} min={4} max={7} /></label>
    <label className="talent-param"><span>含帶技能的掉落品</span><input type="checkbox" /></label>
    <label className="talent-param">
      <span>會出結晶的</span>
      <select defaultValue="improve">
        <option value="improve">新或更強才拆</option>
        <option value="always">照拆</option>
        <option value="never">不拆</option>
      </select>
    </label>
    <label className="talent-param"><span>含製作品 (鍛)</span><input type="checkbox" /></label>
  </>
);

function Demo() {
  return (
    <div className="demo-stage">
      <h2>桌面（760px）</h2>
      <div className="demo-desktop talent-editor">
        <KeepRow actionLabel="販售裝備" lead={SELL_LEAD} />
        <KeepRow actionLabel="拆解裝備" lead={DISMANTLE_LEAD} />
        <KeepRow actionLabel="存入裝備" />
      </div>
      <h2>手機（393px）</h2>
      <div className="demo-mobile talent-editor">
        <KeepRow actionLabel="拆解裝備" lead={DISMANTLE_LEAD} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
