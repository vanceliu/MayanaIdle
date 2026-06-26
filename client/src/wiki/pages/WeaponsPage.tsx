import { useState, useMemo } from 'react';
import { useWeaponList, useDropSourceForItem, getAreaDisplayName } from '../hooks/useWikiData';
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';

const TYPE_LABELS: Record<string, string> = {
  sword: '單手劍',
  dagger: '匕首',
  axe: '單手斧',
  mace: '鈍器',
  staff: '法杖',
  bow: '弓',
  twoHandSword: '雙手劍',
  twoHandAxe: '雙手斧',
  twoHandStaff: '雙手法杖',
  dualBlade: '雙刀',
  claw: '爪',
  shield: '盾牌',
  magicBook: '魔法書',
};

const MATERIAL_LABELS: Record<string, string> = {
  wood: '木',
  iron: '鐵',
  silver: '銀',
  mithril: '秘銀',
  dragon: '龍',
  orichalcum: '奧利哈鋼',
};

const CLASS_LABELS: Record<string, string> = {
  knight: '騎士',
  elf: '妖精',
  thief: '盜賊',
  elementalist: '元素師',
  priest: '牧師',
};

export function WeaponsPage() {
  const weapons = useWeaponList();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('requiredLevel');
  const [sortAsc, setSortAsc] = useState(true);

  const types = useMemo(() => [...new Set(weapons.map(w => w.type))], [weapons]);
  const materials = useMemo(() => [...new Set(weapons.map(w => w.material).filter(Boolean))], [weapons]);

  const filtered = useMemo(() => {
    let list = weapons;
    if (typeFilter !== 'all') list = list.filter(w => w.type === typeFilter);
    if (materialFilter !== 'all') list = list.filter(w => w.material === materialFilter);
    if (search) list = list.filter(w => w.name.includes(search));
    list = [...list].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [weapons, typeFilter, materialFilter, search, sortKey, sortAsc]);

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
      <h2 className="wiki-page-title">武器列表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">全部類型</option>
          {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
        </select>
        <select className="wiki-filter-select" value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}>
          <option value="all">全部材質</option>
          {materials.map(m => <option key={m} value={m!}>{MATERIAL_LABELS[m!] || m}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋武器名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>名稱{sortIndicator('name')}</th>
              <th className="sortable" onClick={() => handleSort('type')}>類型{sortIndicator('type')}</th>
              <th className="sortable" onClick={() => handleSort('requiredLevel')}>等級{sortIndicator('requiredLevel')}</th>
              <th className="sortable" onClick={() => handleSort('smallMonsterDamage')}>對小怪{sortIndicator('smallMonsterDamage')}</th>
              <th className="sortable" onClick={() => handleSort('largeMonsterDamage')}>對大怪{sortIndicator('largeMonsterDamage')}</th>
              <th>命中</th>
              <th>額攻</th>
              <th>材質</th>
              <th>安定值</th>
              <th>雙手</th>
              <th>職業限制</th>
              <th>取得方式</th>
              <th>掉落來源</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => (
              <WeaponRow key={w.name} weapon={w} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的武器</p>}
      </div>
    </div>
  );
}

function WeaponRow({ weapon: w }: { weapon: ReturnType<typeof useWeaponList>[number] }) {
  const dropSources = useDropSourceForItem(w.name);
  const acquireLabel = w.acquireType === 'shop' ? '商店' : w.acquireType === 'craft' ? '製作' : '掉落';

  return (
    <tr>
      <td>
        <Link className="wiki-link" to={`/wiki/weapons/${encodeURIComponent(w.name)}`}>
          {w.name}
        </Link>
      </td>
      <td>{TYPE_LABELS[w.type] || w.type}</td>
      <td className="cell-number">{w.requiredLevel}</td>
      <td className="cell-number">{w.smallMonsterDamage ?? '-'}</td>
      <td className="cell-number">{w.largeMonsterDamage ?? '-'}</td>
      <td className="cell-number">{w.attackSuccess ?? 0}</td>
      <td className="cell-number">{w.extraAttack ?? 0}</td>
      <td>{w.material ? MATERIAL_LABELS[w.material] || w.material : '-'}</td>
      <td className="cell-number">{w.stability ?? '-'}</td>
      <td className="cell-center">{w.isTwoHanded ? '✓' : ''}</td>
      <td>
        {w.requiredClass
          ? w.requiredClass.map(c => <span key={c} className="wiki-tag">{CLASS_LABELS[c] || c}</span>)
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
