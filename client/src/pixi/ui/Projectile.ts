import { Graphics, Container } from 'pixi.js';

const PROJECTILE_RADIUS = 3;
const MIN_DURATION = 100;
const MAX_DURATION = 1500;

interface FlyingProjectile {
  graphics: Graphics;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  elapsed: number;
  duration: number;
  onArrive: () => void;
}

export class ProjectileManager {
  private pool: Graphics[] = [];
  private active: FlyingProjectile[] = [];
  readonly container = new Container();

  spawn(
    fromX: number, fromY: number,
    toX: number, toY: number,
    speed: number,
    color: number,
    onArrive: () => void,
  ): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, (dist / speed) * 1000));

    const g = this.acquire(color);
    g.x = fromX;
    g.y = fromY;
    g.alpha = 1;
    g.visible = true;

    this.active.push({
      graphics: g,
      startX: fromX, startY: fromY,
      endX: toX, endY: toY,
      elapsed: 0,
      duration,
      onArrive,
    });
  }

  update(deltaMS: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.elapsed += deltaMS;
      const t = Math.min(p.elapsed / p.duration, 1);

      p.graphics.x = p.startX + (p.endX - p.startX) * t;
      p.graphics.y = p.startY + (p.endY - p.startY) * t;

      if (t >= 1) {
        p.onArrive();
        this.release(p.graphics);
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.active) {
      this.release(p.graphics);
    }
    this.active.length = 0;
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) {
      g.destroy();
    }
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  private acquire(color: number): Graphics {
    let g = this.pool.pop();
    if (!g) {
      g = new Graphics();
      this.container.addChild(g);
    }
    g.clear();
    g.circle(0, 0, PROJECTILE_RADIUS).fill(color);
    return g;
  }

  private release(g: Graphics): void {
    g.visible = false;
    this.pool.push(g);
  }
}
