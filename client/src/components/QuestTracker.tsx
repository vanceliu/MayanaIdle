import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import type { Quest } from '../models/quest';
import { ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../models/quest';
import { getAreaDisplayName } from '../wiki/hooks/useWikiData';

export function QuestTracker() {
  const [isOpen, setIsOpen] = useState(false);
  const character = useGameStore(s => s.character);
  const adventurerQuests = useGameStore(s => s.adventurerQuests);

  if (!character) return null;

  const classQuests = character.quests.filter(
    (q: Quest) => q.status === 'active' || q.status === 'completable'
  );
  const totalQuests = classQuests.length + adventurerQuests.length;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="quest-tracker-btn" onClick={() => setIsOpen(!isOpen)}>
        📋 任務
        {totalQuests > 0 && (
          <span className="quest-count-badge">{totalQuests}</span>
        )}
      </button>

      {isOpen && (
        <div className="quest-tracker-panel">
          <h4>進行中的任務</h4>

          {totalQuests === 0 && (
            <p className="empty-text">目前無進行中的任務</p>
          )}

          {classQuests.map((quest: Quest) => (
            <div key={quest.id} className={`quest-tracker-item ${quest.status === 'completable' ? 'completable' : ''}`}>
              <div className="tracker-title">
                <span className="tracker-source">[職業]</span>
                {quest.type === 'errand' ? '職業試煉 — 實戰訓練' : '職業試煉 — 稀有材料'}
              </div>
              <div className="tracker-area">
                {quest.targetArea && getAreaDisplayName(quest.targetArea)}
                {quest.targetMonster && ` — ${quest.targetMonster}`}
              </div>
              <div className="tracker-progress">
                {quest.type === 'errand' ? (
                  <>擊殺：<strong>{quest.killCount ?? 0}/{ERRAND_KILL_TARGET}</strong></>
                ) : (
                  <>素材：<strong>{quest.materialCount ?? 0}/{COLLECT_MATERIAL_TARGET}</strong></>
                )}
                {quest.status === 'completable' && <span className="quest-highlight"> — 可交付</span>}
              </div>
            </div>
          ))}

          {adventurerQuests.map(quest => (
            <div key={quest.id} className={`quest-tracker-item ${quest.status === 'completable' ? 'completable' : ''}`}>
              <div className="tracker-title">
                <span className="tracker-source">[冒險]</span>
                {quest.title}
              </div>
              <div className="tracker-area">
                {getAreaDisplayName(quest.targetArea)}
                {quest.targetMonster && ` — ${quest.targetMonster}`}
              </div>
              <div className="tracker-progress">
                進度：<strong>{quest.currentCount}/{quest.targetCount}</strong>
                {quest.status === 'completable' && <span className="quest-highlight"> — 可交付</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
