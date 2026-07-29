export interface Position {
  x: number;
  y: number;
}

export const TileType = {
  Ground: 0,
  Boundary: 1,
  Wall: 3,
  Decoration: 4,
  Tree: 10,
  Rock: 11,
  Pillar: 12,
  Water: 13,
  Lava: 14,
  Chasm: 15,
  Grass: 16,
  Sand: 17,
  Carpet: 18,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];
export type MapTheme =
  | 'grassland'
  | 'highland'
  | 'snow'
  | 'ivory'
  | 'forest'
  | 'swamp'
  | 'cave'
  | 'prison'
  | 'battlefield'
  | 'ancient'
  | 'dragon'
  | 'tower'
  | 'frost-tower'
  | 'lava-tower';

export type TileVisualRole = 'ground' | 'boundary' | 'wall' | 'tree' | 'rock' | 'pillar' | 'decoration' | 'water' | 'lava' | 'chasm' | 'grass' | 'sand' | 'carpet';

export interface TileDefinition {
  id: TileType;
  role: TileVisualRole;
  walkable: boolean;
  spawnable: boolean;
  blocksSight: boolean;
  blocksProjectiles: boolean;
  elevation: 0 | 1;
}

export const TILE_DEFINITIONS: Readonly<Record<TileType, TileDefinition>> = {
  [TileType.Ground]: { id: TileType.Ground, role: 'ground', walkable: true, spawnable: true, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Boundary]: { id: TileType.Boundary, role: 'boundary', walkable: false, spawnable: false, blocksSight: true, blocksProjectiles: true, elevation: 0 },
  [TileType.Wall]: { id: TileType.Wall, role: 'wall', walkable: false, spawnable: false, blocksSight: true, blocksProjectiles: true, elevation: 0 },
  [TileType.Decoration]: { id: TileType.Decoration, role: 'decoration', walkable: true, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Tree]: { id: TileType.Tree, role: 'tree', walkable: false, spawnable: false, blocksSight: true, blocksProjectiles: true, elevation: 0 },
  [TileType.Rock]: { id: TileType.Rock, role: 'rock', walkable: false, spawnable: false, blocksSight: true, blocksProjectiles: true, elevation: 0 },
  [TileType.Pillar]: { id: TileType.Pillar, role: 'pillar', walkable: false, spawnable: false, blocksSight: true, blocksProjectiles: true, elevation: 0 },
  [TileType.Water]: { id: TileType.Water, role: 'water', walkable: false, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Lava]: { id: TileType.Lava, role: 'lava', walkable: false, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Chasm]: { id: TileType.Chasm, role: 'chasm', walkable: false, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Grass]: { id: TileType.Grass, role: 'grass', walkable: true, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Sand]: { id: TileType.Sand, role: 'sand', walkable: true, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
  [TileType.Carpet]: { id: TileType.Carpet, role: 'carpet', walkable: true, spawnable: false, blocksSight: false, blocksProjectiles: false, elevation: 0 },
};

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  theme?: MapTheme;
  tiles: number[][];
  spawnPoint: Position;
}

export function isInBounds(map: MapData, position: Position): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y)
    && position.x >= 0 && position.x < map.width
    && position.y >= 0 && position.y < map.height;
}

export function getTileDefinition(tile: number): TileDefinition | undefined {
  return TILE_DEFINITIONS[tile as TileType];
}

export function getTileAt(map: MapData, position: Position): TileDefinition | undefined {
  if (!isInBounds(map, position)) return undefined;
  return getTileDefinition(map.tiles[position.y][position.x]);
}

export function isWalkableTile(map: MapData, position: Position): boolean {
  return getTileAt(map, position)?.walkable === true;
}

export function isSpawnableTile(map: MapData, position: Position): boolean {
  return getTileAt(map, position)?.spawnable === true;
}

export function canTransition(map: MapData, from: Position, to: Position): boolean {
  const fromTile = getTileAt(map, from);
  const toTile = getTileAt(map, to);
  if (!fromTile?.walkable || !toTile?.walkable) return false;

  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;

  // All tiles now have elevation 0, so any walkable-to-walkable transition is valid
  return true;
}

export function getElevation(map: MapData, position: Position): 0 | 1 {
  return getTileAt(map, position)?.elevation ?? 0;
}

export function getRenderedElevation(map: MapData, position: Position): number {
  return getElevation(map, position);
}
