import { create } from 'zustand';
import type { Position, MapData } from '../models/mapControl';
import { findPath, getRandomWalkablePosition } from '../systems/pathfinding';

export interface MapMonster {
  id: string;
  position: Position;
  targetPosition: Position;
  speed: number;
  path: Position[];
  pathIndex: number;
  pathRecalcTimer: number;
  moveTimer: number;
  lastPathPlayerPos: Position;
  isBoss: boolean;
}

const SPAWN_INTERVAL_MS = 1000;
const BASE_SPAWN_CHANCE = 0.15;
const BASE_MAX_MONSTERS = 3;
const MIN_SPAWN_DISTANCE = 5;
const MAX_TRACK_DISTANCE = 15;
const TRIGGER_DISTANCE = 1.2;
const MONSTER_SPEED = 1;
const PATH_RECALC_INTERVAL = 5000;
const ASTAR_DISTANCE = 8;
const PLAYER_MOVE_THRESHOLD = 2;

let monsterIdCounter = 0;
function nextMonsterId(): string {
  return `m_${++monsterIdCounter}`;
}

function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export interface MapMonsterState {
  monsters: MapMonster[];
  maxMonsters: number;
  spawnTimer: number;
  paused: boolean;
  combatMonsterIds: string[];
  hasBossInPool: boolean;

  spawnTick: (deltaMs: number, map: MapData, playerPos: Position, pressure: number) => void;
  moveMonsters: (deltaMs: number, map: MapData, playerPos: Position) => void;
  checkCollisions: (playerPos: Position) => MapMonster[];
  setCombatMonsters: (ids: string[]) => void;
  clearCombatMonsters: () => void;
  clearAll: () => void;
  setMaxMonsters: (max: number) => void;
  setPaused: (paused: boolean) => void;
  setHasBossInPool: (has: boolean) => void;
}

export const useMapMonsterStore = create<MapMonsterState>((set, get) => ({
  monsters: [],
  maxMonsters: BASE_MAX_MONSTERS,
  spawnTimer: 0,
  paused: false,
  combatMonsterIds: [],
  hasBossInPool: false,

  spawnTick: (deltaMs, map, playerPos, pressure) => {
    const state = get();
    if (state.paused) return;
    if (state.monsters.length >= state.maxMonsters) return;

    const newTimer = state.spawnTimer + deltaMs;
    const frequencyMultiplier = 1 + pressure * 0.2;
    const adjustedInterval = SPAWN_INTERVAL_MS / frequencyMultiplier;
    if (newTimer < adjustedInterval) {
      set({ spawnTimer: newTimer });
      return;
    }

    set({ spawnTimer: 0 });

    if (Math.random() > BASE_SPAWN_CHANCE) return;

    // Determine if this spawn is a boss
    const bossAlreadyOnMap = state.monsters.some(m => m.isBoss);
    let isBoss = false;
    if (state.hasBossInPool && !bossAlreadyOnMap) {
      isBoss = Math.random() < 0.1;
    }

    // Find a spawn position at least MIN_SPAWN_DISTANCE from player
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      const pos = getRandomWalkablePosition(map, playerPos);
      if (!pos) continue;
      if (distance(pos, playerPos) >= MIN_SPAWN_DISTANCE) {
        const monster: MapMonster = {
          id: nextMonsterId(),
          position: { ...pos },
          targetPosition: { ...playerPos },
          speed: MONSTER_SPEED,
          path: [],
          pathIndex: 0,
          pathRecalcTimer: 0,
          moveTimer: 0,
          lastPathPlayerPos: { ...playerPos },
          isBoss,
        };
        set({ monsters: [...state.monsters, monster] });
        return;
      }
    }
  },

  moveMonsters: (deltaMs, map, playerPos) => {
    const state = get();
    if (state.monsters.length === 0) return;

    const updated: MapMonster[] = [];
    const playerSnapped = { x: Math.round(playerPos.x), y: Math.round(playerPos.y) };

    for (const monster of state.monsters) {
      if (state.combatMonsterIds.includes(monster.id)) {
        updated.push(monster);
        continue;
      }

      if (distance(monster.position, playerPos) > MAX_TRACK_DISTANCE) {
        continue;
      }

      let { path, pathIndex, pathRecalcTimer, lastPathPlayerPos, moveTimer } = monster;
      pathRecalcTimer += deltaMs;

      const distToPlayer = distance(monster.position, playerPos);

      if (distToPlayer <= ASTAR_DISTANCE) {
        // Near player: use A* pathfinding
        const playerMoved = distance(playerPos, lastPathPlayerPos) >= PLAYER_MOVE_THRESHOLD;
        const timerExpired = pathRecalcTimer >= PATH_RECALC_INTERVAL;
        const needsRecalc = playerMoved || timerExpired || path.length === 0 || pathIndex >= path.length;

        if (needsRecalc) {
          const monsterSnapped = { x: Math.round(monster.position.x), y: Math.round(monster.position.y) };
          const newPath = findPath(map, monsterSnapped, playerSnapped);
          if (newPath && newPath.length > 0) {
            path = newPath;
            pathIndex = 0;
          }
          pathRecalcTimer = 0;
          lastPathPlayerPos = { ...playerPos };
        }

        // Move along A* path
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

        updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      } else {
        // Far from player: greedy one-step with smooth interpolation (no A*)
        // Build a one-node path toward player if we don't have one
        if (path.length === 0 || pathIndex >= path.length) {
          const mx = Math.round(monster.position.x);
          const my = Math.round(monster.position.y);
          let bestX = mx;
          let bestY = my;
          let bestDist = distance({ x: mx, y: my }, playerPos);

          for (const dir of [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
            { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
          ]) {
            const nx = mx + dir.x;
            const ny = my + dir.y;
            if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
            if (map.tiles[ny][nx] === 1) continue;
            if (dir.x !== 0 && dir.y !== 0) {
              if (map.tiles[my][mx + dir.x] === 1 || map.tiles[my + dir.y][mx] === 1) continue;
            }
            const d = distance({ x: nx, y: ny }, playerPos);
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

        // Smooth interpolation to next grid center
        const moveDistance = (monster.speed * deltaMs) / 1000;
        let remaining = moveDistance;
        let pos = { ...monster.position };
        let idx = pathIndex;

        while (remaining > 0 && idx < path.length) {
          const next = path[idx];
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

        updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      }
    }

    set({ monsters: updated });
  },

  checkCollisions: (playerPos) => {
    const state = get();
    return state.monsters.filter(m =>
      !state.combatMonsterIds.includes(m.id) &&
      distance(m.position, playerPos) <= TRIGGER_DISTANCE
    );
  },

  setCombatMonsters: (ids) => {
    set({ combatMonsterIds: ids });
  },

  clearCombatMonsters: () => {
    const { combatMonsterIds } = get();
    set(state => ({
      monsters: state.monsters.filter(m => !combatMonsterIds.includes(m.id)),
      combatMonsterIds: [],
    }));
  },

  clearAll: () => {
    set({ monsters: [], spawnTimer: 0 });
  },

  setMaxMonsters: (max) => {
    set({ maxMonsters: max });
  },

  setPaused: (paused) => {
    set({ paused });
  },

  setHasBossInPool: (has) => {
    set({ hasBossInPool: has });
  },
}));
