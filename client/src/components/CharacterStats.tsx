import type { ReactNode } from 'react';
import { getWeightStatus } from '../systems/weight';
import { useGameStore } from '../stores/gameStore';
import { Tooltip } from './Tooltip';
import { getTotalAttributes } from '../models/character';
import {
  getCombatBonuses,
  getEffectiveDefense,
  getBuffFlatBonus,
  getRangedAttackBonus,
  getPlayerDebuffModifier,
  getBuffDamageReduction,
  getTotalAttackSpeedPercent,
  getWeaponAttackSuccess,
  DAMAGE_REDUCTION_CAP,
  MAGIC_DEFENSE_PER_PERCENT,
  MAGIC_DEFENSE_CONTRIBUTION_CAP,
  getMagicDefenseContribution,
  getTotalMagicResist,
  getPlayerBlockRate,
  getUncappedPlayerDodgeRate,
  DODGE_RATE_CAP,
  getSkillCooldownReduction,
  getWeaponAttributeBonus,
  getUnclampedDefense,
  INT_SKILL_DAMAGE_PERCENT_PER_2,
  getWeaponDamageRange,
} from '../systems/combat';
import { roundAffixTenth } from '../models/affix';
import { getEffectiveGearArray } from '../systems/gear';
import { getHpRegen, getMpRegen } from '../systems/regen';

interface StatTip {
  /** 這個欄位是什麼 */
  desc: string;
  /** 怎麼算出來的 */
  formula?: string;
  /** 補充說明（上限、生效條件、與其他欄位的關係） */
  note?: string;
}

function StatRow({ label, value, tip }: { label: string; value: ReactNode; tip: StatTip }) {
  return (
    <div className="stat-row">
      <Tooltip
        position="right"
        content={
          <div className="stat-tip">
            <div className="stat-tip-title">{label}</div>
            <div className="stat-tip-desc">{tip.desc}</div>
            {tip.formula && <div className="stat-tip-formula">{tip.formula}</div>}
            {tip.note && <div className="stat-tip-note">{tip.note}</div>}
          </div>
        }
      >
        <span className="stat-label">{label}</span>
      </Tooltip>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** 含百分比詞綴的欄位顯示一位小數（`34-ui-guidelines.md`、`07-affix.md` § 7.3） */
const pct = (v: number) => roundAffixTenth(v).toFixed(1);

export function CharacterStats() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  const bagItems = useGameStore(s => s.bagItems);

  if (!char) return null;

  // 一律使用戰鬥系統的聚合函式，避免面板與實際戰鬥各算一份而漂移
  const gearList = getEffectiveGearArray(char, activeEffects, equippedGear);

  const attrs = getTotalAttributes(char, activeEffects, gearList);
  // 敏捷每 3 點生效（§ 20.2）
  const effectiveAGI = Math.floor(attrs.AGI / 3) * 3;
  // const effectiveINT = Math.floor(attrs.INT / 2) * 2;

  const weapon = equippedGear.rightHand;
  const weaponExtraAttack = weapon?.extraAttack ?? 0;

  const bonuses = getCombatBonuses(gearList, activeEffects);

  const critRate0 = 5 + bonuses.crit_rate;
  const critDamage = 200 + bonuses.crit_damage;
  const attackPower = bonuses.attack_power;
  const attackElemental = bonuses.element_brand;
  const skillElemental = bonuses.skill_elemental;
  const cooldownReduction = getSkillCooldownReduction(char, gearList, activeEffects);
  const healEffect = bonuses.heal_effect;
  const potionEffect = bonuses.potion_effect;
  const dropRate = bonuses.drop_rate;
  const goldRate = bonuses.gold_rate;

  const blockRate = getPlayerBlockRate(gearList, activeEffects);

  // 攻速：詞綴 + buff + 減速 debuff（與 getPlayerAttackInterval 同一套）
  const attackSpeed = getTotalAttackSpeedPercent(gearList, activeEffects);

  // 負重（§ 20.7）。超重會擋下攻擊與魔法，所以要看得到自己差多少
  const weight = getWeightStatus(char, gearList, bagItems);

  // 防禦：含 buff 固定防禦與詛咒 -20%
  const totalDefense = getEffectiveDefense(gearList, activeEffects, bonuses.defense);
  // 「防禦值」那一列顯示未夾底的數字；減傷率仍走夾底後的 `totalDefense`
  const shownDefense = getUnclampedDefense(gearList, activeEffects, bonuses.defense);

  // 普攻的屬性加成：近戰吃力量、遠程吃敏捷（§ 21.3）。
  // 一律走戰鬥系統的 `getWeaponAttributeBonus()`，面板自己算一份會與實際戰鬥漂移
  const attackAttrBonus = getWeaponAttributeBonus(weapon ?? null, attrs);
  const agiBonus = Math.floor(effectiveAGI / 3);

  // 攻擊力：含額外攻擊 buff、遠程加成，以及虛弱 debuff
  const weakenPercent = getPlayerDebuffModifier(activeEffects, 'attack');
  const flatAttackBuff = getBuffFlatBonus(activeEffects, 'extra_attack')
    + getRangedAttackBonus(weapon ?? null, activeEffects);
  const applyAtk = (weaponDamage: number) => Math.max(1, Math.floor(
    Math.floor((weaponDamage + weaponExtraAttack + flatAttackBuff + attackAttrBonus) * (1 + attackPower / 100))
    * (100 + weakenPercent) / 100
  ));
  // 武器基傷每下在 floor(W/2)~W 擲骰（§ 21.3），面板顯示整段範圍
  const physicalRange = (basis: 'small' | 'large') => {
    const { min, max } = getWeaponDamageRange(weapon ?? null, basis);
    return `${applyAtk(min)}~${applyAtk(max)}`;
  };
  const physicalSmall = physicalRange('small');
  const physicalLarge = physicalRange('large');

  // 減傷率：防禦減傷與 buff 減傷類間乘算（§ 21.5）
  const defenseReduction = Math.min(totalDefense, 75);
  const buffReduction = getBuffDamageReduction(activeEffects);
  const damageReduction = Math.round(100 - (100 - defenseReduction) * (100 - buffReduction) / 100);
  // 魔法減傷（§ 21.16）：裝備防禦貢獻上限 10%，其餘靠魔法抗性，總上限 75%
  const magicResist = getTotalMagicResist(char, gearList, activeEffects);
  const magicDefenseReduction = Math.min(
    getMagicDefenseContribution(totalDefense) + magicResist,
    DAMAGE_REDUCTION_CAP,
  );
  const magicDamageReduction = 100 - (100 - magicDefenseReduction) * (100 - buffReduction) / 100;

  const uncappedDodge = getUncappedPlayerDodgeRate(char, gearList, activeEffects);
  const totalDodge = Math.min(DODGE_RATE_CAP, uncappedDodge);

  // 與 systems/combat.ts 的命中判定同一套：基礎命中 80 + AGI加成 + 武器攻擊成功（含強化 /2）
  const hitRate = 80 + agiBonus + getWeaponAttackSuccess(weapon ?? null);

  // 非戰鬥狀態的回復量，與自然回復 tick 同一支（`29-regen.md`）
  const hpRegen = getHpRegen(char, false, gearList, activeEffects);
  const mpRegen = getMpRegen(char, false, gearList, activeEffects);

  const critRate = Math.min(75, critRate0);

  return (
    <div className="char-stats-content">
      <div className="char-stats-grid">
        <div className="stat-group">
          <div className="stat-group-title">基礎屬性</div>
          <StatRow label="STR" value={attrs.STR} tip={{ desc: '提升近戰攻擊與負重。', formula: '近戰攻擊 +1／每 2 點' }} />
          <StatRow label="AGI" value={attrs.AGI} tip={{ desc: '提升遠程攻擊、命中、迴避。', formula: '遠程攻擊 +1／每 2 點；命中、迴避 +1／每 3 點' }} />
          <StatRow label="VIT" value={attrs.VIT} tip={{ desc: '提升 HP 成長、回血、負重。', formula: '回血 +1／每 2 點' }} />
          <StatRow label="SPI" value={attrs.SPI} tip={{ desc: '提升 MP 成長、回魔、魔抗。', formula: '回魔、魔抗 +1／每 2 點' }} />
          <StatRow label="INT" value={attrs.INT} tip={{ desc: '提升技能傷害與冷卻縮減。', formula: `技能傷害 +${INT_SKILL_DAMAGE_PERCENT_PER_2}%、冷卻縮減 +1%／每 2 點` }} />
          <StatRow label="CHA" value={attrs.CHA} tip={{ desc: '目前沒有效果。' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">攻擊</div>
          <StatRow label="物理(小怪)" value={physicalSmall} tip={{ desc: '對小型怪的普攻傷害（未計防禦、爆擊）。' }} />
          <StatRow label="物理(大怪)" value={physicalLarge} tip={{ desc: '對大型怪的普攻傷害（未計防禦、爆擊）。' }} />
          <StatRow label="普攻元素" value={<>+{pct(attackElemental)}%</>} tip={{ desc: '普攻元素傷害加成，武器有元素時生效。' }} />
          <StatRow label="技能元素" value={<>+{pct(skillElemental)}%</>} tip={{ desc: '元素技能傷害加成。' }} />
          <StatRow label="攻速加成" value={<>{attackSpeed >= 0 ? '+' : ''}{pct(attackSpeed)}%</>} tip={{ desc: '縮短普攻間隔。', formula: '間隔 = 1200ms ÷ (1 + 攻速%)' }} />
          <StatRow label="冷卻縮減" value={<>+{pct(cooldownReduction)}%</>} tip={{ desc: '縮短技能冷卻。', note: '上限 50%' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">防禦</div>
          <StatRow label="防禦值" value={shownDefense} tip={{ desc: '物理減傷的來源，不是百分比。', note: `超過 ${DAMAGE_REDUCTION_CAP} 的部分轉為迴避` }} />
          <StatRow label="減傷率" value={<>{damageReduction}%</>} tip={{ desc: '物理傷害減少比例。', note: `上限 ${DAMAGE_REDUCTION_CAP}%` }} />
          <StatRow label="魔法減傷率" value={<>{pct(magicDamageReduction)}%</>} tip={{ desc: '魔法傷害減少比例。', formula: `防禦每 ${MAGIC_DEFENSE_PER_PERCENT} 點 1%（最多 ${MAGIC_DEFENSE_CONTRIBUTION_CAP}%）+ 魔法抗性`, note: `上限 ${DAMAGE_REDUCTION_CAP}%` }} />
          <StatRow label="魔法抗性" value={<>{pct(magicResist)}%</>} tip={{ desc: '加進魔法減傷率，並降低受負面狀態的機率。' }} />
          <StatRow label="迴避率" value={<>{totalDodge.toFixed(1)}%{uncappedDodge.toFixed(1) !== totalDodge.toFixed(1) && <span className="stat-overflow">（{uncappedDodge.toFixed(1)}%）</span>}</>} tip={{ desc: '閃避攻擊的機率。', note: `上限 ${DODGE_RATE_CAP}%` }} />
          <StatRow label="命中率" value={<>{hitRate}%</>} tip={{ desc: '普攻命中的基準機率。' }} />
          <StatRow label="格擋率" value={<>{pct(blockRate)}%</>} tip={{ desc: '擋下攻擊、傷害減半的機率。', note: '上限 50%' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">爆擊</div>
          <StatRow label="爆擊率" value={<>{pct(critRate)}%</>} tip={{ desc: '普攻與物理技能的爆擊機率。', note: '上限 75%' }} />
          <StatRow label="爆擊傷害" value={<>{pct(critDamage)}%</>} tip={{ desc: '爆擊時的傷害倍率。' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">回復</div>
          <StatRow label="每次回血" value={hpRegen} tip={{ desc: '每 5 秒回復的 HP。', note: '戰鬥中減半' }} />
          <StatRow label="每次回魔" value={mpRegen} tip={{ desc: '每 6 秒回復的 MP。', note: '戰鬥中減半' }} />
          <StatRow label="補血效果" value={<>+{pct(healEffect)}%</>} tip={{ desc: '治癒技能的回復量加成。' }} />
          <StatRow label="藥水效果" value={<>+{pct(potionEffect)}%</>} tip={{ desc: '藥水的回復量加成。' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">掉落</div>
          <StatRow label="掉寶率" value={<>+{pct(dropRate)}%</>} tip={{ desc: '物品掉落機率加成。' }} />
          <StatRow label="金幣獲得率" value={<>+{pct(goldRate)}%</>} tip={{ desc: '金幣掉落量加成。' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">負重</div>
          <StatRow
            label="負重"
            value={(
              <span className={weight.overweight ? 'stat-overweight' : undefined}>
                {weight.carried} / {weight.capacity}
                {weight.overweight && ' ⚠'}
              </span>
            )}
            tip={{ desc: '超過上限無法攻擊與施法。' }}
          />
        </div>
      </div>
    </div>
  );
}
