import { formatSkillRange, formatBuffDuration } from '../../models/skill';
import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { SKILL_CATALOG } from '../../models/skill';
import type { Skill } from '../../models/skill';
import { canLearnBasicMagic, getLearnableMaxLevel, CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import { CLASS_NAMES_ZH } from '../../models/character';
import { getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { getItemById } from '../../models/items';
import { hasBagItem, addBagItem, consumeBagItem, getBagItemAmount } from '../../models/bagItem';

const LEARN_PRICES: Record<number, number> = {
  1: 100,
  2: 500,
  3: 700,
};

/** 魔法書碎片（所有配方共用的素材） */
const SPELLBOOK_FRAGMENT_ID = 127;

interface SpellbookRecipe {
  /** 成品魔法書的 `ITEM_DEFINITIONS` id。名稱一律由 id 反查（§ 99.1） */
  bookItemId: number;
  levels: string;
  fragments: number;
  materialItemId: number;
  materialAmount: number;
}

const SPELLBOOK_RECIPES: SpellbookRecipe[] = [
  { bookItemId: 97, levels: '4~5', fragments: 3, materialItemId: 128, materialAmount: 5 },
  { bookItemId: 98, levels: '6~7', fragments: 5, materialItemId: 129, materialAmount: 5 },
  { bookItemId: 99, levels: '8', fragments: 10, materialItemId: 130, materialAmount: 10 },
  { bookItemId: 100, levels: '9', fragments: 20, materialItemId: 131, materialAmount: 20 },
  { bookItemId: 101, levels: '10', fragments: 40, materialItemId: 131, materialAmount: 40 },
];

function getRequiredBookId(level: number): number | null {
  if (level >= 4 && level <= 5) return 97;
  if (level >= 6 && level <= 7) return 98;
  if (level === 8) return 99;
  if (level === 9) return 100;
  if (level === 10) return 101;
  return null;
}

function itemName(itemId: number): string {
  return getItemById(itemId)?.name ?? '未知道具';
}

type AcademyTab = 'learn' | 'craft';

export function MagicAcademy() {
  const char = useGameStore(s => s.character);
  const skills = useGameStore(s => s.skills);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<AcademyTab>('learn');

  if (!char) return null;

  const restriction = CLASS_MAGIC_RESTRICTIONS[char.className];
  const learnableLevel = getLearnableMaxLevel(char.className, char.level);
  const currentSkillCount = skills.length;

  const learnableByGold = SKILL_CATALOG.filter(s => {
    const level = s.level ?? 1;
    if (level > 3) return false;
    if (skills.some(k => k.id === s.id)) return false;
    return canLearnBasicMagic(char.className, char.level, level, currentSkillCount);
  });

  const learnableByBook = SKILL_CATALOG.filter(s => {
    const level = s.level ?? 1;
    if (level <= 3 || level > 10) return false;
    if (skills.some(k => k.id === s.id)) return false;
    return canLearnBasicMagic(char.className, char.level, level, currentSkillCount);
  });

  function learnWithGold(skill: Omit<Skill, 'lastUsedAt'>) {
    const level = skill.level ?? 1;
    const price = LEARN_PRICES[level];
    if (!price || !char || char.gold < price) return;
    if (!canLearnBasicMagic(char.className, char.level, level, currentSkillCount)) return;

    const updatedSkills = [...skills, { ...skill, lastUsedAt: 0 }];
    set({
      character: { ...char, gold: char.gold - price, skills: updatedSkills },
      skills: updatedSkills,
    });
    useGameStore.getState().saveState();
  }

  function learnWithBook(skill: Omit<Skill, 'lastUsedAt'>) {
    const level = skill.level ?? 1;
    if (!canLearnBasicMagic(char!.className, char!.level, level, currentSkillCount)) return;

    const bookItemId = getRequiredBookId(level);
    if (bookItemId == null) return;

    const hasBook = hasBagItem(bagItems, bookItemId);
    if (!hasBook) return;

    const newBag = consumeBagItem(bagItems, bookItemId);

    const updatedSkills = [...skills, { ...skill, lastUsedAt: 0 }];
    set({
      bagItems: newBag,
      skills: updatedSkills,
      character: char ? { ...char, skills: updatedSkills } : char,
    });
    useGameStore.getState().saveState();
  }

  function craftBook(recipe: SpellbookRecipe) {
    const currentBag = useGameStore.getState().bagItems;
    const currentInv = useGameStore.getState().inventory;
    const fragments = getBagItemAmount(currentBag, SPELLBOOK_FRAGMENT_ID);
    const materials = getBagItemAmount(currentBag, recipe.materialItemId);

    if (fragments < recipe.fragments || materials < recipe.materialAmount) return;

    let newBag = consumeBagItem(currentBag, SPELLBOOK_FRAGMENT_ID, recipe.fragments);
    newBag = consumeBagItem(newBag, recipe.materialItemId, recipe.materialAmount);

    if (!hasBagItem(newBag, recipe.bookItemId)
      && getBagUsedSlots(newBag, currentInv, equippedGear) >= getBagMaxSlots(equippedGear)) {
      return;
    }
    newBag = addBagItem(newBag, recipe.bookItemId, 1);

    set({ bagItems: newBag });
    useGameStore.getState().saveState();
  }

  return (
    <div className="academy-panel">
      <p className="shop-greeting">「歡迎來到魔法學院。想學習什麼魔法呢？」</p>
      <div className="shop-gold">持有金幣: {char.gold}G</div>
      <div className="academy-restriction">
        <span>職業: {CLASS_NAMES_ZH[char.className]}</span>
        <span>可學上限: {restriction.maxLevel} 級（{restriction.maxSkills} 個）</span>
        <span>目前可學級數: {learnableLevel > 0 ? `${learnableLevel} 級` : '尚未達到學習等級'}</span>
        <span>已學: {currentSkillCount} / {restriction.maxSkills}</span>
      </div>

      {learnableLevel === 0 && (
        <p className="restriction-warning">
          {char.className === 'knight'
            ? '騎士需達到等級 50 才能學習基礎魔法'
            : `尚未達到可學習魔法的等級`}
        </p>
      )}

      <div className="storage-tabs">
        <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>學習魔法</button>
        <button className={tab === 'craft' ? 'active' : ''} onClick={() => setTab('craft')}>製作魔法書</button>
      </div>

      {/* 只有分頁內容會捲動，金幣與分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'learn' && (
        <div className="academy-learn-content">
          <h4>金幣學習（1~3 級）</h4>
          {learnableByGold.length === 0 && <p className="empty-text">沒有可學習的魔法</p>}
          {learnableByGold.map(skill => {
            const level = skill.level ?? 1;
            const price = LEARN_PRICES[level];
            return (
              <div key={skill.id} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{skill.name} (Lv.{level})</span>
                  <span className="shop-item-desc">MP:{skill.mpCost} / {skill.type === 'attack' ? `威力:${skill.power}` : skill.type}{formatSkillRange(skill) && ` / 射程:${formatSkillRange(skill)}`}{formatBuffDuration(skill) && ` / 持續:${formatBuffDuration(skill)}`}</span>
                  <span className="shop-item-price">{price}G</span>
                </div>
                <div className="shop-item-actions">
                  <button onClick={() => learnWithGold(skill)} disabled={char.gold < price}>學習</button>
                </div>
              </div>
            );
          })}

          <h4>魔法書學習（4~10 級）</h4>
          {learnableByBook.length === 0 && <p className="empty-text">沒有可學習的高階魔法</p>}
          {learnableByBook.map(skill => {
            const level = skill.level ?? 1;
            const bookItemId = getRequiredBookId(level)!;
            const bookCount = getBagItemAmount(bagItems, bookItemId);
            const hasBook = bookCount > 0;
            return (
              <div key={skill.id} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{skill.name} (Lv.{level})</span>
                  <span className="shop-item-desc">需要: {itemName(bookItemId)} (持有: {bookCount})</span>
                </div>
                <div className="shop-item-actions">
                  <button onClick={() => learnWithBook(skill)} disabled={!hasBook}>
                    {hasBook ? '學習' : '缺少魔法書'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'craft' && (
        <div className="academy-craft-content">
          <h4>製作魔法書</h4>
          <div className="craft-material-info">
            <span>持有碎片: {getBagItemAmount(bagItems, SPELLBOOK_FRAGMENT_ID)}</span>
          </div>
          {SPELLBOOK_RECIPES.map(recipe => {
            const fragments = getBagItemAmount(bagItems, SPELLBOOK_FRAGMENT_ID);
            const materials = getBagItemAmount(bagItems, recipe.materialItemId);
            const canCraft = fragments >= recipe.fragments && materials >= recipe.materialAmount;
            return (
              <div key={recipe.bookItemId} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{itemName(recipe.bookItemId)}</span>
                  <span className="shop-item-desc">教學等級: {recipe.levels}</span>
                  <span className="shop-item-desc">
                    {itemName(SPELLBOOK_FRAGMENT_ID)} ×{recipe.fragments} ({fragments}) + {itemName(recipe.materialItemId)} ×{recipe.materialAmount} ({materials})
                  </span>
                </div>
                <div className="shop-item-actions">
                  <button onClick={() => craftBook(recipe)} disabled={!canCraft}>
                    {canCraft ? '製作' : '素材不足'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h4>已學習魔法</h4>
      {skills.length === 0 && <p className="empty-text">尚未學習任何魔法</p>}
      {skills.map(skill => (
        <div key={skill.id} className="learned-skill">
          <span>{skill.name}</span>
          <span className="skill-meta">MP:{skill.mpCost} / {skill.type}{formatSkillRange(skill) && ` / 射程:${formatSkillRange(skill)}`}{formatBuffDuration(skill) && ` / 持續:${formatBuffDuration(skill)}`}</span>
        </div>
      ))}
      </div>
    </div>
  );
}
