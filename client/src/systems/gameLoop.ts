import type { Position, MapData } from '../models/mapControl';
import type { MapMonster } from '../stores/mapMonsterStore';
import { OccupationManager } from './occupationManager';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { calculatePressure } from './pressure';
import { findPath, findAdjacentWalkable } from './pathfinding';
import { TileType } from '../models/mapControl';

const ATTACK_RANGE_MELEE = 1.5;
const DOT_TICK_INTERVAL = 1000;

export const occupation = new OccupationManager();

let dotTickTimer = 0;
let pauseLogShown = false;
let combatInterruptLogShown = false;

export function gameLoopTick(deltaMs: number) {
  const mapStore = useMapControlStore.getState();
  const monsterStore = useMapMonsterStore.getState();
  const gameState = useGameStore.getState();
  const map = mapStore.currentMap;

  if (!map || !gameState.character) return;

  const playerPos = mapStore.playerPosition;

  // === Rebuild occupation map ===
  occupation.clear();
  occupation.register(
    { x: Math.round(playerPos.x), y: Math.round(playerPos.y) },
    'player',
    'player',
  );
  for (const m of monsterStore.monsters) {
    occupation.register(
      { x: Math.round(m.position.x), y: Math.round(m.position.y) },
      'monster',
      m.id,
    );
  }

  // === HP/MP threshold check ===
  const ch = gameState.character;
  const effMaxHp = getEffectiveMaxHp(ch, gameState.equippedGear);
  const effMaxMp = getEffectiveMaxMp(ch, gameState.equippedGear);
  const hpPct = (ch.hp / effMaxHp) * 100;
  const mpPct = effMaxMp > 0 ? (ch.mp / effMaxMp) * 100 : 100;
  const belowThreshold = hpPct <= gameState.afterCombatHpThreshold || mpPct <= gameState.afterCombatMpThreshold;
  const aboveResume = hpPct >= gameState.afterCombatHpResumeThreshold && mpPct >= gameState.afterCombatMpResumeThreshold;

  // Only trigger pause in idle state (no nearby monsters in attack range)
  const hasNearbyMonster = monsterStore.monsters.some(m => {
    const dx = m.position.x - playerPos.x;
    const dy = m.position.y - playerPos.y;
    return Math.sqrt(dx * dx + dy * dy) <= ATTACK_RANGE_MELEE;
  });
  const isIdle = !hasNearbyMonster;

  if (belowThreshold && !monsterStore.paused && isIdle) {
    monsterStore.setPaused(true);
    useMapControlStore.getState().setAutoMove(false);
    const existing = useGameStore.getState().combatLogs;
    useGameStore.setState({
      combatLogs: [...existing.slice(-199), { text: 'HP/MP 低於門檻，等待恢復中...', type: 'system' }],
    });
    pauseLogShown = true;
  } else if (belowThreshold && monsterStore.paused && !pauseLogShown) {
    // Already paused on load — show log once
    const existing = useGameStore.getState().combatLogs;
    useGameStore.setState({
      combatLogs: [...existing.slice(-199), { text: 'HP/MP 低於門檻，等待恢復中...', type: 'system' }],
    });
    pauseLogShown = true;
  } else if (aboveResume && monsterStore.paused) {
    monsterStore.setPaused(false);
    if (gameState.searchMode === 'auto') {
      useMapControlStore.getState().setAutoMove(true);
    }
    const existing = useGameStore.getState().combatLogs;
    useGameStore.setState({
      combatLogs: [...existing.slice(-199), { text: '恢復完畢，繼續探索', type: 'system' }],
    });
    pauseLogShown = false;
  }

  // Pause interrupted by monster approaching
  if (monsterStore.paused && hasNearbyMonster && !combatInterruptLogShown) {
    const existing = useGameStore.getState().combatLogs;
    useGameStore.setState({
      combatLogs: [...existing.slice(-199), { text: '等待被打斷，進入戰鬥中', type: 'system' }],
    });
    combatInterruptLogShown = true;
  } else if (monsterStore.paused && !hasNearbyMonster) {
    combatInterruptLogShown = false;
  } else if (!monsterStore.paused) {
    combatInterruptLogShown = false;
  }

  // === Spawn monsters (only if player is not in recovery) ===
  if (!monsterStore.paused) {
    const now = Date.now();
    const { pressure, maxMonsters } = calculatePressure(gameState.character.areaEnteredAt, now);
    const elapsedMinutes = (now - gameState.character.areaEnteredAt) / (1000 * 60);
    monsterStore.setMaxMonsters(maxMonsters);
    monsterStore.spawnTick(deltaMs, map, playerPos, pressure, elapsedMinutes);
  }

  // === Move monsters (always, not affected by player pause) ===
  moveMonstersSafe(deltaMs, map, playerPos, monsterStore);

  // === Move player (always allow movement for manual click) ===
  movePlayerSafe(deltaMs);

  // === DoT tick + effect expiration ===
  tickDotsAndEffects(deltaMs);
}

function tickDotsAndEffects(deltaMs: number) {
  const now = Date.now();
  const gs = useGameStore.getState();

  // Clear expired effects
  const activeEffects = gs.activeEffects;
  const stillActive = activeEffects.filter(e => now < e.startTime + e.duration);
  if (stillActive.length !== activeEffects.length) {
    useGameStore.setState({ activeEffects: stillActive });
  }

  // DoT timer accumulation (actual DoT damage is processed in tickArpgCombatLoop)
  dotTickTimer += deltaMs;
  if (dotTickTimer >= DOT_TICK_INTERVAL) {
    dotTickTimer = 0;
    dotTickReady = true;
  }
}

export let dotTickReady = false;
export function consumeDotTick(): boolean {
  if (dotTickReady) {
    dotTickReady = false;
    return true;
  }
  return false;
}

function movePlayerSafe(deltaMs: number) {
  const store = useMapControlStore.getState();

  if (!store.isMoving) {
    return;
  }

  const { currentPath, pathIndex, playerPosition, moveSpeed } = store;
  if (currentPath.length === 0 || pathIndex >= currentPath.length) {
    useMapControlStore.setState({ isMoving: false });
    return;
  }

  const moveDistance = (moveSpeed * deltaMs) / 1000;
  let remaining = moveDistance;
  let pos = { ...playerPosition };
  let idx = pathIndex;

  while (remaining > 0 && idx < currentPath.length) {
    const next = currentPath[idx];
    const nextTile = { x: Math.round(next.x), y: Math.round(next.y) };

    // Check if next tile is occupied by a monster
    if (occupation.isOccupiedByType(nextTile, 'monster')) {
      // Stop before monster — we're adjacent, let FSM handle attacking
      useMapControlStore.setState({ isMoving: false });
      break;
    }

    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= remaining) {
      pos = { x: next.x, y: next.y };
      remaining -= dist;
      idx++;
    } else {
      const ratio = remaining / dist;
      pos = { x: pos.x + dx * ratio, y: pos.y + dy * ratio };
      remaining = 0;
    }
  }

  // Update occupation
  occupation.unregister({ x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) });
  occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'player', 'player');

  useMapControlStore.setState({
    playerPosition: pos,
    pathIndex: idx,
  });
}

function moveMonstersSafe(
  deltaMs: number,
  map: MapData,
  playerPos: Position,
  monsterStore: ReturnType<typeof useMapMonsterStore.getState>,
) {
  if (monsterStore.monsters.length === 0) return;

  const updated: MapMonster[] = [];
  const playerSnapped = { x: Math.round(playerPos.x), y: Math.round(playerPos.y) };
  const MAX_TRACK_DISTANCE = 15;
  const TRIGGER_DISTANCE = 1.2;
  const ASTAR_DISTANCE = 8;
  const PATH_RECALC_INTERVAL = 5000;
  const PLAYER_MOVE_THRESHOLD = 2;

  for (const monster of monsterStore.monsters) {
    const dist = Math.sqrt(
      (monster.position.x - playerPos.x) ** 2 +
      (monster.position.y - playerPos.y) ** 2,
    );

    // Despawn if too far
    if (dist > MAX_TRACK_DISTANCE) {
      continue;
    }

    // Already in attack range — don't move
    if (dist <= TRIGGER_DISTANCE) {
      updated.push(monster);
      continue;
    }

    let { path, pathIndex, pathRecalcTimer, lastPathPlayerPos, moveTimer } = monster;
    pathRecalcTimer += deltaMs;

    // Pathfinding
    if (dist <= ASTAR_DISTANCE) {
      const playerMoved = Math.sqrt(
        (playerPos.x - lastPathPlayerPos.x) ** 2 +
        (playerPos.y - lastPathPlayerPos.y) ** 2,
      ) >= PLAYER_MOVE_THRESHOLD;
      const timerExpired = pathRecalcTimer >= PATH_RECALC_INTERVAL;
      const needsRecalc = playerMoved || timerExpired || path.length === 0 || pathIndex >= path.length;

      if (needsRecalc) {
        const monsterSnapped = { x: Math.round(monster.position.x), y: Math.round(monster.position.y) };
        // Find path to adjacent tile of player, not player's tile
        const adjTarget = findAdjacentWalkable(map, playerSnapped, monsterSnapped);
        const target = adjTarget ?? playerSnapped;
        const occupiedSet = occupation.getOccupiedSet(monster.id);
        const newPath = findPath(map, monsterSnapped, target, occupiedSet);
        if (newPath && newPath.length > 0) {
          path = newPath;
          pathIndex = 0;
        }
        pathRecalcTimer = 0;
        lastPathPlayerPos = { ...playerPos };
      }
    } else {
      // Greedy: one step toward player
      if (path.length === 0 || pathIndex >= path.length) {
        const mx = Math.round(monster.position.x);
        const my = Math.round(monster.position.y);
        let bestX = mx;
        let bestY = my;
        let bestDist = Math.sqrt((mx - playerPos.x) ** 2 + (my - playerPos.y) ** 2);

        const dirs = [
          { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
          { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
        ];

        for (const dir of dirs) {
          const nx = mx + dir.x;
          const ny = my + dir.y;
          if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
          if (map.tiles[ny][nx] === TileType.Wall) continue;
          if (!occupation.canMoveTo({ x: nx, y: ny }, monster.id)) continue;
          if (dir.x !== 0 && dir.y !== 0) {
            if (map.tiles[my][mx + dir.x] === TileType.Wall || map.tiles[my + dir.y][mx] === TileType.Wall) continue;
          }
          const d = Math.sqrt((nx - playerPos.x) ** 2 + (ny - playerPos.y) ** 2);
          if (d < bestDist) {
            bestDist = d;
            bestX = nx;
            bestY = ny;
          }
        }

        if (bestX !== mx || bestY !== my) {
          path = [{ x: bestX, y: bestY }];
          pathIndex = 0;
        } else {
          updated.push({ ...monster, path: [], pathIndex: 0, pathRecalcTimer, lastPathPlayerPos, moveTimer });
          continue;
        }
      }
    }

    // Move along path with collision check
    if (path.length === 0 || pathIndex >= path.length) {
      updated.push({ ...monster, path, pathIndex, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      continue;
    }

    const moveDistance = (monster.speed * deltaMs) / 1000;
    let remaining = moveDistance;
    let pos = { ...monster.position };
    let idx = pathIndex;

    while (remaining > 0 && idx < path.length) {
      const next = path[idx];
      const nextTile = { x: Math.round(next.x), y: Math.round(next.y) };

      if (!occupation.canMoveTo(nextTile, monster.id)) {
        break;
      }

      const dx = next.x - pos.x;
      const dy = next.y - pos.y;
      const stepDist = Math.sqrt(dx * dx + dy * dy);

      if (stepDist <= remaining) {
        pos = { x: next.x, y: next.y };
        remaining -= stepDist;
        idx++;
      } else {
        const ratio = remaining / stepDist;
        pos = { x: pos.x + dx * ratio, y: pos.y + dy * ratio };
        remaining = 0;
      }
    }

    // Update occupation
    occupation.unregister({ x: Math.round(monster.position.x), y: Math.round(monster.position.y) });
    occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'monster', monster.id);

    updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
  }

  useMapMonsterStore.setState({ monsters: updated });
}
