import { useState, useMemo } from 'react';
import { ITEM_DEFINITIONS } from '../../db/seed';
import { useDropSourceForItem, useRegions, getAreaDisplayName, getDropRate } from '../hooks/useWikiData';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS, MONSTER_SEEDS } from '../../db/seed';
import { ALL_CLASS_SKILL_BOOKS, getSkillBookLevel } from '../../systems/classSkillBookDrop';
import { Link, useParams } from 'react-router-dom';
import { GameIcon } from '../../components/GameIcon';
import { resolveItemIcon, MATERIAL_TIER_COLORS } from '../../models/iconMap';
import type { ItemDefinition } from '../../models/items';
import { formatMaterialUsage, hasMaterialUsage, getCraftUsage } from '../../systems/craftMaterialUsage';
import { isSigilItemId } from '../../models/sigil';
import '../components/WikiTable.css';

/**
 * 類型欄與篩選的標籤。`sigil` 是**顯示用的虛擬類型** ——
 * 印記在 seed 裡歸 `scroll`（可堆疊的消耗品、不進批量販售的素材篩選），
 * 但玩家要查印記時不會想到去翻卷軸，而那份 category 還被背包與商店的邏輯吃著，
 * 不能為了 Wiki 的分類去動它。
 */
const CATEGORY_LABELS: Record<string, string> = {
  potion: '藥水',
  scroll: '卷軸',
  sigil: '印記',
  material: '材料',
  dungeon: '副本道具',
  spellbook: '魔法書',
  other: '其他',
};

/** 顯示用類型：印記自成一類，其餘照 seed 的 `category` */
function displayCategory(item: ItemDefinition): string {
  return isSigilItemId(item.id) ? 'sigil' : item.category;
}

/** 素材顏色圖例，語意依 `39-batch-sell.md` § 39.3，色碼取自 MATERIAL_TIER_COLORS。 */
const MATERIAL_TIER_LEGEND = [
  { tier: 1, label: '純販售素材（新手區域）' },
  { tier: 2, label: '入門區域素材' },
  { tier: 3, label: '中等區域素材' },
  { tier: 4, label: '進階區域素材' },
  { tier: 5, label: '高階區域素材' },
  { tier: 6, label: 'Boss 素材' },
  { tier: 7, label: '最終 Boss 素材' },
].map(t => ({ ...t, color: MATERIAL_TIER_COLORS[t.tier] }));

/** seed 沒填 icon 時的類別預設值。素材走 iconType/iconTier，不會用到這裡。 */
const CATEGORY_FALLBACK_ICON: Record<string, string> = {
  potion: 'red-potion',
  scroll: 'scroll',
  spellbook: 'spellbook',
  dungeon: 'key',
  material: 'material',
  other: 'material',
};

/**
 * 圖示與顏色一律取自 seed（`resolveItemIcon` 為背包／商店／Wiki 共用的單一來源），
 * 不可在 Wiki 端用名稱猜測 —— 否則同一道具在遊戲內與 Wiki 會顯示成兩種樣子。
 */
function getWikiItemIcon(item: ItemDefinition): { icon: string; color?: string } {
  return resolveItemIcon(item, CATEGORY_FALLBACK_ICON[item.category] ?? 'material');
}

/** 售價欄：明確標記不可販售，與「沒填價格」區分開。 */
function formatSellPrice(item: ItemDefinition): string {
  if (item.noSell) return '不可販售';
  return item.sellPrice ? `${item.sellPrice.toLocaleString()} G` : '—';
}

function formatBuyPrice(item: ItemDefinition): string {
  return item.buyPrice ? `${item.buyPrice.toLocaleString()} G` : '—';
}

export function ItemsPage() {
  const { itemName } = useParams();

  if (itemName) {
    return <ItemDetail name={decodeURIComponent(itemName)} />;
  }

  return <ItemList />;
}

function ItemList() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [craftFilter, setCraftFilter] = useState<'all' | 'craft' | 'nocraft'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = ITEM_DEFINITIONS;
    // 用顯示類型過濾 —— 選「卷軸」時不該再看到印記，選「印記」時只看到那六個
    if (categoryFilter !== 'all') list = list.filter(i => displayCategory(i) === categoryFilter);
    if (craftFilter === 'craft') list = list.filter(i => hasMaterialUsage(i.id));
    if (craftFilter === 'nocraft') list = list.filter(i => !hasMaterialUsage(i.id));
    if (search) list = list.filter(i => i.name.includes(search));
    return list;
  }, [categoryFilter, craftFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">道具總表</h2>
      <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
        <span style={{ marginRight: 12 }}>素材顏色（iconTier）：</span>
        {MATERIAL_TIER_LEGEND.map(t => (
          <span key={t.tier} style={{ color: t.color, marginRight: 12 }}>● T{t.tier} {t.label}</span>
        ))}
      </div>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">全部類型</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          className="wiki-filter-select"
          aria-label="用途篩選"
          value={craftFilter}
          onChange={e => setCraftFilter(e.target.value as typeof craftFilter)}
        >
          <option value="all">全部用途</option>
          <option value="craft">僅有用途素材</option>
          <option value="nocraft">僅純販售素材</option>
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
              <th>用途</th>
              <th>重量</th>
              <th>購買價格</th>
              <th>售價</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const { icon, color } = getWikiItemIcon(item);
              return (
              <tr key={item.name}>
                <td>
                  <Link className="wiki-link" to={`/wiki/items/${encodeURIComponent(item.name)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <GameIcon name={icon} size={16} color={color} />
                    {item.name}
                  </Link>
                </td>
                <td>{CATEGORY_LABELS[displayCategory(item)]}</td>
                <td>{item.description}</td>
                <td>{formatMaterialUsage(item.id) || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                <td className="cell-number">{item.weight}</td>
                <td className="cell-number">{formatBuyPrice(item)}</td>
                <td className="cell-number">{formatSellPrice(item)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="wiki-empty">無符合條件的道具</p>}
      </div>
    </div>
  );
}

function ItemDetail({ name }: { name: string }) {
  const item = ITEM_DEFINITIONS.find(i => i.name === name);
  const craftUsage = item ? getCraftUsage(item.id) : undefined;
  const dropSources = useDropSourceForItem(name);
  const bossDropSources = useMemo(() => {
    const itemDef = ITEM_DEFINITIONS.find(i => i.name === name);
    if (!itemDef) return [];
    return BOSS_DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === itemDef.id);
  }, [name]);

  const skillBookEntry = useMemo(() => ALL_CLASS_SKILL_BOOKS.find(b => b.itemId === item?.id), [item?.id]);

  const regions = useRegions();

  const skillBookDropSources = useMemo(() => {
    if (!skillBookEntry) return [];
    const bookLevel = skillBookEntry.level;
    const sources: { label: string; area: string; rate: string }[] = [];
    const matchedAreas = new Set<string>();

    // 找出所有對應等級的區域
    for (const region of regions) {
      if (region.type === 'town') continue;
      if (region.floors && region.floors.length > 0) {
        for (const floor of region.floors) {
          if (getSkillBookLevel(floor.levelMax) === bookLevel) {
            const areaId = `${region.id}-${floor.floor}f`;
            matchedAreas.add(areaId);
            sources.push({ label: getAreaDisplayName(areaId), area: areaId, rate: '基礎 0.05%' });
          }
        }
      } else if (getSkillBookLevel(region.levelMax) === bookLevel) {
        matchedAreas.add(region.id);
        sources.push({ label: getAreaDisplayName(region.id), area: region.id, rate: '基礎 0.05%' });
      }
    }

    // 那些區域中的 Boss → 5%
    const bossMonsters = MONSTER_SEEDS.filter(m => m.isBoss && matchedAreas.has(m.area));
    for (const boss of bossMonsters) {
      sources.push({ label: `${boss.name}（Boss）`, area: boss.area, rate: '基礎 5.0%' });
    }

    return sources;
  }, [skillBookEntry, regions]);

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

      <h2 className="wiki-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {(() => {
          const { icon, color } = getWikiItemIcon(item);
          return <GameIcon name={icon} size={24} color={color} />;
        })()}
        {item.name}
      </h2>

      <div className="wiki-table-wrap" style={{ marginBottom: 24 }}>
        <table className="wiki-table">
          <thead>
            <tr>
              <th>類型</th>
              <th>說明</th>
              <th>用途</th>
              <th>重量</th>
              <th>購買價格</th>
              <th>售價</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{CATEGORY_LABELS[displayCategory(item)]}</td>
              <td>{item.description}</td>
              <td>{formatMaterialUsage(item.id) || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
              <td className="cell-number">{item.weight}</td>
              <td className="cell-number">{formatBuyPrice(item)}</td>
              <td className="cell-number">{formatSellPrice(item)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {formatMaterialUsage(item.id) && (
        <>
          <h3 style={{ color: 'var(--text-primary)', margin: '16px 0 8px', fontFamily: 'var(--font-display)' }}>
            用途（{formatMaterialUsage(item.id)}）
          </h3>
          {/* 六種印記都有用途但不進裝備配方（`30-items.md` § 製作用途標記），故裝備清單是選擇性的 */}
          {craftUsage && (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            此素材用於以下 {craftUsage.equipment.length} 件裝備的鐵匠鋪配方：
          </p>)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 12 }}>
            {craftUsage?.equipment.map(equip => (
              <Link
                key={equip.name}
                className="wiki-link"
                to={`/wiki/${equip.isArmor ? 'armor' : 'weapons'}/${encodeURIComponent(equip.name)}`}
              >
                {equip.name}
              </Link>
            ))}
          </div>
        </>
      )}

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
        !item.buyPrice && skillBookDropSources.length === 0 && bossDropSources.length === 0 && <p style={{ color: 'var(--text-dim)' }}>無掉落資料（可能為任務獎勵或特殊取得）</p>
      )}

      {skillBookDropSources.length > 0 && (
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
                {skillBookDropSources.map((s, i) => (
                  <tr key={`skill-${i}`}>
                    <td>
                      <Link className="wiki-link" to={`/wiki/maps/${s.area}`}>
                        {s.label}
                      </Link>
                    </td>
                    <td className="cell-number">{s.rate}</td>
                    <td className="cell-number">1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xs)', marginTop: 4 }}>
            不區分職業，25 本共同池隨機
          </p>
        </>
      )}

      {bossDropSources.length > 0 && (
        <>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, marginBottom: 8 }}>Boss 掉落：</p>
          <div className="wiki-table-wrap">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Boss</th>
                  <th>掉落機率</th>
                  <th>數量</th>
                </tr>
              </thead>
              <tbody>
                {bossDropSources.map((d, i) => (
                  <tr key={`boss-${d.bossName}-${i}`}>
                    <td>{d.bossName}</td>
                    <td className="cell-number">{getDropRate(d.dropValue)}</td>
                    <td className="cell-number">{d.minAmount && d.maxAmount ? `${d.minAmount}~${d.maxAmount}` : '1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
