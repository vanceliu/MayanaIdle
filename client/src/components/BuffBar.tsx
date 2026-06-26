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

  const playerBuffs = activeEffects.filter(e => e.type === 'buff' && e.target === 'player');

  if (playerBuffs.length === 0) return null;

  const now = Date.now();
  const visible = playerBuffs.slice(0, MAX_VISIBLE);
  const overflow = playerBuffs.length - MAX_VISIBLE;

  return (
    <div className="buff-bar">
      {visible.map(buff => {
        const remaining = buff.startTime + buff.duration - now;
        const isExpiring = remaining > 0 && remaining < 5000;
        const iconName = getEffectIcon(buff.category);

        return (
          <Tooltip
            key={buff.id}
            position="bottom"
            content={
              <div className="buff-tooltip-content">
                <div className="buff-tooltip-name">{buff.name}</div>
                <div className="buff-tooltip-desc">{buff.description}</div>
                <div className="buff-tooltip-time">剩餘: {formatTime(remaining)}</div>
                <div className="buff-tooltip-source">來源: {buff.sourceSkillName}</div>
              </div>
            }
          >
            <div className={`buff-icon ${isExpiring ? 'expiring' : ''}`}>
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
