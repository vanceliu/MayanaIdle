import '../components/WikiTable.css';
import {
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
} from '../../models/scriptEngine';
import {
  COMBAT_CONDITION_DESC,
  COMBAT_ACTION_DESC,
  PERSISTENT_CONDITION_DESC,
  PERSISTENT_ACTION_DESC,
  VILLAGE_CONDITION_DESC,
  VILLAGE_ACTION_DESC,
} from '../talentAffixDescriptions';
import {
  VILLAGE_CONDITION_LABELS,
  VILLAGE_ACTION_LABELS,
} from '../../models/villageScript';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import {
  AFFIX_DROP_RATE,
  AFFIX_FUSE_SUCCESS_RATE,
  AFFIX_TIER_BAND,
  SLOT_DROP_RATE_BOSS,
  slotTierBandFor,
  SLOT_GRANT_LEVEL_INTERVAL,
  STARTING_SLOT_COUNT,
  TALENT_POOL_TIER_CAP,
  BLOCKED_LABELS,
  TALENT_TYPE_LABELS,
  conditionSlotCount,
  type TalentType,
  type TalentSlotTier,
  type TalentTier,
} from '../../models/talent';

/**
 * 自動天賦說明（`03-combat.md` § 3.12～3.14、`49-village-script.md`）。
 *
 * 條件與動作的名稱一律從 models 的標籤常數讀 —— 面板改了名字這裡會跟著動，
 * 不會出現「Wiki 寫的選項在面板上找不到」。判定頻率那類數字是硬編碼文字，
 * 與 `AttributesPage` 同一種做法。
 */

// 樣式沿用 `CombatPage` 的做法：純文字說明頁用 inline style，不另立 CSS class
const SECTION_TITLE = {
  color: 'var(--accent-gold)',
  fontFamily: 'var(--font-display)',
  marginBottom: 12,
} as const;
const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
  marginTop: 8,
} as const;
const codeStyle = {
  background: 'var(--bg-card)',
  padding: 16,
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.9,
  overflowX: 'auto',
} as const;
const subTitleStyle = { color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 } as const;

/** 條件／動作對照表：左欄名稱、右欄說明 */
function LabelTable({ head, rows }: { head: string; rows: [string, string][] }) {
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>{head}</th>
            <th>說明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, desc]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toRows(
  labels: Record<string, string>,
  desc: Record<string, string>,
  kind: 'condition' | 'action',
  type: TalentType,
): [string, string][] {
  const obtainable = new Set(
    TALENT_AFFIX_DEFS
      .filter(d => !d.blocked && d.kind === kind && d.appliesTo.includes(type))
      .map(d => d.ruleId),
  );
  return Object.entries(labels)
    .filter(([key]) => obtainable.has(key))
    .map(([key, label]) => [label, desc[key] ?? '']);
}

export function TalentsPage() {
  return (
    <div>
      <h2 className="wiki-page-title">自動天賦</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>天賦格與鑲材</h3>
        <p style={noteStyle}>
          一個<strong>天賦格</strong>就是一條規則。格子本身是空的，
          條件與實作由<strong>鑲材</strong>提供 —— 鑲材是打怪掉的，不是一開始就全部給你。
          天賦格的階級決定它有幾個條件槽，實作槽固定 1 個。
        </p>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>天賦格</th><th>條件槽</th><th>實作槽</th><th>能鑲的鑲材階級</th></tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4] as TalentSlotTier[]).map(tier => (
                <tr key={tier}>
                  <td>T{tier}</td>
                  <td>{conditionSlotCount(tier)}</td>
                  <td>1</td>
                  <td>不限</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          天賦格<strong>不綁類型</strong>：同一個格子安裝到戰鬥、常駐或補給都可以。
          要換類型就拆下再到目標分頁安裝，拆下時鑲材全部退回背包，不會消失。
        </p>

        <h4 style={subTitleStyle}>取得</h4>
        <ul style={noteStyle}>
          <li>創角給 {STARTING_SLOT_COUNT} 個 T1 天賦格，其中 3 個已經裝好可以直接打</li>
          <li>每 {SLOT_GRANT_LEVEL_INTERVAL} 級由信箱發 1 個 T1 天賦格，要自己領、自己安裝</li>
          <li>高階天賦格只有 Boss 會掉（{SLOT_DROP_RATE_BOSS}%），或用低階 ×2 合成</li>
          <li>鑲材由一般怪與 Boss 掉落，Boss 掉率是一般怪的兩倍</li>
        </ul>

        <h4 style={subTitleStyle}>鑲材的三種型態</h4>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>型態</th><th>意思</th><th>能不能改</th></tr></thead>
            <tbody>
              <tr>
                <td>指定</td>
                <td>掉落時就綁死一個對象（某個技能、某類道具）</td>
                <td><strong>首次鑲入時選定，之後不可更改</strong></td>
              </tr>
              <tr>
                <td>池</td>
                <td>掉落時綁一個子集（例如「火系攻擊技能」）</td>
                <td>子集不可更改，子集內可自由挑</td>
              </tr>
              <tr>
                <td>自選</td>
                <td>沒有綁定對象，數值自己填</td>
                <td>隨時可改</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          <strong>一份鑲材只能在一個槽位</strong>：同一份不可能同時出現在兩個天賦格或兩份天賦配置裡。
          把它鑲到別的地方，原本那個槽位就空了。
        </p>

        <h4 style={subTitleStyle}>合成上限</h4>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>類型</th><th>條件鑲材上限</th><th>實作鑲材上限</th></tr></thead>
            <tbody>
              {(['combat', 'persistent', 'supply'] as const).map(t => (
                <tr key={t}>
                  <td>{TALENT_TYPE_LABELS[t]}</td>
                  <td>T{TALENT_POOL_TIER_CAP[t].condition}</td>
                  <td>T{TALENT_POOL_TIER_CAP[t].action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>三種天賦</h3>
        <p style={noteStyle}>
          每套天賦都是<strong>有序規則列表</strong>：由上往下判定，
          第一個「條件全部成立、而且動作真的做得出來」的規則被執行，其餘不看。
          一條規則可以掛多個條件，全部成立才算（AND）；沒有條件等同「永遠」。
        </p>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>天賦</th>
                <th>判定時機</th>
                <th>負責什麼</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>戰鬥天賦</td>
                <td>每次攻擊機會（1200ms，受加速影響）</td>
                <td>攻擊技能、普通攻擊</td>
              </tr>
              <tr>
                <td>常駐天賦</td>
                <td>每 300ms，任何狀態</td>
                <td>喝藥、buff、治癒、狀態解除</td>
              </tr>
              <tr>
                <td>補給天賦</td>
                <td>每 1200ms，任何地點</td>
                <td>回城、買賣、倉庫存取、返回掛機點</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          三者同時運作，優先順序為常駐 → 緊急撤退 → 村莊。保命動作永遠先做。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>戰鬥天賦</h3>
        <LabelTable head="條件" rows={toRows(COMBAT_CONDITION_LABELS, COMBAT_CONDITION_DESC, 'condition', 'combat')} />
        <LabelTable head="動作" rows={toRows(COMBAT_ACTION_LABELS, COMBAT_ACTION_DESC, 'action', 'combat')} />
        <p style={noteStyle}>
          <strong>不需要多掛「技能就緒」</strong>：動作選了技能時，冷卻、MP、武器需求
          本來就會被檢查，不過關就跳到下一條規則。
        </p>
        <p style={noteStyle}>
          <strong>沒有任何啟用的攻擊規則，角色就完全不出手。</strong>
          引擎不會偷偷退回普通攻擊 —— 關掉普攻規則代表你不打算貼身。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>常駐天賦</h3>
        <LabelTable head="條件" rows={toRows(PERSISTENT_CONDITION_LABELS, PERSISTENT_CONDITION_DESC, 'condition', 'persistent')} />
        <LabelTable head="動作" rows={toRows(PERSISTENT_ACTION_LABELS, PERSISTENT_ACTION_DESC, 'action', 'persistent')} />
        <p style={noteStyle}>
          面板下方另有獨立的「緊急撤退」設定（HP 低於門檻就回城），
          只在附近有敵人時生效，不參與規則列表的排序。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>補給天賦</h3>
        <LabelTable head="條件" rows={toRows(VILLAGE_CONDITION_LABELS, VILLAGE_CONDITION_DESC, 'condition', 'supply')} />
        <LabelTable head="動作" rows={toRows(VILLAGE_ACTION_LABELS, VILLAGE_ACTION_DESC, 'action', 'supply')} />
        <p style={noteStyle}>
          動作做不出來時就跳過該規則。因此在野外時整份規則會自然掉到「回城」那條，
          回城之後才輪到買賣 —— 同一份規則同時描述了「何時該回城」與「回城後做什麼」。
        </p>
        <p style={noteStyle}>
          <strong>預設是空的。</strong>這些動作會花錢、賣東西、把角色傳走，
          門檻由你自己決定，系統不給預設值。
        </p>
        <h4 style={subTitleStyle}>販售／存入裝備的篩選條件</h4>
        <p style={noteStyle}>
          同一份設定，兩個動作方向相反：<strong>販售時命中＝保留（不賣），存入時命中＝要存</strong>。
          符合任一條就命中。可用條件：詞綴 Tier 高於 N、帶有指定詞綴、本職業可裝備的、
          指定裝備類型、白名單。新手裝與穿在身上的裝備一律不賣也不存。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>天賦配置</h3>
        <p style={noteStyle}>
          一份天賦配置 ＝ 戰鬥＋常駐＋補給＋緊急撤退<strong>整包</strong>設定。
          切換情境（清怪／打王／練功）時一次到位，不必分三處各切一遍，切了立刻生效。
        </p>
        <p style={noteStyle}>
          <strong>配置之間是換裝，不是複製。</strong>
          天賦格與鑲材都是實體，同一個只能在一份配置裡。
          所以切到另一份配置時，別份配置正在用的天賦格會出現在背包「天賦」分頁 ——
          裝過來就等於從那一份搬過來，那一份會少一格。
        </p>
        <ul style={noteStyle}>
          <li>改動直接存進使用中的配置，沒有「儲存／放棄」兩段式</li>
          <li>「預設」配置不可刪除，所以清單永遠至少有一份</li>
          <li>搬過來的鑲材如果不適用新類型（例如常駐格搬到補給），該鑲材退回背包</li>
          <li>合成<strong>只吃完全沒安裝的</strong>天賦格與鑲材，不會去拆別份配置</li>
          <li>配置存在角色身上，不跨角色共用（規則裡的技能綁職業）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>合成與掉落</h3>
        <TalentFusionTable />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>合成與掉落</h3>
        <TalentFusionTable />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>範例</h3>
        <h4 style={subTitleStyle}>戰鬥天賦：怪聚成一團才放範圍技</h4>
        <pre style={codeStyle}>{`#1 如果 本招命中數 ≥ 3 且 MP 高於 40%  → 施放火球
#2 如果 自身周圍怪物數 ≥ 4（半徑 3 碼） → 施放天雷
#3 如果 目標 HP 低於 30%                → 施放風刃
#4 永遠                                 → 普通攻擊`}</pre>

        <h4 style={subTitleStyle}>常駐天賦：補血與維持 buff</h4>
        <pre style={codeStyle}>{`#1 如果 HP 低於 30%                        → 使用紅色藥水
#2 如果 HP 低於 50% 且 技能就緒（治癒）    → 施放治癒
#3 如果 Buff 未激活（魔法盔甲）            → 施放魔法盔甲
#4 如果 狀態異常（中毒）                   → 使用解毒藥水`}</pre>

        <h4 style={subTitleStyle}>補給天賦：背包滿了自己回城整理</h4>
        <pre style={codeStyle}>{`#1 如果 背包已用格數 ≥ 38  → 回城
#2 如果 紅色藥水 少於 20   → 回城
#3 永遠                    → 存入裝備（詞綴 Tier 高於 5）到共用倉庫
#4 永遠                    → 販售素材（Tier 2 以下，保留配方素材）
#5 永遠                    → 販售裝備（商店中階以下，保留本職業可裝備的）
#6 如果 紅色藥水 少於 100  → 購買紅色藥水至 100
#7 如果 金幣多於 50000     → 存入金幣（身上留下 50000）
#8 永遠                    → 返回上次掛機點`}</pre>
        <p style={noteStyle}>
          存入排在販售前面：規則由上往下，先把要留的搬走，
          販售就不必倚賴保留條件寫得夠準。
        </p>
      </section>
    </div>
  );
}

/**
 * 鑲材總表（`43-wiki-system.md` § 4.12）。
 *
 * **必須列出玩家尚未取得的** —— 編輯器只顯示已持有的（`51-auto-talent.md` § 51.10），
 * 「還有什麼可以刷」只有 Wiki 回答得了。
 */
export function TalentAffixTable() {
  const rows = [...TALENT_AFFIX_DEFS].sort((a, b) =>
    a.tier - b.tier || a.kind.localeCompare(b.kind) || a.id - b.id);

  return (
    <div>
      <h3>鑲材總表（{TALENT_AFFIX_DEFS.length} 筆）</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th><th>種類</th><th>適用</th><th>型態</th><th>取得</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id}>
              <td>T{d.tier}</td>
              <td>{d.kind === 'condition' ? '條件' : '實作'}</td>
              <td>{d.appliesTo.map(t => TALENT_TYPE_LABELS[t]).join('／')}</td>
              <td>{d.form === 'fixed' ? '指定' : d.form === 'pool' ? '池' : '自選'}</td>
              {/* 未開放的鑲材標明原因，免得玩家白刷（§ 51.4.3.2、§ 51.4.4） */}
              <td>{d.blocked ? BLOCKED_LABELS[d.blockedReason ?? 'monster'] : '掉落／合成'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 合成鏈與掉落分帶（`51-auto-talent.md` § 51.5.2、§ 51.6） */
export function TalentFusionTable() {
  return (
    <div>
      <h3>合成與掉落</h3>
      <p>
        天賦格：低階 ×2 → 高階 ×1，<strong>必定成功</strong>。
        鑲材：<strong>同階級、同種類、同適用類型</strong> ×2 → 隨機同類 T+1，失敗只退回其中 1 份。
      </p>
      <table className="wiki-table">
        <thead><tr><th>產出</th><th>鑲材合成成功率</th><th>一般怪掉率</th><th>Boss 掉率</th></tr></thead>
        <tbody>
          {([1, 2, 3, 4, 5, 6, 7] as TalentTier[]).map(tier => (
            <tr key={tier}>
              <td>T{tier}</td>
              <td>{tier === 1 ? '—' : `${AFFIX_FUSE_SUCCESS_RATE[tier as Exclude<TalentTier, 1>]}%`}</td>
              <td>{AFFIX_DROP_RATE[tier] === 0 ? '不掉落' : `${AFFIX_DROP_RATE[tier]}%`}</td>
              <td>{AFFIX_DROP_RATE[tier] === 0 ? '不掉落' : `${AFFIX_DROP_RATE[tier] * 2}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>掉落階級的區域分帶</h4>
      <table className="wiki-table">
        <thead><tr><th>區域最高等級</th><th>可掉鑲材</th><th>可掉天賦格（Boss）</th></tr></thead>
        <tbody>
          {/*
            兩張分帶表的列數不一樣（鑲材 6 段、天賦格 3 段），
            **不可以用索引配對** —— 要用同一個區域等級各自查。
          */}
          {AFFIX_TIER_BAND.map(b => {
            const slotBand = slotTierBandFor(b.maxAreaLevel);
            const range = (min: number, max: number) => (min === max ? `T${min}` : `T${min}～T${max}`);
            return (
              <tr key={b.maxAreaLevel}>
                <td>{b.maxAreaLevel === Infinity ? '61+' : `～${b.maxAreaLevel}`}</td>
                <td>{range(b.min, b.max)}</td>
                <td>{range(slotBand.min, slotBand.max)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
