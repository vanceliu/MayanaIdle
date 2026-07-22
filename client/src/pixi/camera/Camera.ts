import { Container } from 'pixi.js';

export class Camera {
  private container: Container;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private targetX = 0;
  private targetY = 0;
  private lerp = 0.1;

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
      this.container.x += (destX - this.container.x) * this.lerp;
      this.container.y += (destY - this.container.y) * this.lerp;
    }
  }

  getOffset(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }
}
