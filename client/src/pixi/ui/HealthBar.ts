import { Graphics, Container } from 'pixi.js';

const BAR_WIDTH = 40;
const BAR_HEIGHT = 4;
const BAR_OFFSET_Y = -20;

export class HealthBar {
  readonly container = new Container();
  private bg = new Graphics();
  private bar = new Graphics();
  private barColor: number;
  /** 上一次畫出來的比例。血量沒變就不重建幾何 —— 這支每隻怪每幀都會被呼叫 */
  private lastRatio = -1;

  constructor(isBoss: boolean) {
    this.barColor = isBoss ? 0xaa44ff : 0xff3333;
    this.container.y = BAR_OFFSET_Y;

    this.bg.rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT);
    this.bg.fill(0x333333);

    this.container.addChild(this.bg, this.bar);
    this.update(1, 1);
  }

  update(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(current / max, 1));
    if (ratio === this.lastRatio) return;
    this.lastRatio = ratio;
    this.bar.clear();
    this.bar.rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH * ratio, BAR_HEIGHT);
    this.bar.fill(this.barColor);
  }

  /** 這一刻畫出來的血量比例（0–1）。測試用來確認血條跟的是演出而不是判定 */
  get ratio(): number {
    return this.lastRatio;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
