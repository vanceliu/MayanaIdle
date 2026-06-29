import { useGameStore } from '../stores/gameStore';
import { getTotalAttributes } from '../models/character';
import { getEffectiveAffixValue } from '../models/affix';

export function CharacterStats() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);

  if (!char) return null;

  const attrs = getTotalAttributes(char);
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

  let totalDefense = 0;
  let blockRate = 0;
  let critRate = 5;
  let critDamage = 200;
  let attackPower = 0;
  let attackElemental = 0;
  let skillElemental = 0;
  let attackSpeed = 0;
  let cooldownReduction = 0;
  let maxHpBonus = 0;
  let maxMpBonus = 0;
  let healEffect = 0;
  let potionEffect = 0;

  for (const [, item] of Object.entries(equippedGear)) {
    if (!item) continue;
    if (item.defense) totalDefense += item.defense;
    if (item.enhancement && item.defense) totalDefense += item.enhancement;
    if (item.blockRate) blockRate += item.blockRate;

    if (item.affixes) {
      for (const affix of item.affixes) {
        const val = getEffectiveAffixValue(affix, item.quality);
        switch (affix.type) {
          case 'attack_power': attackPower += val; break;
          case 'attack_elemental': attackElemental += val; break;
          case 'skill_elemental': skillElemental += val; break;
          case 'crit_rate': critRate += val; break;
          case 'crit_damage': critDamage += val; break;
          case 'attack_speed': attackSpeed += val; break;
          case 'cooldown_reduction': cooldownReduction += val; break;
          case 'defense': totalDefense += val; break;
          case 'max_hp': maxHpBonus += val; break;
          case 'max_mp': maxMpBonus += val; break;
          case 'heal_effect': healEffect += val; break;
          case 'potion_effect': potionEffect += val; break;
          case 'block_rate': blockRate += val; break;
        }
      }
    }
  }

  // Apply buff modifiers from active effects
  const now = Date.now();
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      switch (mod.stat) {
        case 'defense': totalDefense += mod.value; break;
        case 'attack_power': attackPower += mod.value; break;
        case 'crit_rate': critRate += mod.value; break;
        case 'crit_damage': critDamage += mod.value; break;
        case 'attack_speed': attackSpeed += mod.value; break;
        case 'cooldown_reduction': cooldownReduction += mod.value; break;
        case 'max_hp': maxHpBonus += mod.value; break;
        case 'max_mp': maxMpBonus += mod.value; break;
      }
    }
  }

  const strBonus = Math.floor(effectiveSTR / 2);
  const agiBonus = Math.floor(effectiveAGI / 3);

  const physicalSmall = Math.floor((weaponSmall + weaponEnhance + weaponExtraAttack + strBonus) * (1 + attackPower / 100));
  const physicalLarge = Math.floor((weaponLarge + weaponEnhance + weaponExtraAttack + strBonus) * (1 + attackPower / 100));

  const damageReduction = Math.min(totalDefense, 65);
  const defOverflow = Math.max(0, totalDefense - 65);
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

  critRate = Math.min(75, critRate);

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
            <span>攻速加成</span><span>+{attackSpeed}%</span>
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
