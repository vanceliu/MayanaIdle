import { useGameStore } from '../../stores/gameStore';
import type { Skill } from '../../models/skill';
import { QUEST_TEMPLATES, ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../../models/quest';
import type { Quest } from '../../models/quest';
import { getAvailableQuests } from '../../systems/questSystem';
import { getRegion } from '../../models/mapData';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { ClassSkillDef } from '../../models/classSkills';

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

  function renderQuestDescription(quest: Quest) {
    if (quest.type === 'errand') {
      const areaName = getAreaName(quest.targetArea!);
      return (
        <span className="shop-item-desc">
          工會師傅要求你前往 <strong className="quest-highlight">{areaName}</strong> 進行實戰訓練。請擊殺任意怪物 <strong className="quest-highlight">{ERRAND_KILL_TARGET} 隻</strong> 以證明你的實力。
        </span>
      );
    }
    const areaName = getAreaName(quest.targetArea!);
    return (
      <span className="shop-item-desc">
        為了製作技能書的特殊墨水，工會需要特定素材。請擊殺 <strong className="quest-highlight">{areaName}</strong> 的 <strong className="quest-highlight">{quest.targetMonster}</strong> 收集素材 <strong className="quest-highlight">{COLLECT_MATERIAL_TARGET} 個</strong>。
      </span>
    );
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
                  {quest.type === 'errand' ? '職業試煉 — 實戰訓練' : '職業試煉 — 稀有材料'}（{template?.skillLevel}級技能書）
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
                {quest.type === 'errand' ? '職業試煉 — 實戰訓練' : '職業試煉 — 稀有材料'}
              </span>
              {renderQuestDescription(quest)}
              <span className="quest-progress">
                進度：<strong>{renderQuestProgress(quest)}</strong>
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
