import type { Attributes } from '../models/attributes';
import { attributeRequirementEntries } from '../models/attributes';
import type { EquipmentInstance } from '../models/equipment';
import { useGameStore } from '../stores/gameStore';
import { getEffectiveGearArray, getUnmetRequirement } from '../systems/gear';

interface AttributeRequirementProps {
  requirement?: Partial<Attributes>;
  /** 已經是手上這一件時傳進來：判定要排掉它自己的額外屬性（§ 6A.8.8） */
  exclude?: EquipmentInstance;
  className?: string;
}

/**
 * 素質需求一行（`06-equipment.md` § 6A.8.8）。背包、裝備欄、商店、鐵匠鋪共用這一份。
 *
 * 未達標的屬性逐項標紅 —— 商店與鐵匠鋪的意義是「買／做得出來但穿不動」，
 * 買下去或做出來才發現詞綴全凍結是最貴的一種驚喜。
 */
export function AttributeRequirement({ requirement, exclude, className }: AttributeRequirementProps) {
  const character = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);

  if (!requirement) return null;
  const entries = attributeRequirementEntries(requirement);
  if (entries.length === 0) return null;

  // 沒有角色時（角色選擇畫面、Wiki）一律當作達標 —— 那裡沒有可比對的屬性
  const unmet = character
    ? getUnmetRequirement(
        character,
        activeEffects,
        getEffectiveGearArray(character, activeEffects, equippedGear),
        requirement,
        exclude,
      )
    : [];

  return (
    <div className={`equip-detail-stat${unmet.length > 0 ? ' equip-detail-unmet' : ''}${className ? ` ${className}` : ''}`}>
      素質需求:{' '}
      {entries.map((entry, i) => (
        <span key={entry.key} className={unmet.includes(entry.key) ? 'equip-detail-unmet-attr' : undefined}>
          {i > 0 ? ' / ' : ''}{entry.label} {entry.value}
        </span>
      ))}
    </div>
  );
}
