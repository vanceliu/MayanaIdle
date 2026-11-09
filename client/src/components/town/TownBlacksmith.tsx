import { useState, useMemo } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import type { EquipmentTemplate } from '../../models/equipment';
import { ARMOR_STABILITY_MIN, ARMOR_STABILITY_MAX } from '../../models/equipment';
import { EQUIPMENT_TIER_NAMES } from '../../models/equipmentTier';
import { AttributeRequirement } from '../AttributeRequirement';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import { EquipmentDetail } from '../EquipmentInfo';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import { getBagItemAmount } from '../../models/bagItem';
import { evaluateCraftRequirements, hasCraftQuestFor } from '../../systems/craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';
import { getDismantleYield } from '../../systems/crafting';
import type { EquipmentInstance } from '../../models/equipment';

import { getEquipmentTierColor, getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import {
  craftRequiresAbility, getAbilityCommonPool, getAbilityClassPool, getAbilityDefinition, rollAbility,
  formatAbilityEffect, type AbilityType,
} from '../../models/ability';

type BlacksmithTab = 'craft' | 'dismantle';

export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const craftQuests = useGameStore(s => s.craftQuests);
  const acceptCraftQuest = useGameStore(s => s.acceptCraftQuest);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const [selectedRecipe, setSelectedRecipe] = useState<EquipmentTemplate | null>(null);
  const [craftCategory, setCraftCategory] = useState<string>('sword');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<BlacksmithTab>('craft');
  /** 各配方指定的隨機技能（`07-affix-ability.md` § 7S.6） */
  const [abilityChoices, setAbilityChoices] = useState<Record<number, AbilityType>>({});
  const allTemplates = useEquipmentTemplates();
  const craftTemplates = useMemo(
    () => allTemplates.filter(t => t.acquireType === 'craft').sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)),
    [allTemplates],
  );

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
    return evaluateCraftRequirements(recipe, bagItems, inventory, char.gold).ready;
  }

  /** 該配方指定的隨機技能；不在本角色可選範圍內時視為未指定 */
  function chosenAbility(recipe: EquipmentTemplate): AbilityType | undefined {
    const chosen = abilityChoices[recipe.id!];
    if (!chosen || !char) return undefined;
    const options = [...getAbilityCommonPool(recipe), ...getAbilityClassPool(recipe, char.className)];
    return options.includes(chosen) ? chosen : undefined;
  }

  function isAbilityReady(recipe: EquipmentTemplate): boolean {
    return !craftRequiresAbility(recipe) || chosenAbility(recipe) !== undefined;
  }

  async function handleCraft() {
    if (!selectedRecipe || !char) return;
    if (!canCraftRecipe(selectedRecipe) || !isAbilityReady(selectedRecipe)) return;
    const settled = useGameStore.getState().craftEquipment(selectedRecipe.id!, chosenAbility(selectedRecipe));
    // 單機同步、線上模式 Promise；訊息在同一個 click 內就要出現（單機）
    if (settled && typeof (settled as Promise<unknown>).then === 'function') {
      setResultMsg((await (settled as Promise<CraftResult>)).message);
    } else {
      setResultMsg((settled as CraftResult).message);
    }
  }

  // 拆解清單：背包中未裝備且模板有配方的實例（§ 6A.3「拆解」）
  const dismantlable = inventory
    .map(item => ({ item, yields: getDismantleYield(allTemplates.find(t => t.id === item.templateId)) }))
    .filter((e): e is { item: EquipmentInstance; yields: NonNullable<typeof e.yields> } => e.yields !== null);

  async function handleDismantle(item: EquipmentInstance) {
    const warning = item.enhancement > 0 ? `\n強化 +${item.enhancement} 不退還。` : '';
    if (!window.confirm(`確定拆解 ${item.name}？只退還一半材料。${warning}`)) return;
    const result = await useGameStore.getState().dismantleEquipment(item.id!);
    setResultMsg(result.message);
  }

  return (
    <div className="shop-panel blacksmith-panel">
      <p className="shop-greeting">「想打什麼裝備？」</p>
      <div className="bs-resources">
        <span>金幣: {char.gold.toLocaleString()}G</span>
        <span>製作任務: {craftQuests.length}/{MAX_ACTIVE_CRAFT_QUESTS}</span>
      </div>


      <div className="shop-tabs">
        <button className={tab === 'craft' ? 'active' : ''} onClick={() => { setTab('craft'); setResultMsg(null); }}>裝備製作</button>
        <button className={tab === 'dismantle' ? 'active' : ''} onClick={() => { setTab('dismantle'); setResultMsg(null); }}>裝備拆解</button>
      </div>

      {resultMsg && <p className="bs-result">{resultMsg}</p>}

      {tab === 'dismantle' && (
        <div className="panel-scroll">
          <p className="shop-item-desc">退還一半材料，前置裝備不退；身上的裝備不能拆。</p>
          {dismantlable.length === 0 && <p className="shop-item-desc">背包裡沒有可拆解的裝備</p>}
          <div className="shop-items">
            {dismantlable.map(({ item, yields }) => {
              const color = getEquipmentInstanceTierColor(item, allTemplates);
              return (
                <div key={item.id} className="shop-item bs-shop-item">
                  <div className="shop-item-info">
                    <Tooltip position="right" content={<EquipmentDetail item={item} />}>
                      <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={color} />
                        {item.name}{item.enhancement > 0 ? ` +${item.enhancement}` : ''}
                      </span>
                    </Tooltip>
                    <span className="shop-item-desc bs-craft-materials">
                      {yields.map(m => {
                        const def = getItemById(m.itemId);
                        const { icon, color: matColor, glowClass } = resolveItemIcon(def, 'material');
                        return (
                          <span key={m.itemId} className="bs-craft-mat">
                            <GameIcon name={icon} size={14} color={matColor} className={glowClass} />
                            <span className="bs-craft-mat-name" style={{ color: matColor }}>{def?.name ?? '未知素材'}</span>
                            <span className="bs-craft-mat-count">×{m.amount}</span>
                          </span>
                        );
                      })}
                    </span>
                  </div>
                  <div className="shop-item-actions">
                    <button className="btn-danger" aria-label={`拆解 ${item.name}`} onClick={() => handleDismantle(item)}>拆解</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'craft' && (<>
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
                {/* § 7S.6 武器必須指定隨機技能，數值取最弱值 */}
                {craftRequiresAbility(recipe) && (() => {
                  const chosen = chosenAbility(recipe);
                  const classPool = getAbilityClassPool(recipe, char.className);
                  const preview = chosen ? rollAbility(recipe, { channel: 'craft', className: char.className, chosen }) : undefined;
                  return (
                    <span className={`shop-item-desc bs-ability-row ${chosen ? '' : 'lacking'}`}>
                      <span className="bs-ability-label">隨機技能</span>
                      <select
                        aria-label="隨機技能"
                        value={chosen ?? ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const value = e.target.value as AbilityType | '';
                          setAbilityChoices(prev => {
                            const next = { ...prev };
                            if (value) next[recipe.id!] = value; else delete next[recipe.id!];
                            return next;
                          });
                        }}
                      >
                        <option value="">請選擇</option>
                        <optgroup label="共通">
                          {getAbilityCommonPool(recipe).map(t => <option key={t} value={t}>{getAbilityDefinition(t)!.name}</option>)}
                        </optgroup>
                        {classPool.length > 0 && (
                          <optgroup label={CLASS_NAMES_ZH[char.className]}>
                            {classPool.map(t => <option key={t} value={t}>{getAbilityDefinition(t)!.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      {preview && <span className="bs-ability-preview">{formatAbilityEffect(preview)}</span>}
                    </span>
                  );
                })()}
                <span className="shop-item-desc bs-craft-materials">
                  {/* 製作費（§ 6A.3） */}
                  {(() => {
                    const need = recipe.craftGold ?? 0;
                    const enough = char.gold >= need;
                    return (
                      <span className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                        <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
                        <span className="bs-craft-mat-name" style={enough ? { color: 'var(--accent-gold)' } : undefined}>金幣</span>
                        <span className="bs-craft-mat-count">{char.gold.toLocaleString()}/{need.toLocaleString()}</span>
                      </span>
                    );
                  })()}
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
                  disabled={!canCraftRecipe(recipe) || !isAbilityReady(recipe) || selectedRecipe?.id !== recipe.id}
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
      </>)}
    </div>
  );
}
