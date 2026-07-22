import { Container, Graphics } from 'pixi.js';
import type { Position } from '../../models/mapControl';
import { worldToScreen, TILE_W, TILE_H } from '../utils/isometric';

const PATH_COLOR = 0x4488ff;
const PATH_ALPHA = 0.4;

export class PathLayer {
  public container: Container;
  private graphics: Graphics;

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  updatePath(path: Position[], fromIndex: number): void {
    this.graphics.clear();

    const hw = TILE_W / 4;
    const hh = TILE_H / 4;

    for (let i = fromIndex; i < path.length; i++) {
      const { sx, sy } = worldToScreen(path[i].x, path[i].y);
      this.graphics
        .poly([
          sx, sy - hh,
          sx + hw, sy,
          sx, sy + hh,
          sx - hw, sy,
        ])
        .fill({ color: PATH_COLOR, alpha: PATH_ALPHA });
    }
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.container.removeChildren();
  }
}
