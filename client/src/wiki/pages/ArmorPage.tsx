import { useState, useMemo } from 'react';
import { useArmorList, useDropSourceForItem, getAreaDisplayName } from '../hooks/useWikiData';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { GameIcon } from '../../components/GameIcon';
import { getEquipIcon } from '../../models/iconMap';
import { getEquipmentTierColor } from '../../models/equipmentTier';
import { isOffhandDefenseType } from '../../models/equipment';
import type { EquipmentTemplate } from '../../models/equipment';
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
  // 副手三種（`06-equipment.md` § 副手裝備）分別列出，不合併成「副手」
  shield: '盾牌',
  magicBook: '魔導書',
  armGuard: '臂甲',
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

/** 副手防具以武器 type 當部位分類，其餘用 slot */
function getCategoryKey(a: Pick<EquipmentTemplate, 'slot' | 'type'>): string {
  return isOffhandDefenseType(a.type) ? a.type : a.slot;
}

export function ArmorPage() {
  const { name } = useParams();
  return <ArmorList initialSearch={name ? decodeURIComponent(name) : undefined} />;
}

function ArmorList({ initialSearch }: { initialSearch?: string }) {
  const armors = useArmorList();
  const [searchParams, setSearchParams] = useSearchParams();
  const craftTierParam = searchParams.get('tier');
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [craftTierFilter, setCraftTierFilter] = useState<string>(craftTierParam || 'all');
  const [search, setSearch] = useState(initialSearch || '');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const slots = useMemo(() => [...new Set(armors.map(getCategoryKey))], [armors]);

  const filtered = useMemo(() => {
    let list = armors;
    if (slotFilter !== 'all') list = list.filter(a => getCategoryKey(a) === slotFilter);
    // `06-equipment-acquire.md` § 6A.1：以裝備階級 tier 篩選
    if (craftTierFilter !== 'all') {
      const wanted = Number(craftTierFilter);
      list = list.filter(a => a.tier === wanted);
    }
    if (search) list = list.filter(a => a.name.includes(search));
    list = [...list].sort((a, b) => {
      const av = sortKey === 'slot' ? getCategoryKey(a) : (a as any)[sortKey] ?? 0;
      const bv = sortKey === 'slot' ? getCategoryKey(b) : (b as any)[sortKey] ?? 0;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [armors, slotFilter, craftTierFilter, search, sortKey, sortAsc]);

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
        <select className="wiki-filter-select" value={craftTierFilter} onChange={e => {
          const val = e.target.value;
          setCraftTierFilter(val);
          if (val === 'all') {
            searchParams.delete('tier');
          } else {
            searchParams.set('tier', val);
          }
          setSearchParams(searchParams, { replace: true });
        }}>
          <option value="all">全部階級</option>
          <option value="1">裝備Tier 1（低階）</option>
          <option value="2">裝備Tier 2（低階）</option>
          <option value="3">裝備Tier 3（低階）</option>
          <option value="4">裝備Tier 4（中階）</option>
          <option value="5">裝備Tier 5（中階）</option>
          <option value="6">裝備Tier 6（高階）</option>
          <option value="7">裝備Tier 7（高階）</option>
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
              <th className="sortable" onClick={() => handleSort('defense')}>防禦{sortIndicator('defense')}</th>
              <th>格擋</th>
              <th>魔攻</th>
              <th>材質</th>
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
  const tierColor = getEquipmentTierColor(a as any);
  const categoryKey = getCategoryKey(a);

  const extras: string[] = [];
  if (a.bonusHp) extras.push(`HP+${a.bonusHp}`);
  if (a.bonusMp) extras.push(`MP+${a.bonusMp}`);
  if (a.hpRegen) extras.push(`回血+${a.hpRegen}`);
  if (a.mpRegen) extras.push(`回魔+${a.mpRegen}`);
  if (a.bonusBagSlots) extras.push(`背包格子+${a.bonusBagSlots}`);
  if (a.bonusWeight) extras.push(`負重+${a.bonusWeight}`);
  if (a.bonusStats) extras.push(a.bonusStats);

  return (
    <tr>
      <td>
        <Link className="wiki-link" to={`/wiki/armor/${encodeURIComponent(a.name)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: tierColor }}>
          <GameIcon name={getEquipIcon(categoryKey)} size={16} color={tierColor} />
          {a.name}
        </Link>
      </td>
      <td>{SLOT_LABELS[categoryKey] || categoryKey}</td>
      <td className="cell-number">{a.defense ?? '-'}</td>
      <td className="cell-number">{a.blockRate ? `${a.blockRate}%` : '-'}</td>
      <td className="cell-number">{a.magicAttack ?? '-'}</td>
      <td>{a.material ? MATERIAL_LABELS[a.material] || a.material : '-'}</td>
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
