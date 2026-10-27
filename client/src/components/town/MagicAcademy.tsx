import { formatSkillRange, formatBuffDuration } from '../../models/skill';
import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { SKILL_CATALOG } from '../../models/skill';
import { canLearnBasicMagic, getLearnableMaxLevel, CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import { CLASS_NAMES_ZH } from '../../models/character';
import { isClassMagic, CLASS_SKILLS } from '../../models/classSkills';
import { getItemById } from '../../models/items';
import { getBagItemAmount, hasBagItem } from '../../models/bagItem';
import {
  LEARN_PRICES, SPELLBOOK_FRAGMENT_ID, SPELLBOOK_RECIPES, getRequiredBookId,
} from '../../models/magicAcademy';

function itemName(itemId: number): string {
  return getItemById(itemId)?.name ?? '未知道具';
}

type AcademyTab = 'learn' | 'craft' | 'class';

export function MagicAcademy() {
  const char = useGameStore(s => s.character);
  const skills = useGameStore(s => s.skills);
  const bagItems = useGameStore(s => s.bagItems);
  // 判定、扣款、消耗都在 store（線上模式轉成 RPC 交給 server）
  const learnBasicMagic = useGameStore(s => s.learnBasicMagic);
  const craftSpellbook = useGameStore(s => s.craftSpellbook);
  const learnClassSkill = useGameStore(s => s.learnClassSkill);
  const [tab, setTab] = useState<AcademyTab>('learn');

  if (!char) return null;

  const restriction = CLASS_MAGIC_RESTRICTIONS[char.className];
  const learnableLevel = getLearnableMaxLevel(char.className, char.level);
  /** 學習額度只算基礎魔法，職業魔法走 `23-class-magic.md` 的獨立額度 */
  const learnedBasicSkills = skills.filter(s => !isClassMagic(s.id));
  const currentSkillCount = learnedBasicSkills.length;

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

  const myClassSkills = CLASS_SKILLS.filter(s => s.className === char.className);
  const learnedClassSkills = skills.filter(s => myClassSkills.some(c => c.id === s.id));

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
        <button className={tab === 'class' ? 'active' : ''} onClick={() => setTab('class')}>職業技能</button>
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
                  <button onClick={() => learnBasicMagic(skill.id)} disabled={char.gold < price}>學習</button>
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
                  <button onClick={() => learnBasicMagic(skill.id)} disabled={!hasBook}>
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
                  <button onClick={() => craftSpellbook(recipe.bookItemId)} disabled={!canCraft}>
                    {canCraft ? '製作' : '素材不足'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'class' && (
        <div className="academy-class-content">
          <h4>職業技能（{CLASS_NAMES_ZH[char.className]}）</h4>
          <div className="guild-skill-list">
            {myClassSkills.map(def => {
              const learned = skills.some(s => s.id === def.id);
              const hasBook = hasBagItem(bagItems, def.bookItemId);
              const levelOk = char.level >= def.requiredLevel;
              const canLearn = !learned && hasBook && levelOk;

              return (
                <div key={def.id} className={`shop-item ${learned ? 'learned' : ''}`}>
                  <div className="shop-item-info">
                    <span className="shop-item-name">{def.name}</span>
                    <span className="shop-item-desc">
                      Lv.{def.requiredLevel} | {def.skill.type} | MP {def.skill.mpCost}
                      {formatSkillRange(def.skill) && ` | 射程 ${formatSkillRange(def.skill)}`}
                      {formatBuffDuration(def.skill) && ` | 持續 ${formatBuffDuration(def.skill)}`}
                    </span>
                  </div>
                  <div className="shop-item-actions">
                    {learned ? (
                      <span className="guild-learned-tag">已學習</span>
                    ) : (
                      <button
                        onClick={() => learnClassSkill(def.id)}
                        disabled={!canLearn}
                        title={!levelOk ? `需要等級 ${def.requiredLevel}` : !hasBook ? `需要 ${itemName(def.bookItemId)}` : ''}
                      >
                        學習
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'class' ? (
        <>
          <h4>已學習職業技能</h4>
          {learnedClassSkills.length === 0 && <p className="empty-text">尚未學習任何職業技能</p>}
          {learnedClassSkills.map(skill => (
            <div key={skill.id} className="learned-skill">
              <span>{skill.name}</span>
              <span className="skill-meta">MP:{skill.mpCost} / {skill.type}{formatSkillRange(skill) && ` / 射程:${formatSkillRange(skill)}`}{formatBuffDuration(skill) && ` / 持續:${formatBuffDuration(skill)}`}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          <h4>已學習魔法</h4>
          {learnedBasicSkills.length === 0 && <p className="empty-text">尚未學習任何魔法</p>}
          {learnedBasicSkills.map(skill => (
            <div key={skill.id} className="learned-skill">
              <span>{skill.name}</span>
              <span className="skill-meta">MP:{skill.mpCost} / {skill.type}{formatSkillRange(skill) && ` / 射程:${formatSkillRange(skill)}`}{formatBuffDuration(skill) && ` / 持續:${formatBuffDuration(skill)}`}</span>
            </div>
          ))}
        </>
      )}
      </div>
    </div>
  );
}
