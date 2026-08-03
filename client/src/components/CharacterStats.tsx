import type { ReactNode } from 'react';
import { getWeightStatus } from '../systems/weight';
import { useGameStore } from '../stores/gameStore';
import { Tooltip } from './Tooltip';
import { getTotalAttributes, getMagicResist } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
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
  getMagicDefenseContribution,
  getGearMagicResist,
  getSkillCooldownReduction,
} from '../systems/combat';

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

export function CharacterStats() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  const bagItems = useGameStore(s => s.bagItems);

  if (!char) return null;

  // 一律使用戰鬥系統的聚合函式，避免面板與實際戰鬥各算一份而漂移
  const gearList = Object.values(equippedGear).filter(Boolean) as EquipmentInstance[];

  const attrs = getTotalAttributes(char, activeEffects, gearList);
  const effectiveSTR = Math.floor(attrs.STR / 2) * 2;
  // 敏捷每 3 點生效（§ 20.2），其餘每 2 點
  const effectiveAGI = Math.floor(attrs.AGI / 3) * 3;
  const effectiveVIT = Math.floor(attrs.VIT / 2) * 2;
  const effectiveSPI = Math.floor(attrs.SPI / 2) * 2;
  // const effectiveINT = Math.floor(attrs.INT / 2) * 2;

  const weapon = equippedGear.rightHand;
  const weaponSmall = weapon?.smallMonsterDamage ?? 0;
  const weaponLarge = weapon?.largeMonsterDamage ?? 0;
  const weaponEnhance = weapon?.enhancement ?? 0;
  const weaponExtraAttack = weapon?.extraAttack ?? 0;

  const bonuses = getCombatBonuses(gearList, activeEffects);

  const critRate0 = 5 + bonuses.crit_rate;
  const critDamage = 200 + bonuses.crit_damage;
  const attackPower = bonuses.attack_power;
  const attackElemental = bonuses.attack_elemental;
  const skillElemental = bonuses.skill_elemental;
  const cooldownReduction = getSkillCooldownReduction(char, gearList, activeEffects);
  const healEffect = bonuses.heal_effect;
  const potionEffect = bonuses.potion_effect;

  let blockRate = bonuses.block_rate;
  for (const item of gearList) {
    if (item.blockRate) blockRate += item.blockRate;
  }
  blockRate = Math.min(50, blockRate);

  // 攻速：詞綴 + buff + 減速 debuff（與 getPlayerAttackInterval 同一套）
  const attackSpeed = getTotalAttackSpeedPercent(gearList, activeEffects);

  // 負重（§ 20.7）。超重會擋下攻擊與魔法，所以要看得到自己差多少
  const weight = getWeightStatus(char, gearList, bagItems);

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
  // 魔法減傷（§ 21.16）：裝備防禦貢獻上限 50%，其餘靠魔法抗性，總上限 75%
  const magicResist = getMagicResist(attrs.SPI) + getGearMagicResist(gearList);
  const magicDefenseReduction = Math.min(
    getMagicDefenseContribution(totalDefense) + magicResist,
    DAMAGE_REDUCTION_CAP,
  );
  const magicDamageReduction = Math.round(
    100 - (100 - magicDefenseReduction) * (100 - buffReduction) / 100
  );

  const defOverflow = Math.max(0, totalDefense - 75);
  const dodgeFromDef = Math.floor(defOverflow / 5);
  const baseDodge = char.className === 'thief' ? 10 : 5;
  const totalDodge = Math.min(35, baseDodge + agiBonus + dodgeFromDef);

  // 與 systems/combat.ts 的命中判定同一套：基礎命中 80 + AGI加成 + 武器攻擊成功（含強化 /2）
  const hitRate = 80 + agiBonus + getWeaponAttackSuccess(weapon ?? null);

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
          <StatRow label="STR" value={attrs.STR} tip={{ desc: '力量。提升近戰攻擊力。', formula: '近戰攻擊 +1 / 每 2 點', note: '每 2 點才生效一次，奇數無效（STR 13 以 12 計算）' }} />
          <StatRow label="AGI" value={attrs.AGI} tip={{ desc: '敏捷。影響命中率與迴避率。', formula: '命中 +1、迴避 +1 / 每 3 點', note: '每 3 點才生效一次（AGI 8 以 6 計算）' }} />
          <StatRow label="VIT" value={attrs.VIT} tip={{ desc: '體質。影響升級 HP 成長與每次回血量。', formula: '升級 HP +random(VIT-6, VIT-3)；回血 +1 / 每 2 點', note: '升級成長使用原始值，回血使用每 2 點生效的有效值' }} />
          <StatRow label="SPI" value={attrs.SPI} tip={{ desc: '精神。影響升級 MP 成長、每次回魔與魔法抗性。', formula: '升級 MP +random(SPI-6, SPI-3)；回魔 +1、魔法抗性 +1% / 每 2 點', note: '魔法抗性是抵擋怪物魔法傷害的來源之一' }} />
          <StatRow label="INT" value={attrs.INT} tip={{ desc: '智力。提升魔法技能的傷害與冷卻縮減。', formula: '技能傷害 +5%、冷卻縮減 +1% / 每 2 點', note: '傷害只影響走技能公式的招式，不影響普攻；冷卻縮減與詞綴加總後上限 50%' }} />
          <StatRow label="CHA" value={attrs.CHA} tip={{ desc: '魅力。規劃用於寵物攜帶數量。', note: '寵物系統尚未實作，目前此屬性沒有任何效果' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">攻擊</div>
          <StatRow label="物理(小怪)" value={physicalSmall} tip={{ desc: '對「小型」怪物的每次普攻傷害（未計怪物防禦與爆擊）。', formula: '(武器小怪基傷 + 強化等級 + 額外攻擊 + STR加成) × (1 + 攻擊力%)', note: '怪物體型分小型/大型，武器對兩者的基傷不同' }} />
          <StatRow label="物理(大怪)" value={physicalLarge} tip={{ desc: '對「大型」怪物的每次普攻傷害（未計怪物防禦與爆擊）。', formula: '(武器大怪基傷 + 強化等級 + 額外攻擊 + STR加成) × (1 + 攻擊力%)', note: '多數 Boss 為大型，但小型 Boss 也存在' }} />
          <StatRow label="普攻元素" value={<>+{attackElemental}%</>} tip={{ desc: '普通攻擊的元素傷害加成，來自裝備詞綴。', formula: '所有「普攻元素傷害」詞綴加總', note: '只在武器帶元素屬性（或火矢附魔生效）時才計入，無屬性武器吃不到' }} />
          <StatRow label="技能元素" value={<>+{skillElemental}%</>} tip={{ desc: '元素技能的傷害加成，來自裝備詞綴與 buff。', formula: '「技能元素傷害」詞綴 + 元素增幅等 buff', note: '只對有元素屬性的技能生效，無屬性技能吃不到' }} />
          <StatRow label="攻速加成" value={<>{attackSpeed >= 0 ? '+' : ''}{attackSpeed}%</>} tip={{ desc: '縮短普攻間隔。負值代表被減速。', formula: '攻擊間隔 = 1200ms / (1 + 攻速%)', note: '加速 buff 與減速 debuff 的百分比先相加再換算' }} />
          <StatRow label="冷卻縮減" value={<>+{cooldownReduction}%</>} tip={{ desc: '縮短所有技能的冷卻時間。', formula: '「減少冷卻時間」詞綴 + 冷卻縮減類 buff + 智力（每 2 點 +1%）', note: '上限 50%，已包含在顯示值內' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">防禦</div>
          <StatRow label="防禦值" value={totalDefense} tip={{ desc: '裝備提供的防禦總量。這是「數值」，不是百分比。', formula: '(裝備防禦 + 防具強化等級 + buff固定防禦) × (1 + 防禦力%詞綴)', note: '被詛咒時再 -20%。防禦值超過 75 的部分會轉為迴避率' }} />
          <StatRow label="減傷率" value={<>{damageReduction}%</>} tip={{ desc: '受到「物理」傷害時實際減少的比例。', formula: 'min(防禦值, 75) 與 buff減傷 類間乘算', note: '防禦值的減傷上限為 75%，堆再高也不會超過' }} />
          <StatRow label="魔法減傷率" value={<>{magicDamageReduction}%</>} tip={{ desc: '受到「魔法」傷害時實際減少的比例 —— 這是最終結果。', formula: 'min(防禦值,75) × 0.5 + 魔法抗性，上限 75%，再與 buff減傷 乘算', note: '裝備防禦對魔法只有一半效力（最多貢獻 37.5%），缺口要靠下面的「魔法抗性」補' }} />
          <StatRow label="魔法抗性" value={<>{magicResist}%</>} tip={{ desc: '魔法減傷率的來源之一，會直接加進上面那一列。', formula: 'SPI 每 2 點 +1% ＋ 項鍊/戒指強化每 +1 給 2% ＋ 魔法抗性詞綴', note: '另有第二個用途：降低怪物對你施加「詛咒／虛弱／減速」的機率' }} />
          <StatRow label="迴避率" value={<>{totalDodge}%</>} tip={{ desc: '完全閃避怪物攻擊的機率（傷害歸零）。物理與魔法皆可迴避。', formula: '基礎(一般 5%／盜賊 10%) + AGI每3點+1 + 防禦溢出((防禦-75)/5)', note: '上限 35%，已包含在顯示值內' }} />
          <StatRow label="命中率" value={<>{hitRate}%</>} tip={{ desc: '普通攻擊命中怪物的基準機率。', formula: '80 + AGI每3點+1 + 武器攻擊成功(含強化/2)', note: '實戰另計「等級差」與「怪物迴避率」，最終限縮在 5%~95%。技能必定命中' }} />
          <StatRow label="格擋率" value={<>{blockRate}%</>} tip={{ desc: '以盾牌或臂甲擋下攻擊的機率，成功時傷害減半。', formula: '副手基礎格擋率 + 格擋率詞綴', note: '未裝備盾牌／臂甲時為 0。上限 50%。在防禦減傷之後才判定' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">爆擊</div>
          <StatRow label="爆擊率" value={<>{critRate}%</>} tip={{ desc: '普攻與技能造成暴擊的機率。', formula: '基礎 5% + 爆擊率詞綴 + 精準打擊等 buff', note: '上限 75%，已包含在顯示值內' }} />
          <StatRow label="爆擊傷害" value={<>{critDamage}%</>} tip={{ desc: '暴擊時的傷害倍率。200% 代表兩倍傷害。', formula: '基礎 200% + 爆擊傷害詞綴 + 致命一擊等 buff', note: '在防禦減傷「之前」套用' }} />
        </div>

        <div className="stat-group">
          <div className="stat-group-title">回復</div>
          <StatRow label="每次回血" value={hpRegen} tip={{ desc: '每 5 秒自動回復的 HP 量。', formula: 'floor(有效VIT / 2) + 裝備回血量加總', note: '戰鬥中減半（最低 1）。HP 已滿或死亡時停止' }} />
          <StatRow label="每次回魔" value={mpRegen} tip={{ desc: '每 6 秒自動回復的 MP 量。', formula: 'floor(有效SPI / 2) + 裝備回魔量加總', note: '戰鬥中減半（最低 1）。本遊戲沒有補魔藥水，MP 主要靠此回復' }} />
          <StatRow label="補血效果" value={<>+{healEffect}%</>} tip={{ desc: '提升「治癒類技能」的回復量。', formula: '所有「補血效果」詞綴加總', note: '不影響藥水，也不影響自然回血與聖域的每秒回血' }} />
          <StatRow label="藥水效果" value={<>+{potionEffect}%</>} tip={{ desc: '提升「藥水」的回復量。', formula: '所有「藥水效果」詞綴加總', note: '不影響治癒技能' }} />
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
            tip={{
              desc: '身上裝備與背包物品的總重量。超過上限就無法攻擊、無法施放魔法。',
              formula: '上限 = (有效力量 + 有效體質) × 100 + 腰帶負重加成',
              note: '超重時仍可移動與回血回魔；每次出手都會在戰鬥記錄顯示一次',
            }}
          />
        </div>
      </div>
    </div>
  );
}
