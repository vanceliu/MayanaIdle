import { create } from 'zustand';
import type { Position, MapData } from '../models/mapControl';
import { TileType } from '../models/mapControl';
import { getMapForRegion } from '../models/mapDataControl';
import { findPath, findNearestWalkable, getRandomWalkablePosition } from '../systems/pathfinding';

export interface MapControlState {
  currentMap: MapData | null;
  playerPosition: Position;
  targetPosition: Position | null;
  currentPath: Position[];
  pathIndex: number;
  isMoving: boolean;
  autoMove: boolean;
  moveSpeed: number; // tiles per second

  loadMap: (regionId: string, floor?: number | null) => void;
  setPlayerPosition: (pos: Position) => void;
  moveToTarget: (target: Position) => void;
  setAutoMove: (auto: boolean) => void;
  tick: (deltaMs: number) => void;
  pickRandomTarget: () => void;
  stopMoving: () => void;
  reset: () => void;
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

  loadMap: (regionId, floor) => {
    const map = getMapForRegion(regionId, floor);
    if (!map) return;
    set({
      currentMap: map,
      playerPosition: { ...map.spawnPoint },
      targetPosition: null,
      currentPath: [],
      pathIndex: 0,
      isMoving: false,
    });
  },

  setPlayerPosition: (pos) => set({ playerPosition: pos }),

  moveToTarget: (target) => {
    const { currentMap, playerPosition, isMoving } = get();
    if (!currentMap) return;

    let startPos = playerPosition;
    if (isMoving) {
      startPos = { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) };
    }

    let finalTarget = target;
    if (currentMap.tiles[target.y]?.[target.x] === TileType.Wall) {
      const nearest = findNearestWalkable(currentMap, target);
      if (!nearest) return;
      finalTarget = nearest;
    }

    const path = findPath(currentMap, startPos, finalTarget);
    if (!path || path.length === 0) return;

    set({
      playerPosition: startPos,
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
    const target = getRandomWalkablePosition(currentMap, playerPosition);
    if (!target) return;
    const path = findPath(currentMap, playerPosition, target);
    if (!path || path.length === 0) {
      setTimeout(() => get().pickRandomTarget(), 100);
      return;
    }
    set({
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

  reset: () => {
    set({
      currentMap: null,
      playerPosition: { x: 0, y: 0 },
      targetPosition: null,
      currentPath: [],
      pathIndex: 0,
      isMoving: false,
      autoMove: false,
    });
  },
}));
