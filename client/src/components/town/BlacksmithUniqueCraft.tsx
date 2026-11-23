import { useState } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import type { EquipmentTemplate } from '../../models/equipment';
import { CRAFTED_GEAR_SUFFIX, UNIQUE_CRAFTED_GEAR_SUFFIX } from '../../models/equipment';
import { craftRequiresAbility } from '../../models/ability';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';
import { formatUniqueCraftAffixTiers, isUniqueCraftTier } from '../../models/uniqueCraft';
import {
  evaluateCraftRequirements, findCraftPrerequisiteCandidates, getUniqueCraftPrerequisiteBlock, hasCraftQuestFor,
  craftQuestId, isRecipeCraftable, listCraftPrerequisiteOptions, UNIQUE_CRAFT_PREREQUISITE_BLOCK_TEXT,
  type CraftPrerequisiteCandidate, type CraftSources,
} from '../../systems/craftQuestSystem';
import { BlacksmithPrereqPicker, CRAFT_SOURCE_LABEL, PrereqName } from './BlacksmithPrereqPicker';
import { CraftCategoryTabs, RecipeRequirementChips, RecipeSummary, matchesCraftCategory } from './BlacksmithRecipeParts';

const PREREQ_HINT = `同一模板的掉落品、商店品、${CRAFTED_GEAR_SUFFIX} 皆可（${UNIQUE_CRAFTED_GEAR_SUFFIX}、擬態品不可）；選定的那件製作後消失。`;

const instanceLabel = (c: CraftPrerequisiteCandidate) =>
  `${c.item.name}${c.item.enhancement > 0 ? ` +${c.item.enhancement}` : ''}（${CRAFT_SOURCE_LABEL[c.source]}）`;

/** 鐵匠鋪「獨特製作」分頁（`06-equipment-acquire.md` § 6A.3.1） */
export function BlacksmithUniqueCraft({ templates, sources, onResult }: {
  templates: EquipmentTemplate[];
  sources: CraftSources;
  onResult: (message: string | null) => void;
}) {
  const char = useGameStore(s => s.character);
  const craftQuests = useGameStore(s => s.craftQuests);
  const acceptCraftQuest = useGameStore(s => s.acceptCraftQuest);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const [category, setCategory] = useState('sword');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** 各配方指定的前置裝備實例 id */
  const [prereqChoices, setPrereqChoices] = useState<Record<number, number>>({});
  const [pickerRecipe, setPickerRecipe] = useState<EquipmentTemplate | null>(null);
  if (!char) return null;

  const recipes = templates
    .filter(t => t.acquireType === 'craft' && isRecipeCraftable(t, 'unique'))
    .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));

  /** 指定的前置裝備；已不在背包或倉庫、或不可用時視為未指定 */
  function chosenPrereq(recipe: EquipmentTemplate) {
    const id = prereqChoices[recipe.id!];
    return id === undefined ? undefined : findCraftPrerequisiteCandidates(recipe, sources, 'unique').find(c => c.item.id === id);
  }

  async function handleCraft(recipe: EquipmentTemplate) {
    const prereq = chosenPrereq(recipe);
    if (!char || !prereq || !evaluateCraftRequirements(recipe, sources, char.gold, 'unique').ready) return;
    if (!window.confirm(`確定製作 ${recipe.name}${UNIQUE_CRAFTED_GEAR_SUFFIX}？\n將消耗前置裝備：${instanceLabel(prereq)}`)) return;
    const result: CraftResult = await useGameStore.getState().craftUniqueEquipment(recipe.id!, prereq.item.id!);
    onResult(result.message);
  }

  return (
    <>
      <CraftCategoryTabs recipes={recipes} value={category} onChange={key => { setCategory(key); setSelectedId(null); }} />
      <div className="panel-scroll">
        <div className="shop-items">
          {recipes.filter(r => matchesCraftCategory(r, category)).map(recipe => {
            const status = evaluateCraftRequirements(recipe, sources, char.gold, 'unique');
            const picked = chosenPrereq(recipe);
            const usable = status.prerequisite?.have ?? 0;
            const selected = selectedId === recipe.id;
            const tracked = hasCraftQuestFor(craftQuests, recipe.id!, 'unique');
            const full = craftQuests.length >= MAX_ACTIVE_CRAFT_QUESTS;
            return (
              <div
                key={recipe.id}
                className={`shop-item bs-shop-item ${selected ? 'selected' : ''} ${status.ready ? '' : 'disabled-look'}`}
                onClick={() => { setSelectedId(recipe.id!); onResult(null); }}
              >
                <div className="shop-item-info">
                  <RecipeSummary recipe={recipe} />
                  {/* § 6A.6「製作品 (獨)」：產物規則 */}
                  <span className="shop-item-desc bs-unique-rule">
                    產物 <strong>{recipe.name}{UNIQUE_CRAFTED_GEAR_SUFFIX}</strong>：詞綴 4 條隨機
                    {isUniqueCraftTier(recipe.tier) && `（${formatUniqueCraftAffixTiers(recipe.tier)}）`}
                    {craftRequiresAbility(recipe) && '｜必帶隨機技能（隨機抽）'}｜不可使用印記
                  </span>
                  <span className={`shop-item-desc bs-ability-row ${picked ? '' : 'lacking'}`}>
                    <span className="bs-ability-label">前置裝備</span>
                    {picked ? (
                      <>
                        <PrereqName item={picked.item} templates={templates} />
                        <span className="bs-source-tag-inline">{CRAFT_SOURCE_LABEL[picked.source]}</span>
                      </>
                    ) : (
                      <span className="bs-dim">{usable ? '未選擇' : `沒有可用的${recipe.name}`}</span>
                    )}
                    <button
                      className="bs-prereq-open"
                      disabled={usable === 0}
                      onClick={e => { e.stopPropagation(); setSelectedId(recipe.id!); setPickerRecipe(recipe); }}
                    >
                      {picked ? '更換' : '選擇'}
                    </button>
                  </span>
                  <RecipeRequirementChips status={status} templates={templates} />
                </div>
                <div className="shop-item-actions">
                  <button
                    onClick={e => { e.stopPropagation(); void handleCraft(recipe); }}
                    disabled={!status.ready || !picked || !selected}
                  >
                    製作
                  </button>
                  {tracked ? (
                    <button className="btn-danger" onClick={e => { e.stopPropagation(); abandonCraftQuest(craftQuestId(recipe.id!, 'unique')); }}>
                      取消追蹤
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); acceptCraftQuest(recipe.id!, true); }}
                      disabled={full}
                      title={full ? `製作追蹤已滿（${MAX_ACTIVE_CRAFT_QUESTS}）` : undefined}
                    >
                      製作追蹤
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pickerRecipe && (
        <BlacksmithPrereqPicker
          prerequisiteName={pickerRecipe.name}
          candidates={listCraftPrerequisiteOptions(pickerRecipe, sources, 'unique').map(c => {
            const block = getUniqueCraftPrerequisiteBlock(c.item);
            return block ? { ...c, blockReason: UNIQUE_CRAFT_PREREQUISITE_BLOCK_TEXT[block] } : c;
          })}
          chosenId={chosenPrereq(pickerRecipe)?.item.id}
          templates={templates}
          hint={PREREQ_HINT}
          onChoose={id => setPrereqChoices(prev => ({ ...prev, [pickerRecipe.id!]: id }))}
          onClose={() => setPickerRecipe(null)}
        />
      )}
    </>
  );
}
