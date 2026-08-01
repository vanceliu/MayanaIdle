import {
  AFFIX_DEFINITIONS,
  SPECIAL_AFFIX_DEFINITIONS,
  AFFIX_TIERS,
  AFFIX_TIER_OVERRIDES,
  getAffixTierTable,
  getSpecialAffixChance,
  getTierWeights,
  getBossTierWeights,
  type AffixCategory,
  type AffixType,
} from '../../models/affix';
import '../components/WikiTable.css';

/**
 * 詞綴 wiki 頁。
 * 所有資料直接讀 `models/affix.ts`，不另抄一份，避免與實作 drift。
 */

const CATEGORIES: { key: AffixCategory; label: string; slots: string }[] = [
  { key: 'weapon', label: '武器', slots: '右手／左手武器（含魔導書）' },
  { key: 'armor', label: '一般防具', slots: '頭盔、胸甲、手套、鞋子、腰帶' },
  { key: 'shield', label: '盾牌', slots: '左手盾牌' },
  { key: 'accessory', label: '飾品', slots: '項鍊、戒指 ×2' },
];

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
const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
  marginTop: 10,
} as const;

function TierValue({ type, tier }: { type: AffixType; tier: number }) {
  const t = getAffixTierTable(type)[tier - 1];
  return (
    <span className={`affix-tag tier-${tier}`}>
      {t.min === t.max ? `${t.min}%` : `${t.min}~${t.max}%`}
    </span>
  );
}

export function AffixesPage() {
  const overriddenTypes = Object.keys(AFFIX_TIER_OVERRIDES) as AffixType[];

  return (
    <div>
      <h2 className="wiki-page-title">詞綴</h2>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>哪些裝備可以帶哪些詞綴</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>詞綴</th>
                {CATEGORIES.map(c => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AFFIX_DEFINITIONS.map(def => (
                <tr key={def.type}>
                  <td>{def.name}</td>
                  {CATEGORIES.map(c => (
                    <td key={c.key} className="cell-number">
                      {def.category.includes(c.key) ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {SPECIAL_AFFIX_DEFINITIONS.map(def => (
                <tr key={def.type}>
                  <td>
                    <span className="affix-tag special">[特殊]</span> {def.name}
                  </td>
                  {CATEGORIES.map(c => (
                    <td key={c.key} className="cell-number">
                      {def.category.includes(c.key) ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ color: 'var(--text-secondary)' }}>可選詞綴數</td>
                {CATEGORIES.map(c => (
                  <td key={c.key} className="cell-number" style={{ color: 'var(--accent-info)' }}>
                    {AFFIX_DEFINITIONS.filter(d => d.category.includes(c.key)).length} 種
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="wiki-table-wrap" style={{ marginTop: 12 }}>
          <table className="wiki-table">
            <thead>
              <tr>
                <th>分類</th>
                <th>對應部位</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(c => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  <td>{c.slots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          每件裝備最多 4 個詞綴插槽，同一件裝備不可插入相同種類的詞綴；不同裝備之間可以重複。
          <br />
          飾品的裝備類型與一般防具同為「防具」，但詞綴池獨立，可額外帶魔法抗性。
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>各階級數值</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>階級</th>
                <th>通用數值</th>
                {overriddenTypes.map(type => (
                  <th key={type}>
                    {AFFIX_DEFINITIONS.find(d => d.type === type)?.name ?? type}
                  </th>
                ))}
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
                  {overriddenTypes.map(type => (
                    <td key={type} className="cell-number">
                      <TierValue type={type} tier={t.tier} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          品質會放大詞綴數值：實際效果 = floor(數值 × (1 + 品質% / 100))。
          <br />
          鐵匠鋪的詞綴強化最高只能提升到 T5，T6／T7 只能靠掉落取得。
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
        <h3 style={headingStyle}>特殊詞綴</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>詞綴</th>
                <th>效果</th>
                <th>最低區域等級</th>
              </tr>
            </thead>
            <tbody>
              {SPECIAL_AFFIX_DEFINITIONS.map(def => (
                <tr key={def.type}>
                  <td>
                    <span className="affix-tag special">{def.name}</span>
                  </td>
                  <td>{def.description}</td>
                  <td className="cell-number">Lv.{def.minAreaLevel}+</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wiki-table-wrap" style={{ marginTop: 12 }}>
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
          特殊詞綴無階級、不可強化，會佔用一個一般詞綴插槽，同一件裝備不會重複。
          <br />
          特殊詞綴只涵蓋<strong>魔法抗性擋不住</strong>的負面狀態。詛咒、虛弱、減速改由魔法抗性依機率抵抗，
          因此沒有對應的免疫詞綴。
        </p>
      </section>
    </div>
  );
}
