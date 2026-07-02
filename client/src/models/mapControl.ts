export interface Position {
  x: number;
  y: number;
}

export enum TileType {
  Floor = 0,
  Wall = 1,
  Spawn = 2,
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: number[][];
  spawnPoint: Position;
}

export interface MapEntity {
  id: string;
  position: Position;
  type: 'player' | 'monster';
}
