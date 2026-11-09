import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getAbilityMeterValue } from '../models/abilityMeter';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';
import { getRestedExpRemaining } from '../systems/restedExp';
import type { ActiveEffect } from '../models/effect';
import { gameNow } from '../core/clock';
import { useIsMobile } from '../hooks/useViewport';
import { splitBuffOverflow, useBuffRowsPerColumn } from '../hooks/useBuffColumns';

/** icon 邊長（§ 24.8.1）。外框由 `.buff-icon` 的寬度決定，兩者要一起改 */
const BUFF_ICON_SIZE = 36;
const BUFF_ICON_SIZE_MOBILE = 28;

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

type BuffSlot =
  | { kind: 'rested'; remainingMs: number }
  | { kind: 'buff' | 'debuff'; effect: ActiveEffect };

function slotKey(slot: BuffSlot): string {
  return slot.kind === 'rested' ? 'rested' : slot.effect.id;
}

export function BuffBar() {
  const activeEffects = useGameStore(s => s.activeEffects);
  const character = useGameStore(s => s.character);
  const [now, setNow] = useState(() => Date.now());
  const barRef = useRef<HTMLDivElement>(null);
  const rowsPerColumn = useBuffRowsPerColumn(barRef);
  const iconSize = useIsMobile() ? BUFF_ICON_SIZE_MOBILE : BUFF_ICON_SIZE;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const playerEffects = activeEffects.filter(
    e => e.target === 'player' && (e.type === 'buff' || e.type === 'debuff')
  );
  const restedMs = character ? getRestedExpRemaining(character, now) : 0;

  if (playerEffects.length === 0 && restedMs <= 0) return null;

  // § 24.8.1：回鍋加倍 → buff → debuff 依序排入兩欄
  const slots: BuffSlot[] = [
    ...(restedMs > 0 ? [{ kind: 'rested' as const, remainingMs: restedMs }] : []),
    ...playerEffects.filter(e => e.type === 'buff').map(effect => ({ kind: 'buff' as const, effect })),
    ...playerEffects.filter(e => e.type === 'debuff').map(effect => ({ kind: 'debuff' as const, effect })),
  ];
  const { visible, overflow } = rowsPerColumn === null
    ? { visible: slots, overflow: 0 }
    : splitBuffOverflow(slots, rowsPerColumn);
  const gridStyle: CSSProperties | undefined = rowsPerColumn === null
    ? undefined
    : { gridAutoFlow: 'column', gridTemplateRows: `repeat(${rowsPerColumn}, auto)` };
  const effectNow = gameNow();

  return (
    <div className="buff-bar" ref={barRef} style={gridStyle}>
      {visible.map(slot => slot.kind === 'rested'
        ? <RestedExpIcon key={slotKey(slot)} remainingMs={slot.remainingMs} iconSize={iconSize} />
        : <EffectIcon key={slotKey(slot)} effect={slot.effect} now={effectNow} iconSize={iconSize} />)}
      {overflow > 0 && <div className="buff-overflow">+{overflow}</div>}
    </div>
  );
}

/** 回鍋經驗加倍倒數（§ 24.8.6）。不是 buff，不進 `activeEffects` */
function RestedExpIcon({ remainingMs, iconSize }: { remainingMs: number; iconSize: number }) {
  return (
    <Tooltip
      position="bottom"
      content={
        <div className="buff-tooltip-content">
          <div className="buff-tooltip-name rested">回鍋加倍</div>
          <div className="buff-tooltip-desc">擊殺經驗 ×2</div>
          <div className="buff-tooltip-time">剩餘: {formatTime(remainingMs)}</div>
          <div className="buff-tooltip-source">來源: 離線累積</div>
        </div>
      }
    >
      <div className="buff-icon is-rested" data-testid="rested-exp-icon">
        <GameIcon name="items/hourglass" size={iconSize} />
        <span className="buff-timer">{formatTime(remainingMs)}</span>
      </div>
    </Tooltip>
  );
}

function EffectIcon({ effect, now, iconSize }: { effect: ActiveEffect; now: number; iconSize: number }) {
  const remaining = effect.startTime + effect.duration - now;
  // 怒氣、平靜（`07-affix-ability.md` § 7S.7）：以當下數值取代倒數
  const meter = getAbilityMeterValue(effect, now);
  const isExpiring = meter === undefined && remaining > 0 && remaining < 5000;
  const isDebuff = effect.type === 'debuff';

  return (
    <Tooltip
      position="bottom"
      content={
        <div className="buff-tooltip-content">
          <div className={`buff-tooltip-name${isDebuff ? ' debuff' : ''}`}>{effect.name}{meter !== undefined ? ` ${meter}` : ''}</div>
          <div className="buff-tooltip-desc">{effect.description}</div>
          {meter === undefined && <div className="buff-tooltip-time">剩餘: {formatTime(remaining)}</div>}
          <div className="buff-tooltip-source">來源: {effect.sourceSkillName}</div>
        </div>
      }
    >
      <div
        className={`buff-icon ${isDebuff ? 'is-debuff' : 'is-buff'} ${isExpiring ? 'expiring' : ''}`}
        data-testid={isDebuff ? 'player-debuff-icon' : 'player-buff-icon'}
      >
        <GameIcon name={getEffectIcon(effect.category)} size={iconSize} />
        <span className="buff-timer">{meter ?? formatTime(remaining)}</span>
      </div>
    </Tooltip>
  );
}
