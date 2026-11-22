import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';
import {
  CLASS_BASE_ATTRIBUTES, CLASS_NAMES_ZH, CLASS_TOTAL_POINTS, CREATION_ATTRIBUTE_CAP,
  getAvailablePoints, type ClassName,
} from '../../models/character';
import { ATTRIBUTE_KEYS } from '../../models/attributes';
import { STAR_CHART_UNLOCK_LEVEL } from '../../models/starChart';
import { ZONES, getRegionsByZone } from '../../models/mapData';
import { BLOCK_RATE_CAP, COOLDOWN_REDUCTION_CAP, DAMAGE_REDUCTION_CAP, DODGE_RATE_CAP } from '../../systems/combat';
import { BOSS_SPAWN_MIN_MINUTES } from '../../stores/mapMonsterStore';
import { BOSS_SPAWN_BASE_CHANCE } from '../../systems/globalRates';
import { BAG_BASE_SLOTS, INN_PRICES, POTION_CONFIG } from '../../stores/gameStore';
import { MAX_ACTIVE_ADVENTURER_QUESTS } from '../../models/adventurerQuest';
import { COLLECT_MATERIAL_TARGET, ERRAND_KILL_TARGET } from '../../models/quest';
import { ABILITY_CHANCE, ABILITY_MIN_TIER } from '../../models/ability';
import { AFFIX_SOCKETS } from '../../models/affix';
import { QUICK_SLOT_COUNT } from '../../models/quickSlot';
import { SLOT_GRANT_LEVEL_INTERVAL, STARTING_SLOT_COUNT, TALENT_INSTALL_MAX } from '../../models/talent';
import { ARENA_TIERS } from '../../models/arena';
import { STARTER_MAX_LEVEL, getStarterEnhanceCost } from '../../systems/starterNpc';
import { DEFAULT_EMERGENCY_RETREAT, DEFAULT_PERSISTENT_SCRIPT } from '../../models/scriptEngine';
import { RESTED_EXP_CAP_MS, RESTED_EXP_MULTIPLIER } from '../../systems/restedExp';
import { OFFLINE_GOLD_ENABLED, OFFLINE_GOLD_MIN_OFFLINE_MS } from '../../systems/offlineGold';
import { MELEE_WEAPON_RANGE, WEAPON_RANGE } from '../../models/equipment';
import { AUCTION_ENABLED, AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS } from '../../models/auction';

/** 新手開始（`43-wiki-system.md` § 4.0）：依遊玩順序介紹，細節連到各 Wiki 頁；數值取 model 常數 */

const SECTION_TITLE = { color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 } as const;
const CARD = { background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 } as const;
const CARD_TEXT = { color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 } as const;
const WRAP_TEXT = { whiteSpace: 'normal', textAlign: 'left' } as const;
const TOC_BUTTON = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--accent-gold)', fontSize: 'var(--fs-sm)', lineHeight: 2, textAlign: 'left',
} as const;

export const RECOMMENDED_CLASS: ClassName = 'elf';

/** 職業定位（`04-character.md` § 4.4～§ 4.8）與主要屬性（`20-attributes.md` § 20.8） */
const CLASS_GUIDE: Record<ClassName, { role: string; main: string }> = {
  knight: { role: '近戰、防禦型，可用盾，HP 高', main: '力量、體質' },
  elf: { role: '遠程輸出，用弓從遠處攻擊', main: '敏捷' },
  elementalist: { role: '魔法輸出，靠 MP，爆發強但較脆弱', main: '精神、智力' },
  priest: { role: '治療與輔助', main: '智力' },
  thief: { role: '近戰敏捷型，基礎迴避較高', main: '敏捷、力量' },
};
const CLASS_ORDER: ClassName[] = ['elf', 'knight', 'elementalist', 'priest', 'thief'];

const BASIC_POTIONS = ['red', 'orange', 'white'] as const;
const NEWBIE_ZONE_ID = 'newbie-neutral';
const potionHpThreshold = DEFAULT_PERSISTENT_SCRIPT[0]?.conditions.find(c => c.type === 'hp_below')?.value;

const CHAPTERS = [
  { id: 'start-class', title: '1. 建立角色、選擇職業' },
  { id: 'start-town', title: '2. 薄暮村與新手指導員' },
  { id: 'start-field', title: '3. 第一次出城' },
  { id: 'start-mechanics', title: '4. 遊戲機制' },
  { id: 'start-quests', title: '5. 任務' },
  { id: 'start-gear', title: '6. 裝備成長' },
  { id: 'start-crafting', title: '7. 鐵匠鋪製作' },
  { id: 'start-maps', title: '8. 換地圖' },
  { id: 'start-skills', title: '9. 技能與自動天賦' },
  { id: 'start-next', title: '10. 之後可以玩什麼' },
] as const;
type ChapterId = typeof CHAPTERS[number]['id'];

function Chapter({ id, children }: { id: ChapterId; children: ReactNode }) {
  const title = CHAPTERS.find(c => c.id === id)!.title;
  return (
    <section id={id} style={{ marginBottom: 32 }}>
      <h3 style={SECTION_TITLE}>{title}</h3>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div style={CARD}><div style={CARD_TEXT}>{children}</div></div>;
}

function WikiLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="wiki-link" to={to}>{children}</Link>;
}

export function StartPage() {
  const newbieRegions = getRegionsByZone(NEWBIE_ZONE_ID).filter(r => r.type !== 'town');
  const openArena = ARENA_TIERS.filter(t => t.open);

  return (
    <div>
      <h2 className="wiki-page-title">新手開始</h2>
      <Card>
        照新手實際遊玩的順序介紹：每章講這一步要做什麼、為什麼，細節點連結到對應的 Wiki 頁。
      </Card>

      <nav aria-label="章節目錄" style={{ ...CARD, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {CHAPTERS.map(c => (
          <button
            key={c.id}
            type="button"
            style={TOC_BUTTON}
            onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {c.title}
          </button>
        ))}
      </nav>

      <Chapter id="start-class">
        <Card>
          建角時選職業、輸入名稱、分配屬性點、設定外觀。屬性總和固定 {CLASS_TOTAL_POINTS} 點，
          單項（初始＋加點）不得超過 {CREATION_ATTRIBUTE_CAP}，點數要全部分完才能建角。<br />
          <strong>新手推薦：{CLASS_NAMES_ZH[RECOMMENDED_CLASS]}</strong>。
          弓的射程 {WEAPON_RANGE.bow} 格（近戰武器 {MELEE_WEAPON_RANGE} 格），能在怪物靠近前先出手。
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>職業</th><th>定位</th><th>主屬性</th>
                {ATTRIBUTE_KEYS.map(k => <th key={k}>{k}</th>)}
                <th>可分配</th>
              </tr>
            </thead>
            <tbody>
              {CLASS_ORDER.map(cls => (
                <tr key={cls}>
                  <td>{CLASS_NAMES_ZH[cls]}{cls === RECOMMENDED_CLASS ? '（推薦）' : ''}</td>
                  <td style={WRAP_TEXT}>{CLASS_GUIDE[cls].role}</td>
                  <td>{CLASS_GUIDE[cls].main}</td>
                  {ATTRIBUTE_KEYS.map(k => <td key={k} className="cell-number">{CLASS_BASE_ATTRIBUTES[cls][k]}</td>)}
                  <td className="cell-number">{getAvailablePoints(cls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          升級時 HP、MP 回滿；Lv.{STAR_CHART_UNLOCK_LEVEL} 起每升一級得 1 點星盤點數，屬性沒有上限。
          見 <WikiLink to="/wiki/attributes">屬性公式</WikiLink>、<WikiLink to="/wiki/exp-table">經驗表</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-town">
        <Card>
          建角後直接穿上整套新手裝（T1），出生在薄暮村，新手指導員的視窗會自動打開。<br />
          <strong>新手指導員</strong>（只在薄暮村）：Lv.{STARTER_MAX_LEVEL} 以下可補領缺少的新手裝；
          新手裝強化每次 {getStarterEnhanceCost()}G、必定成功，上限為安定值。新手裝不能販售、不能存倉庫。<br />
          <strong>城鎮設施</strong>：雜貨店（藥水、回城卷軸）、武器店、防具店、鐵匠鋪（製作）、印記師（詞綴、品質）、
          旅館（完全休息 {INN_PRICES.full}G）、倉庫、魔法學院（學技能）、冒險者工會（任務）、統計中心（排行榜）、試驗場、競技場。
          城鎮不生怪，點 NPC 就能開面板。
        </Card>
      </Chapter>

      <Chapter id="start-field">
        <Card>
          從畫面上方的地圖選擇器挑地圖。地圖沒有等級限制，但怪物等級落在該地圖的等級範圍內，先從曙光草原開始。
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>新手區地圖（依序前進）</th><th>等級</th></tr></thead>
            <tbody>
              {newbieRegions.map(r => (
                <tr key={r.id}>
                  <td><WikiLink to={`/wiki/maps/${r.id}`}>{r.name}</WikiLink></td>
                  <td className="cell-number">{r.levelMin}～{r.levelMax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          <strong>自動戰鬥</strong>：角色自己走動、找怪、攻擊，戰鬥和探索在同一張地圖。點怪物可換目標；
          快捷列 {QUICK_SLOT_COUNT} 格（鍵盤 1～9、0）可放技能與藥水手動使用。<br />
          <strong>預設保護</strong>：HP 低於 {potionHpThreshold}% 喝紅色藥水；
          HP 低於 {DEFAULT_EMERGENCY_RETREAT.hpThreshold}% 用回城卷軸緊急撤退；附近沒怪且 HP、MP 偏低時會停下休息。<br />
          <strong>回復</strong>：HP、MP 隨時間自然回復，戰鬥中減半；回城可住旅館。藥水共用冷卻，沒有直接補 MP 的藥水。<br />
          <strong>死亡</strong>：傳回最近的城鎮，HP 回到一半，不扣金幣、經驗、物品，已拿到的經驗與掉落不會收回。<br />
          <strong>背包與負重</strong>：背包 {BAG_BASE_SLOTS} 格，只有腰帶能擴充；背包滿時新掉落會直接消失。
          負重上限＝（力量＋體質）× 100＋腰帶，超重時無法普攻與施法，也不會自然回復。
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>藥水</th><th>回復 HP</th></tr></thead>
            <tbody>
              {BASIC_POTIONS.map(p => (
                <tr key={p}>
                  <td>{POTION_CONFIG[p].name}</td>
                  <td className="cell-number">{POTION_CONFIG[p].healMin}～{POTION_CONFIG[p].healMax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Chapter>

      <Chapter id="start-mechanics">
        <Card>
          <strong>上線才會進行</strong>：遊戲在 server 上進行，關掉瀏覽器或斷線就會登出、戰鬥停止{OFFLINE_GOLD_ENABLED ? '' : '，沒有離線收益'}。<br />
          <strong>回鍋加倍</strong>：離線時間會存成回鍋加倍，回來後擊殺經驗 ×{RESTED_EXP_MULTIPLIER}，存量上限 {RESTED_EXP_CAP_MS / 3_600_000} 小時。<br />
          {OFFLINE_GOLD_ENABLED && (
            <>
              <strong>離線收益</strong>：<strong>只有金幣</strong>，離線期間不會獲得經驗與掉落物。離線滿 {OFFLINE_GOLD_MIN_OFFLINE_MS / 60_000} 分鐘後上線，會收到一封金幣信，到信箱領取；金額依最近一次登入期間所做的事情決定。<br />
            </>
          )}
          <strong>物理與魔法</strong>：普攻會判定命中與爆擊；魔法技能必定命中、不會被閃、不爆擊。<br />
          <strong>防禦</strong>：每 1 點少受 1% 傷害，上限 {DAMAGE_REDUCTION_CAP}%；角色起始防禦為負值，前幾點裝備防禦只是抵銷。
          魔法抗性只擋怪物的魔法攻擊。<br />
          <strong>迴避與格擋</strong>：迴避上限 {DODGE_RATE_CAP}%；格擋需要副手，觸發時傷害減半，上限 {BLOCK_RATE_CAP}%。<br />
          詳細公式見 <WikiLink to="/wiki/combat">戰鬥計算</WikiLink>。
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>屬性</th><th>作用</th></tr></thead>
            <tbody>
              <tr><td>力量 STR</td><td style={WRAP_TEXT}>近戰傷害、負重</td></tr>
              <tr><td>敏捷 AGI</td><td style={WRAP_TEXT}>遠程（弓）傷害、命中、迴避</td></tr>
              <tr><td>體質 VIT</td><td style={WRAP_TEXT}>最大 HP、回血、負重</td></tr>
              <tr><td>精神 SPI</td><td style={WRAP_TEXT}>最大 MP、回魔、魔法抗性</td></tr>
              <tr><td>智力 INT</td><td style={WRAP_TEXT}>技能傷害與治癒、冷卻縮減（上限 {COOLDOWN_REDUCTION_CAP}%）</td></tr>
            </tbody>
          </table>
        </div>
        <Card>
          <strong>元素</strong>：火、冰、風、地、光、暗、無七種；火克風、風克地、地克冰、冰克火，光暗互克。
          武器的元素來自「元素刻印」詞綴。
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>負面狀態</th><th>效果</th><th>解法</th></tr></thead>
            <tbody>
              <tr><td>中毒</td><td style={WRAP_TEXT}>每秒受傷</td><td style={WRAP_TEXT}>解毒藥水；防具免疫詞綴</td></tr>
              <tr><td>流血</td><td style={WRAP_TEXT}>每秒受傷</td><td style={WRAP_TEXT}>止血繃帶；防具免疫詞綴</td></tr>
              <tr><td>詛咒</td><td style={WRAP_TEXT}>防禦降低</td><td style={WRAP_TEXT}>淨化藥水；魔抗可抵抗</td></tr>
              <tr><td>虛弱</td><td style={WRAP_TEXT}>攻擊降低</td><td style={WRAP_TEXT}>淨化藥水；魔抗可抵抗</td></tr>
              <tr><td>沉默</td><td style={WRAP_TEXT}>不能用技能（普攻、道具照常）</td><td style={WRAP_TEXT}>淨化藥水；魔抗可抵抗</td></tr>
              <tr><td>減速</td><td style={WRAP_TEXT}>攻速降低</td><td style={WRAP_TEXT}>加速效果抵銷；魔抗可抵抗</td></tr>
              <tr><td>暈眩</td><td style={WRAP_TEXT}>無法行動，也不能喝藥水、用回城卷軸</td><td style={WRAP_TEXT}>「暈眩抵抗」詞綴縮短時間</td></tr>
            </tbody>
          </table>
        </div>
        <Card>
          <strong>強化怪</strong>：怪物可能帶 1～4 個強化詞綴，外框與名稱依數量為藍、黃、橙、紅，掉落、金幣、經驗較多。<br />
          <strong>詠唱</strong>：怪物有時改用讀條攻擊，傷害較高、打不斷；走出射程或擋住視線可以躲掉。<br />
          <strong>Pressure</strong>：在同一張地圖連續殺怪，Pressure 會上升，同時出現的怪物與掉落都變多；離開地圖、死亡、重新登入後歸零。<br />
          <strong>Boss</strong>：有 Boss 的地圖待滿 {BOSS_SPAWN_MIN_MINUTES} 分鐘後，每生成一隻怪有 {BOSS_SPAWN_BASE_CHANCE * 100}% 機率是 Boss，同時最多 1 隻，以紫色血條區分。
          見 <WikiLink to="/wiki/monsters">怪物</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-quests">
        <Card>
          任務都在城鎮的冒險者工會，分「冒險任務／職業任務／懸賞」三頁。<br />
          <strong>職業任務</strong>：Lv.10 擊殺 {ERRAND_KILL_TARGET} 隻得 1 級職業技能書；
          Lv.20 收集 {COLLECT_MATERIAL_TARGET} 個任務素材得 2 級職業技能書。技能書拿到魔法學院學會。<br />
          <strong>冒險任務</strong>：殲滅、收集、持續戰鬥、交付等類型，同時最多接 {MAX_ACTIVE_ADVENTURER_QUESTS} 個；
          完成得金幣、藥水、印記等獎勵與貢獻，貢獻累積提升等階，等階越高獎勵種類越多。<br />
          見 <WikiLink to="/wiki/quests">任務系統</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-gear">
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>階級</th><th>主要來源</th></tr></thead>
            <tbody>
              <tr><td>T1</td><td style={WRAP_TEXT}>新手裝（建角時穿上）</td></tr>
              <tr><td>T2、T3</td><td style={WRAP_TEXT}>商店購買、低等級地圖掉落</td></tr>
              <tr><td>T4、T5</td><td style={WRAP_TEXT}>鐵匠鋪製作、中等級地圖掉落</td></tr>
              <tr><td>T6</td><td style={WRAP_TEXT}>高等級地圖掉落（部分可製作）</td></tr>
              <tr><td>T7</td><td style={WRAP_TEXT}>只有 Boss 掉落</td></tr>
            </tbody>
          </table>
        </div>
        <Card>
          <strong>詞綴</strong>：每件 {AFFIX_SOCKETS} 個詞綴洞；商店與製作品固定滿洞，掉落品 1～{AFFIX_SOCKETS} 條。<br />
          <strong>品質</strong>：在印記師用工藝印記提升，放大詞綴數值與賣價。<br />
          <strong>強化</strong>：在背包對裝備使用強化卷軸。安定值以內必定成功，超過後有機率失敗，<strong>失敗時裝備消失</strong>。<br />
          <strong>隨機技能</strong>：T{ABILITY_MIN_TIER} 以上的武器、項鍊、戒指有 {ABILITY_CHANCE}% 機率帶一條（製作品必定帶）；
          同一種技能穿多件只有一件生效。<br />
          <strong>素質需求</strong>：防具有屬性需求，不足時仍可穿，但詞綴與隨機技能不生效；武器只看職業。<br />
          見 <WikiLink to="/wiki/weapons">武器</WikiLink>、<WikiLink to="/wiki/armor">防具</WikiLink>、<WikiLink to="/wiki/affixes">詞綴</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-crafting">
        <Card>
          鐵匠鋪可製作 T4～T6 裝備（T6 腰帶、上衣、斗篷、項鍊、戒指除外），消耗素材與金幣，必定成功；部分配方要先有低一階的裝備當材料。
          製作素材從試煉高地開始掉落。<br />
          製作品（名稱帶「(鍛)」）固定 {AFFIX_SOCKETS} 條詞綴、不能使用印記；製作武器、項鍊、戒指時可指定隨機技能。<br />
          有配方的裝備可以拆解，退回部分素材；拆解掉落品會留下技能結晶，可用來更換其他裝備的隨機技能。<br />
          見 <WikiLink to="/wiki/crafting">鐵匠鋪</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-maps">
        <Card>
          打不動或升級變慢時就往下一張地圖走。等級差會影響命中，經驗只看怪物等級。各區域的等級範圍：
        </Card>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>區域</th><th>等級</th></tr></thead>
            <tbody>
              {ZONES.map(z => (
                <tr key={z.id}>
                  <td>{z.name}</td>
                  <td className="cell-number">{z.levelMin}～{z.levelMax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          高等級地圖掉落較高階的裝備。百柱塔要通行卷軸才能進入。
          見 <WikiLink to="/wiki/maps">地圖</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-skills">
        <Card>
          <strong>基礎魔法</strong>：在魔法學院學，低等級花金幣、高等級交魔法書；各職業能學到的等級不同。<br />
          <strong>職業魔法</strong>：交職業技能書學會；1、2 級由職業任務取得，之後由怪物掉落。<br />
          魔法書、技能書與製作魔法書的素材放在背包、個人倉庫或帳號倉庫都能用，不必先取出。<br />
          <strong>自動天賦</strong>：決定自動戰鬥時做什麼。分戰鬥、常駐、補給三種，一個天賦格＝條件＋動作，由上往下取第一個成立的。
          建角送 {STARTING_SLOT_COUNT} 格，之後每 {SLOT_GRANT_LEVEL_INTERVAL} 級由信箱多發 1 格；兩格同階可合成高一階，
          同類型最多裝 {TALENT_INSTALL_MAX} 格。學會新技能後記得加進戰鬥天賦。<br />
          見 <WikiLink to="/wiki/skills">技能</WikiLink>、<WikiLink to="/wiki/talents">自動天賦</WikiLink>。
        </Card>
      </Chapter>

      <Chapter id="start-next">
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>內容</th><th>說明</th></tr></thead>
            <tbody>
              <tr>
                <td><WikiLink to="/wiki/arena">競技場</WikiLink></td>
                <td style={WRAP_TEXT}>連續清波拿票券換裝備箱，Lv.{openArena[0]?.level} 起開放</td>
              </tr>
              <tr><td>懸賞契約</td><td style={WRAP_TEXT}>冒險者工會簽約，讓指定怪物必帶強化詞綴</td></tr>
              <tr><td>試驗場</td><td style={WRAP_TEXT}>木樁測傷害，沒有產出</td></tr>
              <tr><td>印記</td><td style={WRAP_TEXT}>在印記師調整詞綴與品質</td></tr>
              <tr><td><WikiLink to="/wiki/maps">地城</WikiLink></td><td style={WRAP_TEXT}>象牙塔、朦朧洞窟、水下監獄、龍谷地間、遠古地監、百柱塔</td></tr>
              <tr><td>公會</td><td style={WRAP_TEXT}>只在開放世界</td></tr>
              {AUCTION_ENABLED && (
                <tr>
                  <td>拍賣場</td>
                  <td style={WRAP_TEXT}>
                    只在開放世界。上架裝備或道具，標價收金幣或指定道具，上架費 {AUCTION_LISTING_FEE.toLocaleString()} 金幣（不退），
                    每隻角色最多 {AUCTION_MAX_LISTINGS} 筆、不過期；成交後雙方的東西都寄到信箱
                  </td>
                </tr>
              )}
              <tr><td>排行榜</td><td style={WRAP_TEXT}>城鎮統計中心</td></tr>
            </tbody>
          </table>
        </div>
      </Chapter>
    </div>
  );
}
