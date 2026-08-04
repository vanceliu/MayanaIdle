import {
  BASE_CHARACTER_DEFENSE,
  DAMAGE_REDUCTION_CAP,
  MAGIC_DEFENSE_EFFECTIVENESS,
  MAGIC_DEFENSE_CONTRIBUTION_CAP,
} from '../../systems/combat';
import { ACCESSORY_MAGIC_RESIST_PER_LEVEL } from '../../systems/enhancement';
import '../components/WikiTable.css';

/** 減傷／迴避等上限直接引用 `systems/combat.ts` 的常數，避免與實作 drift。 */
const MONSTER_DEFENSE_CAP = DAMAGE_REDUCTION_CAP;
const CRIT_RATE_CAP = 75;
const DODGE_CAP = 35;
const BLOCK_RATE_CAP = 50;
const BASE_ATTACK_INTERVAL_MS = 1200;
const MIN_ATTACK_INTERVAL_MS = 300;

const sectionStyle = { marginBottom: 32 } as const;
const headingStyle = {
  color: 'var(--accent-gold)',
  fontFamily: 'var(--font-display)',
  marginBottom: 12,
} as const;
const boxStyle = {
  background: 'var(--bg-card)',
  padding: 16,
  borderRadius: 'var(--radius-md)',
  marginBottom: 12,
} as const;
const formulaStyle = {
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 2,
} as const;
const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
} as const;

function Section({
  title,
  formula,
  note,
}: {
  title: string;
  formula: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h3 style={headingStyle}>{title}</h3>
      <div style={boxStyle}>
        <p style={formulaStyle}>{formula}</p>
      </div>
      {note && <p style={noteStyle}>{note}</p>}
    </section>
  );
}

export function CombatPage() {
  return (
    <div>
      <h2 className="wiki-page-title">戰鬥計算</h2>

      <Section
        title="物理攻擊（普通攻擊）"
        formula={
          <>
            基礎傷害 = 武器傷害(依怪物體型，已含強化等級) + STR加成(有效STR/2) + 額外攻擊
            <br />
            　　　　　+ 材質種族克制 + 元素克制 + 火矢附魔(弓限定)
            <br />
            傷害 = floor(基礎傷害 × (1 + 攻擊力%/100))
            <br />
            傷害 = floor(傷害 × (1 + 普攻元素%/100))　※ 武器有元素或火矢附魔時
            <br />
            傷害 = floor(傷害 × (2.0 + 爆擊傷害%/100))　※ 爆擊時
            <br />
            傷害 = max(1, floor(傷害 × (100 - 怪物減傷) / 100))
            <br />
            最終傷害 = 虛弱中則再 × 0.8
          </>
        }
        note={
          <>
            怪物減傷 = min(怪物防禦, {MONSTER_DEFENSE_CAP})，防禦下降類 debuff 會先降低怪物防禦。
            虛弱 debuff 作用於<strong>最終傷害</strong>，在所有乘區與防禦減傷之後才套用。
          </>
        }
      />

      <Section
        title="技能攻擊（魔法）"
        formula={
          <>
            INT加成 = floor(技能攻擊力 × (有效INT / 2 × 10) / 100)
            <br />
            基礎傷害 = 技能攻擊力 + INT加成 + 裝備魔法攻擊 + 元素克制
            <br />
            傷害 = floor(基礎傷害 × (1 + 技能元素%/100))　※ 技能有元素時
            <br />
            傷害 = floor(傷害 × (2.0 + 爆擊傷害%/100))　※ 爆擊時
            <br />
            最終傷害 = max(1, floor(傷害 × (100 - 怪物減傷) / 100))
          </>
        }
        note={
          <>
            技能<strong>必定命中</strong>，不做命中判定。裝備魔法攻擊為固定值加算，不進 INT 倍率、
            也不受攻擊力%詞綴影響。技能傷害不受虛弱影響（虛弱只作用於依物理公式計算的傷害）。
            <br />
            部分職業技能標示為「物理傷害」，那是指<strong>無元素屬性</strong>，公式仍走本節（吃 INT）；
            唯一走物理普攻公式的技能是三連射。
          </>
        }
      />

      <Section
        title="命中率"
        formula={
          <>
            命中率 = 80 + AGI加成(有效AGI/3) + 武器攻擊成功 + 等級差(玩家Lv - 怪物Lv)
            <br />
            　　　　+ 種族命中buff - 怪物迴避
            <br />
            武器攻擊成功 = 武器基礎值 + floor(強化等級 / 2)
            <br />
            命中率上限：95%　下限：5%
          </>
        }
      />

      <Section
        title="玩家防禦減傷"
        formula={
          <>
            最終防禦 = max(0, floor(裝備防禦合計 × (1 + 防禦力%/100)) + {BASE_CHARACTER_DEFENSE})
            　※ 詛咒中則再 -20%
            <br />
            <br />
            物理減傷率 = min(最終防禦, {DAMAGE_REDUCTION_CAP})
            <br />
            魔法減傷率 = min( min(最終防禦, {DAMAGE_REDUCTION_CAP}) × {MAGIC_DEFENSE_EFFECTIVENESS} +
            魔法抗性, {DAMAGE_REDUCTION_CAP} )
            <br />
            <br />
            傷害 = max(1, floor(怪物傷害 × (100 - 減傷率) / 100))
            <br />
            傷害 = max(1, floor(傷害 × (100 - buff減傷%) / 100))　※ 與防禦減傷為乘算
          </>
        }
        note={
          <>
            <strong>裝備防禦對魔法只有一半效力</strong>，最多貢獻 {MAGIC_DEFENSE_CONTRIBUTION_CAP}%（＝物理上限的一半），
            不足的部分要靠魔法抗性補。物理與魔法的總減傷上限相同，都是 {DAMAGE_REDUCTION_CAP}%。
            <br />
            怪物目前沒有魔法抗性，減傷來源仍只有防禦。
            <br />
            <strong>角色初始防禦為 {BASE_CHARACTER_DEFENSE}</strong>，前 {Math.abs(BASE_CHARACTER_DEFENSE)} 點裝備防禦形同填坑。
            它在百分比加成之後才扣，所以防禦力%詞綴不會放大這個負值；最終防禦夾底於 0，
            裸裝也不會承受超過 100% 的傷害。
          </>
        }
      />

      <Section
        title="魔法抗性"
        formula={
          <>
            魔法抗性 = floor(有效SPI / 2)　　　　　　　※ 精神每 2 點 +1%
            <br />
            　　　　　+ 飾品強化等級 × {ACCESSORY_MAGIC_RESIST_PER_LEVEL}　※ 項鍊／戒指，每 +1 給 {ACCESSORY_MAGIC_RESIST_PER_LEVEL}%
            <br />
            　　　　　+ 魔法抗性詞綴　　　　　　　　　※ 項鍊／戒指／盾牌限定
          </>
        }
        note={
          <>
            魔法抗性有兩個用途：一是加進上面的<strong>魔法減傷率</strong>；
            二是降低怪物對你施加 <strong>詛咒／虛弱／減速</strong> 的機率
            —— 怪物的基礎觸發率命中後，再以 min(魔法抗性, 100)% 判定是否抵抗。
            <br />
            中毒／流血／暈眩不受魔法抗性影響，只能靠免疫或抵抗詞綴。
          </>
        }
      />

      <Section
        title="迴避率"
        formula={
          <>
            基礎迴避 = 盜賊 10% / 其他職業 5%
            <br />
            AGI迴避 = 有效AGI / 3
            <br />
            防禦溢出迴避 = (總防禦 - {DAMAGE_REDUCTION_CAP}) / 5　※ 總防禦 &gt; {DAMAGE_REDUCTION_CAP} 時
            <br />
            迴避率 = 基礎迴避 + AGI迴避 + 防禦溢出迴避
            <br />
            迴避率上限：{DODGE_CAP}%
          </>
        }
        note={<>物理與魔法攻擊都可以迴避，成功迴避時傷害為 0。</>}
      />

      <Section
        title="爆擊"
        formula={
          <>
            爆擊率 = min({CRIT_RATE_CAP}, 5 + 爆擊率詞綴 + buff)
            <br />
            爆擊倍率 = 2.0 + 爆擊傷害% / 100
          </>
        }
        note={<>爆擊在防禦減傷「之前」套用。普攻與技能共用同一組爆擊數值。</>}
      />

      <Section
        title="格擋"
        formula={
          <>
            格擋率 = min({BLOCK_RATE_CAP}, 盾牌基礎格擋 + 格擋率詞綴)
            <br />
            格擋時傷害減半
          </>
        }
        note={<>未裝備盾牌時格擋率為 0。格擋在防禦減傷「之後」才判定。</>}
      />

      <Section
        title="攻擊速度"
        formula={
          <>
            基礎攻速間隔 = {BASE_ATTACK_INTERVAL_MS}ms
            <br />
            實際間隔 = floor({BASE_ATTACK_INTERVAL_MS} / (1 + 攻速%/100))
            <br />
            最低間隔：{MIN_ATTACK_INTERVAL_MS}ms
          </>
        }
        note={<>加速 buff 與減速 debuff 的百分比先相加，再一次換算成間隔。</>}
      />

      <section>
        <h3 style={headingStyle}>元素克制關係</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>攻擊屬性</th>
                <th>克制屬性</th>
                <th>額外傷害</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><span className="wiki-badge wiki-badge-fire">火</span></td><td><span className="wiki-badge wiki-badge-wind">風</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-wind">風</span></td><td><span className="wiki-badge wiki-badge-earth">地</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-earth">地</span></td><td><span className="wiki-badge wiki-badge-ice">冰</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-ice">冰</span></td><td><span className="wiki-badge wiki-badge-fire">火</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-light">光</span></td><td><span className="wiki-badge wiki-badge-dark">闇</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-dark">闇</span></td><td><span className="wiki-badge wiki-badge-light">光</span></td><td className="cell-number">+3</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ ...noteStyle, marginTop: 10 }}>
          克制成立時為固定 +3 傷害，加算至基礎傷害。攻擊方或目標任一方為無屬性時不計。
        </p>
      </section>
    </div>
  );
}
