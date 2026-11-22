import { useRef, useState, type ReactNode } from 'react';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

/**
 * 分組單選選單：摘要鈕＋彈出面板，依組收合、可依名稱搜尋。
 * 只有一組時直接展開；打開時已選項目所在的組展開。搜尋時只列名稱含關鍵字的項目，有結果的組全部展開。
 * 樣式沿用天賦參數選單（`App.css` 的 `talent-param-multi-*`、`talent-item-*`）。
 */

export interface PickerOption<V extends string | number> {
  value: V;
  label: string;
}

export interface PickerGroup<V extends string | number> {
  key: string;
  label: string;
  options: PickerOption<V>[];
}

export function GroupedPicker<V extends string | number>({
  label, groups, value, buttonText, emptyText, onPick, onClear,
}: {
  label?: ReactNode;
  /** 空的組不顯示 */
  groups: readonly PickerGroup<V>[];
  value?: V;
  buttonText: string;
  emptyText: string;
  onPick: (value: V) => void;
  /** 有值時面板顯示「清除」 */
  onClear?: () => void;
}) {
  const nonEmpty = groups.filter(g => g.options.length > 0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const ref = useRef<HTMLSpanElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  const keyword = query.trim();
  const shown = keyword
    ? nonEmpty
      .map(g => ({ ...g, options: g.options.filter(o => o.label.includes(keyword)) }))
      .filter(g => g.options.length > 0)
    : nonEmpty;

  function toggleOpen() {
    if (!open) {
      const selectedGroup = value != null ? nonEmpty.find(g => g.options.some(o => o.value === value)) : undefined;
      setExpanded(new Set(nonEmpty.length === 1 ? [nonEmpty[0].key] : selectedGroup ? [selectedGroup.key] : []));
      setQuery('');
    }
    setOpen(o => !o);
  }

  function toggleGroup(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pick(next: V) {
    onPick(next);
    setOpen(false);
  }

  return (
    <span className="talent-param-multi" ref={ref} onClick={e => e.stopPropagation()}>
      {label != null && <span>{label}</span>}
      <button
        type="button"
        className={`talent-param-multi-btn${value != null ? '' : ' is-empty'}`}
        onClick={toggleOpen}
      >
        {buttonText} ▾
      </button>
      {open && (
        <div className="talent-param-multi-panel">
          <div className="talent-param-multi-head">
            <input placeholder="搜尋名稱" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            {value != null && onClear && (
              <button
                type="button"
                className="talent-param-multi-clear"
                onClick={() => { onClear(); setOpen(false); }}
              >
                清除
              </button>
            )}
          </div>
          <ul className="talent-param-multi-list">
            {shown.length === 0 && <li className="talent-param-multi-more">{emptyText}</li>}
            {shown.map(g => {
              const isOpen = keyword !== '' || expanded.has(g.key);
              return (
                <li key={g.key}>
                  <button
                    type="button"
                    className="talent-item-group"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(g.key)}
                  >
                    <span className="talent-item-group-arrow" aria-hidden="true">{isOpen ? '▼' : '▶'}</span>
                    {g.label}
                    <span className="talent-item-group-count">{g.options.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="talent-item-options">
                      {g.options.map(o => (
                        <li key={o.value}>
                          <button
                            type="button"
                            className={`talent-item-option${o.value === value ? ' is-selected' : ''}`}
                            onClick={() => pick(o.value)}
                          >
                            {o.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}
