/**
 * Wiki 星盤頁（`43-wiki-system.md`、`56-star-chart.md`）：規則、節點數值、技能等級、命星與配點模擬。
 * 數值一律讀 model 常數。
 */
import { Link } from 'react-router-dom';
import '../components/WikiTable.css';
import {
  KEYSTONE_CAP, STAR_CHART_UNLOCK_LEVEL, STAR_CLASS_ORDER, STAR_FLAG_LABEL, STAR_NODES, STAR_NODE_BY_ID, STAR_POINT_VALUE,
  starPoints, starRefundCostPerPoint, starStartNodeId,
} from '../../models/starChart';
import { CLASS_SKILL_LEVEL_SCALE, CLASS_SKILL_LEVEL_SCALE_BY_CLASS } from '../../models/skillStar';
import { CLASS_NAMES_ZH } from '../../models/character';
import { LEVEL_CAP } from '../../systems/levelUp';
import { COOLDOWN_REDUCTION_CAP } from '../../systems/combat';
import { StarChartPlanner } from '../../components/StarChartPlanner';
import { formatStarEffect } from '../../components/StarChartBoard';

const SECTION_TITLE = { color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 } as const;
const CARD = { background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 } as const;
const CARD_TEXT = { color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 } as const;
const NORMAL_CAP = 100;

const POINT_ROWS: [string, string][] = [
  ['屬性', `+${STAR_POINT_VALUE.attr}`],
  ['體質、精神', `起點、職業星座（含職業支線星座）、命星與騎士、盜賊區的體質節點為屬性；其餘每 1 點改為最大 HP／最大 MP +${STAR_POINT_VALUE.flatPerAttr}`],
  ['攻擊力／魔法攻擊', `+${STAR_POINT_VALUE.atkPct}%`],
  ['防禦力', `+${STAR_POINT_VALUE.defPct}%`],
  ['最大 HP／最大 MP %', `+${STAR_POINT_VALUE.hpPct}%`],
  ['命中', `+${STAR_POINT_VALUE.hit}%`],
  ['迴避值', `+${STAR_POINT_VALUE.evasion}（100 迴避值＝1% 迴避率）`],
  ['冷卻縮減', `+${STAR_POINT_VALUE.cdrPct}%（與詞綴、buff、智力合計上限 ${COOLDOWN_REDUCTION_CAP}%）`],
  ['職業技能強化', `冷卻 −${STAR_POINT_VALUE.skillCd}%`],
  ['技能等級', '+1（職業技能）'],
];

/** 命星位置：中央、職業區，或兩職業交界（`risk{交界}-keystone{n}`） */
function keystoneArea(id: string): string {
  if (id.startsWith('center')) return '中央';
  const junction = /^risk(\d+)-/.exec(id);
  if (junction) {
    const i = Number(junction[1]);
    return `${CLASS_NAMES_ZH[STAR_CLASS_ORDER[i]]}／${CLASS_NAMES_ZH[STAR_CLASS_ORDER[(i + 1) % STAR_CLASS_ORDER.length]]}交界`;
  }
  return CLASS_NAMES_ZH[id.split('-')[0] as keyof typeof CLASS_NAMES_ZH];
}

const scales = (s: readonly number[]) => s.map(v => `×${v}`).join('／');

/** 職業起點的屬性：「騎士 力量 +2、體質 +6」 */
const startText = STAR_CLASS_ORDER.map(c =>
  `${CLASS_NAMES_ZH[c]} ${STAR_NODE_BY_ID.get(starStartNodeId(c))!.effects.map(e => `${e.label} ${formatStarEffect(e)}`).join('、')}`).join('；');

export function StarChartPage() {
  const keystones = STAR_NODES.filter(n => n.kind === 'keystone');
  return (
    <div>
      <h2 className="wiki-page-title">星盤</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>概要</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            五職業共用一張星盤，從各自的職業起點出發，沿連線點亮節點；可以跨進其他職業的區域，代價是路上的點數。他職業的職業技能節點點了不生效。<br />
            Lv.{STAR_CHART_UNLOCK_LEVEL} 開放，起點自動點上；之後每升一級得 1 點，Lv.N 共 N − {STAR_CHART_UNLOCK_LEVEL - 1} 點
            （Lv.{NORMAL_CAP} 為 {starPoints(NORMAL_CAP)} 點，硬上限 Lv.{LEVEL_CAP} 為 {starPoints(LEVEL_CAP)} 點）。<br />
            點節點與取消節點都先是草稿，按「確認」才生效；退回已確認的節點要付洗點費：每點＝角色等級 × {starRefundCostPerPoint(1).toLocaleString()} 金幣。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>節點</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            星點：單一效果。星座：節點群中心，多項效果，每項為星點數值 × 2。命星：改變規則的效果，必帶代價；全盤最多同時點 {KEYSTONE_CAP} 顆；命星是終點，不能經命星走到其他節點。職業命星連到該職業每條技能線的末端。<br />
            節點顏色：力量紅、敏捷綠、智力藍、精神淺藍、體質粉紅，兩種屬性左右各半，其餘白色。<br />
            職業起點：{startText}。體質、精神只出現在職業起點、職業星座（含職業支線星座）、命星與騎士、盜賊區的體質節點，其他節點改為最大 HP／最大 MP 固定值，
            與裝備的固定 HP／MP 相加後才乘星盤的最大 HP%／MP%。
          </p>
        </div>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>星點效果</th><th>數值</th></tr></thead>
            <tbody>{POINT_ROWS.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>技能等級</h3>
        <div style={CARD}>
          <p style={CARD_TEXT}>
            職業技能學會時為等級 I，星盤「等級 +1」節點往上加，最高 III（技能名稱後顯示，例如盾擊(II)）。<br />
            職業技能的傷害、治癒、護盾與輔助效果：I／II／III 為 {scales(CLASS_SKILL_LEVEL_SCALE)}（盜賊、元素師、牧師 {scales(CLASS_SKILL_LEVEL_SCALE_BY_CLASS.thief ?? [])}）；
            冷卻未點強化時為表列 ÷ 0.8，每點一個強化 −10%，兩個點滿回到表列。閃避反擊與元素師的「冷卻縮減」技能沒有星盤節點。<br />
            基礎魔法沒有等級，星盤不強化；技能說明的分類為基礎攻擊魔法、基礎回復魔法、基礎護盾增益魔法。<br />
            各技能每一級的實際數值見 <Link className="wiki-link" to="/wiki/skills">技能頁</Link>。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>命星</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead><tr><th>命星</th><th>位置</th><th>效果與代價</th></tr></thead>
            <tbody>
              {keystones.map(k => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>{keystoneArea(k.id)}</td>
                  <td style={{ textAlign: 'left' }}>
                    {[...(k.flags ?? []).map(f => STAR_FLAG_LABEL[f]), ...k.effects.map(e => `${e.label} ${formatStarEffect(e)}`)].join('；')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={SECTION_TITLE}>配點模擬</h3>
        <p style={{ ...CARD_TEXT, color: 'var(--text-secondary)' }}>
          選職業與等級試點，滑鼠移到節點上看內容；這裡的配點不會存進角色。左上篩選欄輸入文字（如 HP、體質、命星）會標出符合的節點。
        </p>
        <StarChartPlanner />
      </section>
    </div>
  );
}
