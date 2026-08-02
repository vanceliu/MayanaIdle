import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { SKILL_CATALOG } from '../../models/skill';
import type { Skill } from '../../models/skill';
import { canLearnBasicMagic, getLearnableMaxLevel, CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import { CLASS_NAMES_ZH } from '../../models/character';
import type { BagItem } from '../../stores/gameStore';
import { getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';

const LEARN_PRICES: Record<number, number> = {
  1: 100,
  2: 500,
  3: 700,
};

interface SpellbookRecipe {
  name: string;
  levels: string;
  fragments: number;
  material: string;
  materialAmount: number;
}

const SPELLBOOK_RECIPES: SpellbookRecipe[] = [
  { name: '基礎魔法書', levels: '4~5', fragments: 3, material: '魔法書材料（基礎）', materialAmount: 5 },
  { name: '中階魔法書', levels: '6~7', fragments: 5, material: '魔法書材料（中階）', materialAmount: 5 },
  { name: '高階魔法書', levels: '8', fragments: 10, material: '魔法書材料（高階）', materialAmount: 10 },
  { name: '稀有魔法書（上）', levels: '9', fragments: 20, material: '魔法書材料（稀有）', materialAmount: 20 },
  { name: '稀有魔法書（下）', levels: '10', fragments: 40, material: '魔法書材料（稀有）', materialAmount: 40 },
];

function getRequiredBook(level: number): string | null {
  if (level >= 4 && level <= 5) return '基礎魔法書';
  if (level >= 6 && level <= 7) return '中階魔法書';
  if (level === 8) return '高階魔法書';
  if (level === 9) return '稀有魔法書（上）';
  if (level === 10) return '稀有魔法書（下）';
  return null;
}

function getBagAmount(bagItems: BagItem[], name: string): number {
  return bagItems.find(b => b.name === name)?.amount ?? 0;
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

    const bookName = getRequiredBook(level);
    if (!bookName) return;

    const hasBook = getBagAmount(bagItems, bookName) > 0;
    if (!hasBook) return;

    const newBag = bagItems.map(b =>
      b.name === bookName ? { ...b, amount: b.amount - 1 } : b
    ).filter(b => b.amount > 0);

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
    const fragments = getBagAmount(currentBag, '魔法書碎片');
    const materials = getBagAmount(currentBag, recipe.material);

    if (fragments < recipe.fragments || materials < recipe.materialAmount) return;

    let newBag = currentBag.map(b => {
      if (b.name === '魔法書碎片') return { ...b, amount: b.amount - recipe.fragments };
      if (b.name === recipe.material) return { ...b, amount: b.amount - recipe.materialAmount };
      return b;
    }).filter(b => b.amount > 0);

    const existingBook = newBag.find(b => b.name === recipe.name);
    if (existingBook) {
      newBag = newBag.map(b => b.name === recipe.name ? { ...b, amount: b.amount + 1 } : b);
    } else {
      if (getBagUsedSlots(newBag, currentInv) >= getBagMaxSlots(equippedGear)) return;
      newBag = [...newBag, { name: recipe.name, type: 'spellbook' as const, amount: 1 }];
    }

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
                  <span className="shop-item-desc">MP:{skill.mpCost} / {skill.type === 'attack' ? `威力:${skill.power}` : skill.type}</span>
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
            const bookName = getRequiredBook(level)!;
            const hasBook = getBagAmount(bagItems, bookName) > 0;
            return (
              <div key={skill.id} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{skill.name} (Lv.{level})</span>
                  <span className="shop-item-desc">需要: {bookName} (持有: {getBagAmount(bagItems, bookName)})</span>
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
            <span>持有碎片: {getBagAmount(bagItems, '魔法書碎片')}</span>
          </div>
          {SPELLBOOK_RECIPES.map(recipe => {
            const fragments = getBagAmount(bagItems, '魔法書碎片');
            const materials = getBagAmount(bagItems, recipe.material);
            const canCraft = fragments >= recipe.fragments && materials >= recipe.materialAmount;
            return (
              <div key={recipe.name} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{recipe.name}</span>
                  <span className="shop-item-desc">教學等級: {recipe.levels}</span>
                  <span className="shop-item-desc">
                    魔法書碎片 ×{recipe.fragments} ({fragments}) + {recipe.material} ×{recipe.materialAmount} ({materials})
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
          <span className="skill-meta">MP:{skill.mpCost} / {skill.type}</span>
        </div>
      ))}
    </div>
  );
}
