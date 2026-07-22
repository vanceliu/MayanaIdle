import { Container, Graphics } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { worldToScreen, TILE_W, TILE_H, WALL_HEIGHT, getDepth } from '../utils/isometric';

const WALL_TOP_COLOR = 0x4a4a5a;
const WALL_LEFT_COLOR = 0x3a3a4a;
const WALL_RIGHT_COLOR = 0x2a2a3a;

export class WallLayer {
  private wallGraphics: Graphics[] = [];

  constructor() {}

  buildInto(container: Container, mapData: MapData): void {
    this.removeFrom(container);

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        if (tile !== 1) continue;

        const { sx, sy } = worldToScreen(x, y);
        const wallGraphic = this.drawWall(sx, sy);
        wallGraphic.zIndex = getDepth({ x, y });
        this.wallGraphics.push(wallGraphic);
        container.addChild(wallGraphic);
      }
    }
  }

  private removeFrom(container: Container): void {
    for (const g of this.wallGraphics) {
      container.removeChild(g);
      g.destroy();
    }
    this.wallGraphics = [];
  }

  private drawWall(sx: number, sy: number): Graphics {
    const g = new Graphics();
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    // top face (raised)
    g.poly([
      sx, sy - hh - WALL_HEIGHT,
      sx + hw, sy - WALL_HEIGHT,
      sx, sy + hh - WALL_HEIGHT,
      sx - hw, sy - WALL_HEIGHT,
    ]).fill({ color: WALL_TOP_COLOR });

    // left face
    g.poly([
      sx - hw, sy - WALL_HEIGHT,
      sx, sy + hh - WALL_HEIGHT,
      sx, sy + hh,
      sx - hw, sy,
    ]).fill({ color: WALL_LEFT_COLOR });

    // right face
    g.poly([
      sx + hw, sy - WALL_HEIGHT,
      sx, sy + hh - WALL_HEIGHT,
      sx, sy + hh,
      sx + hw, sy,
    ]).fill({ color: WALL_RIGHT_COLOR });

    return g;
  }

  destroy(): void {
    for (const g of this.wallGraphics) {
      g.destroy();
    }
    this.wallGraphics = [];
  }
}
