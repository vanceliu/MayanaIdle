import { useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { GameIcon } from './GameIcon';
import { Tooltip } from './Tooltip';
import { getEffectIcon } from '../models/iconMap';
import { MapCanvas } from './MapCanvas';

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export function BattleView() {
  const phase = useGameStore(s => s.phase);
  const monsters = useGameStore(s => s.monsters);
  const selectedTargetIdx = useGameStore(s => s.selectedTargetIdx);
  const combatLogs = useGameStore(s => s.combatLogs);
  const selectTarget = useGameStore(s => s.selectTarget);
  const manualSearch = useGameStore(s => s.manualSearch);
  const cancelManualSearch = useGameStore(s => s.cancelManualSearch);
  const isManualSearching = useGameStore(s => s.isManualSearching);
  const searchMode = useGameStore(s => s.searchMode);
  const setSearchMode = useGameStore(s => s.setSearchMode);
  const activeEffects = useGameStore(s => s.activeEffects);
  const character = useGameStore(s => s.character);
  const logRef = useRef<HTMLDivElement>(null);

  const currentMap = useMapControlStore(s => s.currentMap);
  const loadMap = useMapControlStore(s => s.loadMap);
  const setAutoMove = useMapControlStore(s => s.setAutoMove);

  // Load map when character region changes
  useEffect(() => {
    if (character) {
      loadMap(character.currentRegion, character.currentFloor);
    }
  }, [character?.currentRegion, character?.currentFloor, loadMap]);

  // Sync search mode with auto move
  useEffect(() => {
    if (searchMode === 'auto' && phase === 'explore') {
      setAutoMove(true);
    } else {
      setAutoMove(false);
    }
  }, [searchMode, phase, setAutoMove]);

  // Unpause monsters when returning to explore
  useEffect(() => {
    if (phase === 'explore') {
      useMapMonsterStore.getState().setPaused(false);
    }
  }, [phase]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [combatLogs.length]);

  return (
    <div className="battle-view">
      <div className="battle-top-bar">
        <div className="explore-bar">
          <div className="search-mode-toggle">
            <button className={searchMode === 'auto' ? 'active' : ''} onClick={() => setSearchMode('auto')}>自動搜尋</button>
            <button className={searchMode === 'manual' ? 'active' : ''} onClick={() => setSearchMode('manual')}>手動搜尋</button>
          </div>
          {searchMode === 'manual' && phase === 'explore' && !isManualSearching && (
            <button className="btn-search" onClick={manualSearch}>搜尋</button>
          )}
          {searchMode === 'manual' && phase === 'explore' && isManualSearching && (
            <button className="btn-search searching" onClick={cancelManualSearch}>取消搜尋</button>
          )}
          {searchMode === 'auto' && phase === 'explore' && (
            <span className="explore-indicator">探索中...</span>
          )}
          {phase === 'combat' && (
            <span className="explore-indicator combat-indicator">戰鬥中</span>
          )}
        </div>

        {phase === 'combat' && monsters.some(m => m.currentHp > 0) && (
          <div className="monster-list">
            {monsters.map((m, i) => {
              const hpPercent = Math.max(0, Math.floor((m.currentHp / m.maxHp) * 100));
              const isSelected = i === selectedTargetIdx;
              const monsterDebuffs = activeEffects.filter(
                e => e.type === 'debuff' && e.target === 'monster' && e.targetIdx === i
              );
              const now = Date.now();
              return (
                <div
                  key={i}
                  className={`monster-card ${m.currentHp <= 0 ? 'dead' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => m.currentHp > 0 && selectTarget(i)}
                >
                  <div className="monster-name">{m.name} Lv.{m.level}</div>
                  <div className="bar monster-hp-bar">
                    <div className="bar-fill" style={{ width: `${hpPercent}%` }} />
                    <span>{Math.max(0, m.currentHp)}/{m.maxHp}</span>
                  </div>
                  {monsterDebuffs.length > 0 && (
                    <div className="monster-debuffs">
                      {monsterDebuffs.map(debuff => {
                        const remaining = debuff.startTime + debuff.duration - now;
                        const iconName = getEffectIcon(debuff.category);
                        return (
                          <Tooltip
                            key={debuff.id}
                            position="bottom"
                            content={
                              <div className="buff-tooltip-content">
                                <div className="buff-tooltip-name">{debuff.name}</div>
                                <div className="buff-tooltip-desc">{debuff.description}</div>
                                <div className="buff-tooltip-time">剩餘: {formatTime(remaining)}</div>
                              </div>
                            }
                          >
                            <div className="debuff-icon">
                              <GameIcon name={iconName} size={20} />
                              <span className="debuff-timer">{formatTime(remaining)}</span>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {phase === 'dead' && (
          <div className="death-banner">你倒下了 — 已傳送至最近城鎮</div>
        )}
      </div>

      {currentMap && phase !== 'combat' && (
        <MapCanvas />
      )}

      <div className={`combat-log ${currentMap && phase !== 'combat' ? 'compact' : ''}`} ref={logRef}>
        {combatLogs.map((log, i) => (
          <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
        ))}
      </div>
    </div>
  );
}
