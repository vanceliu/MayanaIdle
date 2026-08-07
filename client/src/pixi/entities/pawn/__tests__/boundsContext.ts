import type { PawnContext } from '../drawPawn';

/**
 * 只記座標、不畫東西的假 ctx。
 *
 * jsdom 沒有 canvas，所以無法在測試裡真的畫出來再量像素。
 * 改成把每一個經過的座標收進來取外框 —— 控制點也算，
 * 所以量出來的框**只會比實際大不會比較小**，
 * 拿來問「會不會超出貼圖」是安全的方向。
 *
 * 同時擋 NaN：髮際線是一條連續路徑，少一個參數就會讓中段座標變成 NaN，
 * 那些 path 指令會被 canvas 靜默丟掉 —— 畫面上只表現成「參數沒作用」，
 * 不會有任何錯誤。這裡直接記下來。
 */
export class BoundsContext implements PawnContext {
  /** 出現過 NaN／Infinity 的座標，附上當時呼叫的方法名 */
  readonly badValues: string[] = [];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  lineJoin: CanvasLineJoin = 'round';
  lineCap: CanvasLineCap = 'round';
  miterLimit = 10;
  globalAlpha = 1;

  private rawMinX = Infinity;
  private rawMinY = Infinity;
  private rawMaxX = -Infinity;
  private rawMaxY = -Infinity;
  /** 描邊會往外長半個線寬。取最粗的那次算一次就好，逐次累加會灌水 */
  private maxStroke = 0;

  get left(): number { return this.rawMinX - this.maxStroke / 2; }
  get right(): number { return this.rawMaxX + this.maxStroke / 2; }
  get top(): number { return this.rawMinY - this.maxStroke / 2; }
  get bottom(): number { return this.rawMaxY + this.maxStroke / 2; }

  private at(method: string, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.badValues.push(`${method}(${x}, ${y})`);
      return;
    }
    if (x < this.rawMinX) this.rawMinX = x;
    if (x > this.rawMaxX) this.rawMaxX = x;
    if (y < this.rawMinY) this.rawMinY = y;
    if (y > this.rawMaxY) this.rawMaxY = y;
  }

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  fill(): void {}

  stroke(): void {
    if (Number.isFinite(this.lineWidth)) {
      this.maxStroke = Math.max(this.maxStroke, this.lineWidth);
    } else {
      this.badValues.push(`lineWidth = ${this.lineWidth}`);
    }
  }

  moveTo(x: number, y: number): void { this.at('moveTo', x, y); }
  lineTo(x: number, y: number): void { this.at('lineTo', x, y); }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.at('quadraticCurveTo', cx, cy);
    this.at('quadraticCurveTo', x, y);
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.at('bezierCurveTo', c1x, c1y);
    this.at('bezierCurveTo', c2x, c2y);
    this.at('bezierCurveTo', x, y);
  }

  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.at('ellipse', x - rx, y - ry);
    this.at('ellipse', x + rx, y + ry);
  }

  roundRect(x: number, y: number, w: number, h: number): void {
    this.at('roundRect', x, y);
    this.at('roundRect', x + w, y + h);
  }
}
