import { useState } from 'react';
import {
  AFFIX_CATEGORIES,
  AFFIX_DEFINITIONS,
  AFFIX_POOLS,
  AFFIX_TIER_TABLES,
  SHARED_AFFIX_TYPES,
  SPECIAL_AFFIX_DEFINITIONS,
  formatAffixBound,
  formatAffixTierSpan,
  getAffixCategoryName,
  getAffixPoolForSlot,
  getAffixTierTable,
  isAttributeAffixType,
  isFlatAffixType,
  type AffixCategory,
  type AffixGroup,
  type AffixTierTableKey,
  type AffixType,
} from '../../models/affix';
import {
  UNIQUE_AFFIX_BY_TEMPLATE,
  UNIQUE_AFFIX_POOLS,
  formatUniqueAffixRange,
  getUniqueAffixDefinition,
  type UniqueAffixDefinition,
  type UniqueAffixPool,
} from '../../models/uniqueAffix';
import { EQUIPMENT_SEEDS } from '../../db/seed';
import './WikiTable.css';
import './AffixCategoryView.css';

/** § 7.4 的分類小標，依 `AFFIX_DEFINITIONS` 的出現順序 */
const AFFIX_GROUPS = AFFIX_DEFINITIONS.reduce<AffixGroup[]>(
  (acc, d) => (acc.includes(d.group) ? acc : [...acc, d.group]),
  [],
);

/** 各分類的 T7 獨有詞綴來源（`07-affix-tier7.md` § 7T.5）：隨機池或依模板指定的部位 */
const UNIQUE_SOURCE: Record<AffixCategory, Exclude<UniqueAffixPool, 'fixed'> | { slot: string }> = {
  weapon: 'weapon',
  helmChest: 'helmChest',
  shirtCloak: 'shirtCloak',
  gloves: 'gloves',
  boots: 'boots',
  belt: { slot: 'belt' },
  offhand: { slot: 'leftHand' },
  necklace: 'accessory',
  ring: 'accessory',
};

/** 可帶隨機技能的分類（`07-affix-ability.md`） */
const ABILITY_CATEGORIES: Partial<Record<AffixCategory, string>> = { weapon: '武器', necklace: '飾品', ring: '飾品' };

const hasSpecial = (category: AffixCategory) => SPECIAL_AFFIX_DEFINITIONS.some(d => d.category.includes(category));

function rangeText(type: AffixType, category: AffixCategory): string {
  return isAttributeAffixType(type) ? '固定 +1 · 無 Tier' : formatAffixTierSpan(type, category);
}

function uniqueRows(category: AffixCategory): { label: string; def: UniqueAffixDefinition }[] {
  const source = UNIQUE_SOURCE[category];
  if (typeof source === 'string') {
    return UNIQUE_AFFIX_POOLS[source].map(type => ({ label: getUniqueAffixDefinition(type).name, def: getUniqueAffixDefinition(type) }));
  }
  return Object.entries(UNIQUE_AFFIX_BY_TEMPLATE)
    .map(([id, type]) => ({ tpl: EQUIPMENT_SEEDS.find(e => e.id === Number(id)), type }))
    .filter(r => r.tpl?.slot === source.slot)
    .map(r => ({ label: r.tpl!.name, def: getUniqueAffixDefinition(r.type) }));
}

function TierChips({ type, category }: { type: AffixType; category: AffixCategory }) {
  if (isAttributeAffixType(type)) return <span className="affix-cat-dim">無 Tier，固定 +1</span>;
  const unit = isFlatAffixType(type) ? '' : '%';
  return (
    <div className="affix-cat-tiers">
      {getAffixTierTable(type, category).map(t => (
        <span key={t.tier} className={`affix-tag tier-${t.tier}`}>
          T{t.tier} {formatAffixBound(type, t.min)}~{formatAffixBound(type, t.max)}{unit}
        </span>
      ))}
    </div>
  );
}

/** 一個分類能抽到的全部內容（`43-wiki-system.md` § 4.2.1） */
function CategoryView({ category }: { category: AffixCategory }) {
  const pool = getAffixPoolForSlot(category);
  const [open, setOpen] = useState<Set<AffixType>>(new Set());
  const allOpen = pool.every(d => open.has(d.type));
  const toggle = (type: AffixType) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(type)) next.delete(type); else next.add(type);
    return next;
  });
  const isWeapon = category === 'weapon';
  const ownCount = pool.filter(d => !SHARED_AFFIX_TYPES.includes(d.type)).length;
  const special = hasSpecial(category);
  const uniqueFixed = typeof UNIQUE_SOURCE[category] !== 'string';
  const unique = uniqueRows(category);
  const ability = ABILITY_CATEGORIES[category];

  return (
    <>
      <div className="affix-cat-head">
        <h4>{getAffixCategoryName(category)}{category === 'offhand' && '（盾牌、魔導書、臂甲）'}</h4>
        <div className="affix-cat-facts">
          <span>一般詞綴 <strong>{pool.length}</strong> 種{!isWeapon && `（專屬 ${ownCount}・共用 ${SHARED_AFFIX_TYPES.length}）`}</span>
          <span>免疫詞綴 <strong>{special ? '會出現' : '不會出現'}</strong></span>
          <span>T7 獨有詞綴 <strong>{uniqueFixed ? '依裝備指定' : `${unique.length} 選 1`}</strong></span>
          <span>隨機技能 <strong>{ability ? 'T3 以上可帶' : '不會帶'}</strong></span>
        </div>
      </div>
      <div className="affix-cat-toolbar">
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(pool.map(d => d.type)))}>
          {allOpen ? '收合各階數值' : '展開各階數值'}
        </button>
      </div>

      {AFFIX_GROUPS.map(group => {
        const rows = pool.filter(d => d.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group}>
            <h4 className="affix-cat-group">{group}</h4>
            <div className="wiki-table-wrap">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>詞綴</th>
                    <th>效果</th>
                    <th style={{ width: '24%' }}>數值區間（T1~T7）</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap(d => {
                    const isOpen = open.has(d.type);
                    const out = [
                      <tr key={d.type} className={`affix-cat-row${isOpen ? ' open' : ''}`} onClick={() => toggle(d.type)}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {d.name}
                          {!isWeapon && SHARED_AFFIX_TYPES.includes(d.type) && <span className="affix-cat-shared">共用</span>}
                        </td>
                        <td>{d.description}</td>
                        <td className="cell-number"><span className="wiki-range">{rangeText(d.type, category)}</span></td>
                      </tr>,
                    ];
                    if (isOpen) {
                      out.push(
                        <tr key={`${d.type}-tiers`}>
                          <td colSpan={3}><TierChips type={d.type} category={category} /></td>
                        </tr>,
                      );
                    }
                    return out;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {special && (
        <>
          <h4 className="affix-cat-group">免疫詞綴</h4>
          <div className="wiki-table-wrap">
            <table className="wiki-table">
              <thead>
                <tr><th style={{ width: '22%' }}>詞綴</th><th>效果</th><th style={{ width: '24%' }}>出現條件</th></tr>
              </thead>
              <tbody>
                {SPECIAL_AFFIX_DEFINITIONS.filter(d => d.category.includes(category)).map(d => (
                  <tr key={d.type}>
                    <td><span className="affix-tag special">{d.name}</span></td>
                    <td>{d.description}</td>
                    <td>固定效果 · Lv.{d.minAreaLevel}+ 掉落</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4 className="affix-cat-group">T7 獨有詞綴{uniqueFixed ? '（依裝備指定）' : '（均等抽 1 條）'}</h4>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>{uniqueFixed ? '裝備' : '名稱'}</th>
              <th>效果</th>
              <th style={{ width: '24%' }}>數值</th>
            </tr>
          </thead>
          <tbody>
            {unique.map(r => {
              const range = formatUniqueAffixRange(r.def);
              return (
                <tr key={r.label}>
                  <td><span className="affix-tag tier-7">{r.label}</span></td>
                  <td>{r.def.description}</td>
                  <td className="cell-number">{/~/.test(range) ? <span className="wiki-range">{range}</span> : range}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ability && (
        <p className="affix-cat-note">
          隨機技能：T3 以上的{isWeapon ? '武器' : '項鍊、戒指'}可另帶 1 條，清單見下方〈隨機技能〉的{ability}池。
        </p>
      )}
    </>
  );
}

/** 詞綴 × 分類矩陣，格內為 T7 上限 */
function MatrixView({ onPick }: { onPick: (c: AffixCategory) => void }) {
  return (
    <>
      <div className="wiki-table-wrap">
        <table className="wiki-table affix-cat-matrix">
          <thead>
            <tr>
              <th>詞綴</th>
              {AFFIX_CATEGORIES.map(c => (
                <th key={c.key} className="clickable" title={c.parts} onClick={() => onPick(c.key)}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AFFIX_DEFINITIONS.map(d => (
              <tr key={d.type}>
                <td>{d.name}</td>
                {AFFIX_CATEGORIES.map(c => {
                  if (!(d.type in AFFIX_POOLS[c.key])) return <td key={c.key}><span className="affix-cat-dim">—</span></td>;
                  if (isAttributeAffixType(d.type)) return <td key={c.key} className="cell-number"><span className="wiki-range">+1</span></td>;
                  const t = getAffixTierTable(d.type, c.key);
                  const unit = isFlatAffixType(d.type) ? '' : '%';
                  return (
                    <td key={c.key} className="cell-number" title={formatAffixTierSpan(d.type, c.key)}>
                      <span className="wiki-range">{formatAffixBound(d.type, t[t.length - 1].max)}{unit}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td>免疫詞綴</td>
              {AFFIX_CATEGORIES.map(c => (
                <td key={c.key}>{hasSpecial(c.key) ? <span className="affix-tag special">✓</span> : <span className="affix-cat-dim">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td><strong>種類數</strong></td>
              {AFFIX_CATEGORIES.map(c => <td key={c.key}><strong>{getAffixPoolForSlot(c.key).length}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="affix-cat-note">格內為 T7 上限；滑過看完整區間。點欄位標題看該分類的詳細內容。</p>
    </>
  );
}

/** 〈詞綴一覽〉：分類分頁＋總覽 */
export function AffixCategoryList() {
  const [view, setView] = useState<AffixCategory | 'matrix'>('weapon');
  return (
    <>
      <div className="affix-cat-chips" role="tablist" aria-label="詞綴分類">
        {AFFIX_CATEGORIES.map(c => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={view === c.key}
            className={`affix-cat-chip${view === c.key ? ' active' : ''}`}
            onClick={() => setView(c.key)}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={view === 'matrix'}
          className={`affix-cat-chip${view === 'matrix' ? ' active' : ''}`}
          onClick={() => setView('matrix')}
        >
          總覽
        </button>
      </div>
      {view === 'matrix' ? <MatrixView onPick={setView} /> : <CategoryView key={view} category={view} />}
    </>
  );
}

/** 使用某張階級表的詞綴名稱（跨分類） */
function tableUsers(key: AffixTierTableKey): AffixType[] {
  const types = new Set<AffixType>();
  for (const c of AFFIX_CATEGORIES) {
    for (const [type, k] of Object.entries(AFFIX_POOLS[c.key])) if (k === key) types.add(type as AffixType);
  }
  return AFFIX_DEFINITIONS.filter(d => types.has(d.type)).map(d => d.type);
}

/** 〈階級數值〉：每張階級表一列，滑過一列顯示使用它的詞綴 */
export function AffixTierTables() {
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table" id="affix-tiers">
        <thead>
          <tr>
            {[1, 2, 3, 4, 5, 6, 7].map(n => <th key={n}><span className={`affix-tag tier-${n}`}>T{n}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(AFFIX_TIER_TABLES) as AffixTierTableKey[]).map(key => {
            const users = tableUsers(key);
            const sample = users[0];
            const unit = isFlatAffixType(sample) ? '' : '%';
            return (
              <tr key={key} title={users.map(t => AFFIX_DEFINITIONS.find(d => d.type === t)!.name).join('、')}>
                {AFFIX_TIER_TABLES[key].map(t => (
                  <td key={t.tier} className="cell-number">
                    <span className={`affix-tag tier-${t.tier}`}>
                      {formatAffixBound(sample, t.min)}~{formatAffixBound(sample, t.max)}{unit}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
