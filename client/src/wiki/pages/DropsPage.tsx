import { useState, useMemo } from 'react';
import { getAreaDisplayName } from '../hooks/useWikiData';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../../db/seed';
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
  const [tab, setTab] = useState<'area' | 'boss'>('area');

  const areas = useMemo(() => [...new Set(DROP_TABLE_SEEDS.map(d => d.area))], []);
  const bossNames = useMemo(() => [...new Set(BOSS_DROP_TABLE_SEEDS.map(d => d.bossName))], []);

  const [bossFilter, setBossFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let list = [...DROP_TABLE_SEEDS];
    if (areaFilter !== 'all') list = list.filter(d => d.area === areaFilter);
    if (typeFilter !== 'all') list = list.filter(d => d.itemType === typeFilter);
    if (search) list = list.filter(d => d.itemName.includes(search));
    return list;
  }, [areaFilter, typeFilter, search]);

  const filteredBoss = useMemo(() => {
    let list = [...BOSS_DROP_TABLE_SEEDS];
    if (bossFilter !== 'all') list = list.filter(d => d.bossName === bossFilter);
    if (typeFilter !== 'all') list = list.filter(d => d.itemType === typeFilter);
    if (search) list = list.filter(d => d.itemName.includes(search));
    return list;
  }, [bossFilter, typeFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">掉落表</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className={`wiki-filter-select${tab === 'area' ? ' active' : ''}`}
          style={{ padding: '6px 16px', cursor: 'pointer', background: tab === 'area' ? 'var(--accent-gold)' : 'var(--bg-card)', color: tab === 'area' ? 'var(--bg-main)' : 'var(--text-primary)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: tab === 'area' ? 700 : 400 }}
          onClick={() => setTab('area')}
        >
          區域掉落
        </button>
        <button
          className={`wiki-filter-select${tab === 'boss' ? ' active' : ''}`}
          style={{ padding: '6px 16px', cursor: 'pointer', background: tab === 'boss' ? 'var(--accent-gold)' : 'var(--bg-card)', color: tab === 'boss' ? 'var(--bg-main)' : 'var(--text-primary)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: tab === 'boss' ? 700 : 400 }}
          onClick={() => setTab('boss')}
        >
          Boss 專屬掉落
        </button>
      </div>

      <div className="wiki-filters">
        {tab === 'area' && (
          <select className="wiki-filter-select" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
            <option value="all">全部區域</option>
            {areas.map(a => <option key={a} value={a}>{getAreaDisplayName(a)}</option>)}
          </select>
        )}
        {tab === 'boss' && (
          <select className="wiki-filter-select" value={bossFilter} onChange={e => setBossFilter(e.target.value)}>
            <option value="all">全部 Boss</option>
            {bossNames.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
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

      {tab === 'area' && (
        <div className="wiki-table-wrap">
          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>
              ※ Lv40+ 區域一般小怪額外判定職業技能書掉落（0.05%）：Lv40~43 掉 3 級書、Lv43~46 掉 4 級書、Lv46+ 掉 5 級書。不區分職業，25 本共同池隨機。
            </p>
          </div>
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
      )}

      {tab === 'boss' && (
        <div className="wiki-table-wrap">
          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>
              ※ Boss 擊殺時只從專屬掉落池掉落，不使用一般區域掉落表。<br />
              ※ Boss 額外判定職業技能書掉落（5%）：Lv40~43 區域掉 3 級書、Lv43~46 掉 4 級書、Lv46+ 掉 5 級書。不區分職業，25 本共同池隨機。
            </p>
          </div>
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Boss</th>
                <th>物品</th>
                <th>類型</th>
                <th>機率權重</th>
                <th>數量</th>
              </tr>
            </thead>
            <tbody>
              {filteredBoss.map((d, i) => {
                const isEquip = d.itemType === 'equipment';
                return (
                  <tr key={`${d.bossName}-${d.itemName}-${i}`}>
                    <td>{d.bossName}</td>
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
          {filteredBoss.length === 0 && <p className="wiki-empty">無符合條件的 Boss 掉落資料</p>}
        </div>
      )}
    </div>
  );
}
