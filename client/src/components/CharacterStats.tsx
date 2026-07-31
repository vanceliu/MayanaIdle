import { useGameStore } from '../stores/gameStore';
import { getTotalAttributes } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import {
  getCombatBonuses,
  getEffectiveDefense,
  getBuffFlatBonus,
  getRangedAttackBonus,
  getPlayerDebuffModifier,
  getBuffDamageReduction,
  getTotalAttackSpeedPercent,
} from '../systems/combat';

export function CharacterStats() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);

  if (!char) return null;

  const attrs = getTotalAttributes(char, activeEffects);
  const effectiveSTR = Math.floor(attrs.STR / 2) * 2;
  const effectiveAGI = Math.floor(attrs.AGI / 2) * 2;
  const effectiveVIT = Math.floor(attrs.VIT / 2) * 2;
  const effectiveSPI = Math.floor(attrs.SPI / 2) * 2;
  // const effectiveINT = Math.floor(attrs.INT / 2) * 2;

  const weapon = equippedGear.rightHand;
  const weaponSmall = weapon?.smallMonsterDamage ?? 0;
  const weaponLarge = weapon?.largeMonsterDamage ?? 0;
  const weaponEnhance = weapon?.enhancement ?? 0;
  const weaponExtraAttack = weapon?.extraAttack ?? 0;

  // 一律使用戰鬥系統的聚合函式，避免面板與實際戰鬥各算一份而漂移
  const gearList = Object.values(equippedGear).filter(Boolean) as EquipmentInstance[];
  const bonuses = getCombatBonuses(gearList, activeEffects);

  const critRate0 = 5 + bonuses.crit_rate;
  const critDamage = 200 + bonuses.crit_damage;
  const attackPower = bonuses.attack_power;
  const attackElemental = bonuses.attack_elemental;
  const skillElemental = bonuses.skill_elemental;
  const cooldownReduction = Math.min(bonuses.cooldown_reduction, 50);
  const healEffect = bonuses.heal_effect;
  const potionEffect = bonuses.potion_effect;

  let blockRate = bonuses.block_rate;
  for (const item of gearList) {
    if (item.blockRate) blockRate += item.blockRate;
  }
  blockRate = Math.min(50, blockRate);

  // 攻速：詞綴 + buff + 減速 debuff（與 getPlayerAttackInterval 同一套）
  const attackSpeed = getTotalAttackSpeedPercent(gearList, activeEffects);

  // 防禦：含 buff 固定防禦與詛咒 -20%
  const totalDefense = getEffectiveDefense(gearList, activeEffects, bonuses.defense);

  const strBonus = Math.floor(effectiveSTR / 2);
  const agiBonus = Math.floor(effectiveAGI / 3);

  // 攻擊力：含額外攻擊 buff、遠程加成，以及虛弱 debuff
  const weakenPercent = getPlayerDebuffModifier(activeEffects, 'attack');
  const flatAttackBuff = getBuffFlatBonus(activeEffects, 'extra_attack')
    + getRangedAttackBonus(weapon ?? null, activeEffects);
  const applyAtk = (base: number) => Math.max(1, Math.floor(
    Math.floor((base + weaponEnhance + weaponExtraAttack + flatAttackBuff + strBonus) * (1 + attackPower / 100))
    * (100 + weakenPercent) / 100
  ));
  const physicalSmall = applyAtk(weaponSmall);
  const physicalLarge = applyAtk(weaponLarge);

  // 減傷率：防禦減傷與 buff 減傷類間乘算（§ 21.5）
  const defenseReduction = Math.min(totalDefense, 75);
  const buffReduction = getBuffDamageReduction(activeEffects);
  const damageReduction = Math.round(100 - (100 - defenseReduction) * (100 - buffReduction) / 100);
  const defOverflow = Math.max(0, totalDefense - 75);
  const dodgeFromDef = Math.floor(defOverflow / 5);
  const baseDodge = char.className === 'thief' ? 10 : 5;
  const totalDodge = Math.min(35, baseDodge + agiBonus + dodgeFromDef);

  const hitRate = 75 + agiBonus + Math.floor(weaponEnhance / 2);

  let hpRegen = Math.floor(effectiveVIT / 2);
  let mpRegen = Math.floor(effectiveSPI / 2);

  for (const [, item] of Object.entries(equippedGear)) {
    if (!item) continue;
    if (item.hpRegen) hpRegen += item.hpRegen;
    if (item.mpRegen) mpRegen += item.mpRegen;
  }

  const critRate = Math.min(75, critRate0);

  return (
    <div className="char-stats-content">
      <div className="char-stats-grid">
        <div className="stat-group">
          <div className="stat-group-title">基礎屬性</div>
          <div className="stat-row">
            <span>STR</span><span>{attrs.STR}</span>
          </div>
          <div className="stat-row">
            <span>AGI</span><span>{attrs.AGI}</span>
          </div>
          <div className="stat-row">
            <span>VIT</span><span>{attrs.VIT}</span>
          </div>
          <div className="stat-row">
            <span>SPI</span><span>{attrs.SPI}</span>
          </div>
          <div className="stat-row">
            <span>INT</span><span>{attrs.INT}</span>
          </div>
          <div className="stat-row">
            <span>CHA</span><span>{attrs.CHA}</span>
          </div>
        </div>

        <div className="stat-group">
          <div className="stat-group-title">攻擊</div>
          <div className="stat-row">
            <span>物理(小怪)</span><span>{physicalSmall}</span>
          </div>
          <div className="stat-row">
            <span>物理(大怪)</span><span>{physicalLarge}</span>
          </div>
          <div className="stat-row">
            <span>普攻元素</span><span>+{attackElemental}%</span>
          </div>
          <div className="stat-row">
            <span>技能元素</span><span>+{skillElemental}%</span>
          </div>
          <div className="stat-row">
            <span>攻速加成</span><span>{attackSpeed >= 0 ? '+' : ''}{attackSpeed}%</span>
          </div>
          <div className="stat-row">
            <span>冷卻縮減</span><span>+{cooldownReduction}%</span>
          </div>
        </div>

        <div className="stat-group">
          <div className="stat-group-title">防禦</div>
          <div className="stat-row">
            <span>防禦值</span><span>{totalDefense}</span>
          </div>
          <div className="stat-row">
            <span>減傷率</span><span>{damageReduction}%</span>
          </div>
          <div className="stat-row">
            <span>迴避率</span><span>{totalDodge}%</span>
          </div>
          <div className="stat-row">
            <span>命中率</span><span>{hitRate}%</span>
          </div>
          <div className="stat-row">
            <span>格擋率</span><span>{blockRate}%</span>
          </div>
        </div>

        <div className="stat-group">
          <div className="stat-group-title">爆擊</div>
          <div className="stat-row">
            <span>爆擊率</span><span>{critRate}%</span>
          </div>
          <div className="stat-row">
            <span>爆擊傷害</span><span>{critDamage}%</span>
          </div>
        </div>

        <div className="stat-group">
          <div className="stat-group-title">回復</div>
          <div className="stat-row">
            <span>每次回血</span><span>{hpRegen}</span>
          </div>
          <div className="stat-row">
            <span>每次回魔</span><span>{mpRegen}</span>
          </div>
          <div className="stat-row">
            <span>補血效果</span><span>+{healEffect}%</span>
          </div>
          <div className="stat-row">
            <span>藥水效果</span><span>+{potionEffect}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
