import { Container, Graphics } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { worldToScreen, TILE_W, TILE_H } from '../utils/isometric';

const FLOOR_COLOR = 0x2d5a3f;
const FLOOR_ALT_COLOR = 0x245231;
const GRID_COLOR = 0x1a3d2a;

export class FloorLayer {
  public container: Container;
  private _built = false;

  constructor() {
    this.container = new Container();
  }

  buildFromMap(mapData: MapData): void {
    this.container.removeChildren();

    const graphics = new Graphics();

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        if (tile === 1) continue;

        const { sx, sy } = worldToScreen(x, y);
        const color = (x + y) % 2 === 0 ? FLOOR_COLOR : FLOOR_ALT_COLOR;

        graphics
          .poly([
            sx, sy - TILE_H / 2,
            sx + TILE_W / 2, sy,
            sx, sy + TILE_H / 2,
            sx - TILE_W / 2, sy,
          ])
          .fill({ color })
          .stroke({ color: GRID_COLOR, width: 0.5, alpha: 0.3 });
      }
    }

    this.container.addChild(graphics);
    this._built = true;
  }

  destroy(): void {
    this.container.removeChildren();
    this._built = false;
  }
}
