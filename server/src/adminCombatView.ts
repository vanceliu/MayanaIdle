/**
 * 管理介面角色查詢的能力值、技能、快捷列（`97-selfhosted-server.md` § 97.8）。
 * 能力值同遊戲能力值面板（`systems/characterStatSheet.ts`），技能 tooltip 同遊戲技能面板（`models/skillTooltipText.ts`）；不含 buff。
 */
import type { Character } from '../../client/src/models/character';
import type { EquipmentInstance, EquippedGear } from '../../client/src/models/equipment';
import { characterStatSheet, type StatGroupData } from '../../client/src/systems/characterStatSheet';
import { getEffectiveGearArray } from '../../client/src/systems/gear';
import { getMaxHp, getMaxMp } from '../../client/src/systems/maxHpMp';
import { calculateHealAmount, getBasicAttackElement, getEquippedWeapon, previewSkillPhysicalDamage } from '../../client/src/systems/combat';
import { getSkillTemplate } from '../../client/src/models/skillTemplate';
import { resolveSkill, resolveSkillWithoutStars, skillCategoryLabel, starLevelRoman, starLevelSuffix } from '../../client/src/models/skillStar';
import { skillTooltipLines, skillTooltipTagRows, type SkillTagRow, type SkillTooltipLine } from '../../client/src/models/skillTooltipText';
import { getSkillDisplayIcon, SKILL_ELEMENT_COLORS } from '../../client/src/models/iconMap';
import { getQuickSlotItemName, normalizeQuickSlots, quickSlotLabel } from '../../client/src/models/quickSlot';
import type { BagItemLike } from '../../client/src/systems/weight';
import { ICONS } from './generated/iconsIndex';

export interface SkillCell {
  icon: string;
  color: string;
  name: string;
  /** 星盤等級 I／II／III，沒有星盤等級為空字串 */
  star: string;
  tip: {
    name: string;
    category: string;
    tagRows: SkillTagRow[];
    level: number;
    lines: SkillTooltipLine[];
  };
}

export interface CombatView {
  maxHp: number;
  maxMp: number;
  stats: StatGroupData[];
  skills: SkillCell[];
  /** 快捷列 1~0，空格為 null */
  quickSlots: { key: string; name: string | null }[];
  icons: Record<string, string>;
}

export function buildCombatView(
  char: Character,
  equipment: EquipmentInstance[],
  bag: BagItemLike[],
  savedQuickSlots: unknown,
): CombatView {
  const equippedGear: EquippedGear = {};
  for (const e of equipment) if (e.equipped) equippedGear[e.slot] = e;
  const gear = getEffectiveGearArray(char, [], equippedGear);
  const weaponElement = getBasicAttackElement(getEquippedWeapon(gear), []);

  const skills = (char.skills ?? []).flatMap((learned): SkillCell[] => {
    const base = getSkillTemplate(learned.id);
    if (!base) return [];
    const shown = resolveSkill({ ...base, lastUsedAt: 0 }, gear, char, []);
    const floor = resolveSkillWithoutStars({ ...base, lastUsedAt: 0 }, gear, char, []);
    return [{
      icon: getSkillDisplayIcon(base),
      color: SKILL_ELEMENT_COLORS[base.element || 'none'] ?? SKILL_ELEMENT_COLORS.none,
      name: base.name,
      star: starLevelRoman(base, char),
      tip: {
        name: base.name + starLevelSuffix(base, char),
        category: skillCategoryLabel(base),
        tagRows: skillTooltipTagRows(base, shown, weaponElement),
        level: base.level,
        lines: skillTooltipLines({
          base, shown, references: [floor],
          healOf: power => calculateHealAmount(char, power, gear, []),
          physicalOf: (scale, normal) => previewSkillPhysicalDamage(char, gear, [], scale, normal),
        }),
      },
    }];
  });

  const quickSlots = normalizeQuickSlots(savedQuickSlots, new Set((char.skills ?? []).map(s => s.id)))
    .map((entry, i) => ({ key: quickSlotLabel(i), name: entry ? getQuickSlotItemName(entry) : null }));

  const icons: Record<string, string> = {};
  for (const s of skills) if (ICONS[s.icon]) icons[s.icon] = ICONS[s.icon];

  return {
    maxHp: getMaxHp(char, gear),
    maxMp: getMaxMp(char, gear),
    stats: characterStatSheet(char, equippedGear, [], bag),
    skills,
    quickSlots,
    icons,
  };
}
