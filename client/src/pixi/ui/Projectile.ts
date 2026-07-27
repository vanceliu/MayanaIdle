import { Graphics, Container } from 'pixi.js';

const MIN_DURATION = 100;
const MAX_DURATION = 1500;

export type ProjectileShape = 'circle' | 'arrow';

export interface ProjectileSpawnOpts {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  speed: number;
  color: number;
  onArrive: () => void;
  shape?: ProjectileShape;
  size?: number; // radius for circle, length for arrow
}

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

  spawn(opts: ProjectileSpawnOpts): void {
    const { fromX, fromY, toX, toY, speed, color, onArrive, shape = 'circle', size } = opts;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, (dist / speed) * 1000));

    const angle = Math.atan2(dy, dx);
    const g = this.acquire(color, shape, size, angle);
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

  private acquire(color: number, shape: ProjectileShape, size: number | undefined, angle: number): Graphics {
    let g = this.pool.pop();
    if (!g) {
      g = new Graphics();
      this.container.addChild(g);
    }
    g.clear();
    g.rotation = 0;

    if (shape === 'arrow') {
      const len = size ?? 12;
      const headW = len * 0.35;
      // Arrowhead
      g.poly([
        { x: len, y: 0 },
        { x: len * 0.4, y: -headW },
        { x: len * 0.5, y: 0 },
        { x: len * 0.4, y: headW },
      ]).fill(color);
      // Long shaft
      g.rect(-len * 0.9, -headW * 0.15, len * 1.4, headW * 0.3).fill(color);
      g.rotation = angle;
    } else {
      const r = size ?? 3;
      g.circle(0, 0, r).fill(color);
    }

    return g;
  }

  private release(g: Graphics): void {
    g.visible = false;
    this.pool.push(g);
  }
}
