import { useGameStore } from '../stores/gameStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { PanelDockFace } from './PanelDockFace';
import type { Quest } from '../models/quest';
import { ERRAND_KILL_TARGET, COLLECT_MATERIAL_TARGET } from '../models/quest';
import { getAreaDisplayName } from '../wiki/hooks/useWikiData';
import type { CraftQuest } from '../models/craftQuest';
import { evaluateCraftRequirements } from '../systems/craftQuestSystem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getItemById } from '../models/items';
import type { AdventurerQuest } from '../models/adventurerQuest';
import { isDeliverQuestType } from '../models/adventurerQuest';
import { isDeliverQuestSatisfied } from '../systems/adventurerQuestSystem';
import type { BagItem } from '../models/bagItem';
import { getBagItemAmount } from '../models/bagItem';

/**
 * 任務追蹤（§ 36.10.3）
 *
 * 按鈕位於底部 `PanelDock`，與其他面板按鈕並列（額外帶任務數量 badge）；
 * 點擊後開啟可拖曳的半透明浮動視窗，預設落在 stage 右上角。
 */
export function QuestTrackerButton() {
  const character = useGameStore(s => s.character);
  const adventurerQuests = useGameStore(s => s.adventurerQuests);
  const craftQuests = useGameStore(s => s.craftQuests);
  const isOpen = usePanelWindowStore(s => s.open.quest);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();

  if (!character) return null;

  const classQuests = character.quests.filter(
    (q: Quest) => q.status === 'active' || q.status === 'completable'
  );
  const totalQuests = classQuests.length + adventurerQuests.length + craftQuests.length;

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

/**
 * 製作任務的單張卡片（§ 36.13.4）
 *
 * 需求沒有累積進度，每次 render 都由當下的背包重算 ——
 * 賣掉素材或前置裝備，「可製作」就會即時消失。
 */
function CraftQuestItem({ quest }: { quest: CraftQuest }) {
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const templates = useEquipmentTemplates();

  // 裝備名稱一律由 id 反查 seed，不在任務資料內固化（§ 99.1 第 3 條）
  const recipe = templates.find(t => t.id === quest.templateId);
  if (!recipe) return null;

  const status = evaluateCraftRequirements(recipe, bagItems, inventory);
  const prereqName = status.prerequisite
    ? templates.find(t => t.id === status.prerequisite!.templateId)?.name ?? `#${status.prerequisite.templateId}`
    : null;

  return (
    <div className={`quest-tracker-item ${status.ready ? 'completable' : ''}`}>
      <div className="tracker-title">
        <span className="tracker-source">[製作]</span>
        {recipe.name}
      </div>
      <div className="tracker-craft-reqs">
        {status.prerequisite && (
          <span className={`tracker-craft-req ${status.prerequisite.enough ? '' : 'lacking'}`}>
            {prereqName} <strong>{status.prerequisite.have}/{status.prerequisite.need}</strong>
          </span>
        )}
        {status.materials.map(mat => (
          <span key={mat.itemId} className={`tracker-craft-req ${mat.enough ? '' : 'lacking'}`}>
            {getItemById(mat.itemId)?.name ?? `#${mat.itemId}`} <strong>{mat.have}/{mat.need}</strong>
          </span>
        ))}
      </div>
      <div className="tracker-actions">
        {status.ready && <span className="quest-highlight">可製作</span>}
        {/* § 36.13.5：取消製作任務無代價 */}
        <button className="btn-danger tracker-cancel" onClick={() => abandonCraftQuest(quest.id)}>
          取消
        </button>
      </div>
    </div>
  );
}

/** 交付型看背包、其餘看累積進度（§ 36.11） */
function isAdventurerQuestDone(quest: AdventurerQuest, bagItems: BagItem[]): boolean {
  return isDeliverQuestType(quest.type)
    ? isDeliverQuestSatisfied(quest, bagItems)
    : quest.status === 'completable';
}

function AdventurerQuestProgress({ quest, bagItems }: { quest: AdventurerQuest; bagItems: BagItem[] }) {
  if (isDeliverQuestType(quest.type) && quest.targetItemId != null) {
    const have = getBagItemAmount(bagItems, quest.targetItemId);
    const name = getItemById(quest.targetItemId)?.name ?? '未知道具';
    return (
      <>
        {name}：<strong className={have >= quest.targetCount ? '' : 'lacking'}>
          {have}/{quest.targetCount}
        </strong>
      </>
    );
  }
  if (quest.type === 'multierrand' && quest.subTargets) {
    return (
      <>
        {quest.subTargets.map(sub => (
          <span key={sub.monster} className="quest-subtarget">
            {sub.monster} <strong>{sub.currentCount}/{sub.targetCount}</strong>
          </span>
        ))}
      </>
    );
  }
  return <>進度：<strong>{quest.currentCount}/{quest.targetCount}</strong></>;
}

/** 任務內容（由 `PanelWindows` 包在 FloatingWindow 內渲染） */
export function QuestTrackerContent() {
  const character = useGameStore(s => s.character);
  const adventurerQuests = useGameStore(s => s.adventurerQuests);
  const craftQuests = useGameStore(s => s.craftQuests);
  const abandonAdventurerQuest = useGameStore(s => s.abandonAdventurerQuest);
  const bagItems = useGameStore(s => s.bagItems);

  if (!character) return null;

  const classQuests = character.quests.filter(
    (q: Quest) => q.status === 'active' || q.status === 'completable'
  );
  const totalQuests = classQuests.length + adventurerQuests.length + craftQuests.length;

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
        <div key={quest.id} className={`quest-tracker-item ${isAdventurerQuestDone(quest, bagItems) ? 'completable' : ''}`}>
          <div className="tracker-title">
            <span className="tracker-source">[冒險]</span>
            {quest.title}
          </div>
          {/* 交付型不看區域，寫了會被讀成必須去那裡（§ 36.10.2） */}
          {!isDeliverQuestType(quest.type) && (
            <div className="tracker-area">
              {getAreaDisplayName(quest.targetArea)}
              {quest.targetMonster && ` — ${quest.targetMonster}`}
            </div>
          )}
          <div className="tracker-progress">
            <AdventurerQuestProgress quest={quest} bagItems={bagItems} />
            {isAdventurerQuestDone(quest, bagItems) && <span className="quest-highlight"> — 可交付</span>}
          </div>
          <div className="tracker-actions">
            {/* § 36.10.3：追蹤視窗直接退出，代價與冒險者工會面板相同（扣等量貢獻） */}
            <button
              className="btn-danger tracker-cancel"
              onClick={() => abandonAdventurerQuest(quest.id)}
            >
              退出（-{quest.contributionPoints} 貢獻）
            </button>
          </div>
        </div>
      ))}

      {craftQuests.map(quest => (
        <CraftQuestItem key={quest.id} quest={quest} />
      ))}
    </div>
  );
}
