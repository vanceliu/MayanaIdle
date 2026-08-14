import { Graphics, Container } from 'pixi.js';

const BAR_WIDTH = 40;
const BAR_HEIGHT = 3;
const BAR_OFFSET_Y = -26;
const BAR_COLOR = 0xffcc33;

/** 怪物頭上的詠唱條（`48-vfx.md` § 48.7a）。**不可省略、不可只在 Boss 顯示** */
export class CastBar {
  readonly container = new Container();
  private bg = new Graphics();
  private bar = new Graphics();
  private lastRatio = -1;

  constructor() {
    this.container.y = BAR_OFFSET_Y;
    this.container.visible = false;

    this.bg.rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT);
    this.bg.fill(0x332200);

    this.container.addChild(this.bg, this.bar);
  }

  /** `progress` 0~1；**0 代表沒在詠唱**，整條隱藏 */
  update(progress: number): void {
    const ratio = Math.max(0, Math.min(progress, 1));
    this.container.visible = ratio > 0;
    if (ratio === this.lastRatio) return;
    this.lastRatio = ratio;
    this.bar.clear();
    if (ratio <= 0) return;
    this.bar.rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH * ratio, BAR_HEIGHT);
    this.bar.fill(BAR_COLOR);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
