/**
 * 武器剪影的繪製 —— 與角色同一套畫法（Canvas 2D + 壓深描邊），
 * 所以兩者放在一起不會像貼上去的。
 *
 * **一律畫成「指向正上方」的姿勢，握點在原點。** 旋轉、鏡射、前推由呼叫端
 * 用 transform 處理（demo 用 ctx、遊戲用 Pixi sprite）——
 * 把旋轉畫進路徑的話，每個角度都要重畫一次，就不能烘成貼圖了。
 *
 * 例外只有弓：握點在弓的正中央，形狀往上下兩邊長。
 */
import { paint, type PawnContext } from './drawPawn';
import type {
  AxeParams, BladeParams, BowParams, ClawParams, MaceParams, StaffParams,
  WeaponColors, WeaponGeom, WeaponParams,
} from './weaponGeometry';

/** 柄：所有長柄武器共用。柄底略低於握點，握起來才不像抓在最尾端 */
function shaftPath(
  ctx: PawnContext, ox: number, oy: number, len: number, w: number,
): { top: number } {
  const top = oy - len * 0.88;
  const bot = oy + len * 0.12;
  ctx.beginPath();
  ctx.roundRect(ox - w / 2, top, w, bot - top, w * 0.45);
  return { top };
}

function drawBlade(
  ctx: PawnContext, ox: number, oy: number,
  p: BladeParams, c: WeaponColors, s: number, ol: number,
): void {
  const gripLen = p.gripLen * s;
  const gripW = p.gripW * s;
  const guardW = p.guardW * s;
  const guardH = p.guardH * s;
  const bladeLen = p.bladeLen * s;
  const bw = p.bladeW * s;
  const tipLen = Math.min(p.tipLen * s, bladeLen * 0.8);

  const gripTop = oy - gripLen * 0.6;
  const gripBot = oy + gripLen * 0.4;
  const bladeBase = gripTop - guardH;
  const tip = bladeBase - bladeLen;
  const tipBase = tip + tipLen;

  /* 刀身先畫，護手才蓋得住刀根 —— 反過來會看到刀身壓在護手上 */
  ctx.beginPath();
  ctx.moveTo(ox - bw / 2, bladeBase);
  ctx.lineTo(ox - bw / 2, tipBase);
  ctx.quadraticCurveTo(ox - bw * 0.34, tip, ox, tip);
  ctx.quadraticCurveTo(ox + bw * 0.34, tip, ox + bw / 2, tipBase);
  ctx.lineTo(ox + bw / 2, bladeBase);
  ctx.closePath();
  paint(ctx, c.metal, ol, 'miter');

  ctx.beginPath();
  ctx.roundRect(ox - guardW / 2, gripTop - guardH, guardW, guardH, guardH * 0.45);
  paint(ctx, c.metal, ol);

  ctx.beginPath();
  ctx.roundRect(ox - gripW / 2, gripTop, gripW, gripBot - gripTop, gripW * 0.4);
  paint(ctx, c.handle, ol);

  const pr = p.pommelR * s;
  ctx.beginPath();
  ctx.ellipse(ox, gripBot, pr, pr * 0.9, 0, 0, Math.PI * 2);
  paint(ctx, c.metal, ol);
}

function drawAxe(
  ctx: PawnContext, ox: number, oy: number,
  p: AxeParams, c: WeaponColors, s: number, ol: number, lead: 1 | -1,
): void {
  const shaftW = p.shaftW * s;
  const { top } = shaftPath(ctx, ox, oy, p.shaftLen * s, shaftW);
  paint(ctx, c.handle, ol);

  const ty = top + p.headDrop * s;
  const hl = p.headLen * s;
  const hw = p.headW * s;

  /**
   * 斧刃：**靠柄窄、刃口寬、下緣往內凹**。
   *
   * 三條曲線各有分工，少一條就不是斧頭：
   *   上緣  從柄往外撐出去
   *   刃口  外凸的一段弧（斧頭唯一該鼓出來的地方）
   *   下緣  往回內凹（斧的「鬍鬚」）—— 少了它會變成一片半圓，讀成湯勺
   */
  const sx = shaftW * 0.3;
  /* 單刃：刃口朝弧線前進的那一側，不然就是拿刀背在砍 */
  for (const side of p.double ? [1, -1] : [lead]) {
    ctx.beginPath();
    ctx.moveTo(ox + side * sx, ty);
    ctx.quadraticCurveTo(ox + side * hw * 0.72, ty - hl * 0.08, ox + side * hw, ty + hl * 0.18);
    ctx.quadraticCurveTo(ox + side * hw * 1.06, ty + hl * 0.54, ox + side * hw * 0.84, ty + hl * 0.9);
    ctx.quadraticCurveTo(ox + side * hw * 0.42, ty + hl * 0.66, ox + side * sx, ty + hl * 0.5);
    ctx.closePath();
    paint(ctx, c.metal, ol, 'miter');
  }
}

function drawMace(
  ctx: PawnContext, ox: number, oy: number,
  p: MaceParams, c: WeaponColors, s: number, ol: number,
): void {
  const { top } = shaftPath(ctx, ox, oy, p.shaftLen * s, p.shaftW * s);
  paint(ctx, c.handle, ol);

  const r = p.headR * s;
  const spike = p.spikeLen * s;
  const cy = top + r * 0.85;

  /* 球先畫，星形疊上去 —— 球的描邊會從尖刺之間露出來，讀成「球上長了刺」 */
  ctx.beginPath();
  ctx.ellipse(ox, cy, r, r, 0, 0, Math.PI * 2);
  paint(ctx, c.metal, ol);

  /**
   * 尖刺的**谷底貼著球面**（0.97r），不是縮到球心去。
   * 谷底往內收的話整顆會變成一顆星星，讀成魔杖而不是鈍器。
   */
  const n = Math.max(3, Math.round(p.spikes));
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r + spike : r * 0.97;
    const x = ox + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  paint(ctx, c.metal, ol, 'miter');
}

function drawStaff(
  ctx: PawnContext, ox: number, oy: number,
  p: StaffParams, c: WeaponColors, s: number, ol: number,
): void {
  const { top } = shaftPath(ctx, ox, oy, p.shaftLen * s, p.shaftW * s);
  paint(ctx, c.handle, ol);

  const cw = p.collarW * s;
  ctx.beginPath();
  ctx.roundRect(ox - cw / 2, top, cw, cw * 0.5, cw * 0.2);
  paint(ctx, c.metal, ol);

  const gr = p.gemR * s;
  ctx.beginPath();
  ctx.ellipse(ox, top - gr * 0.7, gr, gr, 0, 0, Math.PI * 2);
  paint(ctx, c.metal, ol);
}

/**
 * 弓：兩支弓臂圍成一片中間厚、兩端收尖的葉形，弦是一條直線。
 *
 * 握把在弓背最鼓的地方（不是在弦上），上下各一道綁帶 ——
 * 少了這一段，弓讀起來是一條彎木片而不是一把弓。
 */
function drawBow(
  ctx: PawnContext, ox: number, oy: number,
  p: BowParams, c: WeaponColors, s: number, ol: number, pull: number,
): void {
  const L = p.limbLen * s;
  const th = p.thickness * s;
  const bend = p.bendW * s;

  /**
   * 弓臂末端仍保留的厚度。兩端收成尖點的話，那一段的寬度會小於描邊粗細，
   * 整支弓臂就變成一條黑線 —— 在 37px 高的角色旁邊，弓只剩輪廓沒有顏色。
   */
  const tipW = th * 0.45;

  /* 三次貝茲在 t=0.5 的偏移是控制點的 0.75 倍，端點不在 0 時還要扣掉端點的貢獻 */
  const outer = (bend + th / 2) / 0.75;
  const inner = (bend - th / 2 + tipW / 4) / 0.75;

  ctx.beginPath();
  ctx.moveTo(ox, oy - L);
  ctx.bezierCurveTo(ox + outer, oy - L * 0.55, ox + outer, oy + L * 0.55, ox, oy + L);
  ctx.lineTo(ox - tipW, oy + L - tipW * 0.4);
  ctx.bezierCurveTo(
    ox - tipW + inner, oy + L * 0.55, ox - tipW + inner, oy - L * 0.55,
    ox - tipW, oy - L + tipW * 0.4,
  );
  ctx.closePath();
  paint(ctx, c.metal, ol);

  /* 弦：拉開時中點往後（−x），弓才「上弦」而不是掛著一條直線 */
  const nockX = ox - p.pullMax * s * pull;
  ctx.beginPath();
  ctx.moveTo(ox - tipW * 0.5, oy - L);
  ctx.lineTo(nockX, oy);
  ctx.lineTo(ox - tipW * 0.5, oy + L);
  ctx.strokeStyle = c.string;
  ctx.lineWidth = Math.max(ol * 0.45, 0.5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  /* 中段握把＋綁帶：畫在弓背最鼓處，略寬於弓身才包得住 */
  if (p.riserLen > 0) {
    const rl = p.riserLen * s;
    const rw = th * 1.15;
    const rx = ox + bend - rw / 2;
    ctx.beginPath();
    ctx.roundRect(rx, oy - rl / 2, rw, rl, rw * 0.3);
    paint(ctx, c.grip, ol);

    const wh = p.wrapH * s;
    if (wh > 0) {
      for (const wy of [oy - rl / 2 - wh * 0.35, oy + rl / 2 - wh * 0.65]) {
        ctx.beginPath();
        ctx.roundRect(rx - rw * 0.12, wy, rw * 1.24, wh, wh * 0.35);
        paint(ctx, c.wrap, ol * 0.7);
      }
    }
  }

  /* 搭在弦上的箭：只有拉弦時才有，放掉就交給投射物特效接手 */
  if (p.arrowLen > 0 && pull > 0.12) {
    const len = p.arrowLen * s;
    const headW = th * 0.8;
    ctx.beginPath();
    ctx.moveTo(nockX, oy);
    ctx.lineTo(nockX + len, oy);
    ctx.strokeStyle = c.handle;
    ctx.lineWidth = Math.max(ol * 0.5, 0.5);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(nockX + len + headW * 1.6, oy);
    ctx.lineTo(nockX + len - headW * 0.4, oy - headW);
    ctx.lineTo(nockX + len - headW * 0.4, oy + headW);
    ctx.closePath();
    paint(ctx, '#d8dae2', ol * 0.6, 'miter');
  }
}

function drawClaw(
  ctx: PawnContext, ox: number, oy: number,
  p: ClawParams, c: WeaponColors, s: number, ol: number, lead: 1 | -1,
): void {
  const bw = p.backW * s;
  const bh = p.backH * s;

  ctx.beginPath();
  ctx.roundRect(ox - bw / 2, oy - bh / 2, bw, bh, bh * 0.35);
  paint(ctx, c.handle, ol);

  const n = Math.max(1, Math.round(p.claws));
  const spread = p.clawSpread * s;
  const len = p.clawLen * s;
  /* 爪往弧線前進的那一側彎 —— 反了就變成往回勾 */
  const cur = p.clawCurve * s * lead;
  const w0 = p.clawW * s;
  const y0 = oy - bh / 2;

  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const bx = ox - spread / 2 + spread * u;
    ctx.beginPath();
    ctx.moveTo(bx - w0 / 2, y0);
    ctx.quadraticCurveTo(bx - w0 / 2 + cur * 0.35, y0 - len * 0.62, bx + cur, y0 - len);
    ctx.quadraticCurveTo(bx + w0 / 2 + cur * 0.35, y0 - len * 0.62, bx + w0 / 2, y0);
    ctx.closePath();
    paint(ctx, c.metal, ol, 'miter');
  }
}

/**
 * 畫一把武器。(ox, oy) 是握點，形狀指向正上方。
 * `pull` 只有弓看得懂（0 = 鬆弦、1 = 滿弦）。
 */
export function drawWeapon(
  ctx: PawnContext,
  ox: number, oy: number,
  params: WeaponParams,
  colors: WeaponColors,
  g: WeaponGeom,
  pull = 0,
  /** 弧線前進的那一側（見 `WeaponPose.lead`）。只有不對稱的形狀吃它 */
  lead: 1 | -1 = 1,
): void {
  const s = g.scale / 100;
  const ol = (g.outline / 10) * s;

  ctx.save();
  switch (params.shape) {
    case 'blade': drawBlade(ctx, ox, oy, params, colors, s, ol); break;
    case 'axe': drawAxe(ctx, ox, oy, params, colors, s, ol, lead); break;
    case 'mace': drawMace(ctx, ox, oy, params, colors, s, ol); break;
    case 'staff': drawStaff(ctx, ox, oy, params, colors, s, ol); break;
    case 'bow': drawBow(ctx, ox, oy, params, colors, s, ol, pull); break;
    case 'claw': drawClaw(ctx, ox, oy, params, colors, s, ol, lead); break;
  }
  ctx.restore();
}
