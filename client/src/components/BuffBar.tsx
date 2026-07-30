import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';

const MAX_VISIBLE = 8;

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export function BuffBar() {
  const activeEffects = useGameStore(s => s.activeEffects);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // § 24.8.2：Buff 與 Debuff 同排顯示，以框色區分（buff 藍框 / debuff 紅框）
  const playerEffects = activeEffects.filter(
    e => e.target === 'player' && (e.type === 'buff' || e.type === 'debuff')
  );

  if (playerEffects.length === 0) return null;

  const now = Date.now();
  const visible = playerEffects.slice(0, MAX_VISIBLE);
  const overflow = playerEffects.length - MAX_VISIBLE;

  return (
    <div className="buff-bar">
      {visible.map(effect => {
        const remaining = effect.startTime + effect.duration - now;
        const isExpiring = remaining > 0 && remaining < 5000;
        const iconName = getEffectIcon(effect.category);
        const isDebuff = effect.type === 'debuff';

        return (
          <Tooltip
            key={effect.id}
            position="bottom"
            content={
              <div className="buff-tooltip-content">
                <div className={`buff-tooltip-name${isDebuff ? ' debuff' : ''}`}>{effect.name}</div>
                <div className="buff-tooltip-desc">{effect.description}</div>
                <div className="buff-tooltip-time">剩餘: {formatTime(remaining)}</div>
                <div className="buff-tooltip-source">來源: {effect.sourceSkillName}</div>
              </div>
            }
          >
            <div
              className={`buff-icon ${isDebuff ? 'is-debuff' : 'is-buff'} ${isExpiring ? 'expiring' : ''}`}
              data-testid={isDebuff ? 'player-debuff-icon' : 'player-buff-icon'}
            >
              <GameIcon name={iconName} size={28} />
              <span className="buff-timer">{formatTime(remaining)}</span>
            </div>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <div className="buff-overflow">+{overflow}</div>
      )}
    </div>
  );
}
