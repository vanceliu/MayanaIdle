import '../components/WikiTable.css';
import {
  COMBAT_CONDITION_LABELS,
  COMBAT_CONDITION_HINTS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
  SCRIPT_DEBUFF_LABELS,
  DEFAULT_NEAR_SELF_RADIUS,
} from '../../models/scriptEngine';
import {
  VILLAGE_CONDITION_LABELS,
  VILLAGE_ACTION_LABELS,
} from '../../models/villageScript';

/**
 * 自動腳本說明（`03-combat.md` § 3.12～3.14、`49-village-script.md`）。
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

const COMBAT_CONDITION_DESC: Record<string, string> = {
  always: '無條件觸發',
  monster_count_gte: COMBAT_CONDITION_HINTS.monster_count_gte!,
  monsters_near_self_gte: `${COMBAT_CONDITION_HINTS.monsters_near_self_gte!}（未指定時 ${DEFAULT_NEAR_SELF_RADIUS} 碼）`,
  aoe_hit_count_gte: COMBAT_CONDITION_HINTS.aoe_hit_count_gte!,
  monster_hp_below: '當前目標的 HP 百分比。未選定目標時看距離最近的一隻',
  monster_hp_above: '當前目標的 HP 百分比。未選定目標時看距離最近的一隻',
  mp_above: '角色 MP 百分比',
  mp_below: '角色 MP 百分比',
  skill_ready: '指定攻擊技能冷卻完成、MP 足夠、武器符合需求',
};

const COMBAT_ACTION_DESC: Record<string, string> = {
  skill: '對當前目標施放攻擊技能。取代該次普通攻擊，不是額外動作',
  normal_attack: '物理攻擊當前目標',
  wait: '這次攻擊機會跳過，角色原地等待',
};

const PERSISTENT_CONDITION_DESC: Record<string, string> = {
  always: '無條件觸發',
  hp_below: '自身 HP 百分比',
  hp_above: '自身 HP 百分比',
  mp_below: '自身 MP 百分比',
  mp_above: '自身 MP 百分比',
  buff_not_active: '指定 buff 效果不存在或已過期',
  speed_not_active: '沒有任何加速效果（藥水與加速術互斥，共用同一格）',
  skill_ready: '指定技能冷卻完成且 MP 足夠',
  debuff_active: `身上有指定狀態：${Object.values(SCRIPT_DEBUFF_LABELS).join('／')}。暈眩不列入，暈眩中無法使用任何道具`,
};

const PERSISTENT_ACTION_DESC: Record<string, string> = {
  potion: '紅／橙／白，受各自的藥水冷卻限制',
  speed_potion: '綠色／強化綠色藥水',
  buff_skill: '施放輔助型技能（魔法盔甲、祝福武器等）',
  heal_skill: '施放回復型技能。HP 全滿時不會觸發',
  cure_item: '解毒藥水／止血繃帶／淨化藥水。沒有對應狀態時不會使用',
};

const VILLAGE_CONDITION_DESC: Record<string, string> = {
  always: '無條件觸發',
  bag_slots_used_gte: '背包已用格數（含裝備佔格）',
  item_count_below: '指定道具的持有量',
  gold_below: '身上金幣（實際金額）',
  gold_above: '身上金幣（實際金額）',
};

const VILLAGE_ACTION_DESC: Record<string, string> = {
  return_town: '消耗回城卷軸。只有在野外才成立，回城前會記下掛機點',
  sell_materials: '依顏色等級批量販售，可選擇保留進得了配方的素材',
  sell_equipment: '依顏色等級批量販售，可設保留條件',
  buy_item: '補到目標數量。買不起就只買買得起的量',
  deposit_materials: '依顏色等級存進共用或個人倉庫',
  deposit_equipment: '把命中篩選條件的裝備存進倉庫。沒設條件就不存',
  withdraw_item: '從倉庫補到目標數量，受倉庫存量與背包格數限制',
  deposit_gold: '身上留下指定金額，其餘存進共用倉庫',
  withdraw_gold: '從共用倉庫領到目標金額',
  return_to_hunt: '回到上次離開的座標。需要通行卷軸的區域一樣要有卷軸',
};

function toRows(labels: Record<string, string>, desc: Record<string, string>): [string, string][] {
  return Object.entries(labels).map(([key, label]) => [label, desc[key] ?? '']);
}

export function ScriptsPage() {
  return (
    <div>
      <h2 className="wiki-page-title">自動腳本</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>三套腳本</h3>
        <p style={noteStyle}>
          每套腳本都是<strong>有序規則列表</strong>：由上往下判定，
          第一個「條件全部成立、而且動作真的做得出來」的規則被執行，其餘不看。
          一條規則可以掛多個條件，全部成立才算（AND）；沒有條件等同「永遠」。
        </p>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>腳本</th>
                <th>判定時機</th>
                <th>負責什麼</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>戰鬥腳本</td>
                <td>每次攻擊機會（1200ms，受加速影響）</td>
                <td>攻擊技能、普通攻擊</td>
              </tr>
              <tr>
                <td>常駐腳本</td>
                <td>每 300ms，任何狀態</td>
                <td>喝藥、buff、治癒、狀態解除</td>
              </tr>
              <tr>
                <td>村莊腳本</td>
                <td>每 1000ms，任何地點</td>
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
        <h3 style={SECTION_TITLE}>戰鬥腳本</h3>
        <LabelTable head="條件" rows={toRows(COMBAT_CONDITION_LABELS, COMBAT_CONDITION_DESC)} />
        <LabelTable head="動作" rows={toRows(COMBAT_ACTION_LABELS, COMBAT_ACTION_DESC)} />
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
        <h3 style={SECTION_TITLE}>常駐腳本</h3>
        <LabelTable head="條件" rows={toRows(PERSISTENT_CONDITION_LABELS, PERSISTENT_CONDITION_DESC)} />
        <LabelTable head="動作" rows={toRows(PERSISTENT_ACTION_LABELS, PERSISTENT_ACTION_DESC)} />
        <p style={noteStyle}>
          面板下方另有獨立的「緊急撤退」設定（HP 低於門檻就回城），
          只在附近有敵人時生效，不參與規則列表的排序。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>村莊腳本</h3>
        <LabelTable head="條件" rows={toRows(VILLAGE_CONDITION_LABELS, VILLAGE_CONDITION_DESC)} />
        <LabelTable head="動作" rows={toRows(VILLAGE_ACTION_LABELS, VILLAGE_ACTION_DESC)} />
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
        <h3 style={SECTION_TITLE}>腳本分頁（Template）</h3>
        <p style={noteStyle}>
          一個分頁 ＝ 戰鬥＋常駐＋村莊＋緊急撤退<strong>整包</strong>設定。
          切換情境（清怪／打王／練功）時一次到位，不必分三處各切一遍，切了立刻生效。
        </p>
        <ul style={noteStyle}>
          <li>改動直接存進使用中的分頁，沒有「儲存／放棄」兩段式。想保留舊版就先複製一份</li>
          <li>「預設」分頁不可刪除，所以清單永遠至少有一個</li>
          <li>新分頁的內容是預設腳本，不是空白 —— 空的戰鬥腳本代表角色不出手</li>
          <li>分頁存在角色身上，不跨角色共用（規則裡的技能綁職業）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>範例</h3>
        <h4 style={subTitleStyle}>戰鬥腳本：怪聚成一團才放範圍技</h4>
        <pre style={codeStyle}>{`#1 如果 本招命中數 ≥ 3 且 MP 高於 40%  → 施放火球
#2 如果 自身周圍怪物數 ≥ 4（半徑 3 碼） → 施放天雷
#3 如果 目標 HP 低於 30%                → 施放風刃
#4 永遠                                 → 普通攻擊`}</pre>

        <h4 style={subTitleStyle}>常駐腳本：補血與維持 buff</h4>
        <pre style={codeStyle}>{`#1 如果 HP 低於 30%                        → 使用紅色藥水
#2 如果 HP 低於 50% 且 技能就緒（治癒）    → 施放治癒
#3 如果 Buff 未激活（魔法盔甲）            → 施放魔法盔甲
#4 如果 狀態異常（中毒）                   → 使用解毒藥水`}</pre>

        <h4 style={subTitleStyle}>村莊腳本：背包滿了自己回城整理</h4>
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
