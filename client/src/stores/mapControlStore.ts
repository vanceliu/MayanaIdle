import { create } from 'zustand';
import type { Position, MapData } from '../models/mapControl';
import { TileType } from '../models/mapControl';
import { getMapForRegion } from '../models/mapDataControl';
import { findPath, findNearestWalkable, findAdjacentWalkable, getRandomWalkablePosition } from '../systems/pathfinding';
import { useMapMonsterStore } from './mapMonsterStore';

export interface MapControlState {
  currentMap: MapData | null;
  playerPosition: Position;
  targetPosition: Position | null;
  currentPath: Position[];
  pathIndex: number;
  isMoving: boolean;
  autoMove: boolean;
  moveSpeed: number;

  loadMap: (regionId: string, floor?: number | null, savedPosition?: Position | null) => Promise<void>;
  moveToTarget: (target: Position) => void;
  setAutoMove: (auto: boolean) => void;
  tick: (deltaMs: number) => void;
  pickRandomTarget: () => void;
  stopMoving: () => void;
}

export const useMapControlStore = create<MapControlState>((set, get) => ({
  currentMap: null,
  playerPosition: { x: 0, y: 0 },
  targetPosition: null,
  currentPath: [],
  pathIndex: 0,
  isMoving: false,
  autoMove: false,
  moveSpeed: 2,

  loadMap: async (regionId, floor, savedPosition) => {
    const map = await getMapForRegion(regionId, floor);
    if (!map) return;

    const startPos = savedPosition && savedPosition.x >= 0 && savedPosition.y >= 0
      ? savedPosition
      : map.spawnPoint;

    useMapMonsterStore.getState().clearAll();

    set({
      currentMap: { ...map },
      playerPosition: { ...startPos },
      targetPosition: null,
      currentPath: [],
      pathIndex: 0,
      isMoving: false,
    });
  },

  moveToTarget: (target) => {
    const { currentMap, playerPosition, isMoving } = get();
    if (!currentMap) return;

    const startTile = isMoving
      ? { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) }
      : playerPosition;

    let finalTarget = target;
    if (currentMap.tiles[target.y]?.[target.x] === TileType.Wall) {
      const nearest = findNearestWalkable(currentMap, target);
      if (!nearest) return;
      finalTarget = nearest;
    }

    const path = findPath(currentMap, startTile, finalTarget);
    if (!path || path.length === 0) return;

    set({
      targetPosition: finalTarget,
      currentPath: path,
      pathIndex: 0,
      isMoving: true,
    });
  },

  setAutoMove: (auto) => {
    if (auto) {
      set({ autoMove: true });
      get().pickRandomTarget();
    } else {
      const { playerPosition } = get();
      set({
        autoMove: false,
        isMoving: false,
        currentPath: [],
        targetPosition: null,
        playerPosition: { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) },
      });
    }
  },

  pickRandomTarget: () => {
    const { currentMap, playerPosition } = get();
    if (!currentMap) return;
    const snappedPos = { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) };

    // Check if there are monsters on the map — move toward the nearest one
    const monsterState = useMapMonsterStore.getState();
    const activeMonsters = monsterState.monsters.filter(
      m => !monsterState.combatMonsterIds.includes(m.id)
    );

    if (activeMonsters.length > 0) {
      let nearest = activeMonsters[0];
      let nearestDist = Infinity;
      for (const m of activeMonsters) {
        const dx = m.position.x - snappedPos.x;
        const dy = m.position.y - snappedPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = m;
        }
      }
      const monsterTile = { x: Math.round(nearest.position.x), y: Math.round(nearest.position.y) };
      // Move to adjacent tile of monster, not the monster's tile
      const adjTarget = findAdjacentWalkable(currentMap, monsterTile, snappedPos);
      if (adjTarget) {
        const path = findPath(currentMap, snappedPos, adjTarget);
        if (path && path.length > 0) {
          set({
            playerPosition: snappedPos,
            targetPosition: adjTarget,
            currentPath: path,
            pathIndex: 0,
            isMoving: true,
          });
          return;
        }
      }
    }

    // No monsters or no path to monster — random walk
    const target = getRandomWalkablePosition(currentMap, snappedPos);
    if (!target) return;
    const path = findPath(currentMap, snappedPos, target);
    if (!path || path.length === 0) {
      setTimeout(() => get().pickRandomTarget(), 100);
      return;
    }
    set({
      playerPosition: snappedPos,
      targetPosition: target,
      currentPath: path,
      pathIndex: 0,
      isMoving: true,
    });
  },

  tick: (deltaMs) => {
    const state = get();
    if (!state.isMoving || state.currentPath.length === 0) return;

    const moveDistance = (state.moveSpeed * deltaMs) / 1000;
    let remaining = moveDistance;
    let { pathIndex } = state;
    let pos = { ...state.playerPosition };

    while (remaining > 0 && pathIndex < state.currentPath.length) {
      const next = state.currentPath[pathIndex];
      const dx = next.x - pos.x;
      const dy = next.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= remaining) {
        pos = { x: next.x, y: next.y };
        remaining -= dist;
        pathIndex++;
      } else {
        const ratio = remaining / dist;
        pos = { x: pos.x + dx * ratio, y: pos.y + dy * ratio };
        remaining = 0;
      }
    }

    if (pathIndex >= state.currentPath.length) {
      set({
        playerPosition: pos,
        isMoving: false,
        currentPath: [],
        pathIndex: 0,
        targetPosition: null,
      });
      if (state.autoMove) {
        setTimeout(() => get().pickRandomTarget(), 500 + Math.random() * 1000);
      }
    } else {
      set({ playerPosition: pos, pathIndex });
    }
  },

  stopMoving: () => {
    const { playerPosition } = get();
    set({
      isMoving: false,
      currentPath: [],
      pathIndex: 0,
      targetPosition: null,
      playerPosition: { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) },
    });
  },
}));
