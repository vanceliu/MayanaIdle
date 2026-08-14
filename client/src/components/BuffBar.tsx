import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';
import { getRestedExpRemaining } from '../systems/restedExp';
import type { ActiveEffect } from '../models/effect';

/** icon 邊長（§ 24.8.1）。外框由 `.buff-icon` 的寬度決定，兩者要一起改 */
const BUFF_ICON_SIZE = 36;

/** 每一列各自的顯示上限（§ 24.8.2：buff 與 debuff 分列，各自計算溢位） */
const MAX_VISIBLE_PER_ROW = 8;

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export function BuffBar() {
  const activeEffects = useGameStore(s => s.activeEffects);
  const character = useGameStore(s => s.character);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // § 24.8.2：Buff 與 Debuff 分成兩列，再以框色區分（buff 藍框 / debuff 紅框）
  const playerEffects = activeEffects.filter(
    e => e.target === 'player' && (e.type === 'buff' || e.type === 'debuff')
  );

  const restedMs = character ? getRestedExpRemaining(character, Date.now()) : 0;

  if (playerEffects.length === 0 && restedMs <= 0) return null;

  const buffs = playerEffects.filter(e => e.type === 'buff');
  const debuffs = playerEffects.filter(e => e.type === 'debuff');

  return (
    <div className="buff-bar">
      {restedMs > 0 && <RestedExpRow remainingMs={restedMs} />}
      {buffs.length > 0 && <EffectRow effects={buffs} kind="buff" />}
      {debuffs.length > 0 && <EffectRow effects={debuffs} kind="debuff" />}
    </div>
  );
}

/** 回鍋經驗加倍倒數（§ 24.8.6）。不是 buff，不進 `activeEffects` */
function RestedExpRow({ remainingMs }: { remainingMs: number }) {
  return (
    <div className="buff-row is-rested">
      <Tooltip
        position="bottom"
        content={
          <div className="buff-tooltip-content">
            <div className="buff-tooltip-name rested">回鍋加倍</div>
            <div className="buff-tooltip-desc">擊殺經驗 ×2</div>
            <div className="buff-tooltip-time">剩餘: {formatTime(remainingMs)}</div>
            <div className="buff-tooltip-source">來源: 離線 1 分鐘累積 30 秒，上限 12 小時</div>
          </div>
        }
      >
        <div className="buff-icon is-rested" data-testid="rested-exp-icon">
          <GameIcon name="items/hourglass" size={BUFF_ICON_SIZE} />
          <span className="buff-timer">{formatTime(remainingMs)}</span>
        </div>
      </Tooltip>
    </div>
  );
}

function EffectRow({ effects, kind }: { effects: ActiveEffect[]; kind: 'buff' | 'debuff' }) {
  const now = Date.now();
  const visible = effects.slice(0, MAX_VISIBLE_PER_ROW);
  const overflow = effects.length - MAX_VISIBLE_PER_ROW;
  const isDebuff = kind === 'debuff';

  return (
    <div className={`buff-row is-${kind}`}>
      {visible.map(effect => {
        const remaining = effect.startTime + effect.duration - now;
        const isExpiring = remaining > 0 && remaining < 5000;
        const iconName = getEffectIcon(effect.category);

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
              <GameIcon name={iconName} size={BUFF_ICON_SIZE} />
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
