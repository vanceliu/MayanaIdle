import { useState, useEffect } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { ARMOR_STABILITY_MIN, ARMOR_STABILITY_MAX } from '../../models/equipment';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage, CRAFT_MAX_AFFIX_TIER, type AffixCategory, type Affix } from '../../models/affix';
import { EQUIPMENT_TIER_NAMES } from '../../models/equipmentTier';
import { GameIcon } from '../GameIcon';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import { getBagItemAmount, consumeBagItem } from '../../models/bagItem';
import { evaluateCraftRequirements, hasCraftQuestFor, removeCraftQuestByTemplate } from '../../systems/craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';

import { getEquipmentTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { db } from '../../db/database';
import { resolveEquipment, rollNewInstanceFields } from '../../systems/templateSync';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';

/**
 * 製作品的詞綴（§ 6A.6）：4 個、Tier **T1~T5 均等隨機**、不出特殊詞綴。
 *
 * 這裡走與商店／掉落同一支 `generateAffixes`，只是帶不同選項。
 * 改版前這裡是另一份複製的實作，規則一樣但程式碼分開，很容易單邊改動就走鐘。
 *
 * **這也是「製作版 T6」與「掉落版 T6」的差別所在**：模板素質相同，
 * 但掉落版可以帶 T6/T7 詞綴與特殊詞綴，製作版最高只有 T5、且不會有特殊詞綴。
 */
function generateCraftAffixes(
  category: AffixCategory,
  tpl?: { smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): Affix[] {
  return generateAffixes(category, 1, 4, false, {
    maxTier: CRAFT_MAX_AFFIX_TIER,
    uniformTier: true,
    noSpecialAffix: true,
    ...(tpl ? { weaponBaseDamage: getWeaponBaseDamage(tpl) } : {}),
  });
}

export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
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
    db.equipmentTemplates
      .filter(t => t.acquireType === 'craft')
      .toArray()
      .then(arr => setCraftTemplates(arr.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))));
  }, []);

  if (!char) return null;

  function persistBagItem(itemId: number, newAmount: number) {
    if (!char?.id) return;
    const rows = db.characterBag.where({ characterId: char.id, itemTemplateId: itemId });
    if (newAmount <= 0) {
      rows.delete();
    } else {
      rows.modify({ amount: newAmount });
    }
  }

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
    if (!selectedRecipe.craftMaterials?.length) return;
    const currentInv = useGameStore.getState().inventory;
    const currentBag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(currentBag, currentInv, equippedGear) >= getBagMaxSlots(equippedGear)) return;

    let newBag = [...useGameStore.getState().bagItems];
    for (const mat of selectedRecipe.craftMaterials) {
      const newAmount = getBagItemAmount(newBag, mat.itemId) - mat.amount;
      persistBagItem(mat.itemId, newAmount);
      newBag = consumeBagItem(newBag, mat.itemId, mat.amount);
    }

    let newInvAfterPrereq = [...currentInv];
    if (selectedRecipe.craftPrerequisiteWeapon) {
      const { templateId, quantity } = selectedRecipe.craftPrerequisiteWeapon;
      let removed = 0;
      for (const item of currentInv) {
        if (removed >= quantity) break;
        if (item.templateId === templateId) {
          if (item.id) await db.equipmentInstances.delete(item.id);
          newInvAfterPrereq = newInvAfterPrereq.filter(i => i.id !== item.id);
          removed++;
        }
      }
    }

    const affixCategory: AffixCategory = getAffixCategoryForSlot(selectedRecipe.slot, selectedRecipe.type);
    const craftedAffixes = generateCraftAffixes(affixCategory, selectedRecipe);

    const dbRecord = {
      templateId: selectedRecipe.id!,
      slot: selectedRecipe.slot,
      quality: 0,
      enhancement: 0,
      ...rollNewInstanceFields(selectedRecipe),
      affixes: craftedAffixes,
      ownerId: char.id!,
      equipped: false,
    };

    const id = char.id ? await db.equipmentInstances.add(dbRecord as any) : undefined;

    const newEquip: EquipmentInstance = resolveEquipment({
      id: id as number,
      templateId: selectedRecipe.id!,
      name: selectedRecipe.name,
      type: selectedRecipe.type,
      slot: selectedRecipe.slot,
      isTwoHanded: selectedRecipe.isTwoHanded,
      quality: 0,
      enhancement: 0,
      ...rollNewInstanceFields(selectedRecipe),
      affixes: craftedAffixes,
      ownerId: char.id!,
      equipped: false,
    });

    const newInv = [...newInvAfterPrereq, newEquip];
    useGameStore.setState({
      bagItems: newBag,
      inventory: newInv,
      // § 36.13.5：製作成功即移除同配方的任務。沒追蹤過時是 no-op
      craftQuests: removeCraftQuestByTemplate(
        useGameStore.getState().craftQuests,
        selectedRecipe.id!,
      ),
    });

    setResultMsg(`製作成功！獲得 ${selectedRecipe.name}`);
    const craftStats = { ...useGameStore.getState().statistics, equipmentCrafted: useGameStore.getState().statistics.equipmentCrafted + 1 };
    useGameStore.setState({ statistics: craftStats });
    useGameStore.getState().saveState();
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
