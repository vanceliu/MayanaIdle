import { useGameStore } from '../../stores/gameStore';
import { QUEST_TEMPLATES, ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../../models/quest';
import type { Quest } from '../../models/quest';
import { getAvailableQuests } from '../../systems/questSystem';
import { getRegion } from '../../models/mapData';

/** 冒險者工會「職業任務」分頁（`13-town.md` § 13.10） */
export function ClassQuests() {
  const char = useGameStore(s => s.character);
  const acceptQuest = useGameStore(s => s.acceptQuest);
  const completeQuest = useGameStore(s => s.completeQuest);

  if (!char) return null;

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

  return (
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
  );
}
