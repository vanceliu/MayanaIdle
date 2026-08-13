/**
 * 角色剪影的繪製 —— RimWorld 式的無腳 pawn（`04-character.md` § 4.10）。
 *
 * 用 Canvas 2D 而不是 Pixi Graphics 畫，再把整張畫布烘成貼圖（`pawnTexture.ts`）。
 * Pixi Graphics 沒有 `miterLimit`，`roundRect` 的圓角語意也不同，**不可改用**。
 * 同一份實作同時餵給 `client/demo/` 的調校頁。
 *
 * 只用到下面 `PawnContext` 列出的 API，換渲染器時看那個介面就知道要補什麼。
 */
import type { Lash } from '../../../models/appearance';
import type { HairStyleId } from '../../../models/appearance';
import { HAIR_RENDER, type CapCfg } from './hairRender';
import {
  OUTLINE_COLOR,
  EYE_COLOR_DEFAULT,
  type PawnGeom,
  type PawnDirection,
} from './geometry';

/** 繪製用到的 Canvas 2D 子集。測試用假的 ctx 量路徑範圍，靠的就是這個介面 */
export interface PawnContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fill(): void;
  stroke(): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  miterLimit: number;
  globalAlpha: number;
}

export interface PawnLook {
  hair: HairStyleId;
  skin: string;
  hairColor: string;
  /** 眼珠與睫毛共用 */
  eyeColor: string;
  lash: Lash;
  /** 內衣的顏色。裝備外觀做出來之後可能會蓋掉它（`04-character.md` § 4.10） */
  cloth: string;
  /** 背面不畫眼睛，這裡是給「這個造型有沒有眼睛」用的 */
  eyes?: 'dots' | 'none';
  /**
   * 已套上角色微調的髮際線。
   * 由 `resolveCapCfg()` 算好傳進來，繪製過程不改任何共用設定。
   */
  cap: CapCfg;
}

/** 填色＋壓深描邊。武器剪影共用同一份（`drawWeapon.ts`），描邊色不可各寫一套 */
export function paint(ctx: PawnContext, fill: string, outline: number, join: CanvasLineJoin = 'round'): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline > 0) {
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = outline;
    ctx.lineJoin = join; /* 髮尾要 miter 才收得出尖端，round 會把尖角磨平 */
    ctx.miterLimit = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

interface SpinePoint { x: number; y: number; dx: number; dy: number }

/**
 * 髮尾的中心線 —— 一條圓弧，不是直線。
 *
 * 這是「翹起來」與「兔耳朵」的差別：髮尾的方向必須沿路轉，
 * 從髮根以 ang 甩出去，一路轉過 curl 度，尾端就自然彎回來往下落。
 * 方向固定不變的話，不管角度給多少都只是一根直直射出去的棒子。
 *
 *   ang  = 0 垂直往下／90 水平／>90 往上甩
 *   curl = 掃過的總角度。0 是直的；大於 ang 時尾端會轉到水平線以下
 *   bias = 往哪一側（+1 右 / −1 左）
 */
function tailSpine(
  tx: number, ty: number, len: number,
  angDeg: number, curlDeg: number, curl2Deg: number, bias: number,
): (t: number) => SpinePoint {
  const STEPS = 48;
  const a0 = (angDeg * Math.PI) / 180;
  const c1 = (curlDeg * Math.PI) / 180;
  const c2 = (curl2Deg * Math.PI) / 180;

  /* 彎度隨 t 再變化，curl2 與 curl 反號時就會回彎成 S 形 */
  const angAt = (t: number) => a0 - c1 * t - c2 * t * t;

  const xs = [tx];
  const ys = [ty];
  for (let i = 1; i <= STEPS; i++) {
    const a = angAt((i - 0.5) / STEPS); // 中點取樣，誤差比端點取樣小一階
    xs.push(xs[i - 1] + (bias * Math.sin(a) * len) / STEPS);
    ys.push(ys[i - 1] + (Math.cos(a) * len) / STEPS);
  }

  return (t) => {
    const u = Math.max(0, Math.min(1, t)) * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(u));
    const f = u - i;
    const a = angAt(t);
    return {
      x: xs[i] + (xs[i + 1] - xs[i]) * f,
      y: ys[i] + (ys[i + 1] - ys[i]) * f,
      dx: bias * Math.sin(a),
      dy: Math.cos(a),
    };
  };
}

/**
 * 沿著中心線兩側各外推半個髮束寬。
 *
 * shape 決定寬度輪廓，這是「馬尾」與「雙馬尾」外觀差最多的地方：
 *   taper  一路收細到尖點  —— 馬尾、麻花辮
 *   puff   愈往下愈胖，尾端圓鈍 —— 雙馬尾那種短胖的一束
 */
function tailPath(
  ctx: PawnContext,
  spine: (t: number) => SpinePoint,
  w: number,
  shape: 'taper' | 'puff' = 'taper',
  samples = 20,
): void {
  const hw = w / 2;
  const halfAt = shape === 'puff'
    /* sqrt(1 − t^8) 讓寬度撐到很後面才掉下去，尾端就是圓的而不是尖的 */
    ? (t: number) => hw * (0.62 + 0.38 * t) * Math.sqrt(Math.max(0, 1 - t ** 8))
    : (t: number) => hw * (1 - t) ** 0.6;

  const right: [number, number][] = [];
  const left: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = spine(t);
    const hwT = halfAt(t);
    right.push([p.x + p.dy * hwT, p.y - p.dx * hwT]);
    left.push([p.x - p.dy * hwT, p.y + p.dx * hwT]);
  }

  const root = spine(0);
  ctx.beginPath();
  ctx.moveTo(right[0][0], right[0][1]);
  for (let i = 1; i <= samples; i++) ctx.lineTo(right[i][0], right[i][1]);
  for (let i = samples - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
  /* 綁起來的圓頭：往髮根反方向鼓出去 */
  ctx.quadraticCurveTo(
    root.x - root.dx * hw * 1.45, root.y - root.dy * hw * 1.45,
    right[0][0], right[0][1],
  );
  ctx.closePath();
}

/**
 * 軀幹輪廓：左右對稱的封閉路徑，由肩／腰／臀三個半寬決定。
 *
 * 側邊用三次貝茲，兩個控制點都放在腰寬上 —— 腰比肩臀窄就收出沙漏，
 * 介於中間就是梯形，比肩臀寬就鼓成桶狀。一條公式涵蓋所有體型，
 * 不需要為每種體型各畫一個形狀。
 */
function bodyPath(
  ctx: PawnContext, cx: number, gy: number,
  sh: number, waL: number, waR: number, hi: number,
  h: number, r: number, lean: number,
): void {
  const top = gy - h;
  const rb = Math.min(r, hi * 0.9, h * 0.4);

  /* 前傾：腳底不動，愈往上偏移愈多 */
  const xTop = cx + lean;       // 肩線
  const xC1 = cx + lean * 0.62; // 上段控制點（離地 62%）
  const xC2 = cx + lean * 0.38; // 下段控制點（離地 38%）

  ctx.beginPath();
  ctx.moveTo(xTop - sh, top);
  ctx.lineTo(xTop + sh, top);
  ctx.bezierCurveTo(xC1 + waR, top + h * 0.38, xC2 + waR, top + h * 0.62, cx + hi, gy - rb);
  ctx.quadraticCurveTo(cx + hi, gy, cx + hi - rb, gy);
  ctx.lineTo(cx - hi + rb, gy);
  ctx.quadraticCurveTo(cx - hi, gy, cx - hi, gy - rb);
  ctx.bezierCurveTo(xC2 - waL, top + h * 0.62, xC1 - waL, top + h * 0.38, xTop - sh, top);
  ctx.closePath();
}

interface CapOpts {
  edge: 'straight' | 'swoop' | 'sideswept';
  swoop: number; hold: number; front: number;
  bang: number; bangW: number; peak: number; mDip: number;
}

/**
 * 髮際線：上緣貼著頭頂（圓角），下緣是一條線 —— 所以不需要 clip，
 * 只要頭髮比頭寬一點，直接蓋上去就是對的形狀。
 *
 * 左右下緣可以不等高（hL / hR），旁分與側面的髮際線都靠這個做出來。
 */
function hairCapPath(
  ctx: PawnContext, cx: number, top: number, w: number,
  hL: number, hR: number, r: number, o: CapOpts,
): void {
  const { edge, swoop, hold, front, bang, bangW, peak, mDip } = o;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const rr = Math.max(0, Math.min(r, w / 2, hL, hR));

  ctx.beginPath();
  ctx.moveTo(x0, top + hL);
  ctx.lineTo(x0, top + rr);
  ctx.quadraticCurveTo(x0, top, x0 + rr, top);

  ctx.lineTo(x1 - rr, top);
  ctx.quadraticCurveTo(x1, top, x1, top + rr);
  ctx.lineTo(x1, top + hR);

  /* 髮際線（下緣）：由右往左回去 */
  if (edge === 'swoop') {
    /* 弧形瀏海：中段垂下來一道，配上 part 的左右不等高就是側分 */
    ctx.bezierCurveTo(
      x1 - w * 0.16, top + hR + swoop * 0.35,
      x0 + w * 0.44, top + hL + swoop,
      x0, top + hL,
    );
  } else if (edge === 'sideswept') {
    /**
     * 側面專用：臉那半邊維持在髮際線高度**平走**，落差整個集中到腦後。
     *
     * 不能只拉一條斜線或單一條貝茲 —— 兩者的下緣都會斜著切過臉，
     * 正好壓在眼睛上（貝茲的 y 掉得比 x 快，比直線只好一點點）。
     * hold 就是「平走到哪裡才開始往下掉」，要拉過眼睛的位置。
     */
    if (front > 0) {
      const xb = x1 - w * hold;
      ctx.lineTo(xb, top + hR);
      ctx.bezierCurveTo(xb - w * 0.12, top + hR, x0 + w * 0.10, top + hL, x0, top + hL);
    } else {
      const xb = x0 + w * hold;
      ctx.bezierCurveTo(x1 - w * 0.10, top + hR, xb + w * 0.12, top + hL, xb, top + hL);
      ctx.lineTo(x0, top + hL);
    }
  } else if (bang > 0.05) {
    /**
     * 兩側瀏海不是另外貼上去的形狀，就是這條髮際線本身 ——
     * 走到兩端時往下垂一撮再收回原來的高度，中間那段維持原樣。
     * 貼三角形會有接縫，也不是同一個輪廓。
     */
    ctx.lineTo(x1 - bangW * 0.18, top + hR + bang);
    ctx.quadraticCurveTo(x1 - bangW * 0.55, top + hR + bang * 0.30, x1 - bangW, top + hR);

    const xa = x1 - bangW;
    const xb = x0 + bangW;
    const ya = top + hR;
    const yb = top + hL;
    const xm = (xa + xb) / 2;

    /* 中段的形狀由兩個數字調出來，不是幾個寫死的樣式 */
    if (Math.abs(peak) > 0.05 || Math.abs(mDip) > 0.05) {
      const h1 = (xa + xm) / 2;
      const h2 = (xm + xb) / 2;
      ctx.quadraticCurveTo(xa - (xa - h1) * 0.55, ya - peak * 1.15, h1, ya - peak);
      ctx.quadraticCurveTo((h1 + xm) / 2, ya - peak + mDip * 0.9, xm, ya - peak + mDip);
      ctx.quadraticCurveTo((xm + h2) / 2, yb - peak + mDip * 0.9, h2, yb - peak);
      ctx.quadraticCurveTo(xb + (h2 - xb) * 0.55, yb - peak * 1.15, xb, yb);
    } else {
      ctx.lineTo(xb, yb);
    }
    ctx.quadraticCurveTo(
      x0 + bangW * 0.55, top + hL + bang * 0.30,
      x0 + bangW * 0.18, top + hL + bang,
    );
    /* closePath 從左撮的尖端拉回起點，正好收成那一撮的外緣 */
  }
  /* 三者皆無時 closePath 自己拉一條直線回去 */

  ctx.closePath();
}

/**
 * 畫一個 pawn。(gx, gy) 是所站地磚的中心 —— **軀幹底部貼齊該點**，
 * 與現行圓圈「圓心上移一個半徑」是同一套對齊邏輯（`40-pixijs-migration.md`）。
 */
export function drawPawn(
  ctx: PawnContext,
  gx: number, gy: number,
  dir: PawnDirection,
  look: PawnLook,
  g: PawnGeom,
): void {
  const s = g.scale / 100;
  const ol = (g.outline / 10) * s;
  /* 側面看到的是身體的厚度而不是寬度，所以整體收窄 */
  const narrow = dir.view === 'side' ? g.sideNarrow / 100 : 1;

  const bodyH = g.bodyH * s;
  const sh = g.shoulder * s * narrow;
  const wa = g.waist * s * narrow;
  const hi = g.hip * s * narrow;

  /**
   * 側面的腰左右不對稱：胸腹往前鼓、腰背往內收。
   * 只把三個寬度等比縮窄會變成一根直筒 —— 前後給不同的腰寬才有側身的弧度。
   */
  const isSide = dir.view === 'side';
  const waFront = wa * (isSide ? g.sideWaistFront / 100 : 1);
  const waBack = wa * (isSide ? g.sideWaistBack / 100 : 1);
  const waR = !isSide || dir.sign > 0 ? waFront : waBack;
  const waL = !isSide || dir.sign > 0 ? waBack : waFront;

  const headW = g.headW * s;
  const headH = g.headH * s;
  const headR = Math.min(g.headR * s, headW / 2, headH / 2);
  /* 側面稍微前傾：肩線與頭一起往面朝側平移，腳底不動 */
  const lean = isSide ? dir.sign * (g.sideLean / 10) * s : 0;

  /* 頭「坐在」軀幹頂端，再往下陷 headOverlap */
  const headCy = gy - (bodyH + headH / 2 - g.headOverlap * s);
  const headCx = gx + dir.sign * g.headOff * s + lean;

  ctx.save();

  const hs = HAIR_RENDER[look.hair] ?? HAIR_RENDER.bald;
  const cc = look.cap;
  const knots: { x: number; y: number }[] = []; /* 髮髻要等頭畫完才畫 */
  const deferredTails: { x: number; y: number; bias: number }[] = [];
  let deferredDraw: ((t: { x: number; y: number; bias: number }) => void) | null = null;
  const puff = (g.hairPuff / 10) * s;

  /* ── 1. 地面陰影（等距 2:1，所以垂直半徑減半） ── */
  if (g.shadow > 0 && g.shadowA > 0) {
    ctx.globalAlpha = g.shadowA / 100;
    ctx.beginPath();
    ctx.ellipse(gx, gy, g.shadow * s, g.shadow * s * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * 長髮是**獨立部件**，不沿用預設髮際線。
   *
   * **一條封閉路徑**同時畫出：外輪廓、兩側垂髮、瀏海，中間留一個臉的開口。
   * 不可拆成「髮際線 + 髮量」兩塊各自描邊。
   *
   * 自帶臉部開口，直接畫在頭與軀幹之上，不需要逐朝向調繪製順序。
   */
  function drawLongHair(): void {
    const half = headW / 2;
    const yTop = headCy - headH / 2 - puff;
    const len = (g.lgLen / 100) * headH;
    const yBot = yTop + len;
    const yFr = yTop + (g.lgFringe / 100) * headH;
    const rTop = Math.min(headR + puff, len * 0.3);
    const rHem = Math.min(half * 0.5, len * 0.18);
    const dip = g.lgHemDip / 10;
    const fw0 = half * (g.lgFaceW / 100);
    const lockMin = half * (g.lgLockMin / 100);
    const openCx = headCx + (isSide ? dir.sign * half * (g.lgSideOpen / 100) : 0);

    /* 側面：背側加寬、臉側收窄；正面／背面左右對稱 */
    const sideMul = (sign: number) =>
      !isSide ? 1 : (sign === -dir.sign ? g.lgSideBack : g.lgSideFront) / 100;
    const mL = sideMul(-1);
    const mR = sideMul(1);
    /* 頂端兩側都要蓋得住頭，前後差異只作用在下襬 */
    const topL = half * (g.lgTopW / 100) * (isSide ? 1.12 : mL);
    const topR = half * (g.lgTopW / 100) * (isSide ? 1 : mR);
    const hemL = half * (g.lgHemW / 100) * mL;
    const hemR = half * (g.lgHemW / 100) * mR;
    const cx = headCx;

    ctx.beginPath();
    /* 外輪廓 左上角 → 頂 → 右上角 → 右下襬 */
    ctx.moveTo(cx - topL, yTop + rTop);
    ctx.quadraticCurveTo(cx - topL, yTop, cx - topL + Math.min(rTop, topL), yTop);
    ctx.lineTo(cx + topR - Math.min(rTop, topR), yTop);
    ctx.quadraticCurveTo(cx + topR, yTop, cx + topR, yTop + rTop);
    ctx.bezierCurveTo(cx + topR, yTop + len * 0.45, cx + hemR, yTop + len * 0.62, cx + hemR, yBot - rHem);
    ctx.quadraticCurveTo(cx + hemR, yBot, cx + hemR - rHem, yBot);

    if (dir.view === 'back') {
      /* 背面沒有臉：下襬走一條中間微垂的弧，不是平的切口 */
      ctx.bezierCurveTo(
        cx + hemR * 0.5, yBot + dip, cx - hemL * 0.5, yBot + dip,
        cx - hemL + rHem, yBot,
      );
    } else {
      /**
       * 臉部開口的半寬必須**小於那一側的下襬外緣**（避免路徑自我相交）。
       */
      const fR = Math.min(fw0, cx + hemR - openCx - lockMin);
      const fL = Math.min(fw0, openCx - (cx - hemL) - lockMin);
      ctx.bezierCurveTo(cx + hemR * 0.55, yBot + dip, openCx + fR, yBot + dip, openCx + fR, yBot - rHem * 0.5);
      ctx.bezierCurveTo(openCx + fR, yTop + len * 0.45, openCx + fR, yFr + 1, openCx + fR, yFr);
      ctx.quadraticCurveTo(openCx, yFr + g.lgFringeDip / 10, openCx - fL, yFr);
      ctx.bezierCurveTo(openCx - fL, yFr + 1, openCx - fL, yTop + len * 0.45, openCx - fL, yBot - rHem * 0.5);
      ctx.bezierCurveTo(openCx - fL, yBot + dip, cx - hemL * 0.55, yBot + dip, cx - hemL + rHem, yBot);
    }

    ctx.quadraticCurveTo(cx - hemL, yBot, cx - hemL, yBot - rHem);
    ctx.bezierCurveTo(cx - hemL, yTop + len * 0.62, cx - topL, yTop + len * 0.45, cx - topL, yTop + rTop);
    ctx.closePath();
    paint(ctx, look.hairColor, ol);
  }

  /* ── 2. 軀幹 ── */
  bodyPath(ctx, gx, gy, sh, waL, waR, hi, bodyH, g.bodyR * s, lean);
  paint(ctx, look.cloth, ol);

  /* ── 3. 頭髮的「頭後」部分：馬尾、雙馬尾 ──
     畫在頭之前，才會被頭蓋住而落在後方；但在軀幹之後，
     所以馬尾與雙馬尾會自然披在肩上。 */
  if (hs.tail !== 'none') {
    /**
     * 雙馬尾是「短胖圓頭、往下往外撇」，馬尾與麻花辮是「細長收尖」——
     * 兩者的長寬、角度、寬度輪廓全都不同，不能共用一組數字。
     */
    const c = hs.tailCfg;
    const b = c.base; /* 'twin' = 用雙馬尾那組髮束，後馬尾與側馬尾都共用 */

    const tw = (g[`${b}W`] / 100) * headW * c.wMul;
    const th = (g[`${b}H`] / 100) * headH * c.lenMul;
    const ang = g[`${b}Angle`] + c.angAdd;
    const curl = g[`${b}Curl`] + c.curlAdd;
    const curl2 = g[`${b}Curl2`] + c.curl2Add;
    const shape = c.shape;

    /**
     * 髮根的位置決定了整體長相：
     * 馬尾綁在腦後偏下（所以正面被頭完全擋住，只有背面與側面看得到），
     * 雙馬尾綁在兩側偏上（正背面都看得到，側面只露近的那一束）。
     */
    const tails: { x: number; y: number; bias: number }[] = [];
    if (hs.tail === 'pony') {
      const y = headCy + headH * ((g.ponyRootPct + c.rootAdd) / 100);
      if (dir.view === 'back') {
        tails.push({ x: headCx, y, bias: 1 });
      } else if (isSide) {
        /* 側面要推到頭的輪廓外；y 必須與正面／背面同高 */
        tails.push({ x: headCx - dir.sign * headW * (g.ponySideOffPct / 100), y, bias: -dir.sign });
      } else if (hs.knot) {
        /**
         * 正面：髮髻在腦後、被頭擋住，只有凸出頭輪廓的那一小坨露得出來。
         * 位置必須與背面同一點。
         */
        const kr = (g.knotR / 100) * headW;
        ctx.beginPath();
        ctx.ellipse(headCx - headW * (g.ponyFrontPeekPct / 100), y, kr, kr * 0.94, 0, 0, Math.PI * 2);
        paint(ctx, look.hairColor, ol);
      }
    } else if (hs.tail === 'side') {
      /* 側馬尾＝雙馬尾取單邊：髮根、角度、長寬全部沿用，不另立一套 */
      const sb = isSide ? -dir.sign : 1;
      tails.push({
        x: headCx + sb * (headW / 2 + tw * 0.06),
        y: headCy + headH * ((g.twinRootPct + c.rootAdd) / 100),
        bias: sb,
      });
    } else {
      /* 圓球（Pigtails）髮根要塞進頭裡才像黏上去的；細長款則掛在頭緣 */
      const off = shape === 'puff'
        ? headW * (g.twinOffPct / 100)
        : headW / 2 + tw * 0.06;
      const y = headCy + headH * ((g.twinRootPct + c.rootAdd) / 100);
      /* 側面那顆要推到頭緣，縮太多會整顆藏在頭裡 */
      if (isSide) {
        tails.push({ x: headCx - dir.sign * off * (g.twinSideOffMul / 100), y, bias: -dir.sign });
      } else {
        tails.push({ x: headCx - off, y, bias: -1 }, { x: headCx + off, y, bias: 1 });
      }
    }

    /**
     * 後馬尾的髮束是**貼在頭髮上**的，所以要延後到頭與髮際線都畫完才畫，
     * 靠描邊在髮色上分出輪廓。畫在頭之前的話只有超出頭以外的部分看得到 ——
     * 那就變成「頭以下的馬尾」。
     */
    const drawTail = ({ x: tx, y: ty, bias }: { x: number; y: number; bias: number }) => {
      const spine = tailSpine(tx, ty, th, ang, curl, curl2, bias);
      tailPath(ctx, spine, tw, shape);
      paint(ctx, look.hairColor, ol, shape === 'puff' ? 'round' : 'miter');

      /* 麻花辮：沿著中心線補三顆逐漸縮小的結，就有分節感 */
      if (hs.braid) {
        for (let i = 1; i <= 3; i++) {
          const t = i / 4;
          const p = spine(t);
          const kr = (tw / 2) * (1 - t * 0.55);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, kr, kr * 0.72, 0, 0, Math.PI * 2);
          paint(ctx, look.hairColor, ol);
        }
      }

      /**
       * 束起來的髮髻：一顆小包包頭，髮尾從它下面垂出來。
       * 收集起來等頭與髮際線都畫完再畫。
       */
      if (hs.knot) knots.push({ x: tx, y: ty });
    };

    if (hs.overHead) deferredTails.push(...tails);
    else tails.forEach(drawTail);
    deferredDraw = drawTail;
  }

  /* ── 4. 頭（畫在軀幹與腦後頭髮之上，交疊處被蓋掉） ── */
  ctx.beginPath();
  ctx.roundRect(headCx - headW / 2, headCy - headH / 2, headW, headH, headR);
  paint(ctx, look.skin, ol);

  /* ── 5. 眼睛：正面與側面才畫，背面是空白後腦 ── */
  if (dir.view !== 'back' && look.eyes !== 'none') {
    const er = (g.eyeR / 10) * s;
    const gap = (g.eyeGap / 10) * s;
    const ey = headCy + (g.eyeY / 10) * s;

    /**
     * 側面只看得到一顆眼睛 —— 另一顆在頭的另一側，被擋住。
     * 那顆眼睛往面朝的方向挪，睫毛也畫在面朝那側。
     */
    const eyes = isSide
      ? [{ x: headCx + dir.sign * (g.sideEyeShift / 10) * s, lash: dir.sign }]
      : [{ x: headCx - gap / 2, lash: -1 }, { x: headCx + gap / 2, lash: 1 }];

    const lashCfg = look.lash;
    const eyeColor = look.eyeColor || EYE_COLOR_DEFAULT;

    for (const { x: ex, lash } of eyes) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, er, er * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = eyeColor;
      ctx.fill();

      /**
       * 睫毛：從眼角往外掃出去的一道弧，末端上翹。
       *
       * 起點壓在眼球的**外上緣**（0.72 er 外、0.72 er 高），不是眼睛正上方。
       * 控制點在 0.62 而不是中點。
       */
      if (lashCfg.on) {
        const L = (lashCfg.len / 10) * er; // 往外
        const C = (lashCfg.curl / 10) * er; // 往上
        const x0 = ex + lash * er * 0.72;
        const y0 = ey - er * 0.72;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + lash * L * 0.62, y0 - C * 0.30, x0 + lash * L, y0 - C);
        ctx.strokeStyle = eyeColor;
        ctx.lineWidth = Math.max((lashCfg.w / 100) * er, 0.5);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }

  /* ── 6. 髮際線：最後畫，瀏海才會壓在眼睛上而不是被眼睛壓住 ──
     正面露出額頭、背面幾乎蓋滿；側面則是「面朝那側露額頭、背對那側蓋到底」，
     一條斜下去的髮際線，側臉的感覺就出來了。 */
  if (hs.cap > 0 && !hs.longHair) {
    const covF = (cc.front / 100) * headH;
    const covB = (cc.back / 100) * headH;

    let hL: number;
    let hR: number;
    if (dir.view === 'front') {
      hL = covF;
      hR = hs.part ? covF * 0.52 : covF;
    } else if (dir.view === 'back') {
      hL = covB;
      hR = covB;
    } else {
      /* 側面：面朝那側再往上收一截 */
      const covSide = covF * (cc.sideFront / 100);
      hL = dir.sign > 0 ? covB : covSide;
      hR = dir.sign > 0 ? covSide : covB;
    }

    hairCapPath(
      ctx,
      headCx,
      headCy - headH / 2 - puff,
      headW + puff * 2,
      hL + puff,
      hR + puff,
      hs.flat ? headR * 0.3 : headR + puff,
      {
        /* 側面一律走 sideswept */
        edge: isSide ? 'sideswept' : hs.edge,
        bang: dir.view === 'front' ? (cc.bangLen / 100) * headH : 0,
        bangW: (cc.bangW / 100) * headW,
        peak: dir.view === 'front' ? (cc.peak / 10) * s : 0,
        mDip: dir.view === 'front' ? (cc.mDip / 10) * s : 0,
        swoop: (cc.swoop / 10) * s,
        hold: cc.sideHold / 100,
        front: dir.sign,
      },
    );
    paint(ctx, look.hairColor, ol);
  }

  /* 長髮：自帶臉部開口，直接畫在頭與軀幹之上 */
  if (hs.longHair) drawLongHair();

  /* ── 7. 貼在頭髮上的髮束（後馬尾），以及髮髻 ── */
  if (deferredDraw) deferredTails.forEach(deferredDraw);
  for (const k of knots) {
    const kr = (g.knotR / 100) * headW;
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, kr, kr * 0.94, 0, 0, Math.PI * 2);
    paint(ctx, look.hairColor, ol);
  }

  /* ── 8. 頭頂上的東西：丸子、莫霍克、呆毛 —— 畫在髮際線之上 ── */
  if (hs.top !== 'none') {
    const headTop = headCy - headH / 2 - puff;

    if (hs.top === 'bun' || hs.top === 'twinbun') {
      const br = (g.bunR / 100) * headW;
      /* 丸子綁在腦後：側面時往身後挪，正面才在正中央 */
      const spots: [number, number][] = hs.top === 'bun'
        ? [[headCx - lean * 1.4, headTop + br * 0.25]]
        : [[headCx - headW * 0.34, headTop + br * 0.1], [headCx + headW * 0.34, headTop + br * 0.1]];

      for (const [bx, by] of spots) {
        ctx.beginPath();
        ctx.ellipse(bx, by, br, br * 0.92, 0, 0, Math.PI * 2);
        paint(ctx, look.hairColor, ol);
      }
    } else if (hs.top === 'mohawk') {
      /* 莫霍克：一整片立起來的鰭 */
      const mh = (g.mohawkH / 100) * headH;
      const mw = headW * 0.58;

      ctx.beginPath();
      ctx.moveTo(headCx - mw / 2, headTop + mh * 0.18);
      ctx.quadraticCurveTo(headCx - mw * 0.30, headTop - mh, headCx, headTop - mh * 0.86);
      ctx.quadraticCurveTo(headCx + mw * 0.30, headTop - mh, headCx + mw / 2, headTop + mh * 0.18);
      ctx.closePath();
      paint(ctx, look.hairColor, ol, 'miter');
    } else {
      /**
       * 呆毛：一道拱過頭頂的弧，不是一根刺 —— 跟馬尾共用同一條圓弧公式。
       * 髮根就在頭頂正中央，是從那裡長出來再彎過去，
       * 不是一道跨在頭上的拱橋（把整條弧置中的話髮根會跑到旁邊去）。
       */
      const bias = dir.sign || 1;
      const len = (g.ahogeLen / 100) * headH;
      const spine = tailSpine(headCx, headTop + headH * 0.04, len, g.ahogeAngle, g.ahogeCurl, 0, bias);
      tailPath(ctx, spine, (g.ahogeW / 100) * headW);
      paint(ctx, look.hairColor, ol, 'miter');
    }
  }

  ctx.restore();
}
