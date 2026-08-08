import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { AdventurerQuest, AdventurerQuestDifficulty, QuestTownId } from '../../models/adventurerQuest';
import { getNextRank, MAX_ACTIVE_ADVENTURER_QUESTS, getTownDifficulties, isBossDifficulty, QUEST_BOARD_REFRESH_COST } from '../../models/adventurerQuest';
import { getPointsToNextRank } from '../../systems/adventurerQuestSystem';
import { getItemById } from '../../models/items';

function QuestDescription({ description }: { description: string }) {
  const parts = description.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="shop-item-desc">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="quest-highlight">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/** 獎勵道具的顯示名。一律由 id 反查 seed（§ 99.1），不在任務資料裡固化名稱 */
function rewardItemName(reward: AdventurerQuest['reward']): string {
  return reward.itemId != null ? getItemById(reward.itemId)?.name ?? '未知道具' : '未知道具';
}

function RewardPreview({ quest }: { quest: AdventurerQuest }) {
  const { reward } = quest;
  switch (reward.type) {
    case 'gold':
      return <span className="quest-reward">💰 {reward.amount} 金幣</span>;
    case 'potion':
      return <span className="quest-reward">🧪 {rewardItemName(reward)} ×{reward.amount}</span>;
    case 'quality-stone':
      return <span className="quest-reward">💎 {rewardItemName(reward)} ×{reward.amount}</span>;
    case 'enhancement-stone':
      return <span className="quest-reward">🔮 {rewardItemName(reward)} ×{reward.amount}</span>;
    case 'weapon-scroll':
      return <span className="quest-reward">📜 {rewardItemName(reward)} ×{reward.amount}</span>;
    case 'armor-scroll':
      return <span className="quest-reward">📜 {rewardItemName(reward)} ×{reward.amount}</span>;
    case 'crafting-material':
      return <span className="quest-reward">🔧 {rewardItemName(reward)} ×{reward.amount}</span>;
  }
}

function QuestTypeTag({ type }: { type: AdventurerQuest['type'] }) {
  const labels = { errand: '殲滅', collect: '收集', endurance: '持續', errandboss: 'BOSS討伐', collectboss: 'BOSS素材' };
  return <span className="quest-type-tag">[{labels[type]}]</span>;
}

const TOWN_NAMES: Record<QuestTownId, string> = {
  'neutral-town': '薄暮村',
  'elsarth-town': '艾爾薩斯',
  'varden-town': '瓦爾登',
};

export function AdventurerGuild() {
  const currentArea = useGameStore(s => s.character?.currentArea) as QuestTownId | undefined;
  const townId: QuestTownId = currentArea && (currentArea in TOWN_NAMES) ? currentArea : 'neutral-town';
  const availableDifficulties = useMemo(() => getTownDifficulties(townId), [townId]);
  const [activeDifficulty, setActiveDifficulty] = useState<AdventurerQuestDifficulty>(availableDifficulties[0]);
  const questBoard = useGameStore(s => s.adventurerQuestBoard);
  const activeQuests = useGameStore(s => s.adventurerQuests);
  const guildProgress = useGameStore(s => s.guildProgress);
  const acceptAdventurerQuest = useGameStore(s => s.acceptAdventurerQuest);
  const abandonAdventurerQuest = useGameStore(s => s.abandonAdventurerQuest);
  const completeAdventurerQuest = useGameStore(s => s.completeAdventurerQuest);
  const questBoardTownId = useGameStore(s => s.questBoardTownId);
  const initQuestBoard = useGameStore(s => s.initQuestBoard);
  const rerollQuestBoard = useGameStore(s => s.rerollQuestBoard);

  useEffect(() => {
    if (questBoardTownId !== townId) {
      initQuestBoard();
    }
  }, [initQuestBoard, townId, questBoardTownId]);

  useEffect(() => {
    if (!availableDifficulties.includes(activeDifficulty)) {
      setActiveDifficulty(availableDifficulties[0]);
    }
  }, [availableDifficulties, activeDifficulty]);

  const currentBoard = questBoard[activeDifficulty] ?? [];
  const activeCount = activeQuests.length;
  const canAccept = activeCount < MAX_ACTIVE_ADVENTURER_QUESTS;

  const canReroll = guildProgress.points >= QUEST_BOARD_REFRESH_COST;

  const nextRank = getNextRank(guildProgress.rank);
  const pointsToNext = getPointsToNextRank(guildProgress);

  return (
    <div className="guild-panel">
      <p className="shop-greeting">「歡迎來到冒險者工會。有什麼任務想接嗎？」</p>

      <div className="adventurer-guild-status">
        <span>等階：<strong>{guildProgress.rank}</strong></span>
        <span>貢獻：{guildProgress.points}</span>
        {nextRank && pointsToNext != null && (
          <span>下一階（{nextRank}）還需：{pointsToNext}</span>
        )}
        <span>已接取：{activeCount}/{MAX_ACTIVE_ADVENTURER_QUESTS}</span>
      </div>

      {/* 只有任務清單會捲動，等階／貢獻狀態固定在上方 */}
      <div className="panel-scroll">
      {activeQuests.length > 0 && (
        <>
          <h4>進行中的任務</h4>
          <div className="shop-items">
            {activeQuests.map(quest => (
              <div key={quest.id} className={`shop-item ${quest.status === 'completable' ? 'completable' : ''}`}>
                <div className="shop-item-info">
                  <span className="shop-item-name">
                    <QuestTypeTag type={quest.type} /> {quest.title}
                    <span className="quest-difficulty-badge">{quest.difficulty}</span>
                  </span>
                  <QuestDescription description={quest.description} />
                  <span className="quest-progress">
                    進度：<strong>{quest.currentCount}/{quest.targetCount}</strong>
                  </span>
                  <RewardPreview quest={quest} />
                </div>
                <div className="shop-item-actions">
                  {quest.status === 'completable' ? (
                    <button onClick={() => completeAdventurerQuest(quest.id)}>交付</button>
                  ) : (
                    <button className="btn-danger" onClick={() => abandonAdventurerQuest(quest.id)}>退出</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 難度分級釘在捲動區頂端：不隨任務清單捲走，又能保持在「進行中的任務」之後 */}
      <div className="shop-tabs panel-sticky">
        <span className="quest-town-label">{TOWN_NAMES[townId]}分部</span>
        {availableDifficulties.map(d => (
          <button
            key={d}
            className={`${activeDifficulty === d ? 'active' : ''}${isBossDifficulty(d) ? ' is-boss-tab' : ''}`}
            onClick={() => setActiveDifficulty(d)}
          >
            {d} 級
          </button>
        ))}
        {/* § 36.6.3：只刷目前分頁，貢獻不足 50 時禁用 */}
        <button
          className="quest-reroll-btn"
          disabled={!canReroll}
          onClick={() => rerollQuestBoard(activeDifficulty)}
          title={canReroll ? undefined : `貢獻不足 ${QUEST_BOARD_REFRESH_COST}`}
        >
          重整（-{QUEST_BOARD_REFRESH_COST} 貢獻）
        </button>
      </div>

      <div className="shop-items">
        {currentBoard.length === 0 && (
          <p className="empty-text">目前沒有可用任務</p>
        )}
        {currentBoard.map(quest => {
          const isAccepted = activeQuests.some(q => q.id === quest.id);
          const activeVersion = activeQuests.find(q => q.id === quest.id);
          const isCompletable = activeVersion?.status === 'completable';

          return (
            <div key={quest.id} className={`shop-item ${isCompletable ? 'completable' : ''}`}>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  <QuestTypeTag type={quest.type} /> {quest.title}
                </span>
                <QuestDescription description={quest.description} />
                {isAccepted && activeVersion && (
                  <span className="quest-progress">
                    進度：<strong>{activeVersion.currentCount}/{activeVersion.targetCount}</strong>
                  </span>
                )}
                <RewardPreview quest={quest} />
                <span className="quest-contribution">貢獻 +{quest.contributionPoints}</span>
              </div>
              <div className="shop-item-actions">
                {isCompletable ? (
                  <button onClick={() => completeAdventurerQuest(quest.id)}>交付</button>
                ) : isAccepted ? (
                  <button className="btn-danger" onClick={() => abandonAdventurerQuest(quest.id)}>退出</button>
                ) : (
                  <button onClick={() => acceptAdventurerQuest(quest)} disabled={!canAccept}>
                    接取
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
