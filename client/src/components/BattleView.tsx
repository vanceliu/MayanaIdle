import { useRef, useEffect, useState } from 'react';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { PixiGame } from './PixiGame';
import { getRegion, getFloor } from '../models/mapData';
import { db } from '../db/database';

export function BattleView() {
  const phase = useGameStore(s => s.phase);
  const combatLogs = useGameStore(s => s.combatLogs);
  const searchMode = useGameStore(s => s.searchMode);
  const character = useGameStore(s => s.character);
  const logRef = useRef<HTMLDivElement>(null);
  const [logSize, setLogSize] = useState<0 | 1 | 2>(0); // 0=compact, 1=medium, 2=large

  const currentMap = useMapControlStore(s => s.currentMap);
  const loadMap = useMapControlStore(s => s.loadMap);
  const setAutoMove = useMapControlStore(s => s.setAutoMove);

  // Load map when character region changes
  useEffect(() => {
    if (!character) return;
    const savedPos = (character.mapPositionX != null && character.mapPositionY != null)
      ? { x: character.mapPositionX, y: character.mapPositionY }
      : null;
    loadMap(character.currentRegion, character.currentFloor, savedPos).then(() => {
      // Determine if boss exists in current area's monster pool
      const region = getRegion(character.currentRegion);
      if (region?.floors && character.currentFloor != null) {
        const floor = getFloor(character.currentRegion, character.currentFloor);
        useMapMonsterStore.getState().setHasBossInPool(floor?.isBossFloor ?? false);
      } else {
        const hasFloors = region?.floors && region.floors.length > 0;
        const areaId = hasFloors && character.currentFloor != null
          ? `${character.currentRegion}-${character.currentFloor}f`
          : character.currentRegion;
        db.monsterTemplates.where('area').equals(areaId).toArray().then(monsters => {
          useMapMonsterStore.getState().setHasBossInPool(monsters.some(m => m.isBoss));
        });
      }

      // If auto search is active, start moving after map loads
      const currentSearchMode = useGameStore.getState().searchMode;
      const currentPhase = useGameStore.getState().phase;
      if (currentSearchMode === 'auto' && currentPhase === 'explore') {
        const gs = useGameStore.getState();
        const ch = gs.character;
        if (ch) {
          const effMaxHp = getEffectiveMaxHp(ch, gs.equippedGear);
          const effMaxMp = getEffectiveMaxMp(ch, gs.equippedGear);
          const hpPct = (ch.hp / effMaxHp) * 100;
          const mpPct = effMaxMp > 0 ? (ch.mp / effMaxMp) * 100 : 100;
          if (hpPct <= gs.afterCombatHpThreshold || mpPct <= gs.afterCombatMpThreshold) {
            useMapMonsterStore.getState().setPaused(true);
          } else {
            useMapControlStore.getState().setAutoMove(true);
          }
        }
      }
    });
  }, [character?.currentRegion, character?.currentFloor]);

  // Sync search mode with auto move
  useEffect(() => {
    if (searchMode === 'auto' && phase === 'explore') {
      const map = useMapControlStore.getState().currentMap;
      if (map) {
        const gs = useGameStore.getState();
        const ch = gs.character;
        if (ch) {
          const effMaxHp = getEffectiveMaxHp(ch, gs.equippedGear);
          const effMaxMp = getEffectiveMaxMp(ch, gs.equippedGear);
          const hpPct = (ch.hp / effMaxHp) * 100;
          const mpPct = effMaxMp > 0 ? (ch.mp / effMaxMp) * 100 : 100;
          // 已在恢復等待中就維持暫停：此時 HP/MP 可能已高於暫停門檻但未達恢復門檻，
          // 不可因為「沒低於門檻」就重新起步（由 gameLoopTick 的 aboveResume 分支解除）。
          const alreadyPaused = useMapMonsterStore.getState().paused;
          if (alreadyPaused || hpPct <= gs.afterCombatHpThreshold || mpPct <= gs.afterCombatMpThreshold) {
            useMapMonsterStore.getState().setPaused(true);
          }
          setAutoMove(true);
        } else {
          setAutoMove(true);
        }
      }
    } else if (phase !== 'combat') {
      setAutoMove(false);
    }
  }, [searchMode, phase, setAutoMove]);

  // Unpause monsters when returning to explore
  useEffect(() => {
    if (phase === 'explore') {
      useMapMonsterStore.getState().clearCombatMonsters();
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
      {currentMap && (
        <PixiGame />
      )}

      <div className="combat-log compact" ref={logRef}>
        {combatLogs.map((log, i) => (
          <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
        ))}
      </div>

      {currentMap && logSize > 0 && (
        <div className={`combat-log-overlay log-size-${logSize}`}>
          <div className="combat-log" ref={logRef}>
            {combatLogs.map((log, i) => (
              <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
            ))}
          </div>
        </div>
      )}

      {currentMap && (
        <button
          className="log-resize-btn"
          onClick={() => setLogSize(s => ((s + 1) % 3) as 0 | 1 | 2)}
          title="調整 Log 大小"
        >
          {logSize === 0 ? '▲' : logSize === 1 ? '▲▲' : '▼'}
        </button>
      )}
    </div>
  );
}
