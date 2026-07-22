import { Graphics, Container } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H } from '../utils/isometric';
import type { Position } from '../../models/mapControl';

const MONSTER_COLOR = 0xff6b6b;
const BOSS_COLOR = 0xcc00cc;
const GLOW_COLOR = 0xff8888;
const BOSS_GLOW_COLOR = 0xff00ff;
const RADIUS = TILE_H * 0.45;

export class MonsterEntity {
  public container: Container;
  public id: string;
  private glow: Graphics;
  private body: Graphics;
  private isBoss: boolean;

  constructor(id: string, isBoss = false) {
    this.id = id;
    this.isBoss = isBoss;
    this.container = new Container();

    const glowColor = isBoss ? BOSS_GLOW_COLOR : GLOW_COLOR;
    const bodyColor = isBoss ? BOSS_COLOR : MONSTER_COLOR;

    this.glow = new Graphics();
    this.glow.circle(0, -RADIUS, RADIUS + 2).fill({ color: glowColor, alpha: 0.3 });

    this.body = new Graphics();
    this.body.circle(0, -RADIUS, RADIUS).fill({ color: bodyColor });

    this.container.addChild(this.glow);
    this.container.addChild(this.body);

    if (isBoss) {
      this.drawBossHorns();
    }
  }

  private drawBossHorns(): void {
    const horns = new Graphics();
    horns
      .poly([-6, -RADIUS * 2, -3, -RADIUS * 2 - 8, 0, -RADIUS * 2])
      .fill({ color: BOSS_COLOR })
      .poly([0, -RADIUS * 2, 3, -RADIUS * 2 - 8, 6, -RADIUS * 2])
      .fill({ color: BOSS_COLOR });
    this.container.addChild(horns);
  }

  updatePosition(pos: Position): void {
    const { sx, sy } = worldToScreen(pos.x, pos.y);
    this.container.x = sx;
    this.container.y = sy;
    this.container.zIndex = getEntityDepth(pos);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
