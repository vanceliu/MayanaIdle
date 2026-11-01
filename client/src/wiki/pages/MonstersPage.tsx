import { useState, useMemo } from 'react';
import { useMonsterList, useDropTableByArea, useBossDropTableByName, useRegions, getAreaDisplayName, getDropRate, getDropItemName, getWikiEquipmentPath } from '../hooks/useWikiData';
import { CLASS_SKILLS } from '../../models/classSkills';
import { getItemById } from '../../models/items';
import { getSkillBookLevels, SKILL_BOOK_BOSS_DROP_RATE, SKILL_BOOK_NORMAL_DROP_RATE } from '../../systems/classSkillBookDrop';
import { Link, useParams } from 'react-router-dom';
import { SLOT_DROP_RATE_BOSS, slotTierBandFor } from '../../models/talent';
import {
  MONSTER_AFFIX_COUNT_TABLE, MONSTER_AFFIX_DESCRIPTIONS, MONSTER_AFFIX_LABELS, MONSTER_AFFIX_ORDER,
  MONSTER_AFFIX_DROP_REWARD, MONSTER_AFFIX_GOLD_EXP_REWARD,
} from '../../models/monsterAffix';
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
      const av = (a as unknown as Record<string, unknown>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, unknown>)[sortKey] ?? 0;
      // 排序鍵是動態的，兩邊都要各自窄化：字串比字串，其餘一律當數字
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
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
      <MonsterAffixSection />
    </div>
  );
}

const AFFIX_COUNT_COLOR_NAMES: Record<number, string> = { 1: '藍', 2: '黃', 3: '橙', 4: '紅' };

/** 怪物強化詞綴（`25-monster-system.md` § 25.12），數值一律讀 `models/monsterAffix.ts` */
function MonsterAffixSection() {
  return (
    <section data-testid="wiki-monster-affix" style={{ marginTop: 24 }}>
      <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
        怪物強化詞綴
      </h3>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        怪物生成時有機率帶強化詞綴，一般怪與 Boss 都會出現。詞綴數越多越強，掉落、金幣與經驗也越多。
        怪物列表卡片的名稱依詞綴數上色，名稱下方列出詞綴；戰鬥日誌寫成「詞綴 原名」。
      </p>
      <div className="wiki-table-wrap" style={{ marginBottom: 16 }}>
        <table className="wiki-table">
          <thead>
            <tr><th>詞綴數</th><th>出現機率</th><th>怪物等級</th><th>名稱顏色</th><th>物品掉落</th><th>金幣／經驗</th></tr>
          </thead>
          <tbody>
            {MONSTER_AFFIX_COUNT_TABLE.map((row, i) => (
              <tr key={row.count}>
                <td>{row.count}</td>
                <td>{row.cumulative - (MONSTER_AFFIX_COUNT_TABLE[i - 1]?.cumulative ?? 0)}%</td>
                <td>{row.minLevel <= 1 ? '全部' : `Lv.${row.minLevel} 以上`}</td>
                <td>{AFFIX_COUNT_COLOR_NAMES[row.count]}</td>
                <td>×{MONSTER_AFFIX_DROP_REWARD[row.count]}</td>
                <td>×{MONSTER_AFFIX_GOLD_EXP_REWARD[row.count].toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul style={{ color: 'var(--text-secondary)', margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.8 }}>
        <li>怪物等級不到的詞綴數不會出現，該段機率直接作廢（不會改成較少詞綴）。</li>
        <li>同一隻怪的詞綴不重複，從所有詞綴中等機率抽。</li>
        <li>屬性加成在全域倍率之後計算；護盾量以套用巨大後的最大 HP 計算。</li>
        <li>劇毒／撕裂排在怪物原本的負面效果之後判定，每次攻擊最多觸發一種。</li>
        <li>帶護盾的怪，HP 條長度＝最大 HP＋護盾，傷害先扣淺藍色的護盾段。</li>
      </ul>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr><th>詞綴</th><th>效果</th></tr>
          </thead>
          <tbody>
            {MONSTER_AFFIX_ORDER.map(id => (
              <tr key={id}>
                <td>{MONSTER_AFFIX_LABELS[id]}</td>
                <td>{MONSTER_AFFIX_DESCRIPTIONS[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0' }}>
        自動天賦可用「目標帶有／沒有指定強化詞綴」偵測，再用「切換目標：帶／不帶指定強化詞綴」避開或集火。
      </p>
    </section>
  );
}

function MonsterDetail({ name }: { name: string }) {
  const monsters = useMonsterList();
  const entries = monsters.filter(m => m.name === name);

  if (entries.length === 0) {
    return <p className="wiki-empty">找不到怪物：{name}</p>;
  }

  const first = entries[0];
  const allAreas = [...new Set(entries.map(e => e.area))];

  return (
    <div>
      <Link className="wiki-link" to="/wiki/monsters" style={{ marginBottom: 16, display: 'inline-block' }}>
        ← 返回怪物列表
      </Link>

      <h2 className="wiki-page-title">
        {first.name}
        {first.isBoss && <span style={{ color: 'var(--accent-gold)', marginLeft: 8 }}>★ Boss</span>}
      </h2>

      <div className="wiki-table-wrap" style={{ marginBottom: 24 }}>
        <table className="wiki-table">
          <thead>
            <tr>
              <th>出沒區域</th>
              <th>等級</th>
              <th>HP</th>
              <th>攻擊</th>
              <th>防禦</th>
              <th>經驗</th>
              <th>屬性</th>
              <th>種族</th>
              <th>體型</th>
              <th>Boss</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((m, i) => (
              <tr key={`${m.area}-${i}`}>
                <td>
                  <Link className="wiki-link" to={`/wiki/maps/${m.area}`}>
                    {getAreaDisplayName(m.area)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
        掉落物品
      </h3>
      {first.isBoss ? (
        <BossDropSection bossName={first.name} />
      ) : (
        allAreas.map(area => (
          <AreaDropSection key={area} area={area} />
        ))
      )}

      <SkillBookDropInfo isBoss={first.isBoss} areas={allAreas} />
      <TalentDropInfo isBoss={first.isBoss} areas={allAreas} />
    </div>
  );
}

function BossDropSection({ bossName }: { bossName: string }) {
  const drops = useBossDropTableByName(bossName);

  if (drops.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 6 }}>
        Boss 專屬掉落
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
            {drops.flatMap((d, i) => {
              const isEquip = d.itemType === 'equipment';
              if (isEquip && d.equipmentPool === 'all') {
                // `06-equipment-acquire.md` § 6A.1：掉落池以裝備階級 tier 表示
                const tierParam = String(d.tier ?? '');
                const tierLabel = d.tier != null ? `裝備Tier ${d.tier}` : '';
                return [
                  <tr key={`${d.itemType}-${i}-weapon`}>
                    <td><Link className="wiki-link" to={`/wiki/weapons?tier=${tierParam}`}>{tierLabel}武器（隨機）</Link></td>
                    <td>裝備</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">-</td>
                  </tr>,
                  <tr key={`${d.itemType}-${i}-armor`}>
                    <td><Link className="wiki-link" to={`/wiki/armor?tier=${tierParam}`}>{tierLabel}防具（隨機）</Link></td>
                    <td>裝備</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">-</td>
                  </tr>
                ];
              }
              const name = getDropItemName(d);
              let equipLink = '';
              if (isEquip) {
                if (d.equipmentPool) {
                  if (d.equipmentPool === 'weapon') {
                    const tierParam = String(d.tier ?? '');
                    equipLink = `/wiki/weapons?tier=${tierParam}`;
                  } else if (d.equipmentPool === 'armor') {
                    const tierParam = String(d.tier ?? '');
                    equipLink = `/wiki/armor?tier=${tierParam}`;
                  }
                } else if (d.equipmentTemplateId) {
                  equipLink = getWikiEquipmentPath(name);
                }
              }
              return [(
                <tr key={`${d.itemType}-${i}`}>
                  <td>
                    {isEquip ? (
                      <Link className="wiki-link" to={equipLink}>
                        {name}
                      </Link>
                    ) : name}
                  </td>
                  <td>{d.itemType === 'gold' ? '金幣' : d.itemType === 'equipment' ? '裝備' : '道具'}</td>
                  <td className="cell-number">{getDropRate(d.dropValue)}</td>
                  <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}</td>
                </tr>
              )];
            })}
          </tbody>
        </table>
      </div>
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
            {drops.flatMap((d, i) => {
              const isEquip = d.itemType === 'equipment';
              if (isEquip && d.equipmentPool === 'all') {
                // `06-equipment-acquire.md` § 6A.1：掉落池以裝備階級 tier 表示
                const tierParam = String(d.tier ?? '');
                const tierLabel = d.tier != null ? `裝備Tier ${d.tier}` : '';
                return [
                  <tr key={`${d.itemType}-${i}-weapon`}>
                    <td><Link className="wiki-link" to={`/wiki/weapons?tier=${tierParam}`}>{tierLabel}武器（隨機）</Link></td>
                    <td>裝備</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">-</td>
                  </tr>,
                  <tr key={`${d.itemType}-${i}-armor`}>
                    <td><Link className="wiki-link" to={`/wiki/armor?tier=${tierParam}`}>{tierLabel}防具（隨機）</Link></td>
                    <td>裝備</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">-</td>
                  </tr>
                ];
              }
              const name = getDropItemName(d);
              let equipLink = '';
              if (isEquip) {
                if (d.equipmentPool) {
                  if (d.equipmentPool === 'weapon') {
                    const tierParam = String(d.tier ?? '');
                    equipLink = `/wiki/weapons?tier=${tierParam}`;
                  } else if (d.equipmentPool === 'armor') {
                    const tierParam = String(d.tier ?? '');
                    equipLink = `/wiki/armor?tier=${tierParam}`;
                  }
                } else if (d.equipmentTemplateId) {
                  equipLink = getWikiEquipmentPath(name);
                }
              }
              return [(
                <tr key={`${d.itemType}-${i}`}>
                  <td>
                    {isEquip ? (
                      <Link className="wiki-link" to={equipLink}>
                        {name}
                      </Link>
                    ) : name}
                  </td>
                  <td>{d.itemType === 'gold' ? '金幣' : d.itemType === 'equipment' ? '裝備' : '道具'}</td>
                  <td className="cell-number">{getDropRate(d.dropValue)}</td>
                  <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '-'}</td>
                </tr>
              )];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CLASS_LABELS_BOOK: Record<string, string> = {
  knight: '騎士', elf: '妖精', thief: '盜賊', elementalist: '元素師', priest: '牧師',
};

/** 區域 id → 最高等級。樓層走 `parent-Nf` 的形式，要回頭查母區域 */
function useMaxAreaLevel(areas: string[]): number {
  const regions = useRegions();
  return Math.max(...areas.map(a => {
    const region = regions.find(r => r.id === a);
    if (region) return region.levelMax;
    const floorMatch = a.match(/^(.+)-(\d+)f$/);
    if (floorMatch) {
      const parent = regions.find(r => r.id === floorMatch[1]);
      const floor = parent?.floors?.find(f => f.floor === Number(floorMatch[2]));
      return floor?.levelMax ?? parent?.levelMax ?? 0;
    }
    return 0;
  }));
}

/**
 * 天賦格掉落（`51-auto-talent.md` § 51.6）。
 *
 * 這一段**每隻怪都一樣**，不進掉落表：只有 Boss 會掉、掉率固定，
 * 可掉的階級只看區域等級。不列的話玩家在怪物頁完全查不到天賦格從哪來。
 *
 * 條件與動作不掉落 —— 一律內建（§ 51.4.1）。
 */
function TalentDropInfo({ isBoss, areas }: { isBoss: boolean; areas: string[] }) {
  const maxAreaLevel = useMaxAreaLevel(areas);
  if (!isBoss) return null;
  const band = slotTierBandFor(maxAreaLevel);

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ color: 'var(--accent-info)', marginBottom: 8 }}>
        天賦格掉落（區域 Lv.{maxAreaLevel}）
      </h4>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr><th>階級</th><th>掉落機率</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Link to="/wiki/talents">
                  T{band.min}{band.min !== band.max && `～T${band.max}`}
                </Link>
              </td>
              <td>{SLOT_DROP_RATE_BOSS}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0' }}>
        天賦格只有 Boss 會掉，一般怪不掉。T1 格不掉落，只從角色等級取得。
      </p>
    </div>
  );
}

function SkillBookDropInfo({ isBoss, areas }: { isBoss: boolean; areas: string[] }) {
  const maxAreaLevel = useMaxAreaLevel(areas);
  const bookLevels = getSkillBookLevels(maxAreaLevel);

  if (bookLevels.length === 0) return null;

  const dropRate = isBoss
    ? `${(SKILL_BOOK_BOSS_DROP_RATE * 100).toFixed(0)}%`
    : `${(SKILL_BOOK_NORMAL_DROP_RATE * 100).toFixed(2)}%`;
  const books = CLASS_SKILLS.filter(s => bookLevels.includes(s.classLevel));

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ color: 'var(--accent-info)', marginBottom: 8 }}>
        職業技能書掉落（{isBoss ? 'Boss' : '一般怪物'} 基礎 {dropRate}）
      </h4>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        實際掉落率受角色掉寶率與全域倍率影響。{bookLevels.length > 1 ? '多個階級各自獨立判定。' : ''}
      </p>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>技能書</th>
              <th>職業</th>
              <th>階級</th>
            </tr>
          </thead>
          <tbody>
            {books.map(b => (
              <tr key={b.id}>
                <td>{getItemById(b.bookItemId)?.name ?? '—'}</td>
                <td>{CLASS_LABELS_BOOK[b.className]}</td>
                <td className="cell-number">{b.classLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
