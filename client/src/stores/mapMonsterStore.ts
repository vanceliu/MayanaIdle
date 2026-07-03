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
  isBoss: boolean;
}

const SPAWN_INTERVAL_MS = 1000;
const BASE_SPAWN_CHANCE = 0.15;
const BASE_MAX_MONSTERS = 3;
const MIN_SPAWN_DISTANCE = 5;
const MAX_TRACK_DISTANCE = 15;
const TRIGGER_DISTANCE = 1.2;
const MONSTER_SPEED = 1;
const PATH_RECALC_INTERVAL = 3000;

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

  spawnTick: (deltaMs: number, map: MapData, playerPos: Position) => void;
  moveMonsters: (deltaMs: number, map: MapData, playerPos: Position) => void;
  checkCollisions: (playerPos: Position) => MapMonster[];
  removeMonsters: (ids: string[]) => void;
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

  spawnTick: (deltaMs, map, playerPos) => {
    const state = get();
    if (state.paused) return;
    if (state.monsters.length >= state.maxMonsters) return;

    const newTimer = state.spawnTimer + deltaMs;
    if (newTimer < SPAWN_INTERVAL_MS) {
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
      // Skip monsters in combat (they stay in place)
      if (state.combatMonsterIds.includes(monster.id)) {
        updated.push(monster);
        continue;
      }

      // Remove if too far from player
      if (distance(monster.position, playerPos) > MAX_TRACK_DISTANCE) {
        continue;
      }

      // Recalculate path periodically
      let { path, pathIndex, pathRecalcTimer } = monster;
      pathRecalcTimer += deltaMs;

      if (pathRecalcTimer >= PATH_RECALC_INTERVAL || path.length === 0) {
        const monsterSnapped = { x: Math.round(monster.position.x), y: Math.round(monster.position.y) };
        const newPath = findPath(map, monsterSnapped, playerSnapped);
        if (newPath && newPath.length > 0) {
          path = newPath;
          pathIndex = 0;
        }
        pathRecalcTimer = 0;
      }

      // Move along path (same logic as player tick)
      if (path.length === 0 || pathIndex >= path.length) {
        updated.push({ ...monster, path, pathIndex, pathRecalcTimer });
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

      updated.push({
        ...monster,
        position: pos,
        path,
        pathIndex: idx,
        pathRecalcTimer,
      });
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

  removeMonsters: (ids) => {
    set(state => ({
      monsters: state.monsters.filter(m => !ids.includes(m.id)),
    }));
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
