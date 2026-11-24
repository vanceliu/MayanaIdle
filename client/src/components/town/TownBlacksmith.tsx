import { useState, useMemo } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import type { EquipmentTemplate } from '../../models/equipment';
import { UNIQUE_CRAFTED_GEAR_SUFFIX } from '../../models/equipment';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import { EquipmentDetail } from '../EquipmentInfo';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import {
  craftQuestId, evaluateCraftRequirements, findCraftPrerequisiteCandidates, getCraftSources, hasCraftQuestFor,
} from '../../systems/craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';
import { getDismantleOutcome } from '../../systems/crafting';
import type { EquipmentInstance } from '../../models/equipment';

import { getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import {
  craftRequiresAbility, getAbilityCommonPool, getAbilityClassPool, getAbilityDefinition, rollAbility,
  formatAbilityEffect, type AbilityType,
} from '../../models/ability';
import { crystalImproves, type AbilityCrystal } from '../../models/abilityCrystal';
import { BlacksmithAbilitySwap } from './BlacksmithAbilitySwap';
import { BlacksmithPrereqPicker, CRAFT_SOURCE_LABEL, PrereqName } from './BlacksmithPrereqPicker';
import { BlacksmithUniqueCraft } from './BlacksmithUniqueCraft';
import { CraftCategoryTabs, RecipeRequirementChips, RecipeSummary, matchesCraftCategory } from './BlacksmithRecipeParts';
import { SkillTagText } from '../SkillTagList';

type BlacksmithTab = 'craft' | 'unique' | 'dismantle' | 'swap';

const TAB_LABELS: Record<BlacksmithTab, string> = { craft: '裝備製作', unique: '獨特製作', dismantle: '裝備拆解', swap: '技能更換' };

export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const personalStoredMaterials = useGameStore(s => s.personalStoredMaterials);
  const personalStoredEquipment = useGameStore(s => s.personalStoredEquipment);
  const storedMaterials = useGameStore(s => s.storedMaterials);
  const storedEquipment = useGameStore(s => s.storedEquipment);
  const craftQuests = useGameStore(s => s.craftQuests);
  const abilityCrystals = useGameStore(s => s.abilityCrystals);
  const acceptCraftQuest = useGameStore(s => s.acceptCraftQuest);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const [selectedRecipe, setSelectedRecipe] = useState<EquipmentTemplate | null>(null);
  const [craftCategory, setCraftCategory] = useState<string>('sword');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<BlacksmithTab>('craft');
  /** 各配方指定的隨機技能（`07-affix-ability.md` § 7S.6） */
  const [abilityChoices, setAbilityChoices] = useState<Record<number, AbilityType>>({});
  /** 各配方指定的前置裝備實例 id（`06-equipment-acquire.md` § 6A.3「取用來源」） */
  const [prereqChoices, setPrereqChoices] = useState<Record<number, number>>({});
  const [prereqPickerRecipe, setPrereqPickerRecipe] = useState<EquipmentTemplate | null>(null);
  const allTemplates = useEquipmentTemplates();
  const craftTemplates = useMemo(
    () => allTemplates.filter(t => t.acquireType === 'craft').sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)),
    [allTemplates],
  );

  if (!char) return null;

  const sources = getCraftSources({
    bagItems, inventory, personalStoredMaterials, personalStoredEquipment, storedMaterials, storedEquipment,
  });

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
    return evaluateCraftRequirements(recipe, sources, char.gold).ready;
  }

  /** 該配方指定的隨機技能；不在本角色可選範圍內時視為未指定 */
  function chosenAbility(recipe: EquipmentTemplate): AbilityType | undefined {
    const chosen = abilityChoices[recipe.id!];
    if (!chosen || !char) return undefined;
    const options = [...getAbilityCommonPool(recipe), ...getAbilityClassPool(recipe, char.className)];
    return options.includes(chosen) ? chosen : undefined;
  }

  /** 該配方指定的前置裝備；已不在背包或倉庫時視為未指定 */
  function chosenPrereq(recipe: EquipmentTemplate) {
    const id = prereqChoices[recipe.id!];
    return id === undefined ? undefined : findCraftPrerequisiteCandidates(recipe, sources).find(c => c.item.id === id);
  }

  function isPrereqReady(recipe: EquipmentTemplate): boolean {
    return !recipe.craftPrerequisiteWeapon || chosenPrereq(recipe) !== undefined;
  }

  function isAbilityReady(recipe: EquipmentTemplate): boolean {
    return !craftRequiresAbility(recipe) || chosenAbility(recipe) !== undefined;
  }

  async function handleCraft() {
    if (!selectedRecipe || !char) return;
    if (!canCraftRecipe(selectedRecipe) || !isAbilityReady(selectedRecipe) || !isPrereqReady(selectedRecipe)) return;
    const prereq = chosenPrereq(selectedRecipe);
    const prerequisiteIds = prereq ? [prereq.item.id!] : undefined;
    const settled = useGameStore.getState().craftEquipment(selectedRecipe.id!, chosenAbility(selectedRecipe), prerequisiteIds);
    // 單機同步、線上模式 Promise；訊息在同一個 click 內就要出現（單機）
    if (settled && typeof (settled as Promise<unknown>).then === 'function') {
      setResultMsg((await (settled as Promise<CraftResult>)).message);
    } else {
      setResultMsg((settled as CraftResult).message);
    }
  }

  // 拆解清單：背包中未裝備、模板有配方或帶隨機技能的掉落品（§ 6A.3「拆解」、§ 7S.8）
  const dismantlable = inventory
    .map(item => {
      const template = allTemplates.find(t => t.id === item.templateId);
      return { item, ...getDismantleOutcome(item, template) };
    })
    .filter(e => e.yields !== null || e.crystal !== undefined);

  async function handleDismantle(item: EquipmentInstance, hasYields: boolean, crystal: AbilityCrystal | undefined) {
    const warning = item.enhancement > 0 ? `\n強化 +${item.enhancement} 不退還。` : '';
    const crystalLine = crystal ? `\n隨機技能「${getAbilityDefinition(crystal.type)!.name}」會存成技能結晶。` : '';
    const refund = !hasYields ? '不退材料。'
      : item.isUniqueCraftedGear ? '退還一般配方的全部材料，獨特材料不退。' : '只退還一半材料。';
    if (!window.confirm(`確定拆解 ${item.name}？${refund}${crystalLine}${warning}`)) return;
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
        {(Object.keys(TAB_LABELS) as BlacksmithTab[]).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setResultMsg(null); }}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {resultMsg && <p className="bs-result">{resultMsg}</p>}

      {tab === 'dismantle' && (
        <div className="panel-scroll">
          <p className="shop-item-desc">
            有配方的退還一半材料，{UNIQUE_CRAFTED_GEAR_SUFFIX} 製作品退還一般配方的全部材料（獨特材料不退）；前置裝備不退；掉落品的隨機技能會存成技能結晶。身上的裝備不能拆。
          </p>
          {dismantlable.length === 0 && <p className="shop-item-desc">背包裡沒有可拆解的裝備</p>}
          <div className="shop-items">
            {dismantlable.map(({ item, yields, crystal }) => {
              const color = getEquipmentInstanceTierColor(item, allTemplates);
              const existing = crystal && abilityCrystals.find(c => c.type === crystal.type);
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
                      {!yields && <span className="bs-dim">不退材料</span>}
                      {yields?.map(m => {
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
                    {crystal && (
                      <span className="shop-item-desc">
                        <span className="bs-ability-text">技能結晶：{getAbilityDefinition(crystal.type)!.name}</span>
                        {crystalImproves(existing, crystal) && <span className="bs-crystal-mark">{existing ? '（更新）' : '（新）'}</span>}
                      </span>
                    )}
                    {!crystal && item.ability && (item.isCraftedGear || item.isUniqueCraftedGear) && (
                      <span className="shop-item-desc bs-dim">製作品的隨機技能不會留下結晶</span>
                    )}
                    {item.isUniqueCraftedGear && <span className="shop-item-desc bs-dim">獨特材料不退</span>}
                  </div>
                  <div className="shop-item-actions">
                    <button className="btn-danger" aria-label={`拆解 ${item.name}`} onClick={() => handleDismantle(item, yields !== null, crystal)}>拆解</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'swap' && <BlacksmithAbilitySwap templates={allTemplates} onResult={setResultMsg} />}

      {tab === 'unique' && <BlacksmithUniqueCraft templates={allTemplates} sources={sources} onResult={setResultMsg} />}

      {tab === 'craft' && (<>
      {/* 分類是篩選器，跟分頁一樣固定在表頭，不隨配方清單捲動 */}
      <CraftCategoryTabs recipes={craftTemplates} value={craftCategory} onChange={key => { setCraftCategory(key); setSelectedRecipe(null); }} />

      {/* 只有配方清單會捲動，資源列與分類固定在上方 */}
      <div className="panel-scroll">
      <div className="shop-items">
          {craftTemplates
            .filter(recipe => matchesCraftCategory(recipe, craftCategory))
            .map(recipe => (
            <div
              key={recipe.id}
              className={`shop-item bs-shop-item ${selectedRecipe?.id === recipe.id ? 'selected' : ''} ${!canCraftRecipe(recipe) ? 'disabled-look' : ''}`}
              onClick={() => { setSelectedRecipe(recipe); setResultMsg(null); }}
            >
              <div className="shop-item-info">
                <RecipeSummary recipe={recipe} />
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
                      {preview && <span className="bs-ability-preview"><SkillTagText text={formatAbilityEffect(preview)} /></span>}
                    </span>
                  );
                })()}
                {/* § 6A.3「取用來源」：前置裝備由玩家指定，可在背包或個人／帳號倉庫 */}
                {recipe.craftPrerequisiteWeapon && (() => {
                  const picked = chosenPrereq(recipe);
                  const count = findCraftPrerequisiteCandidates(recipe, sources).length;
                  return (
                    <span className={`shop-item-desc bs-ability-row ${picked ? '' : 'lacking'}`}>
                      <span className="bs-ability-label">前置裝備</span>
                      {picked ? (
                        <>
                          <PrereqName item={picked.item} templates={allTemplates} />
                          <span className="bs-source-tag-inline">{CRAFT_SOURCE_LABEL[picked.source]}</span>
                        </>
                      ) : (
                        <span className="bs-dim">{count ? '未選擇' : '沒有可用的前置裝備'}</span>
                      )}
                      <button
                        className="bs-prereq-open"
                        disabled={count === 0}
                        onClick={e => { e.stopPropagation(); setSelectedRecipe(recipe); setPrereqPickerRecipe(recipe); }}
                      >
                        {picked ? '更換' : '選擇'}
                      </button>
                    </span>
                  );
                })()}
                <RecipeRequirementChips status={evaluateCraftRequirements(recipe, sources, char.gold)} templates={allTemplates} />
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={(e) => { e.stopPropagation(); handleCraft(); }}
                  disabled={!canCraftRecipe(recipe) || !isAbilityReady(recipe) || !isPrereqReady(recipe) || selectedRecipe?.id !== recipe.id}
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
                        onClick={(e) => { e.stopPropagation(); abandonCraftQuest(craftQuestId(recipe.id!)); }}
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
      {prereqPickerRecipe?.craftPrerequisiteWeapon && (
        <BlacksmithPrereqPicker
          prerequisiteName={allTemplates.find(t => t.id === prereqPickerRecipe.craftPrerequisiteWeapon!.templateId)?.name ?? ''}
          candidates={findCraftPrerequisiteCandidates(prereqPickerRecipe, sources)}
          chosenId={chosenPrereq(prereqPickerRecipe)?.item.id}
          templates={allTemplates}
          onChoose={id => setPrereqChoices(prev => ({ ...prev, [prereqPickerRecipe.id!]: id }))}
          onClose={() => setPrereqPickerRecipe(null)}
        />
      )}
      </>)}
    </div>
  );
}
