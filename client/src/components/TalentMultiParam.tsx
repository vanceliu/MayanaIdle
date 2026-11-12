import { useRef, useState, type ReactNode } from 'react';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentTierColor } from '../models/equipmentTier';
import {
  AFFIX_TYPE_OPTIONS, EQUIP_TYPE_OPTIONS, KEEP_TEMPLATE_IDS, type ParamMultiSource,
} from '../models/talentParams';

/**
 * 天賦參數的多選欄位（`49-village-script.md` § 49.4 保留條件）。
 * 平時是摘要鈕（未選／前兩項名稱／共 N 項），點開勾選面板；白名單可搜尋，已勾選的排前面，最多列 `SEARCH_LIMIT` 筆。
 */

interface Option {
  value: string | number;
  label: string;
  group?: string;
  color?: string;
  tier?: number;
}

const SEARCH_LIMIT = 50;

function useOptions(source: ParamMultiSource): Option[] {
  const templates = useEquipmentTemplates();
  if (source === 'affix') return [...AFFIX_TYPE_OPTIONS];
  if (source === 'equipType') return [...EQUIP_TYPE_OPTIONS];
  return templates
    .filter(t => t.id != null && KEEP_TEMPLATE_IDS.has(t.id))
    .map(t => ({ value: t.id!, label: t.name, color: getEquipmentTierColor(t), tier: t.tier }));
}

export function summarizeSelection(selected: readonly (string | number)[], options: readonly Option[]): string {
  if (selected.length === 0) return '未選';
  const names = selected.map(v => options.find(o => o.value === v)?.label ?? String(v));
  return names.length <= 2 ? names.join('、') : `共 ${names.length} 項`;
}

export function TalentMultiParam({ label, source, value, onWrite }: {
  label: string;
  source: ParamMultiSource;
  value: readonly (string | number)[] | undefined;
  onWrite: (next: (string | number)[]) => unknown;
}) {
  const options = useOptions(source);
  const selected = value ?? [];
  const searchable = source === 'template';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  const toggle = (v: string | number) =>
    onWrite(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
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
    <span className="talent-param-multi" ref={ref} onClick={e => e.stopPropagation()}>
      <span>{label}</span>
      <button
        type="button"
        className={`talent-param-multi-btn${selected.length === 0 ? ' is-empty' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {summarizeSelection(selected, options)} ▾
      </button>
      {open && (
        <div className="talent-param-multi-panel">
          <div className="talent-param-multi-head">
            {searchable && (
              <input placeholder="搜尋名稱" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            )}
            <button type="button" className="talent-param-multi-clear" onClick={() => onWrite([])}>清除</button>
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
