import { useGameStore } from '../stores/gameStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { PanelDockFace } from './PanelDockFace';
import type { Quest } from '../models/quest';
import { ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../models/quest';
import { getAreaDisplayName } from '../wiki/hooks/useWikiData';

/**
 * 任務追蹤（§ 36.10.3）
 *
 * 按鈕位於底部 `PanelDock`，與其他面板按鈕並列（額外帶任務數量 badge）；
 * 點擊後開啟可拖曳的半透明浮動視窗，預設落在 stage 右上角。
 */
export function QuestTrackerButton() {
  const character = useGameStore(s => s.character);
  const adventurerQuests = useGameStore(s => s.adventurerQuests);
  const isOpen = usePanelWindowStore(s => s.open.quest);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();

  if (!character) return null;

  const classQuests = character.quests.filter(
    (q: Quest) => q.status === 'active' || q.status === 'completable'
  );
  const totalQuests = classQuests.length + adventurerQuests.length;

  return (
    <button
      className={`panel-dock-btn quest-tracker-btn ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('quest', isMobile)}
      {...panelButtonA11y('quest')}
    >
      {/* 圖示與文字兩者都畫，由 CSS 決定顯示哪一個（`47-mobile.md`） */}
      <PanelDockFace panelKey="quest" />
      {totalQuests > 0 && (
        <span className="quest-count-badge">{totalQuests}</span>
      )}
    </button>
  );
}

/** 任務內容（由 `PanelWindows` 包在 FloatingWindow 內渲染） */
export function QuestTrackerContent() {
  const character = useGameStore(s => s.character);
  const adventurerQuests = useGameStore(s => s.adventurerQuests);

  if (!character) return null;

  const classQuests = character.quests.filter(
    (q: Quest) => q.status === 'active' || q.status === 'completable'
  );
  const totalQuests = classQuests.length + adventurerQuests.length;

  return (
    <div className="quest-tracker-content">
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
  );
}
