import { useState, useMemo } from 'react';
import { ITEM_DEFINITIONS } from '../../models/items';
import { useDropSourceForItem, useRegions, getAreaDisplayName, getDropRate } from '../hooks/useWikiData';
import { DROP_TABLE_SEEDS } from '../../db/seed';
import { Link, useParams } from 'react-router-dom';
import '../components/WikiTable.css';

const CATEGORY_LABELS: Record<string, string> = {
  potion: '藥水',
  scroll: '卷軸',
  material: '材料',
  dungeon: '副本道具',
  spellbook: '魔法書',
  other: '其他',
};

export function ItemsPage() {
  const { itemName } = useParams();

  if (itemName) {
    return <ItemDetail name={decodeURIComponent(itemName)} />;
  }

  return <ItemList />;
}

function ItemList() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = ITEM_DEFINITIONS;
    if (categoryFilter !== 'all') list = list.filter(i => i.category === categoryFilter);
    if (search) list = list.filter(i => i.name.includes(search));
    return list;
  }, [categoryFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">道具總表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">全部類型</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋道具名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>類型</th>
              <th>說明</th>
              <th>重量</th>
              <th>購買價格</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.name}>
                <td>
                  <Link className="wiki-link" to={`/wiki/items/${encodeURIComponent(item.name)}`}>
                    {item.name}
                  </Link>
                </td>
                <td>{CATEGORY_LABELS[item.category]}</td>
                <td>{item.description}</td>
                <td className="cell-number">{item.weight}</td>
                <td className="cell-number">{item.buyPrice ? `${item.buyPrice.toLocaleString()} G` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的道具</p>}
      </div>
    </div>
  );
}

function ItemDetail({ name }: { name: string }) {
  const item = ITEM_DEFINITIONS.find(i => i.name === name);
  const dropSources = useDropSourceForItem(name);

  const regions = useRegions();
  const nonTownAreas = useMemo(() => {
    const townIds = new Set(regions.filter(r => r.type === 'town').map(r => r.id));
    return new Set([...new Set(DROP_TABLE_SEEDS.map(d => d.area))].filter(a => !townIds.has(a)));
  }, [regions]);
  const dropAreas = useMemo(() => new Set(dropSources.map(d => d.area)), [dropSources]);
  const isAllAreas = dropSources.length > 0 && [...nonTownAreas].every(a => dropAreas.has(a));

  if (!item) {
    return <p className="wiki-empty">找不到道具：{name}</p>;
  }

  return (
    <div>
      <Link className="wiki-link" to="/wiki/items" style={{ marginBottom: 16, display: 'inline-block' }}>
        ← 返回道具總表
      </Link>

      <h2 className="wiki-page-title">{item.name}</h2>

      <div className="wiki-table-wrap" style={{ marginBottom: 24 }}>
        <table className="wiki-table">
          <thead>
            <tr>
              <th>類型</th>
              <th>說明</th>
              <th>重量</th>
              <th>購買價格</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{CATEGORY_LABELS[item.category]}</td>
              <td>{item.description}</td>
              <td className="cell-number">{item.weight}</td>
              <td className="cell-number">{item.buyPrice ? `${item.buyPrice.toLocaleString()} G` : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
        取得方式
      </h3>

      {item.buyPrice ? (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          商店購買：{item.buyPrice.toLocaleString()} G
        </p>
      ) : null}

      {isAllAreas ? (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          怪物掉落：所有區域怪物皆可掉落（{getDropRate(dropSources[0].dropValue)}）
        </p>
      ) : dropSources.length > 0 ? (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>怪物掉落：</p>
          <div className="wiki-table-wrap">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>區域</th>
                  <th>掉落機率</th>
                  <th>數量</th>
                </tr>
              </thead>
              <tbody>
                {dropSources.map((d, i) => (
                  <tr key={`${d.area}-${i}`}>
                    <td>
                      <Link className="wiki-link" to={`/wiki/maps/${d.area}`}>
                        {getAreaDisplayName(d.area)}
                      </Link>
                    </td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !item.buyPrice && <p style={{ color: 'var(--text-dim)' }}>無掉落資料（可能為任務獎勵或特殊取得）</p>
      )}
    </div>
  );
}
