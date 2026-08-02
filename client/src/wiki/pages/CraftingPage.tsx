import { useState, useMemo } from 'react';
import { useWeaponList, useArmorList } from '../hooks/useWikiData';
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';

// § 6A.8：製作品階級為 T4~T7（中階 T4~T5 / 高階 T6~T7）
const TIER_LABELS: Record<number, string> = {
  4: '裝備Tier 4（中階）',
  5: '裝備Tier 5（中階）',
  6: '裝備Tier 6（高階）',
  7: '裝備Tier 7（高階）',
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
    if (tierFilter !== 'all') list = list.filter(e => e.tier === Number(tierFilter));
    if (search) list = list.filter(e => e.name.includes(search));
    return list.sort((a, b) => {
      const ta = a.tier ?? 0;
      const tb = b.tier ?? 0;
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
          <option value="4">裝備Tier 4（中階）</option>
          <option value="5">裝備Tier 5（中階）</option>
          <option value="6">裝備Tier 6（高階）</option>
          <option value="7">裝備Tier 7（高階）</option>
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
      <td>{item.tier != null ? TIER_LABELS[item.tier] ?? `裝備Tier ${item.tier}` : '-'}</td>
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
