import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useMonsterHudStore } from '../stores/monsterHudStore';
import { useCombatCommandStore } from '../stores/combatCommandStore';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';
import { useIsMobile } from '../hooks/useViewport';
import type { ActiveEffect } from '../models/effect';

const MAX_VISIBLE_DEBUFFS = 4;

/**
 * debuff icon 的邊長。手機的怪物卡縮到七成（`24-buff-debuff.md` § 24.8.3），
 * icon 要跟著縮 —— `GameIcon` 的尺寸是 inline style，CSS class 蓋不過去，
 * 只能在這裡分流。
 */
const DEBUFF_ICON_SIZE = { desktop: 24, mobile: 17 } as const;

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
  const requestTarget = useCombatCommandStore(s => s.requestTarget);
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
            role="button"
            tabIndex={0}
            aria-pressed={entry.id === targetId}
            aria-label={`指定目標 ${entry.name}`}
            /*
             * 卡片也是切目標的入口（§ 3.6.1）：怪擠在一起時地圖上點不準，
             * 列表是唯一分得開的地方。走 `onPointerDown` 而不是 `onClick` ——
             * 卡片會隨怪物死亡而消失，按下與放開之間清單重排時 click 會整個丟失。
             */
            onPointerDown={() => requestTarget(entry.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                requestTarget(entry.id);
              }
            }}
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
  const isMobile = useIsMobile();
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
        <GameIcon
          name={getEffectIcon(effect.category)}
          size={isMobile ? DEBUFF_ICON_SIZE.mobile : DEBUFF_ICON_SIZE.desktop}
        />
        <span className="monster-debuff-timer">{formatTime(remaining)}</span>
      </div>
    </Tooltip>
  );
}
