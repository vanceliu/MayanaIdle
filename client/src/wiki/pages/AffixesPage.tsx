import { useMemo, useState } from 'react';
import {
  AFFIX_DEFINITIONS,
  SPECIAL_AFFIX_DEFINITIONS,
  AFFIX_TIERS,
  AFFIX_TIER_TABLES,
  DEFAULT_MAX_AFFIX_TIER,
  SHOP_MAX_AFFIX_TIER,
  getAffixPoolForSlot,
  getAffixTierTable,
  getSpecialAffixChance,
  getTierWeights,
  getBossTierWeights,
  type AffixCategory,
  type AffixGroup,
  type AffixType,
} from '../../models/affix';
import {
  SIGIL_DEFINITIONS,
  ENHANCE_SIGIL_RATES,
  ENHANCE_SIGIL_FAIL_TIER,
  POLISH_SIGIL_GOLD_COST,
} from '../../models/sigil';
import '../components/WikiTable.css';

/**
 * 詞綴 wiki 頁。
 * 所有資料直接讀 `models/affix.ts`，不另抄一份，避免與實作 drift。
 *
 * 版面原則：**一條詞綴只出現一次**。
 * 詞綴的「效果 + 適用部位 + 數值區間」全部集中在〈詞綴一覽〉，
 * 階級與掉落機率是與詞綴種類無關的維度，各自獨立成節，不再重複列一次詞綴清單。
 */

const CATEGORIES: { key: AffixCategory; label: string; slots: string }[] = [
  // 魔導書與臂甲雖佔左手欄位，但走防具詞綴池（§ 7.6，`getAffixCategoryForSlot`）
  { key: 'weapon', label: '武器', slots: '右手／左手武器（不含魔導書、臂甲）' },
  { key: 'armor', label: '一般防具', slots: '頭盔、胸甲、手套、鞋子、腰帶、魔導書、臂甲' },
  { key: 'shield', label: '盾牌', slots: '左手盾牌' },
  { key: 'accessory', label: '飾品', slots: '項鍊、戒指 ×2' },
];

const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c.label])
) as Record<AffixCategory, string>;

/** § 7.3 各階級的取得管道 */
const TIER_SOURCE: Record<number, string> = {
  1: '強化',
  2: '強化',
  3: '強化',
  4: '強化',
  5: '強化（上限）',
  6: '怪物掉落',
  7: 'Boss 限定掉落',
};

/** § 7.4 的分類小標，依 `AFFIX_DEFINITIONS` 的出現順序取得（不另外寫死一份） */
const AFFIX_GROUPS = AFFIX_DEFINITIONS.reduce<AffixGroup[]>(
  (acc, d) => (acc.includes(d.group) ? acc : [...acc, d.group]),
  []
);

const SPECIAL_GROUP_LABEL = '特殊詞綴（免疫類）';

const TIER_LEVEL_BANDS = [
  { label: 'Lv.1~10', level: 10 },
  { label: 'Lv.11~20', level: 20 },
  { label: 'Lv.21~30', level: 30 },
  { label: 'Lv.31~40', level: 40 },
  { label: 'Lv.41~50', level: 50 },
  { label: 'Lv.51+', level: 60 },
];

const SPECIAL_CHANCE_BANDS = [
  { label: 'Lv.1~30', level: 30 },
  { label: 'Lv.31~40', level: 31 },
  { label: 'Lv.41~50', level: 41 },
  { label: 'Lv.51+', level: 51 },
];

const sectionStyle = { marginBottom: 32 } as const;
const headingStyle = {
  color: 'var(--accent-gold)',
  fontFamily: 'var(--font-display)',
  marginBottom: 12,
} as const;
const groupHeadingStyle = {
  color: 'var(--text-primary)',
  fontSize: 'var(--fs-sm)',
  margin: '18px 0 6px',
} as const;
const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
  marginTop: 10,
} as const;

/** 某詞綴在專屬／通用階級表下的完整數值區間（T1 下限 ~ T7 上限） */
function tierRange(type: AffixType): string {
  const t = getAffixTierTable(type);
  return `${t[0].min}% ~ ${t[t.length - 1].max}%`;
}

function categoryText(categories: AffixCategory[]): string {
  return categories.map(c => CATEGORY_LABEL[c]).join('、');
}

/** 一個 § 7.4 分類的窄表：詞綴／適用部位／效果／數值區間，四欄不會橫向捲 */
function AffixGroupTable({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; categories: AffixCategory[]; description: string; range: string; special?: boolean }[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <h4 style={groupHeadingStyle}>{title}</h4>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>詞綴</th>
              <th style={{ width: '18%' }}>適用部位</th>
              <th>效果</th>
              <th style={{ width: '16%' }}>數值區間</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {row.special ? <span className="affix-tag special">{row.name}</span> : row.name}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{categoryText(row.categories)}</td>
                <td>{row.description}</td>
                <td className="cell-number">{row.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AffixesPage() {
  const [category, setCategory] = useState<AffixCategory | 'all'>('all');

  const groups = useMemo(() => {
    const match = (cats: AffixCategory[]) => category === 'all' || cats.includes(category);
    const normal = AFFIX_GROUPS.map(group => ({
      title: group,
      rows: AFFIX_DEFINITIONS.filter(d => d.group === group && match(d.category)).map(d => ({
        key: d.type,
        name: d.name,
        categories: d.category,
        description: d.description,
        range: tierRange(d.type),
      })),
    }));
    const special = {
      title: SPECIAL_GROUP_LABEL,
      rows: SPECIAL_AFFIX_DEFINITIONS.filter(d => match(d.category)).map(d => ({
        key: d.type,
        name: d.name,
        categories: d.category,
        description: d.description,
        range: `固定效果 · Lv.${d.minAreaLevel}+ 掉落`,
        special: true,
      })),
    };
    return [...normal, special];
  }, [category]);

  const visibleCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div>
      <h2 className="wiki-page-title">詞綴</h2>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>基本規則</h3>
        <ul style={{ ...noteStyle, marginTop: 0, paddingLeft: 20 }}>
          <li>每件裝備最多 <strong>4 個詞綴插槽</strong>；同一件裝備不可插入相同種類的詞綴，不同裝備之間可以重複。</li>
          <li>所有詞綴數值皆為百分比，並受裝備品質放大：實際效果 = floor(數值 × (1 + 品質% / 100))。</li>
          <li>精鍊印記的升階上限為 <strong>T{DEFAULT_MAX_AFFIX_TIER}</strong>；T6 只能靠一般怪掉落原生取得或突破印記，T7 只有 Boss 掉落與突破印記。</li>
          <li>商店購買的裝備 Tier 硬上限 <strong>T{SHOP_MAX_AFFIX_TIER}</strong>，用精鍊印記也升不過；鐵匠製作品為 T1~T{DEFAULT_MAX_AFFIX_TIER} 均等、固定 4 條、不會出特殊詞綴。</li>
          <li>特殊詞綴（免疫類）佔用一般詞綴插槽，無階級、不可強化，只從高等級區域掉落。</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>詞綴一覽</h3>
        <div className="wiki-filters">
          <select
            className="wiki-filter-select"
            aria-label="適用部位篩選"
            value={category}
            onChange={e => setCategory(e.target.value as AffixCategory | 'all')}
          >
            <option value="all">全部部位</option>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            {category === 'all'
              ? `共 ${AFFIX_DEFINITIONS.length} 種一般詞綴 ＋ ${SPECIAL_AFFIX_DEFINITIONS.length} 種特殊詞綴`
              : `${CATEGORY_LABEL[category]}可選 ${getAffixPoolForSlot(category).length} 種一般詞綴`}
          </span>
        </div>
        <p style={{ ...noteStyle, marginTop: 0, marginBottom: 4 }}>
          {CATEGORIES.map(c => `${c.label}＝${c.slots}`).join('；')}。
          <br />
          飾品的裝備類型與一般防具同為「防具」，但詞綴池獨立，可額外帶魔法抗性；
          魔導書與臂甲雖佔左手欄位，詞綴池與一般防具相同（不含任何攻擊詞綴）。
        </p>
        {groups.map(g => (
          <AffixGroupTable key={g.title} title={g.title} rows={g.rows} />
        ))}
        {visibleCount === 0 && <p className="wiki-empty">無符合條件的詞綴</p>}
        <p style={noteStyle}>
          「數值區間」為 T1 下限到 T7 上限的完整範圍，各階明細見下方〈階級數值〉。
          <br />
          魔法抗性使用專屬階級表，每一階都低於其他詞綴（它可同時出現在項鍊、戒指 ×2、盾牌共 4 個部位）。
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>階級數值</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table" id="affix-tiers">
            <thead>
              <tr>
                <th>階級</th>
                <th>通用數值</th>
                {AFFIX_TIER_TABLES.map(o => (
                  <th key={o.label}>{o.label}</th>
                ))}
                <th>取得方式</th>
              </tr>
            </thead>
            <tbody>
              {AFFIX_TIERS.map(t => (
                <tr key={t.tier}>
                  <td>
                    <span className={`affix-tag tier-${t.tier}`}>T{t.tier}</span>
                  </td>
                  <td className="cell-number">
                    {t.min}~{t.max}%
                  </td>
                  {AFFIX_TIER_TABLES.map(o => {
                    const row = o.tiers[t.tier - 1];
                    return (
                      <td key={o.label} className="cell-number">
                        <span className={`affix-tag tier-${t.tier}`}>{row.min}~{row.max}%</span>
                      </td>
                    );
                  })}
                  <td style={{ color: 'var(--text-secondary)' }}>{TIER_SOURCE[t.tier]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* § 7.3.2 滿值詞綴顯示 */}
        <p style={noteStyle}>
          詞綴滾到<strong>所屬階級的上限值</strong>時，裝備資訊、鐵匠鋪與印記師的詞綴清單會以
          <strong style={{ fontWeight: 700 }}>粗體</strong>顯示（顏色仍為該階級的 Tier 色）。
          <br />
          判定看的是<strong>未加品質的原始數值</strong>：品質對每條詞綴等比放大，不改變這次是否滾到滿值。
          例如品質 20% 的 T4 12%（顯示 14%）不算滿值。特殊詞綴沒有階級與數值，不參與判定，但一律以粗體顯示。
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>掉落階級權重</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>區域等級</th>
                <th>來源</th>
                {AFFIX_TIERS.map(t => (
                  <th key={t.tier}>T{t.tier}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIER_LEVEL_BANDS.map(band => {
                const normal = getTierWeights(band.level);
                const boss = getBossTierWeights(band.level);
                const total = (w: number[]) => w.reduce((s, v) => s + v, 0);
                return [
                  <tr key={`${band.label}-n`}>
                    <td rowSpan={2}>{band.label}</td>
                    <td>一般怪物</td>
                    {normal.map((w, i) => (
                      <td key={i} className="cell-number">
                        {w === 0 ? '—' : `${Math.round((w / total(normal)) * 100)}%`}
                      </td>
                    ))}
                  </tr>,
                  <tr key={`${band.label}-b`}>
                    <td>Boss</td>
                    {boss.map((w, i) => (
                      <td key={i} className="cell-number">
                        {w === 0 ? '—' : `${Math.round((w / total(boss)) * 100)}%`}
                      </td>
                    ))}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>每個詞綴插槽獨立抽階級。鐵匠鋪製作的裝備固定 4 個詞綴、T1~T5 均等，不會出 T6／T7。</p>
      </section>

      <section>
        <h3 style={headingStyle}>特殊詞綴出現機率</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>區域等級</th>
                <th>每個詞綴插槽的出現機率</th>
                <th>Boss 掉落</th>
              </tr>
            </thead>
            <tbody>
              {SPECIAL_CHANCE_BANDS.map(band => (
                <tr key={band.label}>
                  <td>{band.label}</td>
                  <td className="cell-number">{getSpecialAffixChance(band.level)}%</td>
                  <td className="cell-number">{getSpecialAffixChance(band.level, true)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          特殊詞綴取代一個一般詞綴的位置，同一件裝備不會重複；各詞綴的最低掉落區域等級見上方〈詞綴一覽〉。
          <br />
          特殊詞綴只涵蓋<strong>魔法抗性擋不住</strong>的負面狀態。詛咒、虛弱、減速改由魔法抗性依機率抵抗，
          因此沒有對應的免疫詞綴。
        </p>
      </section>

      <section>
        <h3 style={headingStyle}>印記</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>印記</th>
                <th>指定對象</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {SIGIL_DEFINITIONS.map(sigil => (
                <tr key={sigil.type}>
                  <td>{sigil.name}</td>
                  <td>{sigil.target === 'item' ? '整件裝備' : '一條詞綴'}</td>
                  <td>{sigil.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          印記在城鎮的<strong>印記師</strong>使用，詞綴的升階、重骰與裝備品質都在這裡，不影響強化等級（+N）；
          一次消耗印記 ×1，只有工藝印記另收 {POLISH_SIGIL_GOLD_COST.toLocaleString()}G。
          <br />
          升階的兩種印記在印記師是<strong>各自獨立的選項</strong>，守備範圍不重疊：
          取得管道上限以內用<strong>精鍊印記</strong>（必定成功），T5／T6 才輪到<strong>突破印記</strong>。
          <br />
          突破印記是 T6／T7 詞綴在掉落之外的唯一來源：
          {ENHANCE_SIGIL_RATES.map(r => `T${r.from}→T${r.from + 1} ${Math.round(r.rate * 100)}%`).join('、')}
          ，失敗該詞綴掉回 T{ENHANCE_SIGIL_FAIL_TIER}。
          <br />
          混沌與刺針在城鎮使用，沒有區域等級可查，特殊詞綴改依<strong>角色等級</strong>套用上表的機率與門檻。
          混沌／刺針／重刻／突破只在 Lv.31 以上區域的怪物與 Boss 掉落；精鍊與工藝印記走全區域掉落。
          <br />
          印記<strong>不佔背包格也不計負重</strong>，收在背包底部的「印記」抽屜裡，撿再多都不會擠到背包。
        </p>
      </section>
    </div>
  );
}
