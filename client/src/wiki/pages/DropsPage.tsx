import { useState, useMemo } from 'react';
import { getAreaDisplayName } from '../hooks/useWikiData';
import { DROP_TABLE_SEEDS } from '../../db/seed';
import { Link, useSearchParams } from 'react-router-dom';
import '../components/WikiTable.css';

const ITEM_TYPE_LABELS: Record<string, string> = {
  gold: '金幣',
  equipment: '裝備',
  material: '材料',
  potion: '藥水',
  scroll: '卷軸',
  spellbook: '魔法書',
};

export function DropsPage() {
  const [searchParams] = useSearchParams();
  const itemParam = searchParams.get('item');

  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState(itemParam || '');

  const areas = useMemo(() => [...new Set(DROP_TABLE_SEEDS.map(d => d.area))], []);

  const filtered = useMemo(() => {
    let list = [...DROP_TABLE_SEEDS];
    if (areaFilter !== 'all') list = list.filter(d => d.area === areaFilter);
    if (typeFilter !== 'all') list = list.filter(d => d.itemType === typeFilter);
    if (search) list = list.filter(d => d.itemName.includes(search));
    return list;
  }, [areaFilter, typeFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">掉落表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option value="all">全部區域</option>
          {areas.map(a => <option key={a} value={a}>{getAreaDisplayName(a)}</option>)}
        </select>
        <select className="wiki-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">全部類型</option>
          {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋物品名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>區域</th>
              <th>物品</th>
              <th>類型</th>
              <th>機率權重</th>
              <th>數量</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => {
              const isEquip = d.itemType === 'equipment';
              return (
                <tr key={`${d.area}-${d.itemName}-${i}`}>
                  <td>
                    <Link className="wiki-link" to={`/wiki/maps/${d.area}`}>
                      {getAreaDisplayName(d.area)}
                    </Link>
                  </td>
                  <td>
                    {isEquip ? (
                      <Link className="wiki-link" to={`/wiki/weapons/${encodeURIComponent(d.itemName)}`}>
                        {d.itemName}
                      </Link>
                    ) : d.itemName}
                  </td>
                  <td>{ITEM_TYPE_LABELS[d.itemType] || d.itemType}</td>
                  <td className="cell-number">{d.dropValue}</td>
                  <td className="cell-number">
                    {d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的掉落資料</p>}
      </div>
    </div>
  );
}
