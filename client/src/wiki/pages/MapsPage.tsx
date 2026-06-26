import { useMemo } from 'react';
import { useZones, useRegions, useMonstersByArea, useDropTableByArea } from '../hooks/useWikiData';
import { MONSTER_SEEDS } from '../../db/seed';
import { Link, useParams } from 'react-router-dom';
import '../components/WikiTable.css';

const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '闇', none: '無',
};

export function MapsPage() {
  const zones = useZones();
  const regions = useRegions();
  const { areaId } = useParams();

  const monsterCountByArea = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of MONSTER_SEEDS) {
      map[m.area] = (map[m.area] || 0) + 1;
    }
    return map;
  }, []);

  if (areaId) {
    return <AreaDetail areaId={areaId} />;
  }

  return (
    <div>
      <h2 className="wiki-page-title">地圖總覽</h2>
      {zones.map(zone => {
        const zoneRegions = regions.filter(r => r.zoneId === zone.id);
        return (
          <div key={zone.id} style={{ marginBottom: 24 }}>
            <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
              {zone.name}
              <span style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-sm)', marginLeft: 8 }}>
                Lv.{zone.levelMin}~{zone.levelMax}
              </span>
            </h3>
            <div className="wiki-table-wrap">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>區域</th>
                    <th>類型</th>
                    <th>等級範圍</th>
                    <th>怪物數</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneRegions.map(r => (
                    <tr key={r.id}>
                      <td>
                        <Link className="wiki-link" to={`/wiki/maps/${r.id}`}>{r.name}</Link>
                      </td>
                      <td>{r.type === 'town' ? '城鎮' : r.type === 'dungeon' ? '地城' : '野外'}</td>
                      <td className="cell-number">
                        {r.levelMin && r.levelMax ? `${r.levelMin}~${r.levelMax}` : '-'}
                      </td>
                      <td className="cell-number">{monsterCountByArea[r.id] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AreaDetail({ areaId }: { areaId: string }) {
  const regions = useRegions();
  const monsters = useMonstersByArea(areaId);
  const drops = useDropTableByArea(areaId);
  const region = regions.find(r => r.id === areaId);

  if (!region) {
    return <p className="wiki-empty">找不到區域：{areaId}</p>;
  }

  return (
    <div>
      <h2 className="wiki-page-title">{region.name}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        {region.type === 'town' ? '城鎮' : region.type === 'dungeon' ? '地城' : '野外'}
        {region.levelMin && region.levelMax && ` | Lv.${region.levelMin}~${region.levelMax}`}
      </p>

      <Link className="wiki-link" to="/wiki/maps" style={{ marginBottom: 16, display: 'inline-block' }}>
        ← 返回地圖總覽
      </Link>

      {monsters.length > 0 ? (
        <>
          <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
            出沒怪物
          </h3>
          <div className="wiki-table-wrap">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>等級</th>
                  <th>HP</th>
                  <th>攻擊</th>
                  <th>防禦</th>
                  <th>經驗</th>
                  <th>屬性</th>
                  <th>Boss</th>
                </tr>
              </thead>
              <tbody>
                {monsters.map((m, i) => (
                  <tr key={`${m.name}-${i}`}>
                    <td>
                      <Link className="wiki-link" to={`/wiki/monsters?area=${areaId}`}>
                        {m.name}
                      </Link>
                    </td>
                    <td className="cell-number">{m.level}</td>
                    <td className="cell-number">{m.hp}</td>
                    <td className="cell-number">{m.attackMin}~{m.attackMax}</td>
                    <td className="cell-number">{m.defense}</td>
                    <td className="cell-number">{m.exp}</td>
                    <td><span className={`wiki-badge wiki-badge-${m.element}`}>{ELEMENT_LABELS[m.element]}</span></td>
                    <td className="cell-center">{m.isBoss ? '★' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="wiki-empty">此區域無怪物資料</p>
      )}

      <h3 style={{ color: 'var(--text-primary)', margin: '24px 0 8px', fontFamily: 'var(--font-display)' }}>
        區域掉落
      </h3>
      {drops.length > 0 ? (
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>物品</th>
                <th>類型</th>
                <th>機率權重</th>
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
                    <td>{d.itemType}</td>
                    <td className="cell-number">{d.dropValue}</td>
                    <td className="cell-number">
                      {d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="wiki-empty">無掉落資料</p>
      )}
    </div>
  );
}
