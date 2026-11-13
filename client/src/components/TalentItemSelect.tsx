import { useRef, useState } from 'react';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';
import { getItemById, type ItemCategory, type ItemDefinition } from '../models/items';
import type { TalentItemPool } from '../models/talentParams';
import { talentItemOptions } from '../systems/talentItemOptions';

/**
 * 天賦參數的道具選單（`51-auto-talent.md` § 51.4.10~§ 51.4.11）：單選，依類別分組、各組可收合。
 * 只有一組時直接展開；打開時已選道具所在的組展開。搜尋時只列名稱含關鍵字的道具，有結果的組全部展開。
 */

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  potion: '藥水', scroll: '卷軸', material: '材料', dungeon: '副本道具', spellbook: '魔法書', other: '其他',
};

function groupByCategory(items: readonly ItemDefinition[]): [ItemCategory, ItemDefinition[]][] {
  const groups = new Map<ItemCategory, ItemDefinition[]>();
  for (const d of items) {
    const list = groups.get(d.category) ?? [];
    list.push(d);
    groups.set(d.category, list);
  }
  return [...groups];
}

export function TalentItemSelect({ label, pool, value, onWrite }: {
  label: string;
  pool?: TalentItemPool;
  value: number | undefined;
  onWrite: (next: number | undefined) => unknown;
}) {
  const groups = groupByCategory(talentItemOptions(pool));
  const selected = value != null ? getItemById(value) : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const keyword = query.trim();
  const shown = keyword
    ? groups
      .map(([category, items]) => [category, items.filter(d => d.name.includes(keyword))] as [ItemCategory, ItemDefinition[]])
      .filter(([, items]) => items.length > 0)
    : groups;
  const [expanded, setExpanded] = useState<ReadonlySet<ItemCategory>>(new Set());
  const ref = useRef<HTMLSpanElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  function toggleOpen() {
    if (!open) {
      setExpanded(new Set(groups.length === 1 ? [groups[0][0]] : selected ? [selected.category] : []));
      setQuery('');
    }
    setOpen(o => !o);
  }

  function toggleGroup(category: ItemCategory) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function pick(next: number | undefined) {
    onWrite(next);
    setOpen(false);
  }

  return (
    <span className="talent-param-multi" ref={ref} onClick={e => e.stopPropagation()}>
      <span>{label}</span>
      <button
        type="button"
        className={`talent-param-multi-btn${selected ? '' : ' is-empty'}`}
        onClick={toggleOpen}
      >
        {selected?.name ?? '未選擇'} ▾
      </button>
      {open && (
        <div className="talent-param-multi-panel">
          <div className="talent-param-multi-head">
            <input placeholder="搜尋名稱" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            {selected && (
              <button type="button" className="talent-param-multi-clear" onClick={() => pick(undefined)}>清除</button>
            )}
          </div>
          <ul className="talent-param-multi-list">
            {shown.length === 0 && <li className="talent-param-multi-more">沒有符合的道具</li>}
            {shown.map(([category, items]) => {
              const isOpen = keyword !== '' || expanded.has(category);
              return (
                <li key={category}>
                  <button
                    type="button"
                    className="talent-item-group"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(category)}
                  >
                    <span className="talent-item-group-arrow" aria-hidden="true">{isOpen ? '▼' : '▶'}</span>
                    {CATEGORY_LABELS[category]}
                    <span className="talent-item-group-count">{items.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="talent-item-options">
                      {items.map(d => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className={`talent-item-option${d.id === value ? ' is-selected' : ''}`}
                            onClick={() => pick(d.id)}
                          >
                            {d.name}
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
