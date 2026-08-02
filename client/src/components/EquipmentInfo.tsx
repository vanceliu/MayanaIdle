import type { EquipmentInstance, EquipmentTemplate, EquipSlot } from '../models/equipment';
import { AFFIX_DEFINITIONS, getEffectiveAffixValue, isSpecialAffixType, getSpecialAffixDefinition } from '../models/affix';
import { CLASS_NAMES_ZH } from '../models/character';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';
import { getEquipmentTierColor, getEquipmentInstanceTierColor, getEquipmentTierLevel, getEquipmentInstanceTierLevel } from '../models/equipmentTier';

const SLOT_NAMES: Record<EquipSlot, string> = {
  rightHand: '右手',
  leftHand: '左手',
  helmet: '頭盔',
  chest: '胸甲',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指1',
  ring2: '戒指2',
};

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
  // 「裝備Tier」與「詞綴 Tier」同為 1~7 但意義不同，標籤必須寫清楚（§ 6A.8）
  const tierLevel = templates ? getEquipmentInstanceTierLevel(item, templates) : 0;

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
      {!isWeapon && item.defense != null && item.defense > 0 && (
        <div className="equip-detail-stat">防禦: {item.defense}{enhancement > 0 ? `+${enhancement}` : ''}</div>
      )}
      {(item.blockRate ?? 0) > 0 && (
        <div className="equip-detail-stat">格擋率: {item.blockRate}%</div>
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
      {item.affixes && item.affixes.length > 0 && (
        <div className="equip-detail-affixes">
          {item.affixes.map((affix, i) => {
            // § 7.10.5 特殊詞綴：金色顯示、標記 [特殊]、無 Tier
            if (isSpecialAffixType(affix.type)) {
              const sDef = getSpecialAffixDefinition(affix.type);
              return (
                <div key={i} className="equip-detail-affix special" title="特殊詞綴，無法強化">
                  [特殊] {sDef?.name}
                </div>
              );
            }
            const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
            const effectiveValue = getEffectiveAffixValue(affix, item.quality);
            return (
              <div key={i} className={`equip-detail-affix tier-${affix.tier}`}>
                {def?.name} +{effectiveValue}% (T{affix.tier})
              </div>
            );
          })}
        </div>
      )}
      {!compact && <div className="equip-detail-class">可用職業: {getClassDisplay(item.requiredClass)}</div>}
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
      {template.bonusStats && (
        <div className="equip-detail-stat">{template.bonusStats}</div>
      )}
      {isWeapon && template.material && (
        <div className="equip-detail-stat">材質: {MATERIAL_NAMES[template.material] ?? template.material}</div>
      )}
      {(template.weight ?? 0) > 0 && (
        <div className="equip-detail-stat">重量: {template.weight}</div>
      )}
      <div className="equip-detail-class">可用職業: {getClassDisplay(template.requiredClass)}</div>
      {hint && <div className="equip-detail-hint">{hint}</div>}
    </div>
  );
}
