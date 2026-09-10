import { useState, useEffect } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import type { EquipmentTemplate } from '../../models/equipment';
import { ARMOR_STABILITY_MIN, ARMOR_STABILITY_MAX } from '../../models/equipment';
import { EQUIPMENT_TIER_NAMES } from '../../models/equipmentTier';
import { AttributeRequirement } from '../AttributeRequirement';
import { GameIcon } from '../GameIcon';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import { getBagItemAmount } from '../../models/bagItem';
import { evaluateCraftRequirements, hasCraftQuestFor } from '../../systems/craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';

import { getEquipmentTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';


export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const craftQuests = useGameStore(s => s.craftQuests);
  const acceptCraftQuest = useGameStore(s => s.acceptCraftQuest);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const [selectedRecipe, setSelectedRecipe] = useState<EquipmentTemplate | null>(null);
  const [craftTemplates, setCraftTemplates] = useState<EquipmentTemplate[]>([]);
  const [craftCategory, setCraftCategory] = useState<string>('sword');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const allTemplates = useEquipmentTemplates();

  useEffect(() => {
    setCraftTemplates(allTemplates.filter(t => t.acquireType === 'craft').sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)));
  }, [allTemplates]);

  if (!char) return null;

  /*
   * 演出只掛在畫面上，不參與判定（`48-vfx.md` § 48.1）——
   * 失敗時裝備已經被移除，卡片會跟著消失，所以用 `ghost` 存一份快照原地演完碎裂。
   */

  /**
   * 製作按鈕與製作任務外框走**同一支判定**（`36-quest-system.md` § 36.13.3）——
   * 兩邊各寫一份的話，任務會顯示「可製作」但按下去做不出來。
   */
  function canCraftRecipe(recipe: EquipmentTemplate): boolean {
    if (!char) return false;
    return evaluateCraftRequirements(recipe, bagItems, inventory).ready;
  }

  async function handleCraft() {
    if (!selectedRecipe || !char) return;
    if (!canCraftRecipe(selectedRecipe)) return;
    const settled = useGameStore.getState().craftEquipment(selectedRecipe.id!);
    // 單機同步、線上模式 Promise；訊息在同一個 click 內就要出現（單機）
    if (settled && typeof (settled as Promise<unknown>).then === 'function') {
      setResultMsg((await (settled as Promise<CraftResult>)).message);
    } else {
      setResultMsg((settled as CraftResult).message);
    }
  }

  return (
    <div className="shop-panel blacksmith-panel">
      <p className="shop-greeting">「想打什麼裝備？材料備齊了就開工。」</p>
      <div className="bs-resources">
        <span>金幣: {char.gold.toLocaleString()}G</span>
        <span>製作任務: {craftQuests.length}/{MAX_ACTIVE_CRAFT_QUESTS}</span>
      </div>


      {resultMsg && <p className="bs-result">{resultMsg}</p>}

      {/* 分類是篩選器，跟分頁一樣固定在表頭，不隨配方清單捲動 */}
      <div className="bs-craft-categories">
          {[
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
          ].map(cat => {
            const hasItems = craftTemplates.some(t => {
              if (cat.key.startsWith('armor-')) {
                return t.type === 'armor' && t.slot === cat.key.replace('armor-', '');
              }
              return t.type === cat.key;
            });
            if (!hasItems) return null;
            return (
              <button
                key={cat.key}
                className={craftCategory === cat.key ? 'active' : ''}
                onClick={() => { setCraftCategory(cat.key); setSelectedRecipe(null); }}
              >
                {cat.label}
              </button>
            );
          })}
      </div>

      {/* 只有配方清單會捲動，資源列與分類固定在上方 */}
      <div className="panel-scroll">
      <div className="shop-items">
          {craftTemplates
            .filter(recipe => {
              if (craftCategory.startsWith('armor-')) {
                return recipe.type === 'armor' && recipe.slot === craftCategory.replace('armor-', '');
              }
              return recipe.type === craftCategory;
            })
            .map(recipe => (
            <div
              key={recipe.id}
              className={`shop-item bs-shop-item ${selectedRecipe?.id === recipe.id ? 'selected' : ''} ${!canCraftRecipe(recipe) ? 'disabled-look' : ''}`}
              onClick={() => { setSelectedRecipe(recipe); setResultMsg(null); }}
            >
              <div className="shop-item-info">
                <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GameIcon name={getEquipIcon(recipe.type === 'armor' ? recipe.slot : recipe.type)} size={16} color={getEquipmentTierColor(recipe)} />
                  {recipe.name}
                </span>
                <span className="shop-item-desc">
                  {recipe.smallMonsterDamage ? `攻擊: ${recipe.smallMonsterDamage}/${recipe.largeMonsterDamage}` : ''}
                  {recipe.defense ? `防禦: ${recipe.defense}` : ''}
                  {recipe.magicAttack ? ` | 魔攻+${recipe.magicAttack}` : ''}
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
                  {recipe.material ? `${recipe.material === 'wood' ? '木' : recipe.material === 'iron' ? '鐵' : recipe.material === 'silver' ? '銀' : recipe.material === 'mithril' ? '米索利' : recipe.material === 'dragon' ? '龍' : '奧里哈魯根'} | ` : ''}
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
                <span className="shop-item-desc bs-craft-materials">
                  {recipe.craftPrerequisiteWeapon && (() => {
                    const { templateId, quantity } = recipe.craftPrerequisiteWeapon!;
                    const have = inventory.filter(i => i.templateId === templateId).length;
                    const enough = have >= quantity;
                    // 名稱只用於顯示，一律由 id 反查（§ 99.1 第 3 條）
                    const tmpl = allTemplates.find(t => t.id === templateId);
                    const name = tmpl?.name ?? `#${templateId}`;
                    const color = tmpl ? getEquipmentTierColor(tmpl) : undefined;
                    return (
                      <span className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                        <GameIcon name={getEquipIcon(tmpl?.type === 'armor' ? (tmpl.slot ?? 'chest') : (tmpl?.type ?? 'sword'))} size={14} color={color} />
                        <span className="bs-craft-mat-name" style={enough ? { color } : undefined}>{name}</span>
                        <span className="bs-craft-mat-count">{have}/{quantity}</span>
                      </span>
                    );
                  })()}
                  {(recipe.craftMaterials ?? []).map(m => {
                    const have = getBagItemAmount(bagItems, m.itemId);
                    const enough = have >= m.amount;
                    const def = getItemById(m.itemId);
                    const { icon, color, glowClass } = resolveItemIcon(def, 'material');
                    return (
                      <span key={m.itemId} className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                        <GameIcon name={icon} size={14} color={color} className={glowClass} />
                        <span className="bs-craft-mat-name" style={enough ? { color } : undefined}>{def?.name ?? '未知素材'}</span>
                        <span className="bs-craft-mat-count">{have}/{m.amount}</span>
                      </span>
                    );
                  })}
                </span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={(e) => { e.stopPropagation(); handleCraft(); }}
                  disabled={!canCraftRecipe(recipe) || selectedRecipe?.id !== recipe.id}
                >
                  製作
                </button>
                {/* 製作追蹤（§ 36.13.2）。上限 3 個，與冒險者工會分開計算 */}
                {(() => {
                  const registered = hasCraftQuestFor(craftQuests, recipe.id!);
                  if (registered) {
                    return (
                      <button
                        className="btn-danger"
                        onClick={(e) => { e.stopPropagation(); abandonCraftQuest(`craft-${recipe.id}`); }}
                      >
                        取消追蹤
                      </button>
                    );
                  }
                  const full = craftQuests.length >= MAX_ACTIVE_CRAFT_QUESTS;
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); acceptCraftQuest(recipe.id!); }}
                      disabled={full}
                      title={full ? `製作追蹤已滿（${MAX_ACTIVE_CRAFT_QUESTS}）` : undefined}
                    >
                      製作追蹤
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
      </div>
      </div>
    </div>
  );
}
