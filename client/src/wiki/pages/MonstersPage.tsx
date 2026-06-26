import { useState, useMemo } from 'react';
import { useMonsterList, useDropTableByArea, getAreaDisplayName, getDropRate } from '../hooks/useWikiData';
import { Link, useParams } from 'react-router-dom';
import '../components/WikiTable.css';

const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '闇', none: '無',
};

const RACE_LABELS: Record<string, string> = {
  normal: '一般', undead: '不死', demon: '惡魔', dragon: '龍',
};

const SIZE_LABELS: Record<string, string> = {
  small: '小型', large: '大型',
};

export function MonstersPage() {
  const { monsterName } = useParams();

  if (monsterName) {
    return <MonsterDetail name={decodeURIComponent(monsterName)} />;
  }

  return <MonsterList />;
}

function MonsterList() {
  const monsters = useMonsterList();
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [elementFilter, setElementFilter] = useState<string>('all');
  const [raceFilter, setRaceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('level');
  const [sortAsc, setSortAsc] = useState(true);

  const areas = useMemo(() => [...new Set(monsters.map(m => m.area))], [monsters]);

  const filtered = useMemo(() => {
    let list = monsters;
    if (areaFilter !== 'all') list = list.filter(m => m.area === areaFilter);
    if (elementFilter !== 'all') list = list.filter(m => m.element === elementFilter);
    if (raceFilter !== 'all') list = list.filter(m => m.race === raceFilter);
    if (search) list = list.filter(m => m.name.includes(search));
    list = [...list].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [monsters, areaFilter, elementFilter, raceFilter, search, sortKey, sortAsc]);

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
      <h2 className="wiki-page-title">怪物列表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option value="all">全部區域</option>
          {areas.map(a => <option key={a} value={a}>{getAreaDisplayName(a)}</option>)}
        </select>
        <select className="wiki-filter-select" value={elementFilter} onChange={e => setElementFilter(e.target.value)}>
          <option value="all">全部屬性</option>
          {Object.entries(ELEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="wiki-filter-select" value={raceFilter} onChange={e => setRaceFilter(e.target.value)}>
          <option value="all">全部種族</option>
          {Object.entries(RACE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋怪物名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>名稱{sortIndicator('name')}</th>
              <th className="sortable" onClick={() => handleSort('level')}>等級{sortIndicator('level')}</th>
              <th className="sortable" onClick={() => handleSort('hp')}>HP{sortIndicator('hp')}</th>
              <th>攻擊</th>
              <th className="sortable" onClick={() => handleSort('defense')}>防禦{sortIndicator('defense')}</th>
              <th className="sortable" onClick={() => handleSort('exp')}>經驗{sortIndicator('exp')}</th>
              <th>屬性</th>
              <th>種族</th>
              <th>體型</th>
              <th>Boss</th>
              <th>出沒區域</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => (
              <tr key={`${m.name}-${m.area}-${i}`}>
                <td>
                  <Link className="wiki-link" to={`/wiki/monsters/${encodeURIComponent(m.name)}`}>
                    <strong>{m.name}</strong>
                  </Link>
                </td>
                <td className="cell-number">{m.level}</td>
                <td className="cell-number">{m.hp}</td>
                <td className="cell-number">{m.attackMin}~{m.attackMax}</td>
                <td className="cell-number">{m.defense}</td>
                <td className="cell-number">{m.exp}</td>
                <td><span className={`wiki-badge wiki-badge-${m.element}`}>{ELEMENT_LABELS[m.element]}</span></td>
                <td>{RACE_LABELS[m.race]}</td>
                <td>{SIZE_LABELS[m.size]}</td>
                <td className="cell-center">{m.isBoss ? '★' : ''}</td>
                <td>
                  <Link className="wiki-link" to={`/wiki/maps/${m.area}`}>
                    {getAreaDisplayName(m.area)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的怪物</p>}
      </div>
    </div>
  );
}

function MonsterDetail({ name }: { name: string }) {
  const monsters = useMonsterList();
  const entries = monsters.filter(m => m.name === name);

  if (entries.length === 0) {
    return <p className="wiki-empty">找不到怪物：{name}</p>;
  }

  const m = entries[0];
  const allAreas = [...new Set(entries.map(e => e.area))];

  return (
    <div>
      <Link className="wiki-link" to="/wiki/monsters" style={{ marginBottom: 16, display: 'inline-block' }}>
        ← 返回怪物列表
      </Link>

      <h2 className="wiki-page-title">
        {m.name}
        {m.isBoss && <span style={{ color: 'var(--accent-gold)', marginLeft: 8 }}>★ Boss</span>}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="等級" value={m.level} />
        <StatCard label="HP" value={m.hp} />
        <StatCard label="攻擊" value={`${m.attackMin}~${m.attackMax}`} />
        <StatCard label="防禦" value={m.defense} />
        <StatCard label="經驗值" value={m.exp} />
        <StatCard label="屬性" value={ELEMENT_LABELS[m.element]} badge={`wiki-badge wiki-badge-${m.element}`} />
        <StatCard label="種族" value={RACE_LABELS[m.race]} />
        <StatCard label="體型" value={SIZE_LABELS[m.size]} />
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
        出沒區域
      </h3>
      <div style={{ marginBottom: 24 }}>
        {allAreas.map(area => (
          <Link key={area} className="wiki-link" to={`/wiki/maps/${area}`} style={{ marginRight: 12 }}>
            {getAreaDisplayName(area)}
          </Link>
        ))}
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
        掉落物品
      </h3>
      {allAreas.map(area => (
        <AreaDropSection key={area} area={area} />
      ))}
    </div>
  );
}

function AreaDropSection({ area }: { area: string }) {
  const drops = useDropTableByArea(area);

  if (drops.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 6 }}>
        {getAreaDisplayName(area)}
      </p>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>物品</th>
              <th>類型</th>
              <th>掉落機率</th>
              <th>數量</th>
            </tr>
          </thead>
          <tbody>
            {drops.map((d, i) => {
              const isEquip = d.itemType === 'equipment';
              return (
                <tr key={`${d.itemName}-${i}`}>
                  <td>
                    {isEquip ? (
                      <Link className="wiki-link" to={`/wiki/weapons/${encodeURIComponent(d.itemName)}`}>
                        {d.itemName}
                      </Link>
                    ) : d.itemName}
                  </td>
                  <td>{d.itemType === 'gold' ? '金幣' : d.itemType === 'equipment' ? '裝備' : d.itemType === 'material' ? '材料' : d.itemType === 'potion' ? '藥水' : d.itemType === 'scroll' ? '卷軸' : '魔法書'}</td>
                  <td className="cell-number">{getDropRate(d.dropValue)}</td>
                  <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, badge }: { label: string; value: string | number; badge?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 16px',
    }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xs)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-lg)', fontFamily: 'var(--font-mono)' }}>
        {badge ? <span className={badge}>{value}</span> : value}
      </div>
    </div>
  );
}
