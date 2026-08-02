import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useMonsterHudStore } from '../stores/monsterHudStore';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';
import type { ActiveEffect } from '../models/effect';

const MAX_VISIBLE_DEBUFFS = 4;

function formatTime(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

/**
 * 地圖怪物列表（§ 24.8.3）
 *
 * 浮動於 canvas 上方置中，地圖上有幾隻怪就顯示幾張卡片；
 * 玩家目前攻擊的目標以外框高亮，卡片下方為怪物 debuff icon 列。
 */
export function MonsterListOverlay() {
  const entries = useMonsterHudStore(s => s.entries);
  const targetId = useMonsterHudStore(s => s.targetId);
  const activeEffects = useGameStore(s => s.activeEffects);
  const [, setTick] = useState(0);

  // 剩餘秒數顯示由 UI 每秒自刷；過期清除仍由戰鬥 tick 負責（§ 24.8.1）
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;

  const now = Date.now();

  return (
    <div className="monster-list-overlay" data-testid="monster-list-overlay">
      {entries.map(entry => {
        const hpPercent = entry.maxHp > 0
          ? Math.max(0, Math.min(100, (entry.currentHp / entry.maxHp) * 100))
          : 0;
        const debuffs = activeEffects.filter(
          e => e.type === 'debuff' && e.target === 'monster' && e.targetMonsterId === entry.id
        );

        return (
          <div
            key={entry.id}
            className={`monster-card${entry.isBoss ? ' is-boss' : ''}${entry.id === targetId ? ' is-target' : ''}`}
            data-testid="monster-card"
          >
            <div className="monster-card-name">{entry.name}</div>
            <div className="monster-card-hp">
              <div className="monster-card-hp-fill" style={{ width: `${hpPercent}%` }} />
            </div>
            {debuffs.length > 0 && (
              <div className="monster-card-debuffs">
                {debuffs.slice(0, MAX_VISIBLE_DEBUFFS).map(effect => (
                  <MonsterDebuffIcon key={effect.id} effect={effect} now={now} />
                ))}
                {debuffs.length > MAX_VISIBLE_DEBUFFS && (
                  <span className="monster-card-debuff-overflow">
                    +{debuffs.length - MAX_VISIBLE_DEBUFFS}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonsterDebuffIcon({ effect, now }: { effect: ActiveEffect; now: number }) {
  const remaining = effect.startTime + effect.duration - now;
  const isExpiring = remaining > 0 && remaining < 5000;

  return (
    <Tooltip
      position="bottom"
      content={
        <div className="buff-tooltip-content">
          <div className="buff-tooltip-name debuff">{effect.name}</div>
          <div className="buff-tooltip-desc">{effect.description}</div>
          <div className="buff-tooltip-time">剩餘: {formatTime(remaining)}</div>
          <div className="buff-tooltip-source">來源: {effect.sourceSkillName}</div>
        </div>
      }
    >
      <div
        className={`monster-debuff-icon${isExpiring ? ' expiring' : ''}`}
        data-testid="monster-debuff-icon"
      >
        <GameIcon name={getEffectIcon(effect.category)} size={24} />
        <span className="monster-debuff-timer">{formatTime(remaining)}</span>
      </div>
    </Tooltip>
  );
}
