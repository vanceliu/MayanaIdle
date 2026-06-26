import { useState, useMemo } from 'react';
import { useArmorList, useDropSourceForItem, getAreaDisplayName } from '../hooks/useWikiData';
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';

const SLOT_LABELS: Record<string, string> = {
  helmet: '頭盔',
  chest: '盔甲',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指',
  ring2: '戒指',
  leftHand: '副手',
};

const CLASS_LABELS: Record<string, string> = {
  knight: '騎士',
  elf: '妖精',
  thief: '盜賊',
  elementalist: '元素師',
  priest: '牧師',
};

export function ArmorPage() {
  const armors = useArmorList();
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('requiredLevel');
  const [sortAsc, setSortAsc] = useState(true);

  const slots = useMemo(() => [...new Set(armors.map(a => a.slot))], [armors]);

  const filtered = useMemo(() => {
    let list = armors;
    if (slotFilter !== 'all') list = list.filter(a => a.slot === slotFilter);
    if (search) list = list.filter(a => a.name.includes(search));
    list = [...list].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [armors, slotFilter, search, sortKey, sortAsc]);

  function handleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  function sortIndicator(key: string) {
    if (sortKey !== key) return '';
    return sortAsc ? ' ▲' : ' ▼';
  }

  return (
    <div>
      <h2 className="wiki-page-title">防具列表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={slotFilter} onChange={e => setSlotFilter(e.target.value)}>
          <option value="all">全部部位</option>
          {slots.map(s => <option key={s} value={s}>{SLOT_LABELS[s] || s}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋防具名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>名稱{sortIndicator('name')}</th>
              <th className="sortable" onClick={() => handleSort('slot')}>部位{sortIndicator('slot')}</th>
              <th className="sortable" onClick={() => handleSort('requiredLevel')}>等級{sortIndicator('requiredLevel')}</th>
              <th className="sortable" onClick={() => handleSort('defense')}>防禦{sortIndicator('defense')}</th>
              <th>格擋</th>
              <th>安定值</th>
              <th>附加效果</th>
              <th>職業限制</th>
              <th>取得方式</th>
              <th>掉落來源</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <ArmorRow key={a.name} armor={a} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的防具</p>}
      </div>
    </div>
  );
}

function ArmorRow({ armor: a }: { armor: ReturnType<typeof useArmorList>[number] }) {
  const dropSources = useDropSourceForItem(a.name);
  const acquireLabel = a.acquireType === 'shop' ? '商店' : a.acquireType === 'craft' ? '製作' : '掉落';

  const extras: string[] = [];
  if (a.bonusHp) extras.push(`HP+${a.bonusHp}`);
  if (a.bonusMp) extras.push(`MP+${a.bonusMp}`);
  if (a.hpRegen) extras.push(`回血+${a.hpRegen}`);
  if (a.mpRegen) extras.push(`回魔+${a.mpRegen}`);
  if (a.bonusWeight) extras.push(`負重+${a.bonusWeight}`);
  if (a.bonusStats) extras.push(a.bonusStats);

  return (
    <tr>
      <td>
        <Link className="wiki-link" to={`/wiki/armor/${encodeURIComponent(a.name)}`}>
          {a.name}
        </Link>
      </td>
      <td>{SLOT_LABELS[a.slot] || a.slot}</td>
      <td className="cell-number">{a.requiredLevel}</td>
      <td className="cell-number">{a.defense ?? '-'}</td>
      <td className="cell-number">{a.blockRate ? `${a.blockRate}%` : '-'}</td>
      <td className="cell-number">{a.stability ?? '-'}</td>
      <td>{extras.length > 0 ? extras.join(', ') : '-'}</td>
      <td>
        {a.requiredClass
          ? a.requiredClass.map(c => <span key={c} className="wiki-tag">{CLASS_LABELS[c] || c}</span>)
          : '全職業'}
      </td>
      <td>{acquireLabel}</td>
      <td>
        {dropSources.length > 0
          ? dropSources.map(d => (
              <Link key={d.area} className="wiki-link" to={`/wiki/maps/${d.area}`} style={{ marginRight: 4 }}>
                {getAreaDisplayName(d.area)}
              </Link>
            ))
          : '-'}
      </td>
    </tr>
  );
}
