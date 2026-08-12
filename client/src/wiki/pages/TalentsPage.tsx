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
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import {
  AFFIX_DROP_RATE,
  AFFIX_FUSE_SUCCESS_RATE,
  AFFIX_TIER_BAND,
  SLOT_TIER_BAND,
  SLOT_DROP_RATE_BOSS,
  SLOT_GRANT_LEVEL_INTERVAL,
  STARTING_SLOT_COUNT,
  TALENT_POOL_TIER_CAP,
  TALENT_TYPE_LABELS,
  conditionSlotCount,
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
  hp_below: '自身 HP 百分比',
  hp_above: '自身 HP 百分比',
  weapon_type_is: '手持武器的類型。換武器時不必重寫整份配置',
  area_dwell_gte: '在本區停留的分鐘數。怪物隨停留時間增加，這是「該撤了」的判斷依據',
  weight_over: '負重百分比。超重無法攻擊或施法',
  self_shielded: '身上有無敵效果，或護盾還有剩餘吸收量',
  current_area_is: '目前所在的區域或地區',
  target_distance: '與當前目標的距離（碼）。遠程職業拉開距離的依據',
  target_attack_type: '近戰／遠程物理／遠程魔法',
  target_race: '一般／不死／惡魔／龍',
  target_element: '火／冰／風／地／光／暗／無',
  target_size: '小怪／大怪。武器對兩者的基礎傷害不同',
  target_is_boss: '當前目標是不是 Boss',
  target_defense: '當前目標的防禦力',
  target_level_diff: '目標等級減去自身等級。正數＝目標比較高',
  target_range_gt: '當前目標的攻擊射程（碼）',
  hp_dropped_recently: '指定秒數內 HP 掉了幾個百分點。用來偵測爆發傷害',
  target_has_debuff: '當前目標身上有指定的 debuff（依 tag 比對）',
  target_lacks_debuff: '當前目標身上沒有指定的 debuff。避免 DoT 與控場技重複覆蓋',
  target_cc_immune: '當前目標處於控場免疫窗內。這時放控場技是純浪費 MP',
  target_shielded: '當前目標有無敵效果或還有護盾量',
};

const COMBAT_ACTION_DESC: Record<string, string> = {
  skill: '對當前目標施放攻擊技能。取代該次普通攻擊，不是額外動作',
  normal_attack: '物理攻擊當前目標',
  wait: '這次攻擊機會跳過，角色原地等待',
  skill_class_only: '只放該職業的職業魔法，不含基礎魔法',
  switch_target_lowest_hp: '改打場上血量百分比最低的一隻。補刀用',
  switch_target_highest_hp: '改打血量百分比最高的一隻',
  switch_target_farthest: '改打距離最遠的一隻',
  switch_target_by_kind: '改打指定種族或元素的一隻，同類取最近的',
  switch_target_by_debuff: '改打帶著（或沒有）指定 debuff 的一隻',
  lock_target: '釘住當前目標，牠死掉或離場前不再改挑最近的',
  keep_distance: '退到指定距離外。未指定時退到武器射程邊緣',
  close_in: '貼近目標到指定距離',
  disengage: '遠離所有怪物',
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
  monsters_near_self_gte: '以角色為圓心、指定碼數內的怪物數，用來判斷是不是被圍住了',
  weapon_type_is: '手持武器的類型',
  area_dwell_gte: '在本區停留的分鐘數',
  weight_over: '負重百分比。超重無法攻擊或施法',
  self_shielded: '身上有無敵效果，或護盾還有剩餘吸收量',
  current_area_is: '目前所在的區域或地區',
  item_count_below: '指定道具的持有量。藥水快見底時可改用低階的',
  buff_remaining_below: '指定 buff 的剩餘秒數。用來提前續，而不是等它掉光',
  potion_cooldown_ready: '指定藥水的冷卻已經走完',
  hp_dropped_recently: '指定秒數內 HP 掉了幾個百分點。用來偵測爆發傷害',
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
  in_town: '角色現在站在城鎮還是野外',
  bag_free_slots_lte: '背包剩餘格數。取東西前該看的是剩餘，不是已用',
  has_hunt_location: '有沒有上次掛機點的紀錄。沒有就回不去',
  warehouse_gold_gte: '共用倉庫的金幣餘額',
  warehouse_item_gte: '倉庫裡指定道具的存量',
};

const VILLAGE_ACTION_DESC: Record<string, string> = {
  return_town: '消耗回城卷軸。只有在野外才成立，回城前會記下掛機點',
  use_inn: '恢復 HP／MP 並解除異常狀態。HP／MP 全滿又沒有異常狀態時不會觸發',
  sell_materials_threshold_only: '只有顏色門檻，保護開關固定開啟、不吃白名單',
  sell_equipment_threshold_only: '只有顏色門檻，不吃保留條件。新手裝與裝備中的照樣不賣',
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
        <h3 style={SECTION_TITLE}>戰鬥天賦</h3>
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
        <h3 style={SECTION_TITLE}>常駐天賦</h3>
        <LabelTable head="條件" rows={toRows(PERSISTENT_CONDITION_LABELS, PERSISTENT_CONDITION_DESC)} />
        <LabelTable head="動作" rows={toRows(PERSISTENT_ACTION_LABELS, PERSISTENT_ACTION_DESC)} />
        <p style={noteStyle}>
          面板下方另有獨立的「緊急撤退」設定（HP 低於門檻就回城），
          只在附近有敵人時生效，不參與規則列表的排序。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>補給天賦</h3>
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
              {/* 怪物側機制沒開的鑲材不存在於世界上，標明免得玩家白刷（§ 51.4.4） */}
              <td>{d.blocked ? '尚未開放（等怪物機制）' : '掉落／合成'}</td>
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
          {AFFIX_TIER_BAND.map((b, i) => {
            const slotBand = SLOT_TIER_BAND[i];
            return (
              <tr key={b.maxAreaLevel}>
                <td>{b.maxAreaLevel === Infinity ? '61+' : `～${b.maxAreaLevel}`}</td>
                <td>{b.min === b.max ? `T${b.min}` : `T${b.min}～T${b.max}`}</td>
                <td>
                  {!slotBand ? '—'
                    : slotBand.min === slotBand.max ? `T${slotBand.min}`
                    : `T${slotBand.min}～T${slotBand.max}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
