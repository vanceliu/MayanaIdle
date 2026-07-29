import { Graphics, Container } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H } from '../utils/isometric';
import type { Position } from '../../models/mapControl';

const PLAYER_COLOR = 0x4dabf7;
const GLOW_COLOR = 0x74c0fc;
const RADIUS = TILE_H * 0.45;

export class PlayerEntity {
  public container: Container;
  private glow: Graphics;
  private body: Graphics;

  constructor() {
    this.container = new Container();

    this.glow = new Graphics();
    this.glow.circle(0, -RADIUS, RADIUS + 2).fill({ color: GLOW_COLOR, alpha: 0.3 });

    this.body = new Graphics();
    this.body.circle(0, -RADIUS, RADIUS).fill({ color: PLAYER_COLOR });

    this.container.addChild(this.glow);
    this.container.addChild(this.body);
  }

  updatePosition(pos: Position, elevation = 0): void {
    const { sx, sy } = worldToScreen(pos.x, pos.y, elevation);
    this.container.x = sx;
    this.container.y = sy;
    this.container.zIndex = getEntityDepth(pos, elevation);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
