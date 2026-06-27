import { useMemo } from 'react';
import { useZones, useRegions, useMonstersByArea, useDropTableByArea, getDropRate } from '../hooks/useWikiData';
import { MONSTER_SEEDS } from '../../db/seed';
import { Link, useParams } from 'react-router-dom';
import type { Floor } from '../../models/area';
import '../components/WikiTable.css';

const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '闇', none: '無',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  gold: '金幣', equipment: '裝備', material: '材料', potion: '藥水', scroll: '卷軸', spellbook: '魔法書',
};

export function MapsPage() {
  const zones = useZones();
  const regions = useRegions();
  const { areaId } = useParams();

  const monsterCountByArea = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of MONSTER_SEEDS) {
      map[m.area] = (map[m.area] || 0) + 1;

      const floorMatch = m.area.match(/^(.+)-\d+f$/);
      if (floorMatch) {
        const parentId = floorMatch[1];
        map[parentId] = (map[parentId] || 0) + 1;
      }
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
                  {zoneRegions.map(r => {
                    if (r.floors && r.floors.length > 0) {
                      return r.floors.map(floor => {
                        const floorAreaId = `${r.id}-${floor.floor}f`;
                        return (
                          <tr key={floorAreaId}>
                            <td>
                              <Link className="wiki-link" to={`/wiki/maps/${floorAreaId}`}>{r.name} {floor.floor}F</Link>
                            </td>
                            <td>地城</td>
                            <td className="cell-number">{floor.levelMin}~{floor.levelMax}</td>
                            <td className="cell-number">{monsterCountByArea[floorAreaId] || 0}</td>
                          </tr>
                        );
                      });
                    }
                    return (
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
                    );
                  })}
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
  const region = regions.find(r => r.id === areaId);

  // Handle floor-based area IDs (e.g. misty-cave-1f)
  const floorMatch = !region ? areaId.match(/^(.+)-(\d+)f$/) : null;
  const parentRegion = floorMatch ? regions.find(r => r.id === floorMatch[1]) : null;
  const floorNum = floorMatch ? Number(floorMatch[2]) : null;
  const floor = parentRegion?.floors?.find(f => f.floor === floorNum);

  if (!region && !parentRegion) {
    return <p className="wiki-empty">找不到區域：{areaId}</p>;
  }

  // Floor-based detail (e.g. misty-cave-1f)
  if (parentRegion && floor) {
    return (
      <div>
        <h2 className="wiki-page-title">{parentRegion.name} {floorNum}F</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          地城 | Lv.{floor.levelMin}~{floor.levelMax}
          {floor.isBossFloor && ' | ★ Boss層'}
        </p>
        <Link className="wiki-link" to="/wiki/maps" style={{ marginBottom: 16, display: 'inline-block' }}>
          ← 返回地圖總覽
        </Link>
        <SingleAreaContent areaId={areaId} />
      </div>
    );
  }

  // Region with floors array — show all floors
  const hasFloors = region!.floors && region!.floors.length > 0;

  return (
    <div>
      <h2 className="wiki-page-title">{region!.name}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        {region!.type === 'town' ? '城鎮' : region!.type === 'dungeon' ? '地城' : '野外'}
        {region!.levelMin && region!.levelMax && ` | Lv.${region!.levelMin}~${region!.levelMax}`}
      </p>

      <Link className="wiki-link" to="/wiki/maps" style={{ marginBottom: 16, display: 'inline-block' }}>
        ← 返回地圖總覽
      </Link>

      {hasFloors ? (
        <>
          {region!.floors!.map(f => (
            <FloorSection key={f.floor} regionId={areaId} regionName={region!.name} floor={f} />
          ))}
        </>
      ) : (
        <SingleAreaContent areaId={areaId} />
      )}
    </div>
  );
}

function FloorSection({ regionId, regionName, floor }: { regionId: string; regionName: string; floor: Floor }) {
  const floorAreaId = `${regionId}-${floor.floor}f`;
  const monsters = useMonstersByArea(floorAreaId);
  const drops = useDropTableByArea(floorAreaId);

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
        {regionName} {floor.floor}F
        <span style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-sm)', marginLeft: 8 }}>
          Lv.{floor.levelMin}~{floor.levelMax}
          {floor.isBossFloor && ' ★ Boss層'}
        </span>
      </h3>

      {monsters.length > 0 && (
        <div className="wiki-table-wrap" style={{ marginBottom: 12 }}>
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
                    <Link className="wiki-link" to={`/wiki/monsters/${encodeURIComponent(m.name)}`}>
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
      )}

      {drops.length > 0 && (
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>掉落物品</th>
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
                    <td>{ITEM_TYPE_LABELS[d.itemType] || d.itemType}</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {monsters.length === 0 && drops.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-sm)' }}>此樓層無資料</p>
      )}
    </div>
  );
}

function SingleAreaContent({ areaId }: { areaId: string }) {
  const monsters = useMonstersByArea(areaId);
  const drops = useDropTableByArea(areaId);

  return (
    <>
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
                      <Link className="wiki-link" to={`/wiki/monsters/${encodeURIComponent(m.name)}`}>
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
                    <td>{ITEM_TYPE_LABELS[d.itemType] || d.itemType}</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="wiki-empty">無掉落資料</p>
      )}
    </>
  );
}
