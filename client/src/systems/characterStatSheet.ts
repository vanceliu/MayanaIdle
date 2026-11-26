/**
 * 能力值面板的欄位與數值（`34-ui-guidelines.md`）。遊戲的 `CharacterStats` 與管理介面角色查詢共用，
 * 數值一律走戰鬥系統的聚合函式。
 */
import type { Character } from '../models/character';
import { getTotalAttributes } from '../models/character';
import type { ActiveEffect } from '../models/effect';
import type { EquippedGear } from '../models/equipment';
import { roundAffixTenth } from '../models/affix';
import {
  getCombatBonuses,
  starStat,
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
} from './combat';
import { getEffectiveGearArray } from './gear';
import { getHpRegen, getMpRegen } from './regen';
import { getWeightStatus, type BagItemLike } from './weight';

export interface StatTip {
  /** 這個欄位是什麼 */
  desc: string;
  /** 怎麼算出來的 */
  formula?: string;
  /** 補充說明（上限、生效條件、與其他欄位的關係） */
  note?: string;
}

export interface StatRowData {
  label: string;
  value: string;
  /** 超過上限前的原值（迴避率），與 `value` 相同時不設 */
  overflow?: string;
  /** 超重 */
  warn?: boolean;
  tip: StatTip;
}

export interface StatGroupData {
  title: string;
  rows: StatRowData[];
}

/** 含百分比詞綴的欄位顯示一位小數（`34-ui-guidelines.md`、`07-affix.md` § 7.3） */
const pct = (v: number) => roundAffixTenth(v).toFixed(1);
const signed = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}%`;

export function characterStatSheet(
  char: Character,
  equippedGear: EquippedGear,
  activeEffects: ActiveEffect[],
  bagItems: BagItemLike[],
): StatGroupData[] {
  const gearList = getEffectiveGearArray(char, activeEffects, equippedGear);

  const attrs = getTotalAttributes(char, activeEffects, gearList);
  // 敏捷每 3 點生效（§ 20.2）
  const effectiveAGI = Math.floor(attrs.AGI / 3) * 3;

  const weapon = equippedGear.rightHand ?? null;
  const weaponExtraAttack = weapon?.extraAttack ?? 0;

  const bonuses = getCombatBonuses(gearList, activeEffects, char);

  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const critDamage = 200 + bonuses.crit_damage;
  const attackPower = bonuses.attack_power;
  const cooldownReduction = getSkillCooldownReduction(char, gearList, activeEffects);

  const blockRate = getPlayerBlockRate(gearList, activeEffects);

  // 攻速：詞綴 + buff + 減速 debuff（與 getPlayerAttackInterval 同一套）
  const attackSpeed = getTotalAttackSpeedPercent(gearList, activeEffects, char);

  // 負重（§ 20.7）。超重會擋下攻擊與魔法
  const weight = getWeightStatus(char, gearList, bagItems, activeEffects);

  // 防禦：含 buff 固定防禦與詛咒 -20%；「防禦值」顯示未夾底的數字，減傷率走夾底後的
  const totalDefense = getEffectiveDefense(gearList, activeEffects, bonuses.defense);
  const shownDefense = getUnclampedDefense(gearList, activeEffects, bonuses.defense);

  // 普攻的屬性加成：近戰吃力量、遠程吃敏捷（§ 21.3）
  const attackAttrBonus = getWeaponAttributeBonus(weapon, attrs);
  const agiBonus = Math.floor(effectiveAGI / 3);

  // 攻擊力：含額外攻擊 buff、遠程加成，以及虛弱 debuff
  const weakenPercent = getPlayerDebuffModifier(activeEffects, 'attack');
  const flatAttackBuff = getBuffFlatBonus(activeEffects, 'extra_attack')
    + getRangedAttackBonus(weapon, activeEffects);
  const applyAtk = (weaponDamage: number) => Math.max(1, Math.floor(
    Math.floor((weaponDamage + weaponExtraAttack + flatAttackBuff + attackAttrBonus) * (1 + attackPower / 100))
    * (100 + weakenPercent) / 100
  ));
  // 武器基傷每下在 floor(W/2)~W 擲骰（§ 21.3），顯示整段範圍
  const physicalRange = (basis: 'small' | 'large') => {
    const { min, max } = getWeaponDamageRange(weapon, basis);
    return `${applyAtk(min)}~${applyAtk(max)}`;
  };

  // 減傷率：防禦減傷與 buff 減傷類間乘算（§ 21.5）
  const defenseReduction = Math.min(totalDefense, 75);
  const buffReduction = getBuffDamageReduction(activeEffects, gearList);
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

  // 與命中判定同一套：基礎命中 80 + AGI加成 + 武器攻擊成功（含強化 /2）
  const hitRate = 80 + agiBonus + getWeaponAttackSuccess(weapon) + starStat(char, 'hit');

  // 非戰鬥狀態的回復量，與自然回復 tick 同一支（`29-regen.md`）
  const hpRegen = getHpRegen(char, false, gearList, activeEffects);
  const mpRegen = getMpRegen(char, false, gearList, activeEffects);

  const dodge = `${totalDodge.toFixed(1)}%`;
  const dodgeOverflow = `${uncappedDodge.toFixed(1)}%`;

  return [
    {
      title: '基礎屬性',
      rows: [
        { label: 'STR', value: String(attrs.STR), tip: { desc: '提升近戰攻擊與負重。', formula: '近戰攻擊 +1／每 2 點' } },
        { label: 'AGI', value: String(attrs.AGI), tip: { desc: '提升遠程攻擊、命中、迴避。', formula: '遠程攻擊 +1／每 2 點；命中、迴避 +1／每 3 點' } },
        { label: 'VIT', value: String(attrs.VIT), tip: { desc: '提升 HP 成長、回血、負重。', formula: '回血 +1／每 2 點' } },
        { label: 'SPI', value: String(attrs.SPI), tip: { desc: '提升 MP 成長、回魔、魔抗。', formula: '回魔、魔抗 +1／每 2 點' } },
        { label: 'INT', value: String(attrs.INT), tip: { desc: '提升技能傷害與冷卻縮減。', formula: `技能傷害 +${INT_SKILL_DAMAGE_PERCENT_PER_2}%、冷卻縮減 +1%／每 2 點` } },
        { label: 'CHA', value: String(attrs.CHA), tip: { desc: '目前沒有效果。' } },
      ],
    },
    {
      title: '攻擊',
      rows: [
        { label: '物理(小怪)', value: physicalRange('small'), tip: { desc: '對小型怪的普攻傷害（未計防禦、爆擊）。' } },
        { label: '物理(大怪)', value: physicalRange('large'), tip: { desc: '對大型怪的普攻傷害（未計防禦、爆擊）。' } },
        { label: '普攻元素', value: `+${pct(bonuses.element_brand)}%`, tip: { desc: '普攻元素傷害加成，武器有元素時生效。' } },
        { label: '技能元素', value: `+${pct(bonuses.skill_elemental)}%`, tip: { desc: '元素技能傷害加成。' } },
        { label: '攻速加成', value: signed(attackSpeed), tip: { desc: '縮短普攻間隔。', formula: '間隔 = 1200ms ÷ (1 + 攻速%)' } },
        { label: '冷卻縮減', value: `+${pct(cooldownReduction)}%`, tip: { desc: '縮短技能冷卻。', note: '上限 50%' } },
      ],
    },
    {
      title: '防禦',
      rows: [
        { label: '防禦值', value: String(shownDefense), tip: { desc: '物理減傷的來源，不是百分比。', note: `超過 ${DAMAGE_REDUCTION_CAP} 的部分轉為迴避` } },
        { label: '減傷率', value: `${damageReduction}%`, tip: { desc: '物理傷害減少比例。', note: `上限 ${DAMAGE_REDUCTION_CAP}%` } },
        { label: '魔法減傷率', value: `${pct(magicDamageReduction)}%`, tip: { desc: '魔法傷害減少比例。', formula: `防禦每 ${MAGIC_DEFENSE_PER_PERCENT} 點 1%（最多 ${MAGIC_DEFENSE_CONTRIBUTION_CAP}%）+ 魔法抗性`, note: `上限 ${DAMAGE_REDUCTION_CAP}%` } },
        { label: '魔法抗性', value: `${pct(magicResist)}%`, tip: { desc: '加進魔法減傷率，並降低受負面狀態的機率。' } },
        {
          label: '迴避率', value: dodge, ...(dodgeOverflow !== dodge ? { overflow: dodgeOverflow } : {}),
          tip: { desc: '閃避攻擊的機率。', note: `上限 ${DODGE_RATE_CAP}%` },
        },
        { label: '命中率', value: `${hitRate}%`, tip: { desc: '普攻命中的基準機率。' } },
        { label: '格擋率', value: `${pct(blockRate)}%`, tip: { desc: '擋下攻擊、傷害減半的機率。', note: '上限 50%' } },
      ],
    },
    {
      title: '爆擊',
      rows: [
        { label: '爆擊率', value: `${pct(critRate)}%`, tip: { desc: '普攻與物理技能的爆擊機率。', note: '上限 75%' } },
        { label: '爆擊傷害', value: `${pct(critDamage)}%`, tip: { desc: '爆擊時的傷害倍率。' } },
      ],
    },
    {
      title: '回復',
      rows: [
        { label: '每次回血', value: String(hpRegen), tip: { desc: '每 5 秒回復的 HP。', note: '戰鬥中減半' } },
        { label: '每次回魔', value: String(mpRegen), tip: { desc: '每 6 秒回復的 MP。', note: '戰鬥中減半' } },
        { label: '補血效果', value: `+${pct(bonuses.heal_effect)}%`, tip: { desc: '治癒技能的回復量加成。' } },
        { label: '補藥效果', value: `+${pct(bonuses.potion_effect)}%`, tip: { desc: '紅／橙／白色藥水的回復量加成。' } },
      ],
    },
    {
      title: '掉落',
      rows: [
        { label: '掉寶率', value: `+${pct(bonuses.drop_rate)}%`, tip: { desc: '物品掉落機率加成。' } },
        { label: '金幣獲得率', value: `+${pct(bonuses.gold_rate)}%`, tip: { desc: '金幣掉落量加成。' } },
      ],
    },
    {
      title: '負重',
      rows: [
        {
          label: '負重', value: `${weight.carried} / ${weight.capacity}`, ...(weight.overweight ? { warn: true } : {}),
          tip: { desc: '超過上限無法攻擊與施法。' },
        },
      ],
    },
  ];
}
