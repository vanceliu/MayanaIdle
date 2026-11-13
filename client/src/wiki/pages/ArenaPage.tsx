import '../components/WikiTable.css';
import {
  ARENA_BOSS_WAVE_INTERVAL, ARENA_MATERIAL_COST, ARENA_MAX_WAVE, ARENA_SLOT_HOURS, ARENA_TIERS,
  arenaAffixCount, arenaBossOrder, arenaGoldCost, arenaWaveSize,
} from '../../models/arena';
import { ABILITY_CHANCE } from '../../models/ability';
import { ARENA_BOX_PRICE, ARENA_MIMIC_CHANCE, ARENA_SEALED_CHANCE, type ArenaBoxKind } from '../../systems/arenaBox';

/** 競技場（`55-arena.md`）。數值一律取 model 常數 */

const SECTION_TITLE = { color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 } as const;
const CARD = { background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 } as const;
const CARD_TEXT = { color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 } as const;

const PARTY_SIZES = [1, 2, 3, 4];
/** 強化詞綴數的分段：每段取起始波次 */
const AFFIX_BANDS = [1, 11, 21, 31, 41];
const BOX_LABELS: Record<ArenaBoxKind, string> = { weapon: '武器兌換箱', armor: '防具兌換箱', accessory: '飾品兌換箱' };
const SLOT_HOURS = Array.from({ length: 24 / ARENA_SLOT_HOURS }, (_, i) => `${String(i * ARENA_SLOT_HOURS).padStart(2, '0')}:00`);
const percent = (v: number) => `${Math.round(v * 100)}%`;
/** 名單類欄位：換行、靠左（同 `CreditsPage`） */
const WRAP_TEXT = { whiteSpace: 'normal', textAlign: 'left' } as const;

export function ArenaPage() {
  return (
    <div>
      <h2 className="wiki-page-title">競技場</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>概要</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            各城鎮的「競技場」NPC 進場。隊伍專屬場地（單人或組隊 1～4 人），連續清波，每打倒一輪王得 1 張該段位的票券，票券到競技場 NPC 兌換兌換箱。<br />
            一般波 3 隻一般怪；第 {ARENA_BOSS_WAVE_INTERVAL} 的倍數波為王波，只出 2 隻王。上一波清完立刻出下一波，最多 {ARENA_MAX_WAVE} 波。<br />
            擊殺照常給經驗；<strong>不掉任何物品</strong>（金幣、裝備、素材、印記、天賦格皆不掉），沒有 Pressure。<br />
            地形主題每場隨機。怪物強度依段位固定，不隨波次成長；強化詞綴數隨波次增加。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>段位與入場費</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            角色等級達到才可進場，組隊時每位隊員都要達標。入場費為名單內的 Boss 素材任意混合 {ARENA_MATERIAL_COST} 個＋金幣，組隊時由隊長付；非票券場不收費。
          </p>
        </div>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>段位</th><th>等級</th><th>一般怪</th><th>金幣</th></tr>
            </thead>
            <tbody>
              {ARENA_TIERS.map(t => (
                <tr key={t.tier}>
                  <td>T{t.tier}{t.open ? '' : '（未開放）'}</td>
                  <td className="cell-number">Lv.{t.level}</td>
                  <td>{t.normalLabel}</td>
                  <td className="cell-number">{arenaGoldCost(t.tier).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wiki-table-wrap" style={{ marginTop: 12 }}>
          <table className="wiki-table">
            <thead>
              <tr><th>段位</th><th>王（出場順序）</th><th>入場材料</th></tr>
            </thead>
            <tbody>
              {ARENA_TIERS.map(t => (
                <tr key={t.tier}>
                  <td>T{t.tier}</td>
                  <td style={WRAP_TEXT}>{arenaBossOrder(t).map(b => b.name).join(' → ')}</td>
                  <td style={WRAP_TEXT}>{t.materials.join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...CARD_TEXT, color: 'var(--text-dim)' }}>王依 Boss 等級由低到高輪替，輪完後固定出最強者。</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>組隊人數與強化詞綴</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>人數</th><th>一般波</th><th>王波</th></tr>
            </thead>
            <tbody>
              {PARTY_SIZES.map(n => (
                <tr key={n}>
                  <td className="cell-number">{n}</td>
                  <td className="cell-number">{arenaWaveSize(1, n)}</td>
                  <td className="cell-number">{arenaWaveSize(ARENA_BOSS_WAVE_INTERVAL, n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wiki-table-wrap" style={{ marginTop: 12 }}>
          <table className="wiki-table">
            <thead>
              <tr><th>波次</th><th>每隻怪的強化詞綴數</th></tr>
            </thead>
            <tbody>
              {AFFIX_BANDS.map((start, i) => (
                <tr key={start}>
                  <td>{i === AFFIX_BANDS.length - 1 ? `${start} 波起` : `${start}～${AFFIX_BANDS[i + 1] - 1} 波`}</td>
                  <td className="cell-number">{arenaAffixCount(start)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>票券場、離場與排行</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            票券場每 {ARENA_SLOT_HOURS} 小時重置（server 時間 {SLOT_HOURS.join('、')}），每個時段、每個段位各 1 場，進場即用掉。
            用掉之後仍可進場，但不收入場費、不給票券。<br />
            <strong>撤退</strong>：使用回城卷軸（手動或緊急撤退），已得票券全留。<br />
            <strong>死亡</strong>：回城鎮，收回本場已得票券的一半（無條件捨去）；不計入死亡統計。<br />
            <strong>打完第 {ARENA_MAX_WAVE} 波</strong>：發完票券後強制離場，票券全留。<br />
            斷線時保留該場、計時暫停，回來後當前波次重打。server 重啟時未結束的場次作廢，已得票券保留，該時段的票券場次數歸還。<br />
            排行榜在統計中心「競技場」分頁：段位 × 單人／組隊 × 職業，波次高者在前，同波次時間短者在前。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>票券與兌換箱</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            票券：綁角色，不可交易、存倉庫、販售；重量 0、不佔背包格，收在背包的票券抽屜。<br />
            兌換箱：綁角色，重量 1；在背包使用後開出 1 件該段位、該類的裝備（不綁定，不分職業均等抽）。
          </p>
        </div>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>兌換箱（X 為段位）</th><th>票券</th></tr>
            </thead>
            <tbody>
              {(Object.keys(BOX_LABELS) as ArenaBoxKind[]).map(kind => (
                <tr key={kind}><td>TX {BOX_LABELS[kind]}</td><td className="cell-number">{ARENA_BOX_PRICE[kind]} 張</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wiki-table-wrap" style={{ marginTop: 12 }}>
          <table className="wiki-table">
            <thead>
              <tr><th>項目</th><th>(擬) 擬態品（{percent(ARENA_MIMIC_CHANCE)}）</th><th>一般</th></tr>
            </thead>
            <tbody>
              <tr><td>詞綴條數</td><td>必定 4 條</td><td>依野外 Boss 掉落</td></tr>
              <tr><td>詞綴階級</td><td colSpan={2}>依野外 Boss 掉落的機率，可出 T7</td></tr>
              <tr><td>封印詞綴</td><td>必定帶</td><td>{percent(ARENA_SEALED_CHANCE)}</td></tr>
              <tr><td>隨機技能</td><td>武器、項鍊、戒指必定帶，數值最低</td><td>依 Boss 掉落 {ABILITY_CHANCE}%</td></tr>
              <tr><td>限制</td><td>不可使用印記、不可拆解；可販售</td><td>—</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
