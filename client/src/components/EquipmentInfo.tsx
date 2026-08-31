import { getWeaponRange, isRangedWeapon, SLOT_NAMES } from '../models/equipment';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import { formatAffixDisplay, isMaxRollAffix, isSpecialAffixType, isTierlessAffixType, shouldBoldAffix } from '../models/affix';
import { CLASS_NAMES_ZH } from '../models/character';
import { ATTRIBUTE_NAMES_ZH } from '../models/attributes';
import { DEFENSE_BONUS_MAX } from '../models/equipment';
import { useGameStore } from '../stores/gameStore';
import { getEffectiveGearArray, getUnmetAttributes } from '../systems/gear';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';
import { getEquipmentTierColor, getEquipmentInstanceTierColor, getEquipmentTierLevel, getEquipmentInstanceTierLevel } from '../models/equipmentTier';

const MATERIAL_NAMES: Record<string, string> = {
  wood: '木',
  iron: '鐵',
  silver: '銀',
  mithril: '米索利',
  dragon: '龍材質',
  orichalcum: '奧里哈魯根',
};

function getClassDisplay(requiredClass?: string[]): string {
  if (!requiredClass || requiredClass.length === 0) return '全職業';
  return requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、');
}

function isStaff(type: string): boolean {
  return type === 'staff' || type === 'twoHandStaff';
}

/**
 * 素質需求還沒達標的屬性（`06-equipment.md` § 6A.8.8）。
 * 沒有角色時（角色選擇畫面、Wiki）一律當作達標 —— 那裡沒有可比對的屬性。
 */
function useUnmetAttributes(item: EquipmentInstance): (keyof typeof ATTRIBUTE_NAMES_ZH)[] {
  const character = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  if (!item.requiredAttributes || !character) return [];
  const gear = getEffectiveGearArray(character, activeEffects, equippedGear);
  return getUnmetAttributes(character, activeEffects, gear, item);
}

/**
 * 本角色的職業是否不在該件的 `requiredClass` 內（`06-equipment.md` § 6.6）。
 * 沒有角色時（角色選擇畫面、Wiki）一律當作符合。
 */
function useClassMismatch(requiredClass?: string[]): boolean {
  const className = useGameStore(s => s.character?.className);
  if (!requiredClass?.length || !className) return false;
  return !requiredClass.includes(className);
}

interface EquipmentDetailProps {
  item: EquipmentInstance;
  hint?: string;
  compact?: boolean;
  templates?: EquipmentTemplate[];
}

export function EquipmentDetail({ item, hint, compact, templates }: EquipmentDetailProps) {
  const isWeapon = !!(item.smallMonsterDamage || item.largeMonsterDamage);
  const enhancement = item.enhancement ?? 0;
  const enhanceAttackSuccess = Math.floor(enhancement / 2);
  const enhanceMagicAttack = isStaff(item.type) ? Math.floor(enhancement / 2) : 0;
  const baseAttackSuccess = item.attackSuccess ?? 0;
  const baseExtraAttack = item.extraAttack ?? 0;
  const totalAttackSuccess = baseAttackSuccess + enhanceAttackSuccess;
  const tierColor = templates ? getEquipmentInstanceTierColor(item, templates) : '#FFFFFF';
  // 「裝備Tier」與「詞綴 Tier」同為 1~7 但意義不同，標籤必須寫清楚（`06-equipment-acquire.md` § 6A.1）
  const tierLevel = templates ? getEquipmentInstanceTierLevel(item, templates) : 0;
  const defenseBonus = item.defenseBonus ?? 0;
  const defenseTotal = (item.defense ?? 0) + defenseBonus + enhancement;
  const unmet = useUnmetAttributes(item);
  const frozen = unmet.length > 0;
  const classMismatch = useClassMismatch(item.requiredClass);

  return (
    <div className="equip-detail">
      <div className="equip-detail-name" style={{ display: 'flex', alignItems: 'center', gap: 4, color: tierColor }}>
        <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={tierColor} />
        {item.name} {enhancement > 0 ? `+${enhancement}` : ''}
      </div>
      {!compact && <div className="equip-detail-slot">{SLOT_NAMES[item.slot]}{item.isTwoHanded ? '（雙手）' : ''}</div>}
      {!compact && tierLevel > 0 && (
        <div className="equip-detail-tier" style={{ color: tierColor }}>裝備Tier: {tierLevel}</div>
      )}
      {isWeapon && (
        <div className="equip-detail-stat">
          攻擊: {item.smallMonsterDamage}{enhancement > 0 ? `+${enhancement}` : ''}/{item.largeMonsterDamage}{enhancement > 0 ? `+${enhancement}` : ''}
        </div>
      )}
      {/* § 21.5 防禦是三段：基礎 + 隨機額外(+0~+2) + 強化。基礎 0 的 T4 上衣照樣要顯示 */}
      {!isWeapon && defenseTotal > 0 && (
        <div className="equip-detail-stat">
          防禦: {item.defense ?? 0}
          {defenseBonus > 0 && (
            <span
              className={defenseBonus >= DEFENSE_BONUS_MAX ? 'equip-detail-maxroll' : undefined}
              title={defenseBonus >= DEFENSE_BONUS_MAX ? '隨機額外防禦為最大值' : '隨機額外防禦'}
            >+{defenseBonus}</span>
          )}
          {enhancement > 0 ? `+${enhancement}` : ''}
        </div>
      )}
      {(item.blockRate ?? 0) > 0 && (
        <div className="equip-detail-stat">格擋率: {item.blockRate}%</div>
      )}
      {/* 只有遠程武器標射程：近戰 1.5 是預設，13/14 種武器印出來等於多一行零資訊 */}
      {isWeapon && isRangedWeapon(item.type) && (
        <div className="equip-detail-stat">射程: {getWeaponRange(item.type)} 格</div>
      )}
      {isWeapon && totalAttackSuccess > 0 && (
        <div className="equip-detail-stat">攻擊成功: +{totalAttackSuccess}</div>
      )}
      {isWeapon && baseExtraAttack > 0 && (
        <div className="equip-detail-stat">額外攻擊: +{baseExtraAttack}</div>
      )}
      {isWeapon && enhanceMagicAttack > 0 && (
        <div className="equip-detail-stat">魔法攻擊: +{enhanceMagicAttack}</div>
      )}
      {!isWeapon && (item.magicAttack ?? 0) > 0 && (
        <div className="equip-detail-stat">魔法攻擊: +{item.magicAttack}</div>
      )}
      {(item.bonusHp ?? 0) > 0 && (
        <div className="equip-detail-stat">HP+{item.bonusHp}</div>
      )}
      {(item.bonusMp ?? 0) > 0 && (
        <div className="equip-detail-stat">MP+{item.bonusMp}</div>
      )}
      {(item.hpRegen ?? 0) > 0 && (
        <div className="equip-detail-stat">回血+{item.hpRegen}</div>
      )}
      {(item.mpRegen ?? 0) > 0 && (
        <div className="equip-detail-stat">回魔+{item.mpRegen}</div>
      )}
      {(item.bonusBagSlots ?? 0) > 0 && (
        <div className="equip-detail-stat">背包格子+{item.bonusBagSlots}</div>
      )}
      {/* 腰帶的負重加成（`35-inventory-constraints.md` § 35.2.1），拉高負重上限而非物品重量 */}
      {(item.bonusWeight ?? 0) > 0 && (
        <div className="equip-detail-stat">負重+{item.bonusWeight}</div>
      )}
      {item.bonusStats && (
        <div className="equip-detail-stat">{item.bonusStats}</div>
      )}
      {!compact && isWeapon && item.material && (
        <div className="equip-detail-stat">材質: {MATERIAL_NAMES[item.material] ?? item.material}</div>
      )}
      {!compact && (item.weight ?? 0) > 0 && (
        <div className="equip-detail-stat">重量: {item.weight}</div>
      )}
      {item.quality > 0 && (
        <div className="equip-detail-stat">品質: {item.quality}%</div>
      )}
      {/* 詞綴只在完整模式顯示：裝備欄十二個欄位各印四條詞綴會把面板灌爆，改由 hover tooltip 呈現 */}
      {/* 魔導書／臂甲有素質需求也仍有職業限制（§ 6.6），不能因為有素質需求就略過這列 */}
      {!compact && (!item.requiredAttributes || (item.requiredClass?.length ?? 0) > 0) && (
        <div className={`equip-detail-class${classMismatch ? ' equip-detail-unmet' : ''}`}>
          可用職業: {getClassDisplay(item.requiredClass)}
        </div>
      )}
      {/* § 6A.8.8 素質需求。未達標的屬性標紅，該件的詞綴全部凍結 */}
      {item.requiredAttributes && (
        <div className={`equip-detail-stat${frozen ? ' equip-detail-unmet' : ''}`}>
          素質需求:{' '}
          {(Object.keys(item.requiredAttributes) as (keyof typeof ATTRIBUTE_NAMES_ZH)[]).map((k, i) => (
            <span key={k} className={unmet.includes(k) ? 'equip-detail-unmet-attr' : undefined}>
              {i > 0 ? ' / ' : ''}{ATTRIBUTE_NAMES_ZH[k]} {item.requiredAttributes![k]}
            </span>
          ))}
        </div>
      )}
      {!compact && frozen && (
        <div className="equip-detail-frozen">素質不足 · 詞綴未生效</div>
      )}
      {!compact && item.affixes && item.affixes.length > 0 && (
        <div className={`equip-detail-affixes${frozen ? ' is-frozen' : ''}`}>
          {item.affixes.map((affix, i) => (
            // § 7.10.5 特殊詞綴：金色顯示、標記 [特殊]、無 Tier，且不吃品質加成
            isSpecialAffixType(affix.type) ? (
              <div key={i} className="equip-detail-affix special" title="特殊詞綴，無法強化">
                {formatAffixDisplay(affix)}
              </div>
            ) : (
              // § 7.3.2 滾到該 Tier 上限的詞綴以粗體標示；額外屬性無 Tier，一律粗體
              <div
                key={i}
                className={`equip-detail-affix tier-${affix.tier}${shouldBoldAffix(affix) ? ' max-roll' : ''}`}
                title={
                  isTierlessAffixType(affix.type) ? '額外屬性無 Tier，印記只能重骰不能升階'
                    : isMaxRollAffix(affix) ? '此詞綴為該 Tier 最大值' : undefined
                }
              >
                {formatAffixDisplay(affix, item.quality)}
              </div>
            )
          ))}
        </div>
      )}
      {hint && <div className="equip-detail-hint">{hint}</div>}
    </div>
  );
}

interface EquipmentTemplateDetailProps {
  template: EquipmentTemplate;
  hint?: string;
}

export function EquipmentTemplateDetail({ template, hint }: EquipmentTemplateDetailProps) {
  const isWeapon = !!(template.smallMonsterDamage || template.largeMonsterDamage);
  const templateClassMismatch = useClassMismatch(template.requiredClass);
  const baseAttackSuccess = template.attackSuccess ?? 0;
  const baseExtraAttack = template.extraAttack ?? 0;
  const tierColor = getEquipmentTierColor(template);
  const templateTier = getEquipmentTierLevel(template);

  return (
    <div className="equip-detail">
      <div className="equip-detail-name" style={{ display: 'flex', alignItems: 'center', gap: 4, color: tierColor }}>
        <GameIcon name={getEquipIcon(template.type === 'armor' ? template.slot : template.type)} size={16} color={tierColor} />
        {template.name}
      </div>
      <div className="equip-detail-slot">{SLOT_NAMES[template.slot]}{template.isTwoHanded ? '（雙手）' : ''}</div>
      {templateTier > 0 && (
        <div className="equip-detail-tier" style={{ color: tierColor }}>裝備Tier: {templateTier}</div>
      )}
      {isWeapon && (
        <div className="equip-detail-stat">攻擊: {template.smallMonsterDamage}/{template.largeMonsterDamage}</div>
      )}
      {!isWeapon && template.defense != null && template.defense > 0 && (
        <div className="equip-detail-stat">防禦: {template.defense}</div>
      )}
      {(template.blockRate ?? 0) > 0 && (
        <div className="equip-detail-stat">格擋率: {template.blockRate}%</div>
      )}
      {isWeapon && isRangedWeapon(template.type) && (
        <div className="equip-detail-stat">射程: {getWeaponRange(template.type)} 格</div>
      )}
      {isWeapon && baseAttackSuccess > 0 && (
        <div className="equip-detail-stat">攻擊成功: +{baseAttackSuccess}</div>
      )}
      {isWeapon && baseExtraAttack > 0 && (
        <div className="equip-detail-stat">額外攻擊: +{baseExtraAttack}</div>
      )}
      {(template.magicAttack ?? 0) > 0 && (
        <div className="equip-detail-stat">魔法攻擊: +{template.magicAttack}</div>
      )}
      {(template.bonusHp ?? 0) > 0 && (
        <div className="equip-detail-stat">HP+{template.bonusHp}</div>
      )}
      {(template.bonusMp ?? 0) > 0 && (
        <div className="equip-detail-stat">MP+{template.bonusMp}</div>
      )}
      {(template.hpRegen ?? 0) > 0 && (
        <div className="equip-detail-stat">回血+{template.hpRegen}</div>
      )}
      {(template.mpRegen ?? 0) > 0 && (
        <div className="equip-detail-stat">回魔+{template.mpRegen}</div>
      )}
      {(template.bonusBagSlots ?? 0) > 0 && (
        <div className="equip-detail-stat">背包格子+{template.bonusBagSlots}</div>
      )}
      {/* 腰帶的負重加成（`35-inventory-constraints.md` § 35.2.1），拉高負重上限而非物品重量 */}
      {(template.bonusWeight ?? 0) > 0 && (
        <div className="equip-detail-stat">負重+{template.bonusWeight}</div>
      )}
      {template.bonusStats && (
        <div className="equip-detail-stat">{template.bonusStats}</div>
      )}
      {isWeapon && template.material && (
        <div className="equip-detail-stat">材質: {MATERIAL_NAMES[template.material] ?? template.material}</div>
      )}
      {(template.weight ?? 0) > 0 && (
        <div className="equip-detail-stat">重量: {template.weight}</div>
      )}
      <div className={`equip-detail-class${templateClassMismatch ? ' equip-detail-unmet' : ''}`}>
        可用職業: {getClassDisplay(template.requiredClass)}
      </div>
      {hint && <div className="equip-detail-hint">{hint}</div>}
    </div>
  );
}
