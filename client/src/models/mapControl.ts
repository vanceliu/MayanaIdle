export interface Position {
  x: number;
  y: number;
}

export const TileType = {
  Floor: 0,
  Wall: 1,
  Spawn: 2,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: number[][];
  spawnPoint: Position;
}
