import { useState, useMemo } from 'react';
import { useWeaponList, useArmorList } from '../hooks/useWikiData';
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';

const TIER_LABELS: Record<string, string> = {
  entry: '高級入門',
  mid: '高級進階',
  top: '頂級',
};

const TYPE_LABELS: Record<string, string> = {
  sword: '單手劍', dagger: '匕首', axe: '單手斧', mace: '鈍器',
  staff: '法杖', bow: '弓', twoHandSword: '雙手劍', twoHandAxe: '雙手斧',
  twoHandStaff: '雙手法杖', dualBlade: '雙刀', claw: '爪',
  shield: '盾牌', magicBook: '魔法書', armor: '防具',
};

export function CraftingPage() {
  const weapons = useWeaponList();
  const armors = useArmorList();
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const craftItems = useMemo(() => {
    const all = [...weapons, ...armors].filter(e => e.acquireType === 'craft');
    let list = all;
    if (tierFilter !== 'all') list = list.filter(e => e.craftTier === tierFilter);
    if (search) list = list.filter(e => e.name.includes(search));
    return list.sort((a, b) => {
      const tierOrder = { entry: 0, mid: 1, top: 2 };
      const ta = tierOrder[a.craftTier as keyof typeof tierOrder] ?? 0;
      const tb = tierOrder[b.craftTier as keyof typeof tierOrder] ?? 0;
      if (ta !== tb) return ta - tb;
      return (a.name > b.name) ? 1 : -1;
    });
  }, [weapons, armors, tierFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">鐵匠鋪製作</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">全部階級</option>
          <option value="entry">高級入門</option>
          <option value="mid">高級進階</option>
          <option value="top">頂級</option>
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋裝備名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>成品</th>
              <th>類型</th>
              <th>階級</th>
              <th>製作費用</th>
              <th>前置武器</th>
              <th>所需材料</th>
            </tr>
          </thead>
          <tbody>
            {craftItems.map(item => (
              <CraftRow key={item.name} item={item} />
            ))}
          </tbody>
        </table>
        {craftItems.length === 0 && <p className="wiki-empty">無符合條件的配方</p>}
      </div>
    </div>
  );
}

function CraftRow({ item }: { item: ReturnType<typeof useWeaponList>[number] }) {
  const isWeapon = item.type !== 'armor';
  const detailPath = isWeapon
    ? `/wiki/weapons/${encodeURIComponent(item.name)}`
    : `/wiki/armor/${encodeURIComponent(item.name)}`;

  return (
    <tr>
      <td>
        <Link className="wiki-link" to={detailPath}>{item.name}</Link>
      </td>
      <td>{TYPE_LABELS[item.type] || item.type}</td>
      <td>{TIER_LABELS[item.craftTier || ''] || '-'}</td>
      <td className="cell-number">{item.craftGold?.toLocaleString() || '-'} G</td>
      <td>
        {item.craftPrerequisiteWeapon
          ? <span>
              <Link className="wiki-link" to={`/wiki/weapons/${encodeURIComponent(item.craftPrerequisiteWeapon.name)}`}>
                {item.craftPrerequisiteWeapon.name}
              </Link>
              ×{item.craftPrerequisiteWeapon.quantity}
            </span>
          : '-'}
      </td>
      <td>
        {item.craftMaterials?.map(mat => (
          <CraftMaterialLink key={mat.name} name={mat.name} amount={mat.amount} />
        )) || '-'}
      </td>
    </tr>
  );
}

function CraftMaterialLink({ name, amount }: { name: string; amount: number }) {
  return (
    <span style={{ marginRight: 8 }}>
      <Link className="wiki-link" to={`/wiki/items/${encodeURIComponent(name)}`}>
        {name}
      </Link>
      x{amount}
    </span>
  );
}
