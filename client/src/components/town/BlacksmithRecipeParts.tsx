import type { EquipmentTemplate } from '../../models/equipment';
import { ARMOR_STABILITY_MIN, ARMOR_STABILITY_MAX, formatMagicAttack } from '../../models/equipment';
import { EQUIPMENT_TIER_NAMES, getEquipmentTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import { CRAFT_SOURCE_ORDER, type CraftRequirementStatus } from '../../systems/craftQuestSystem';
import { AttributeRequirement } from '../AttributeRequirement';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import { CRAFT_SOURCE_LABEL } from './BlacksmithPrereqPicker';

/** 鐵匠鋪配方分類（裝備製作、獨特製作共用） */
export const CRAFT_CATEGORIES: readonly { key: string; label: string }[] = [
  { key: 'sword', label: '單手劍' },
  { key: 'axe', label: '單手斧' },
  { key: 'mace', label: '鈍器' },
  { key: 'staff', label: '法杖' },
  { key: 'bow', label: '弓' },
  { key: 'twoHandSword', label: '雙手劍' },
  { key: 'twoHandAxe', label: '雙手斧' },
  { key: 'twoHandStaff', label: '雙手法杖' },
  { key: 'dualBlade', label: '雙刀' },
  { key: 'claw', label: '鋼爪' },
  { key: 'shield', label: '盾牌' },
  { key: 'magicBook', label: '魔導書' },
  { key: 'armGuard', label: '臂甲' },
  { key: 'armor-helmet', label: '頭盔' },
  { key: 'armor-chest', label: '胸甲' },
  { key: 'armor-shirt', label: '上衣' },
  { key: 'armor-cloak', label: '斗篷' },
  { key: 'armor-gloves', label: '手套' },
  { key: 'armor-boots', label: '鞋子' },
  { key: 'armor-belt', label: '腰帶' },
  { key: 'armor-necklace', label: '項鍊' },
  { key: 'armor-ring1', label: '戒指' },
];

export function matchesCraftCategory(recipe: EquipmentTemplate, key: string): boolean {
  if (key.startsWith('armor-')) return recipe.type === 'armor' && recipe.slot === key.replace('armor-', '');
  return recipe.type === key;
}

/** 分類按鈕列：只列有配方的分類 */
export function CraftCategoryTabs({ recipes, value, onChange }: {
  recipes: EquipmentTemplate[]; value: string; onChange: (key: string) => void;
}) {
  return (
    <div className="bs-craft-categories">
      {CRAFT_CATEGORIES.filter(cat => recipes.some(r => matchesCraftCategory(r, cat.key))).map(cat => (
        <button key={cat.key} className={value === cat.key ? 'active' : ''} onClick={() => onChange(cat.key)}>
          {cat.label}
        </button>
      ))}
    </div>
  );
}

const MATERIAL_NAMES: Record<string, string> = {
  wood: '木', iron: '鐵', silver: '銀', mithril: '米索利', dragon: '龍',
};

/** 配方卡片上半：名稱、素質、階級與職業、素質需求 */
export function RecipeSummary({ recipe }: { recipe: EquipmentTemplate }) {
  return (
    <>
      <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <GameIcon name={getEquipIcon(recipe.type === 'armor' ? recipe.slot : recipe.type)} size={16} color={getEquipmentTierColor(recipe)} />
        {recipe.name}
      </span>
      <span className="shop-item-desc">
        {recipe.smallMonsterDamage ? `攻擊: ${recipe.smallMonsterDamage}/${recipe.largeMonsterDamage}` : ''}
        {recipe.defense ? `防禦: ${recipe.defense}` : ''}
        {recipe.magicAttack ? ` | 魔攻+${formatMagicAttack(recipe.magicAttack)}` : ''}
        {recipe.blockRate ? ` | 格擋${recipe.blockRate}%` : ''}
        {recipe.attackSuccess ? ` | 命中+${recipe.attackSuccess}` : ''}
        {recipe.extraAttack ? ` | 額攻+${recipe.extraAttack}` : ''}
        {recipe.hpRegen ? ` | 回血+${recipe.hpRegen}` : ''}
        {recipe.mpRegen ? ` | 回魔+${recipe.mpRegen}` : ''}
        {recipe.bonusHp ? ` | HP+${recipe.bonusHp}` : ''}
        {recipe.bonusMp ? ` | MP+${recipe.bonusMp}` : ''}
        {recipe.bonusBagSlots ? ` | 背包格子+${recipe.bonusBagSlots}` : ''}
        {recipe.bonusWeight ? ` | 負重+${recipe.bonusWeight}` : ''}
      </span>
      <span className="shop-item-desc">
        {recipe.bonusStats ? `${recipe.bonusStats} | ` : ''}
        {recipe.material ? `${MATERIAL_NAMES[recipe.material] ?? '奧里哈魯根'} | ` : ''}
        重量{recipe.weight ?? '—'}
        {/* 防具的安定值在製作當下才抽（§ 6.10），配方只能標出範圍 */}
        {` | 安定值${recipe.stability ?? `${ARMOR_STABILITY_MIN}~${ARMOR_STABILITY_MAX}`}`}
        {` | ${recipe.canBreak === false ? '不壞刀' : '會壞刀'}`}
      </span>
      <span className="shop-item-desc">
        {recipe.tier != null ? `${EQUIPMENT_TIER_NAMES[recipe.tier]} | ` : ''}
        {recipe.requiredClass && recipe.requiredClass.length > 0
          ? recipe.requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、')
          : '全職業'}
      </span>
      {/* § 6A.8.8 素質需求：做得出來不等於穿得動，未達標的屬性標紅 */}
      <AttributeRequirement requirement={recipe.requiredAttributes} className="shop-item-desc" />
    </>
  );
}

/**
 * 需求列：製作費、前置裝備、素材（`06-equipment-acquire.md` § 6A.3）。
 * 素材數量為三處合計，hover 看各處存量（§ 6A.3「取用來源」）。
 */
export function RecipeRequirementChips({ status, templates }: { status: CraftRequirementStatus; templates: EquipmentTemplate[] }) {
  const { gold, prerequisite } = status;
  // 名稱只用於顯示，一律由 id 反查（§ 99.1 第 3 條）
  const prereqTemplate = prerequisite ? templates.find(t => t.id === prerequisite.templateId) : undefined;
  const prereqColor = prereqTemplate ? getEquipmentTierColor(prereqTemplate) : undefined;
  return (
    <span className="shop-item-desc bs-craft-materials">
      <span className={`bs-craft-mat ${gold.enough ? '' : 'lacking'}`}>
        <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
        <span className="bs-craft-mat-name" style={gold.enough ? { color: 'var(--accent-gold)' } : undefined}>金幣</span>
        <span className="bs-craft-mat-count">{gold.have.toLocaleString()}/{gold.need.toLocaleString()}</span>
      </span>
      {prerequisite && (
        <span className={`bs-craft-mat ${prerequisite.enough ? '' : 'lacking'}`}>
          <GameIcon
            name={getEquipIcon(prereqTemplate?.type === 'armor' ? (prereqTemplate.slot ?? 'chest') : (prereqTemplate?.type ?? 'sword'))}
            size={14} color={prereqColor}
          />
          <span className="bs-craft-mat-name" style={prerequisite.enough ? { color: prereqColor } : undefined}>
            {prereqTemplate?.name ?? `#${prerequisite.templateId}`}
          </span>
          <span className="bs-craft-mat-count">{prerequisite.have}/{prerequisite.need}</span>
        </span>
      )}
      {status.materials.map(m => {
        const def = getItemById(m.itemId);
        const { icon, color, glowClass } = resolveItemIcon(def, 'material');
        return (
          <Tooltip
            key={m.itemId}
            position="top"
            content={(
              <div className="bs-mat-source-tooltip">
                {CRAFT_SOURCE_ORDER.map(source => <div key={source}>{CRAFT_SOURCE_LABEL[source]} {m.bySource[source]}</div>)}
              </div>
            )}
          >
            <span className={`bs-craft-mat ${m.enough ? '' : 'lacking'}`}>
              <GameIcon name={icon} size={14} color={color} className={glowClass} />
              <span className="bs-craft-mat-name" style={m.enough ? { color } : undefined}>{def?.name ?? '未知素材'}</span>
              <span className="bs-craft-mat-count">{m.have}/{m.need}</span>
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
