import { useGameStore } from '../../stores/gameStore';
import type { Skill } from '../../models/skill';
import type { ClassName } from '../../models/character';
import { QUEST_TEMPLATES, ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../../models/quest';
import type { Quest } from '../../models/quest';
import { getAvailableQuests } from '../../systems/questSystem';
import { getRegion } from '../../models/mapData';

interface ClassSkillDef {
  id: string;
  name: string;
  className: ClassName;
  classLevel: number;
  requiredLevel: number;
  bookName: string;
  skill: Omit<Skill, 'lastUsedAt'>;
}

const CLASS_SKILLS: ClassSkillDef[] = [
  { id: 'shield-bash', name: '盾擊', className: 'knight', classLevel: 1, requiredLevel: 10, bookName: '盾擊技能書',
    skill: { id: 'shield-bash', name: '盾擊', level: 1, element: 'none', type: 'attack', target: 'single', power: 20, mpCost: 15, cooldown: 10000 } },
  { id: 'rend', name: '裂傷斬', className: 'knight', classLevel: 2, requiredLevel: 20, bookName: '裂傷斬技能書',
    skill: { id: 'rend', name: '裂傷斬', level: 2, element: 'none', type: 'attack', target: 'single', power: 25, mpCost: 20, cooldown: 8000 } },
  { id: 'iron-shield', name: '鋼鐵護盾', className: 'knight', classLevel: 3, requiredLevel: 30, bookName: '鋼鐵護盾技能書',
    skill: { id: 'iron-shield', name: '鋼鐵護盾', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 30000, buffEffect: '減傷20%', buffDuration: 15000, buffModifiers: [{ stat: 'damageReduction', value: 20, isPercent: true }], buffCategory: 'defense-buff' } },
  { id: 'taunt', name: '挑釁怒吼', className: 'knight', classLevel: 4, requiredLevel: 40, bookName: '挑釁怒吼技能書',
    skill: { id: 'taunt', name: '挑釁怒吼', level: 4, element: 'none', type: 'attack', target: 'single', power: 20, mpCost: 25, cooldown: 20000, buffEffect: '怪物攻擊力-20%', buffDuration: 10000, buffModifiers: [{ stat: 'attack', value: -20, isPercent: true }], buffCategory: 'atk-debuff' } },
  { id: 'vengeance', name: '復仇之刃', className: 'knight', classLevel: 5, requiredLevel: 50, bookName: '復仇之刃技能書',
    skill: { id: 'vengeance', name: '復仇之刃', level: 5, element: 'none', type: 'attack', target: 'single', power: 80, mpCost: 50, cooldown: 25000 } },

  { id: 'precise-shot', name: '精準射擊', className: 'elf', classLevel: 1, requiredLevel: 10, bookName: '精準射擊技能書',
    skill: { id: 'precise-shot', name: '精準射擊', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, buffEffect: '命中+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'fire-arrow', name: '火矢附魔', className: 'elf', classLevel: 2, requiredLevel: 20, bookName: '火矢附魔技能書',
    skill: { id: 'fire-arrow', name: '火矢附魔', level: 2, element: 'fire', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, buffEffect: '火傷害+15', buffDuration: 300000, buffModifiers: [{ stat: 'fire_damage', value: 15, isPercent: false }], buffCategory: 'fire-enchant' } },
  { id: 'triple-shot', name: '三連射', className: 'elf', classLevel: 3, requiredLevel: 30, bookName: '三連射技能書',
    skill: { id: 'triple-shot', name: '三連射', level: 3, element: 'none', type: 'attack', target: 'single', power: 0, mpCost: 25, cooldown: 8000, hits: 3 } },
  { id: 'hawk-eye', name: '鷹眼', className: 'elf', classLevel: 4, requiredLevel: 40, bookName: '鷹眼技能書',
    skill: { id: 'hawk-eye', name: '鷹眼', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 3000, buffEffect: '命中+5,遠攻+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 5, isPercent: false }, { stat: 'ranged_attack', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'arrow-rain', name: '穿透箭雨', className: 'elf', classLevel: 5, requiredLevel: 50, bookName: '穿透箭雨技能書',
    skill: { id: 'arrow-rain', name: '穿透箭雨', level: 5, element: 'none', type: 'attack', target: 'aoe', power: 50, mpCost: 55, cooldown: 15000, aoeMin: 4, aoeMax: 6 } },

  { id: 'cd-reduce', name: '冷卻縮減', className: 'elementalist', classLevel: 1, requiredLevel: 10, bookName: '冷卻縮減技能書',
    skill: { id: 'cd-reduce', name: '冷卻縮減', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 60000, buffEffect: '冷卻-20%', buffDuration: 30000, buffModifiers: [{ stat: 'cooldown_reduction', value: 20, isPercent: true }], buffCategory: 'cd-reduction' } },
  { id: 'mana-drain', name: '魔力奪取', className: 'elementalist', classLevel: 2, requiredLevel: 20, bookName: '魔力奪取技能書',
    skill: { id: 'mana-drain', name: '魔力奪取', level: 2, element: 'none', type: 'attack', target: 'single', power: 25, mpCost: 0, cooldown: 12000 } },
  { id: 'element-boost', name: '元素增幅', className: 'elementalist', classLevel: 3, requiredLevel: 30, bookName: '元素增幅技能書',
    skill: { id: 'element-boost', name: '元素增幅', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 35, cooldown: 60000, buffEffect: '元素傷害+25%', buffDuration: 30000, buffModifiers: [{ stat: 'skill_elemental', value: 25, isPercent: true }], buffCategory: 'element-boost' } },
  { id: 'chain-cast', name: '連鎖詠唱', className: 'elementalist', classLevel: 4, requiredLevel: 40, bookName: '連鎖詠唱技能書',
    skill: { id: 'chain-cast', name: '連鎖詠唱', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 90000, buffEffect: '下3次無冷卻', buffDuration: 10000, buffCategory: 'chain-cast' } },
  { id: 'element-storm', name: '元素風暴', className: 'elementalist', classLevel: 5, requiredLevel: 50, bookName: '元素風暴技能書',
    skill: { id: 'element-storm', name: '元素風暴', level: 5, element: 'fire', type: 'attack', target: 'aoe', power: 100, mpCost: 80, cooldown: 20000, aoeMin: 6, aoeMax: 10 } },

  { id: 'holy-shield', name: '聖光護盾', className: 'priest', classLevel: 1, requiredLevel: 10, bookName: '聖光護盾技能書',
    skill: { id: 'holy-shield', name: '聖光護盾', level: 1, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 30000, buffEffect: '吸收100傷害', buffDuration: 20000, buffModifiers: [{ stat: 'shield_absorb', value: 100, isPercent: false }], buffCategory: 'holy-shield' } },
  { id: 'high-heal', name: '高階治癒', className: 'priest', classLevel: 2, requiredLevel: 20, bookName: '高階治癒技能書',
    skill: { id: 'high-heal', name: '高階治癒', level: 2, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 400, mpCost: 40, cooldown: 10000 } },
  { id: 'group-heal', name: '群體治癒', className: 'priest', classLevel: 3, requiredLevel: 30, bookName: '群體治癒技能書',
    skill: { id: 'group-heal', name: '群體治癒', level: 3, element: 'none', type: 'heal', target: 'aoe', power: 0, healAmount: 200, mpCost: 60, cooldown: 15000 } },
  { id: 'resurrect', name: '復活術', className: 'priest', classLevel: 4, requiredLevel: 40, bookName: '復活術技能書',
    skill: { id: 'resurrect', name: '復活術', level: 4, element: 'light', type: 'heal', target: 'single', power: 0, healAmount: 0, mpCost: 80, cooldown: 120000 } },
  { id: 'holy-domain', name: '神聖領域', className: 'priest', classLevel: 5, requiredLevel: 50, bookName: '神聖領域技能書',
    skill: { id: 'holy-domain', name: '神聖領域', level: 5, element: 'light', type: 'buff', target: 'aoe', power: 0, mpCost: 90, cooldown: 90000, buffEffect: '減傷30%+免疫負面', buffDuration: 10000, buffModifiers: [{ stat: 'damageReduction', value: 30, isPercent: true }], buffCategory: 'sanctuary' } },

  { id: 'envenom', name: '淬毒', className: 'thief', classLevel: 1, requiredLevel: 10, bookName: '淬毒技能書',
    skill: { id: 'envenom', name: '淬毒', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, buffEffect: '毒傷8/s', buffDuration: 300000, buffCategory: 'poison-enchant' } },
  { id: 'deadly-strike', name: '致命一擊', className: 'thief', classLevel: 2, requiredLevel: 20, bookName: '致命一擊技能書',
    skill: { id: 'deadly-strike', name: '致命一擊', level: 2, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 30000, buffEffect: '爆傷+50%', buffDuration: 15000, buffModifiers: [{ stat: 'crit_damage', value: 50, isPercent: true }], buffCategory: 'crit-buff' } },
  { id: 'smoke-bomb', name: '煙霧彈', className: 'thief', classLevel: 3, requiredLevel: 30, bookName: '煙霧彈技能書',
    skill: { id: 'smoke-bomb', name: '煙霧彈', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 20000, buffEffect: '迴避+15%', buffDuration: 10000, buffModifiers: [{ stat: 'evasion', value: 15, isPercent: true }], buffCategory: 'evasion' } },
  { id: 'precision-strike', name: '精準打擊', className: 'thief', classLevel: 4, requiredLevel: 40, bookName: '精準打擊技能書',
    skill: { id: 'precision-strike', name: '精準打擊', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 3000, buffEffect: '命中+10,爆擊+10%', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 10, isPercent: false }, { stat: 'crit_rate', value: 10, isPercent: true }], buffCategory: 'accuracy' } },
  { id: 'backstab', name: '背刺', className: 'thief', classLevel: 5, requiredLevel: 50, bookName: '背刺技能書',
    skill: { id: 'backstab', name: '背刺', level: 5, element: 'none', type: 'attack', target: 'single', power: 100, mpCost: 50, cooldown: 20000 } },
];

export function ClassGuild() {
  const char = useGameStore(s => s.character);
  const skills = useGameStore(s => s.skills);
  const bagItems = useGameStore(s => s.bagItems);

  const acceptQuest = useGameStore(s => s.acceptQuest);
  const completeQuest = useGameStore(s => s.completeQuest);

  if (!char) return null;

  const myClassSkills = CLASS_SKILLS.filter(s => s.className === char.className);
  const learnedIds = skills.map(s => s.id);

  const availableQuests = getAvailableQuests(char);
  const activeQuests = char.quests.filter(q => q.status === 'active' || q.status === 'completable');

  function getAreaName(areaId: string): string {
    const region = getRegion(areaId);
    return region?.name ?? areaId;
  }

  function renderQuestProgress(quest: Quest): string {
    if (quest.type === 'errand') {
      return `${quest.killCount ?? 0} / ${ERRAND_KILL_TARGET} 隻`;
    }
    return `${quest.materialCount ?? 0} / ${COLLECT_MATERIAL_TARGET} 個`;
  }

  function renderQuestDescription(quest: Quest): string {
    if (quest.type === 'errand') {
      return `前往 ${getAreaName(quest.targetArea!)} 擊殺 ${ERRAND_KILL_TARGET} 隻怪物`;
    }
    return `擊殺 ${quest.targetMonster} 收集 ${COLLECT_MATERIAL_TARGET} 個任務素材`;
  }

  function learnSkill(def: ClassSkillDef) {
    const bag = useGameStore.getState().bagItems;
    const book = bag.find(b => b.name === def.bookName);
    if (!book || book.amount <= 0) return;
    if (char!.level < def.requiredLevel) return;
    if (learnedIds.includes(def.id)) return;

    const newBag = bag.map(b =>
      b.name === def.bookName ? { ...b, amount: b.amount - 1 } : b
    ).filter(b => b.amount > 0);

    const newSkill: Skill = { ...def.skill, lastUsedAt: 0 };
    const currentSkills = useGameStore.getState().skills;
    const updatedSkills = [...currentSkills, newSkill];
    const currentChar = useGameStore.getState().character;

    useGameStore.setState({
      bagItems: newBag,
      skills: updatedSkills,
      character: currentChar ? { ...currentChar, skills: updatedSkills } : currentChar,
    });
    useGameStore.getState().saveState();
  }

  return (
    <div className="guild-panel">
      <p className="shop-greeting">「歡迎來到職業工會。帶來技能書了嗎？」</p>

      <h4>任務</h4>
      <div className="guild-quest-list">
        {availableQuests.length === 0 && activeQuests.length === 0 && (
          <p className="empty-text">目前沒有可接取的任務</p>
        )}
        {availableQuests.map(quest => {
          const template = QUEST_TEMPLATES.find(t => t.id === quest.id);
          return (
            <div key={quest.id} className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name">
                  {quest.type === 'errand' ? '跑腿任務' : '素材收集任務'}（{template?.skillLevel}級技能書）
                </span>
                <span className="shop-item-desc">Lv.{quest.requiredLevel} 解鎖</span>
              </div>
              <div className="shop-item-actions">
                <button onClick={() => acceptQuest(quest.id)}>接取</button>
              </div>
            </div>
          );
        })}
        {activeQuests.map(quest => (
          <div key={quest.id} className={`shop-item ${quest.status === 'completable' ? 'completable' : ''}`}>
            <div className="shop-item-info">
              <span className="shop-item-name">
                {quest.type === 'errand' ? '跑腿任務' : '素材收集任務'}
              </span>
              <span className="shop-item-desc">
                {renderQuestDescription(quest)} — {renderQuestProgress(quest)}
              </span>
            </div>
            <div className="shop-item-actions">
              {quest.status === 'completable' ? (
                <button onClick={() => completeQuest(quest.id)}>交付</button>
              ) : (
                <span className="guild-learned-tag">進行中</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <h4>職業技能（{char.className}）</h4>
      <div className="guild-skill-list">
        {myClassSkills.map(def => {
          const learned = learnedIds.includes(def.id);
          const hasBook = bagItems.some(b => b.name === def.bookName && b.amount > 0);
          const levelOk = char.level >= def.requiredLevel;
          const canLearn = !learned && hasBook && levelOk;

          return (
            <div key={def.id} className={`shop-item ${learned ? 'learned' : ''}`}>
              <div className="shop-item-info">
                <span className="shop-item-name">{def.name}</span>
                <span className="shop-item-desc">
                  Lv.{def.requiredLevel} | {def.skill.type} | MP {def.skill.mpCost}
                </span>
              </div>
              <div className="shop-item-actions">
                {learned ? (
                  <span className="guild-learned-tag">已學習</span>
                ) : (
                  <button
                    onClick={() => learnSkill(def)}
                    disabled={!canLearn}
                    title={!levelOk ? `需要等級 ${def.requiredLevel}` : !hasBook ? `需要 ${def.bookName}` : ''}
                  >
                    學習
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h4>已學習技能</h4>
      {(() => {
        const classSkillIds = myClassSkills.map(s => s.id);
        const learnedClassSkills = skills.filter(s => classSkillIds.includes(s.id));
        return learnedClassSkills.length === 0 ? (
          <p className="empty-text">尚未學習任何職業技能</p>
        ) : (
          learnedClassSkills.map(skill => (
            <div key={skill.id} className="learned-skill">
              <span>{skill.name}</span>
              <span className="skill-meta">MP:{skill.mpCost} / {skill.type}</span>
            </div>
          ))
        );
      })()}
    </div>
  );
}
