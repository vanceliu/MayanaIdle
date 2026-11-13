import {
  AFFIX_SOCKETS,
  EVASION_POINTS_PER_PERCENT,
  DEFAULT_MAX_AFFIX_TIER,
  formatCraftAffixTierRanges,
  formatCraftAffixTierWeights,
  SHOP_MAX_AFFIX_TIER,
  getSpecialAffixChance,
  getTierWeights,
  getBossTierWeights,
} from '../../models/affix';
import {
  SIGIL_DEFINITIONS,
  ENHANCE_SIGIL_RATES,
  ENHANCE_SIGIL_FAIL_TIER,
  POLISH_SIGIL_GOLD_COST,
  CHAOS_SIGIL_MAX_TIER,
  CHAOS_SIGIL_BONUS_TIER,
  CHAOS_SIGIL_T6_RATE,
  CHAOS_SIGIL_T6_ANY_RATE,
  CHAOS_SIGIL_T6_MIN_LEVEL,
  SEAL_SIGIL_SUCCESS_RATE,
  MAX_SEALED_AFFIXES,
  SIGIL_EXCHANGE_TYPES,
  SIGIL_EXCHANGE_FEE_TYPES,
  SIGIL_EXCHANGE_INPUT_COUNT,
  SIGIL_EXCHANGE_FEE_COUNT,
  getSigilDefinition,
} from '../../models/sigil';
import { CRAFTED_GEAR_SUFFIX } from '../../models/equipment';
import '../components/WikiTable.css';
import { UniqueAffixSection } from '../components/UniqueAffixTable';
import { AffixCategoryList, AffixTierTables } from '../components/AffixCategoryView';
import { AbilitySection } from '../components/AbilityTable';

/**
 * 詞綴 wiki 頁（`43-wiki-system.md` § 4.2.1）。
 * 所有資料直接讀 `models/affix.ts`，不另抄一份，避免與實作 drift。
 * 〈詞綴一覽〉以分類為單位顯示該部位能抽到的全部內容；階級與掉落機率各自獨立成節。
 */

const TIER_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

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

export function AffixesPage() {
  return (
    <div>
      <h2 className="wiki-page-title">詞綴</h2>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>基本規則</h3>
        <ul style={{ ...noteStyle, marginTop: 0, paddingLeft: 20 }}>
          <li>每件裝備有 <strong>{AFFIX_SOCKETS} 個詞綴洞</strong>；同一件裝備不可插入相同種類的詞綴，不同裝備之間可以重複。</li>
          <li>
            詞綴條數依取得管道：<strong>商店與鐵匠製作固定 {AFFIX_SOCKETS} 條</strong>；
            <strong>怪物與 Boss 掉落（含 T7）為 1~{AFFIX_SOCKETS} 條均等</strong>，沒填滿的洞留空，裝備說明裡標成「空洞」。
          </li>
          <li>
            空洞用<strong>新增印記</strong>補一條。<strong>封印印記</strong>成功時，那條詞綴移出洞外、原本的洞空出來；
            失敗時，那條詞綴連同它的洞永久毀壞（標成「已毀壞」），之後不能再補。
          </li>
          <li>
            <strong>封印詞綴</strong>名稱前標 <strong>(封)</strong>，<strong>不佔詞綴洞</strong>，列在詞綴洞下面：效果與原詞綴相同、吃品質，
            但<strong>任何印記都動不了它</strong>（混沌重抽時保留，刺針／重刻／精鍊／突破不能指定）。一件最多 {MAX_SEALED_AFFIXES} 條，可與 T7 獨有詞綴並存
            ——一件裝備最多 {AFFIX_SOCKETS} 條詞綴＋1 條 (封)＋T7 的 1 條 (獨)。
          </li>
          <li>詞綴數值受裝備品質放大（額外屬性除外）：百分比詞綴 floor(數值 × (1 + 品質% / 100) × 10) ÷ 10，固定值 floor(數值 × (1 + 品質% / 100))。</li>
          <li>詞綴依部位分類，每類有自己的詞綴池與階級表，同一種詞綴在不同分類的數值範圍可能不同（見〈詞綴一覽〉）。</li>
          <li>
            <strong>舊詞綴</strong>：不在所屬分類詞綴池內的詞綴照常生效，但<strong>不能用精鍊、突破、重刻</strong>，只能用刺針或混沌換掉；
            印記師以「舊」標示。
          </li>
          <li>精鍊印記的升階上限為 <strong>T{DEFAULT_MAX_AFFIX_TIER}</strong>；T6 來自一般怪掉落原生、T5／T6 製作品、突破印記，以及混沌／新增印記的小機率；T7 只有 Boss 掉落與突破印記。</li>
          <li>商店購買的裝備 Tier 硬上限 <strong>T{SHOP_MAX_AFFIX_TIER}</strong>，用精鍊印記也升不過。</li>
          <li>
            鐵匠製作品名稱後標 <strong>{CRAFTED_GEAR_SUFFIX}</strong>：固定 4 條、不會出特殊詞綴，Tier 依裝備階級（{formatCraftAffixTierRanges()}；{formatCraftAffixTierWeights()}），
            <strong>任何印記都不能使用</strong>。同一件模板由怪物掉落取得時沒有 {CRAFTED_GEAR_SUFFIX}，照常可用印記。
          </li>
          <li>特殊詞綴（免疫類）佔用一般詞綴插槽，無階級、不可強化，只從高等級區域掉落。</li>
          <li>裝備階級 T7 另有第 5 條<strong>獨有詞綴</strong>，各分類的清單見〈詞綴一覽〉，通用規則見下方〈T7 獨有詞綴〉。</li>
        </ul>
      </section>

      <section style={sectionStyle} data-testid="affix-list">
        <h3 style={headingStyle}>詞綴一覽</h3>
        <AffixCategoryList />
        <p style={noteStyle}>
          百分比詞綴以 0.1% 為單位，各階區間連續不重疊；品質放大後取到小數一位。
          <br />
          最大 HP／MP 與回血／回魔是<strong>固定值</strong>，不是百分比；額外屬性無 Tier，一律 +1。
          <br />
          迴避是<strong>迴避值</strong>，{EVASION_POINTS_PER_PERCENT} 迴避值 = 1% 迴避率。
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>階級數值</h3>
        <AffixTierTables />
        <p style={noteStyle}>
          T1~T{DEFAULT_MAX_AFFIX_TIER} 由精鍊印記升階；T6 為怪物掉落；T7 為 Boss 限定掉落。滑過一列看使用它的詞綴。
          <br />
          同一種詞綴在不同分類可能用不同的表（例：爆擊率在手套每階 2.0%、在項鍊與戒指每階 1.0%），以〈詞綴一覽〉各分類為準。
          <br />
          {/* § 7.3.2 滿值詞綴顯示 */}
          詞綴滾到<strong>所屬階級的上限值</strong>時，裝備資訊與印記師的詞綴清單會以
          <strong style={{ fontWeight: 700 }}>粗體</strong>顯示（顏色仍為該階級的 Tier 色）。
          判定看的是<strong>未加品質的原始數值</strong>：品質對每條詞綴等比放大，不改變這次是否滾到滿值。
          例如手套上品質 20% 的爆擊率 T4 7.5%（顯示 9.0%）不算滿值。特殊詞綴沒有階級與數值，不參與判定，但一律以粗體顯示。
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>掉落階級機率</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>區域等級</th>
                <th>來源</th>
                {TIER_NUMBERS.map(n => (
                  <th key={n}>T{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIER_LEVEL_BANDS.map(band => {
                const normal = getTierWeights(band.level);
                const boss = getBossTierWeights(band.level);
                // T6／T7：整件至少一條的機率；T1~T5：其餘機率的分配比例（§ 7.7）
                const cell = (w: number[], i: number) => {
                  if (w[i] === 0) return '—';
                  const base = i >= 5 ? w : w.slice(0, 5);
                  return `${Math.round((w[i] / base.reduce((s, v) => s + v, 0)) * 100)}%`;
                };
                return [
                  <tr key={`${band.label}-n`}>
                    <td rowSpan={2}>{band.label}</td>
                    <td>一般怪物</td>
                    {normal.map((_, i) => <td key={i} className="cell-number">{cell(normal, i)}</td>)}
                  </tr>,
                  <tr key={`${band.label}-b`}>
                    <td>Boss</td>
                    {boss.map((_, i) => <td key={i} className="cell-number">{cell(boss, i)}</td>)}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>T6、T7 是<strong>整件裝備至少一條</strong>的機率，不論詞綴幾條都一樣；T1~T5 是其餘詞綴的階級比例。掉落時先抽條數（1~{AFFIX_SOCKETS} 條均等），每條獨立抽階級，仍可能出現 2 條以上 T6。鐵匠鋪製作的裝備固定 {AFFIX_SOCKETS} 個詞綴，Tier 依裝備階級（{formatCraftAffixTierRanges()}；{formatCraftAffixTierWeights()}），不會出 T7。</p>
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
          特殊詞綴只出現在上衣／斗篷與腰帶，取代一個一般詞綴的位置，同一件裝備不會重複；各詞綴的最低掉落區域等級見上方〈詞綴一覽〉。
          <br />
          特殊詞綴只涵蓋<strong>魔法抗性擋不住</strong>的負面狀態。詛咒、虛弱、減速、沉默改由魔法抗性依機率抵抗，
          因此沒有對應的免疫詞綴。
        </p>
      </section>

      <UniqueAffixSection pools={[]} showFixed={false} />
      <AbilitySection groups={['weapon', 'accessory']} />

      <section className="wiki-section">
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
          新手裝與 {CRAFTED_GEAR_SUFFIX} 製作品不可使用任何印記。
          <br />
          升階的兩種印記在印記師是<strong>各自獨立的選項</strong>，守備範圍不重疊：
          取得管道上限以內用<strong>精鍊印記</strong>（必定成功），T5／T6 才輪到<strong>突破印記</strong>。
          <br />
          突破印記是 T7 詞綴在掉落之外的唯一來源，也是唯一能指定詞綴升到 T6 的方式：
          {ENHANCE_SIGIL_RATES.map(r => `T${r.from}→T${r.from + 1} ${Math.round(r.rate * 100)}%`).join('、')}
          ，失敗該詞綴掉回 T{ENHANCE_SIGIL_FAIL_TIER}。
          <br />
          <strong>混沌印記</strong>不看原本有幾條，一律重抽到<strong>填滿所有詞綴洞</strong>（被毀壞的洞不算；封印詞綴不佔洞、原樣保留）。
          每條詞綴有 {(CHAOS_SIGIL_T6_RATE * 100).toFixed(2)}% 為 T{CHAOS_SIGIL_BONUS_TIER}、其餘由 T1~T{CHAOS_SIGIL_MAX_TIER} 均分（4 洞時至少 1 條 T{CHAOS_SIGIL_BONUS_TIER} 的機率為 {CHAOS_SIGIL_T6_ANY_RATE * 100}%）；
          T{CHAOS_SIGIL_BONUS_TIER} 需角色 <strong>Lv.{CHAOS_SIGIL_T6_MIN_LEVEL} 以上</strong>，以下只有 T1~T{CHAOS_SIGIL_MAX_TIER} 均等；
          商店裝只到 T{SHOP_MAX_AFFIX_TIER}、不出 T{CHAOS_SIGIL_BONUS_TIER}。
          <br />
          <strong>新增印記</strong>在空洞補一條，必定成功，Tier 與混沌相同（{(CHAOS_SIGIL_T6_RATE * 100).toFixed(2)}% 為 T{CHAOS_SIGIL_BONUS_TIER}、其餘由 T1~T{CHAOS_SIGIL_MAX_TIER} 均分，同樣需 Lv.{CHAOS_SIGIL_T6_MIN_LEVEL} 以上；商店裝 T1~T{SHOP_MAX_AFFIX_TIER}）；沒有空洞時不能用。
          <br />
          <strong>封印印記</strong>指定一條詞綴：{Math.round(SEAL_SIGIL_SUCCESS_RATE * 100)}% 移出詞綴洞封印成 (封)，原本的洞空出來可再補一條；
          {100 - Math.round(SEAL_SIGIL_SUCCESS_RATE * 100)}% 失敗時那條詞綴<strong>連同詞綴洞一起毀壞</strong>（例：4 條變 3 條、洞也剩 3 個），印記照樣消耗。
          特殊詞綴與額外屬性也能封印。
          <br />
          混沌、刺針與新增在城鎮使用，沒有區域等級可查，特殊詞綴改依<strong>角色等級</strong>套用上表的機率與門檻。
          混沌／刺針／重刻／突破／新增／封印只在 Lv.31 以上區域的怪物與 Boss 掉落；精鍊與工藝印記走全區域掉落。
          <br />
          <strong>印記兌換</strong>（印記師「兌換印記」分頁）：
          {SIGIL_EXCHANGE_TYPES.map(t => getSigilDefinition(t).name).join('／')}任意混搭 {SIGIL_EXCHANGE_INPUT_COUNT} 個，
          加上手續費{SIGIL_EXCHANGE_FEE_TYPES.map(t => getSigilDefinition(t).name).join('＋')}合計 {SIGIL_EXCHANGE_FEE_COUNT} 個，
          換指定的 1 個，必定成功、不收金幣。
          <br />
          印記<strong>不佔背包格也不計負重</strong>，收在背包底部的「印記」抽屜裡，撿再多都不會擠到背包。
        </p>
      </section>
    </div>
  );
}
