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
} from '../talentRuleDescriptions';
import {
  VILLAGE_CONDITION_LABELS,
  VILLAGE_ACTION_LABELS,
} from '../../models/villageScript';
import { selectableRules } from '../../db/seed/talentSeeds';
import {
  FUSE_INPUT_COUNT,
  SLOT_DROP_RATE_BOSS,
  SLOT_TIER_BAND,
  SLOT_GRANT_LEVEL_INTERVAL,
  STARTING_SLOT_COUNT,
  conditionSlotCount,
  type TalentType,
  type TalentSlotTier,
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
  const obtainable = new Set(selectableRules(type, kind).map(d => d.ruleId));
  return Object.entries(labels)
    .filter(([key]) => obtainable.has(key))
    .map(([key, label]) => [label, desc[key] ?? '']);
}

export function TalentsPage() {
  return (
    <div>
      <h2 className="wiki-page-title">自動天賦</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>天賦格</h3>
        <p style={noteStyle}>
          一個<strong>天賦格</strong>就是一條規則：幾個條件槽 ＋ 1 個動作槽。
          <strong>條件與動作全部內建</strong>，創角起就全部可選，不必去刷。
          要煩惱的只有一件事 —— 你有幾個天賦格、階級多高。
        </p>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>天賦格</th><th>條件槽</th><th>動作槽</th></tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4] as TalentSlotTier[]).map(tier => (
                <tr key={tier}>
                  <td>T{tier}</td>
                  <td>{conditionSlotCount(tier)}</td>
                  <td>1</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={noteStyle}>
          天賦格<strong>不綁類型</strong>：同一個格子安裝到戰鬥、常駐或補給都可以。
          要換類型就拆下再到目標分頁安裝，設定會原樣保留，裝回同類型即復原。
        </p>

        <h4 style={subTitleStyle}>取得</h4>
        <ul style={noteStyle}>
          <li>創角給 {STARTING_SLOT_COUNT} 個 T1 天賦格，全部已經裝好可以直接打</li>
          <li>每 {SLOT_GRANT_LEVEL_INTERVAL} 級由信箱發 1 個 T1 天賦格，要自己領、自己安裝</li>
          <li>高階天賦格只有 Boss 會掉（{SLOT_DROP_RATE_BOSS}%），或用低階 ×{FUSE_INPUT_COUNT} 合成</li>
          <li>條件與動作<strong>不掉落、不合成</strong> —— 一律內建</li>
        </ul>

        <h4 style={subTitleStyle}>要多幾條規則，還是少幾條複雜的</h4>
        <p style={noteStyle}>
          合成把低階 ×{FUSE_INPUT_COUNT} 換成高階 ×1：規則數量少一條，換到那一條能多掛一個條件。
          一個 T4 格要吃 8 個 T1 格 —— 這是整個系統唯一要衡量的取捨。
        </p>
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
          符合任一條就命中。可用條件：詞綴 Tier 高於 N、帶有指定詞綴、本角色穿得起的、
          指定裝備類型、白名單。新手裝與穿在身上的裝備一律不賣也不存。
          「本角色穿得起的」要職業與素質需求都通過，素質看你自己的配點，不含裝備與 buff 加成。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>天賦配置</h3>
        <p style={noteStyle}>
          一份天賦配置 ＝ 戰鬥＋常駐＋補給＋緊急撤退<strong>整包</strong>設定。
          切換情境（清怪／打王／練功）時一次到位，不必分三處各切一遍，切了立刻生效。
        </p>
        <p style={noteStyle}>
          <strong>天賦格是換裝，條件與動作是複製。</strong>
          天賦格是實體，同一個只能在一份配置裡；所以切到另一份配置時，
          別份配置正在用的天賦格會出現在背包「天賦」分頁 ——
          裝過來就等於從那一份搬過來，那一份會少一格。
          條件與動作不是實體，任何格子都能重複選同一個。
        </p>
        <ul style={noteStyle}>
          <li>改動直接存進使用中的配置，沒有「儲存／放棄」兩段式</li>
          <li>「預設」配置不可刪除，所以清單永遠至少有一份</li>
          <li>搬過來的槽位如果不適用新類型（例如常駐格搬到補給），該槽位清空</li>
          <li>合成<strong>只吃完全沒安裝的</strong>天賦格，不會去拆別份配置</li>
          <li>配置存在角色身上，不跨角色共用（規則裡的技能綁職業）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>合成與掉落</h3>
        <TalentFusionTable />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>範例</h3>
        <h4 style={subTitleStyle}>戰鬥天賦：怪聚成一團才放範圍技</h4>
        <pre style={codeStyle}>{`#1 如果 本招命中數 ≥ 3 且 MP 高於 40%  → 施放火球
#2 如果 自身周圍怪物數 ≥ 4（半徑 3 格） → 施放天雷
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
#5 永遠                    → 販售裝備（商店中階以下，保留本角色穿得起的）
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

/** 天賦格合成鏈與掉落分帶（`51-auto-talent.md` § 51.5.2、§ 51.6） */
export function TalentFusionTable() {
  const range = (min: number, max: number) => (min === max ? `T${min}` : `T${min}～T${max}`);
  return (
    <div>
      <h3>合成與掉落</h3>
      <p>
        天賦格：低階 ×{FUSE_INPUT_COUNT} → 高階 ×1，<strong>必定成功</strong>，
        不需要 NPC、不限地點、不收金幣。只吃<strong>完全沒安裝</strong>的天賦格。
        <strong>這是系統唯一的合成</strong> —— 條件與動作內建，沒有升級、兌換或降階。
      </p>
      <table className="wiki-table">
        <thead><tr><th>合成</th><th>換算成 T1 格</th></tr></thead>
        <tbody>
          {([1, 2, 3] as TalentSlotTier[]).map(tier => (
            <tr key={tier}>
              <td>T{tier} ×{FUSE_INPUT_COUNT} → T{tier + 1} ×1</td>
              <td>{2 ** tier}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Boss 掉落的天賦格</h4>
      <p>
        掉率固定 {SLOT_DROP_RATE_BOSS}%，<strong>只有 Boss 會掉</strong>。
        T1 格不掉落，只從角色等級取得。
      </p>
      <table className="wiki-table">
        <thead><tr><th>區域最高等級</th><th>可掉天賦格</th></tr></thead>
        <tbody>
          {SLOT_TIER_BAND.map(b => (
            <tr key={b.maxAreaLevel}>
              <td>{b.maxAreaLevel === Infinity ? '61+' : `～${b.maxAreaLevel}`}</td>
              <td>{range(b.min, b.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
