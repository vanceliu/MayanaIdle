/**
 * 角色外觀的 SVG（管理介面角色查詢，`97-selfhosted-server.md` § 97.8）。
 * 用遊戲同一份 `drawPawn()` 畫（`04-character.md` § 4.10），四個朝向排成一列。
 */
import { drawPawn, toPawnLook, type PawnContext } from '../../client/src/pixi/entities/pawn/drawPawn';
import { PAWN_DIRECTIONS, PAWN_GEOM } from '../../client/src/pixi/entities/pawn/geometry';
import { normalizeAppearance } from '../../client/src/models/appearance';

/** 朝向之間的間距（繪圖單位） */
const VIEW_SPACING = 50;
/** 每 2π 的取樣段數：橢圓與圓角轉成折線 */
const ARC_SEGMENTS = 48;
const TAU = Math.PI * 2;

const num = (n: number) => String(Math.round(n * 100) / 100);
const attr = (v: string) => v.replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]!));

interface DrawState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  miterLimit: number;
  globalAlpha: number;
}

/** `PawnContext` 的 SVG 版：每次 fill／stroke 輸出一個 `<path>`，並記錄外框 */
class SvgPawnContext implements PawnContext {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineJoin: CanvasLineJoin = 'miter';
  lineCap: CanvasLineCap = 'butt';
  miterLimit = 10;
  globalAlpha = 1;

  readonly paths: string[] = [];
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  private d: string[] = [];
  private hasPoint = false;
  private readonly stack: DrawState[] = [];

  private point(x: number, y: number): string {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
    return `${num(x)} ${num(y)}`;
  }

  save(): void {
    const { fillStyle, strokeStyle, lineWidth, lineJoin, lineCap, miterLimit, globalAlpha } = this;
    this.stack.push({ fillStyle, strokeStyle, lineWidth, lineJoin, lineCap, miterLimit, globalAlpha });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }

  beginPath(): void {
    this.d = [];
    this.hasPoint = false;
  }

  closePath(): void {
    this.d.push('Z');
  }

  moveTo(x: number, y: number): void {
    this.d.push(`M${this.point(x, y)}`);
    this.hasPoint = true;
  }

  lineTo(x: number, y: number): void {
    this.d.push(`${this.hasPoint ? 'L' : 'M'}${this.point(x, y)}`);
    this.hasPoint = true;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(cx, cy);
    this.d.push(`Q${this.point(cx, cy)} ${this.point(x, y)}`);
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(c1x, c1y);
    this.d.push(`C${this.point(c1x, c1y)} ${this.point(c2x, c2y)} ${this.point(x, y)}`);
  }

  /** Canvas 的順時針語意：a1 − a0 ≥ 2π 為整圈，否則掃過 (a1 − a0) mod 2π */
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void {
    const sweep = a1 - a0 >= TAU ? TAU : (((a1 - a0) % TAU) + TAU) % TAU;
    const steps = Math.max(2, Math.ceil((sweep / TAU) * ARC_SEGMENTS));
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (sweep * i) / steps;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      this.lineTo(x + ex * cos - ey * sin, y + ex * sin + ey * cos);
    }
  }

  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + rr, y);
    this.ellipse(x + w - rr, y + rr, rr, rr, 0, -Math.PI / 2, 0);
    this.ellipse(x + w - rr, y + h - rr, rr, rr, 0, 0, Math.PI / 2);
    this.ellipse(x + rr, y + h - rr, rr, rr, 0, Math.PI / 2, Math.PI);
    this.ellipse(x + rr, y + rr, rr, rr, 0, Math.PI, Math.PI * 1.5);
    this.closePath();
    this.hasPoint = true;
  }

  fill(): void {
    if (this.d.length === 0) return;
    this.paths.push(`<path d="${this.d.join('')}" fill="${attr(this.fillStyle)}"${this.opacity()}/>`);
  }

  stroke(): void {
    if (this.d.length === 0) return;
    this.paths.push(`<path d="${this.d.join('')}" fill="none" stroke="${attr(this.strokeStyle)}" stroke-width="${num(this.lineWidth)}"`
      + ` stroke-linejoin="${this.lineJoin}" stroke-linecap="${this.lineCap}" stroke-miterlimit="${num(this.miterLimit)}"${this.opacity()}/>`);
  }

  private opacity(): string {
    return this.globalAlpha < 1 ? ` opacity="${num(this.globalAlpha)}"` : '';
  }
}

/** 角色外觀四朝向（正面、右、左、背面）；外觀資料不合法的欄位依 `normalizeAppearance()` 補預設 */
export function appearanceSvg(appearance: unknown): string {
  const ctx = new SvgPawnContext();
  const look = toPawnLook(normalizeAppearance(appearance));
  PAWN_DIRECTIONS.forEach((dir, i) => drawPawn(ctx, i * VIEW_SPACING, 0, dir, look, PAWN_GEOM));
  const pad = 3;
  const x = ctx.minX - pad;
  const y = ctx.minY - pad;
  const w = ctx.maxX - ctx.minX + pad * 2;
  const h = ctx.maxY - ctx.minY + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}">${ctx.paths.join('')}</svg>`;
}
