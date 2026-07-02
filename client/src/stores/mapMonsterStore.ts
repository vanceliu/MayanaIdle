import { create } from 'zustand';
import type { Position, MapData } from '../models/mapControl';
import { TileType } from '../models/mapControl';
import { getRandomWalkablePosition } from '../systems/pathfinding';

export interface MapMonster {
  id: string;
  position: Position;
  targetPosition: Position;
  speed: number;
}

const SPAWN_INTERVAL_MS = 1000;
const BASE_SPAWN_CHANCE = 0.15;
const BASE_MAX_MONSTERS = 3;
const MIN_SPAWN_DISTANCE = 5;
const MAX_TRACK_DISTANCE = 15;
const TRIGGER_DISTANCE = 1.2;
const MONSTER_SPEED = 1;

let monsterIdCounter = 0;
function nextMonsterId(): string {
  return `m_${++monsterIdCounter}`;
}

function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function isWalkable(map: MapData, x: number, y: number): boolean {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  return map.tiles[y][x] !== TileType.Wall;
}

export interface MapMonsterState {
  monsters: MapMonster[];
  maxMonsters: number;
  spawnTimer: number;
  paused: boolean;

  spawnTick: (deltaMs: number, map: MapData, playerPos: Position) => void;
  moveMonsters: (deltaMs: number, map: MapData, playerPos: Position) => void;
  checkCollisions: (playerPos: Position) => MapMonster[];
  removeMonsters: (ids: string[]) => void;
  clearAll: () => void;
  setMaxMonsters: (max: number) => void;
  setPaused: (paused: boolean) => void;
}

export const useMapMonsterStore = create<MapMonsterState>((set, get) => ({
  monsters: [],
  maxMonsters: BASE_MAX_MONSTERS,
  spawnTimer: 0,
  paused: false,

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
        };
        set({ monsters: [...state.monsters, monster] });
        return;
      }
    }
  },

  moveMonsters: (deltaMs, map, playerPos) => {
    const state = get();
    if (state.paused || state.monsters.length === 0) return;

    const updated: MapMonster[] = [];
    for (const monster of state.monsters) {
      // Remove if too far from player
      if (distance(monster.position, playerPos) > MAX_TRACK_DISTANCE) {
        continue;
      }

      const dx = playerPos.x - monster.position.x;
      const dy = playerPos.y - monster.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        updated.push(monster);
        continue;
      }

      // 8-direction: determine step direction
      const stepX = Math.abs(dx) < 0.3 ? 0 : (dx > 0 ? 1 : -1);
      const stepY = Math.abs(dy) < 0.3 ? 0 : (dy > 0 ? 1 : -1);

      if (stepX === 0 && stepY === 0) {
        updated.push(monster);
        continue;
      }

      const isDiagonal = stepX !== 0 && stepY !== 0;
      const moveAmount = (monster.speed * deltaMs) / 1000;
      const dirLen = isDiagonal ? Math.SQRT2 : 1;
      const moveX = (stepX / dirLen) * moveAmount;
      const moveY = (stepY / dirLen) * moveAmount;

      const nx = monster.position.x + moveX;
      const ny = monster.position.y + moveY;

      // Check walkability at target tile
      const tileX = Math.round(nx);
      const tileY = Math.round(ny);

      if (isDiagonal) {
        const sideAOk = isWalkable(map, Math.round(monster.position.x + stepX), Math.round(monster.position.y));
        const sideBOk = isWalkable(map, Math.round(monster.position.x), Math.round(monster.position.y + stepY));
        if (isWalkable(map, tileX, tileY) && sideAOk && sideBOk) {
          updated.push({ ...monster, position: { x: nx, y: ny } });
          continue;
        }
        // Fallback: try single axis
        if (sideAOk) {
          const fallX = monster.position.x + (stepX * moveAmount);
          updated.push({ ...monster, position: { x: fallX, y: monster.position.y } });
          continue;
        }
        if (sideBOk) {
          const fallY = monster.position.y + (stepY * moveAmount);
          updated.push({ ...monster, position: { x: monster.position.x, y: fallY } });
          continue;
        }
      } else {
        if (isWalkable(map, tileX, tileY)) {
          updated.push({ ...monster, position: { x: nx, y: ny } });
          continue;
        }
      }

      // Can't move
      updated.push(monster);
    }

    set({ monsters: updated });
  },

  checkCollisions: (playerPos) => {
    const state = get();
    return state.monsters.filter(m => distance(m.position, playerPos) <= TRIGGER_DISTANCE);
  },

  removeMonsters: (ids) => {
    set(state => ({
      monsters: state.monsters.filter(m => !ids.includes(m.id)),
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
}));
