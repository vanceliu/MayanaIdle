import { Container } from 'pixi.js';

export class Camera {
  private container: Container;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private targetX = 0;
  private targetY = 0;
  private lerp = 0.1;
  /** 離目標小於這個距離（px）直接定位：緩動是漸近收斂，不夾的話鏡頭永遠在動、每幀都要重畫 */
  private snapDistance = 0.5;

  constructor(container: Container) {
    this.container = container;
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  setTarget(screenX: number, screenY: number): void {
    this.targetX = screenX;
    this.targetY = screenY;
  }

  update(instant = false): void {
    const destX = this.viewportWidth / 2 - this.targetX;
    const destY = this.viewportHeight / 2 - this.targetY;

    if (instant) {
      this.container.x = destX;
      this.container.y = destY;
    } else {
      this.container.x = this.approach(this.container.x, destX);
      this.container.y = this.approach(this.container.y, destY);
    }
  }

  private approach(current: number, dest: number): number {
    const gap = dest - current;
    return Math.abs(gap) < this.snapDistance ? dest : current + gap * this.lerp;
  }

  getOffset(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }
}
