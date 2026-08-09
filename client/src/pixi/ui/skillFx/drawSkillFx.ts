/**
 * 技能特效的形狀（`48-vfx.md` § 48.7.7）。數字在 `geometry.ts`。
 *
 * ── 為什麼每幀重建幾何 ──
 * `34-ui-guidelines.md` § 34.9.1 的「狀態沒變就不重建」是給常駐物件的；
 * 這些東西**每一幀的形狀都不一樣**（環在擴、火花在飛），本來就沒有可以沿用的幾何。
 * 代價由同時存在的實例上限壓住（`SkillFxManager.MAX_ACTIVE`）。
 *
 * 用 scale 動畫代替重建的話，描邊寬度會跟著放大 —— 擴張中的環會愈擴愈粗，
 * 讀起來是一團在膨脹的甜甜圈，不是一圈往外推的衝擊波。
 *
 * ── 一律 Graphics，不用 filter ──
 * § 48.2：掛 filter 的容器每個都是一個額外 render pass。
 *
 * **所有函式都在局部座標作畫**，原點＝該次演出的錨點（腳下或命中點）；
 * 位置由呼叫端設在 `Graphics` 的 transform 上。
 */
import type { Graphics } from 'pixi.js';
import type { ProjectileShape } from '../projectileStyle';
import {
  clamp01, easeOutCubic, easeOutQuad, fadeAfter, lighten, tilesToGroundRadius,
  MARK_COLORS, EMBLEM_COLORS, STAT_LABEL_TEXT,
  type AuraParams, type BoltParams, type BurstParams, type CastParams,
  type CrackParams, type DotTickParams, type PillarParams,
  type DropParams, type EmblemKind, type EmblemParams, type HealParams,
  type ImpactParams, type MarkKind, type MarkParams, type NovaParams,
  type ShieldKind, type ShieldParams, type TravelParams,
} from './geometry';

/** 地面上的圈一律 2:1 橢圓（§ 48.7.5） */
function groundRing(
  g: Graphics, cx: number, cy: number, tiles: number, width: number, color: number, alpha: number,
): void {
  if (alpha <= 0 || tiles <= 0) return;
  const { rx, ry } = tilesToGroundRadius(tiles);
  g.ellipse(cx, cy, rx, ry).stroke({ width, color, alpha });
}

/**
 * 投射物的頭部 —— 與 `Projectile.ts` 的外型規則同一套（§ 42.4）：
 * 箭矢給物理與弓技，彈丸給其他遠程技能。
 */
export function drawProjectileHead(
  g: Graphics, x: number, y: number, shape: ProjectileShape,
  color: number, size: number, angle: number, alpha = 1,
): void {
  if (shape === 'lance') {
    /*
     * 長槍：比箭長、比箭粗，槍頭是細長的菱形。
     * 與箭的差別必須夠明顯 —— 兩者在 20px 下都是「一根往前的東西」，
     * 只差幾 px 的話玩家分不出冰槍與火焰箭。
     */
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const w = size * 0.16;
    const q = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });
    g.poly([q(size, 0), q(size * 0.45, -w * 1.9), q(size * 0.62, 0), q(size * 0.45, w * 1.9)])
      .fill({ color, alpha });
    g.poly([q(size * 0.55, -w), q(-size, -w), q(-size, w), q(size * 0.55, w)])
      .fill({ color, alpha });
    return;
  }

  if (shape === 'arrow') {
    const headW = size * 0.35;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    /* 箭是有方向的，所以每個頂點都要自己轉 —— 圓形彈丸不需要 */
    const p = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });
    g.poly([
      p(size, 0), p(size * 0.4, -headW), p(size * 0.5, 0), p(size * 0.4, headW),
    ]).fill({ color, alpha });
    const a = p(-size * 0.9, -headW * 0.15);
    const b = p(size * 0.5, -headW * 0.15);
    const c = p(size * 0.5, headW * 0.15);
    const d = p(-size * 0.9, headW * 0.15);
    g.poly([a, b, c, d]).fill({ color, alpha });
  } else {
    g.circle(x, y, size).fill({ color, alpha });
  }
}

/* ═══════════════════════════════════════════════════════════
   § 48.7 技能特效
   ═══════════════════════════════════════════════════════════ */

/** 起手：地面環向內收，帶幾條上升短線 */
export function drawCast(g: Graphics, p: CastParams, color: number, t: number): void {
  const k = easeOutQuad(t);
  const a = p.alpha * fadeAfter(t, 0.55);
  const r = p.r0 + (p.r1 - p.r0) * k;
  groundRing(g, 0, 0, r, p.lineW, color, a);
  /* 同色系的亮版壓在環上 —— 單一純色的環讀起來是一條膠帶，有亮部才有厚度 */
  groundRing(g, 0, 0, r, p.lineW * 0.4, lighten(color, p.light), a * 0.9);

  for (let i = 0; i < p.spokes; i++) {
    const ang = (i / p.spokes) * Math.PI * 2 + Math.PI / p.spokes;
    const { rx, ry } = tilesToGroundRadius(p.r0 * (1 - k * 0.5));
    const x = Math.cos(ang) * rx;
    const y = Math.sin(ang) * ry - k * p.spokeRise;
    g.moveTo(x, y).lineTo(x, y - p.spokeLen * (1 - k * 0.6))
      .stroke({ width: p.lineW, color, alpha: a * 0.8, cap: 'round' });
  }
}

/**
 * 飛行段。錨點＝發射點，`dx/dy` 是到目標的位移。
 * 拖尾是同一條直線上往回退的幾個點，不另外記錄歷史位置。
 */
export function drawTravel(
  g: Graphics, p: TravelParams, color: number, t: number,
  dx: number, dy: number, shape: ProjectileShape, arc = 0,
): void {
  const angle = Math.atan2(dy, dx);
  const size = shape === 'arrow' ? p.arrowLen : p.headSize;
  /* 拱起：兩端貼齊，中段抬最高。一律往畫面上方，不隨方向翻 */
  const at = (u: number) => ({ x: dx * u, y: dy * u - arc * Math.sin(u * Math.PI) });

  for (let i = p.trail; i >= 1; i--) {
    const tt = t - i * p.trailGap;
    if (tt <= 0) continue;
    const f = 1 - i / (p.trail + 1);
    const q = at(tt);
    /* 尾巴一律畫成點 —— 一整排小箭矢讀起來是一群箭，不是一支箭的殘影 */
    g.circle(q.x, q.y, Math.max(0.6, p.headSize * (p.trailShrink + (1 - p.trailShrink) * f)))
      .fill({ color, alpha: p.trailAlpha * f });
  }

  const head = at(t);
  drawProjectileHead(g, head.x, head.y, shape, color, size, angle);
  /* 亮核：沒有它彈丸是一顆平的圓點，分不出「中心」 */
  g.circle(head.x, head.y, p.headSize * 0.45).fill({ color: lighten(color, p.light), alpha: 0.95 });
}

/**
 * 電弧：兩點之間的一段鋸齒（§ 48.7.3 的連鎖）。
 * 錨點＝起點，`dx/dy` 是到終點的位移。
 *
 * **整條一次出現**，不是從頭長到尾 —— 電就是一瞬間的事；
 * 慢慢長出去讀起來是雷射，那是另一回事。
 */
export function drawBolt(
  g: Graphics, p: BoltParams, color: number, t: number, dx: number, dy: number,
): void {
  const len = Math.hypot(dx, dy) || 1;
  /* 垂直於連線的方向，鋸齒往這兩邊歪 */
  const nx = -dy / len;
  const ny = dx / len;
  /* 中途換一次形狀 —— 同一條鋸齒撐完全程會讀成一張貼圖 */
  const phase = t < p.crackleAt ? 0 : 1;
  const alpha = 1 - t;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= p.segments; i++) {
    const f = i / p.segments;
    /* 兩端要對準目標，所以歪的幅度在中段最大、兩頭收斂到 0 */
    const taper = Math.sin(f * Math.PI);
    /* 決定性的鋸齒：低差異序列，不用亂數（每次重播要一樣） */
    const seed = (i + 1) * 0.6180339887 + phase * 0.3183098862;
    const j = ((seed - Math.floor(seed)) * 2 - 1) * p.jitter * taper;
    pts.push({ x: dx * f + nx * j, y: dy * f + ny * j });
  }

  const stroke = (width: number, c: number, a: number) => {
    if (a <= 0) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke({ width, color: c, alpha: a, cap: 'round', join: 'round' });
  };

  /* 由外而內：光暈 → 本體 → 中間那條更亮更細的芯 */
  for (let i = p.glow; i >= 1; i--) {
    stroke(p.lineW * (1 + i * (p.glowWidthMul - 1)), color,
      alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow)));
  }
  stroke(p.lineW, color, alpha);
  stroke(p.lineW * 0.4, lighten(color, p.light), alpha);
}

/**
 * 地裂：從施法者往目標裂開的地縫（地裂術）。
 * 錨點＝施法者，`dx/dy` 是到目標的位移。**跟著投射物一起長**。
 */
export function drawCrack(
  g: Graphics, p: CrackParams, color: number, t: number, dx: number, dy: number,
): void {
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const grow = clamp01(t / p.fadeAt);
  const alpha = fadeAfter(t, p.fadeAt);
  if (alpha <= 0) return;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= p.segments; i++) {
    const f = (i / p.segments) * grow;
    /* 決定性的歪斜，與電弧同一個做法（低差異序列，不用亂數） */
    const seed = (i + 1) * 0.6180339887;
    const j = ((seed - Math.floor(seed)) * 2 - 1) * p.jitter;
    /* 地縫是貼在地上的，垂直方向要壓扁成等距的 2:1 */
    pts.push({ x: dx * f + nx * j, y: dy * f + ny * j * 0.5 });
  }

  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width: p.lineW, color, alpha, cap: 'round', join: 'round' });

  /* 沿路噴起的碎石 —— 只有一條線讀起來是畫在地上的，不是裂開的 */
  for (let i = 0; i < p.chips; i++) {
    const f = ((i + 0.5) / p.chips) * grow;
    if (f <= 0) continue;
    const seed = (i + 3) * 0.7548776662;
    const side = (seed - Math.floor(seed)) * 2 - 1;
    g.circle(dx * f + nx * side * p.jitter * 1.6,
      dy * f + ny * side * p.jitter * 0.8 - p.chipR * 2,
      p.chipR).fill({ color: lighten(color, p.light), alpha });
  }
}

/**
 * 火柱：命中之後從地上竄起的柱子（炎柱）。
 * **竄起快、消失慢** —— 慢慢升起讀起來是電梯。
 */
export function drawPillar(
  g: Graphics, p: PillarParams, color: number, t: number,
): void {
  const rise = clamp01(t / p.riseT);
  const h = p.height * easeOutCubic(rise);
  const alpha = fadeAfter(t, p.riseT + (1 - p.riseT) * 0.25);
  if (alpha <= 0 || h <= 0) return;

  const wBot = p.width / 2;
  const wTop = wBot * (1 - p.taper);

  /* 柱身：下寬上窄的梯形。垂直的長方形讀起來是一塊板子 */
  g.poly([
    { x: -wBot, y: 0 },
    { x: wBot, y: 0 },
    { x: wTop, y: -h },
    { x: -wTop, y: -h },
  ]).fill({ color, alpha: alpha * 0.85 });
  /* 內焰：中間一道更亮更窄的，少了它整根是一塊平的色塊 */
  g.poly([
    { x: -wBot * 0.42, y: 0 },
    { x: wBot * 0.42, y: 0 },
    { x: wTop * 0.42, y: -h * 0.92 },
    { x: -wTop * 0.42, y: -h * 0.92 },
  ]).fill({ color: lighten(color, p.light), alpha });

  /* 腳下一圈，柱子才像從地上長出來而不是浮著 */
  groundRing(g, 0, 0, p.baseR, p.baseW, lighten(color, p.light * 0.6), alpha);
}

/** 命中點：中心閃點＋放射火花＋擴散環 */
export function drawImpact(
  g: Graphics, p: ImpactParams, color: number, t: number, crit: boolean,
  accent: number | null = null, minimal = false,
): void {
  const s = (crit ? p.critScale : 1) * (minimal ? p.normalScale : 1);
  /*
   * 暴擊的整段比較長，但**元素色的部分照原本的絕對時間收掉** ——
   * 把閃點與火花一起拉長會讀成慢動作，而不是「這一下比較重」。
   * 留下來的尾巴只給暴擊專屬的衝擊環與星芒。
   */
  const bt = crit ? clamp01(t * p.critDurationMul) : t;
  const k = easeOutCubic(bt);
  const a = fadeAfter(bt, 0.35);

  const lit = lighten(color, p.light);
  /* 中心是最亮的地方 —— 整個命中點同一個顏色會讀成一個貼紙 */
  g.circle(0, 0, p.flashR * s * (1 - k * 0.7)).fill({ color, alpha: a });
  g.circle(0, 0, p.flashR * s * (1 - k * 0.7) * 0.55).fill({ color: lit, alpha: a });

  const rr = (p.ringR0 + (p.ringR1 - p.ringR0) * k) * s;
  g.circle(0, 0, rr).stroke({ width: p.ringW, color, alpha: a * 0.85 });
  g.circle(0, 0, rr).stroke({ width: p.ringW * 0.4, color: lit, alpha: a * 0.8 });

  /* 帶 debuff 時，隔一根換成點綴色 —— 全換掉會讓玩家以為技能屬性變了 */
  const accentEvery = accent !== null && p.accentRatio > 0
    ? Math.max(1, Math.round(1 / p.accentRatio))
    : 0;

  for (let i = 0; i < p.sparks; i++) {
    const ang = (i / p.sparks) * Math.PI * 2;
    const near = (p.ringR0 + p.sparkLen * 0.3) * s * k;
    const far = near + p.sparkLen * s * (1 - k * 0.5);
    const c = accentEvery && i % accentEvery === 0 ? accent! : color;
    g.moveTo(Math.cos(ang) * near, Math.sin(ang) * near * 0.7)
      .lineTo(Math.cos(ang) * far, Math.sin(ang) * far * 0.7)
      .stroke({ width: p.sparkW, color: c, alpha: a, cap: 'round' });
    /* 火花尖端點一下亮版 —— 讀起來才是「飛出去的火星」而不是一根短線 */
    g.circle(Math.cos(ang) * far, Math.sin(ang) * far * 0.7, p.sparkW * 0.6)
      .fill({ color: lighten(c, p.light), alpha: a });
  }

  /*
   * 點綴色的小點：飛得比火花慢、掉得比較低 ——
   * 流血讀起來就是這幾顆濺出去的東西，跟著火花一起直線飛出去就不像了。
   */
  if (accent !== null) {
    for (let i = 0; i < p.accentFlecks; i++) {
      const ang = (i / p.accentFlecks) * Math.PI * 2 + 0.5;
      const d = p.ringR1 * s * k * 0.7;
      g.circle(Math.cos(ang) * d, Math.sin(ang) * d * 0.6 + k * p.accentFleckR * 3, p.accentFleckR)
        .fill({ color: accent, alpha: a });
    }
  }

  /* 暴擊的衝擊環（§ 48.7.6）—— 顏色不動，數字那邊已經黃了（§ 42.3） */
  if (crit && t < p.critRingT) {
    const ck = easeOutCubic(t / p.critRingT);
    g.circle(0, 0, p.ringR1 * s * 1.5 * ck)
      .stroke({ width: p.critRingW, color: 0xffffff, alpha: (1 - ck) * 0.8 });
  }

  /*
   * 暴擊的星芒：四根又長又尖的白刺，一瞬間張開再收掉。
   *
   * **形狀要跟平常不一樣**，不能只是「同樣的東西大一點」——
   * 環是圓的、火花是元素色的短線，星芒是白色的細長三角，
   * 三者同時出現時各自認得出來。畫成三角形而不是圓頭線段：
   * 圓頭在 20px 下會鈍掉，讀成四根棒子。
   */
  if (crit && t < p.critSpikeT) {
    const sk = easeOutCubic(t / p.critSpikeT);
    const a = (1 - sk) * 0.95;
    const len = p.critSpikeLen * s * sk;
    const half = p.critSpikeW * s * (1 - sk * 0.7) / 2;
    for (let i = 0; i < p.critSpikes; i++) {
      const ang = (i / p.critSpikes) * Math.PI * 2 + Math.PI / p.critSpikes;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      g.poly([
        { x: cos * len, y: sin * len * 0.75 },
        { x: -sin * half, y: cos * half * 0.75 },
        { x: sin * half, y: -cos * half * 0.75 },
      ]).fill({ color: 0xffffff, alpha: a });
    }
  }
}

/** 範圍爆：地面環擴到 `aoeRadius` 格 */
export function drawBurst(
  g: Graphics, p: BurstParams, color: number, t: number, radiusTiles: number,
): void {
  const maxR = radiusTiles * p.radiusMul;

  for (let i = 0; i < p.rings; i++) {
    const tt = (t - i * p.ringDelay) / (1 - i * p.ringDelay);
    if (tt <= 0) continue;
    const k = easeOutCubic(tt);
    const ra = fadeAfter(tt, 0.25) * (1 - i * 0.25);
    groundRing(g, 0, 0, maxR * k, p.ringW, color, ra);
    groundRing(g, 0, 0, maxR * k, p.ringW * 0.35, lighten(color, p.light), ra * 0.9);
  }

  const fa = fadeAfter(t, 0.15);
  g.circle(0, 0, p.flashR * (1 - easeOutCubic(t) * 0.6)).fill({ color, alpha: fa });

  /* 碎片沿地面的橢圓飛出去，不是往四面八方 —— 往上飛的碎片讀起來是爆炸不是範圍 */
  for (let i = 0; i < p.shards; i++) {
    const ang = (i / p.shards) * Math.PI * 2 + 0.2;
    const k = easeOutCubic(t);
    const { rx, ry } = tilesToGroundRadius(maxR * 0.75 * k);
    const x = Math.cos(ang) * rx;
    const y = Math.sin(ang) * ry;
    const len = p.shardLen * (1 - k * 0.5);
    g.moveTo(x, y).lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.5)
      .stroke({ width: p.shardW, color, alpha: fadeAfter(t, 0.3) * 0.9, cap: 'round' });
  }
}

/** 自身中心爆：只有環，沒有碎片 —— 半徑 10 格的碎片會鋪滿整個畫面 */
export function drawNova(
  g: Graphics, p: NovaParams, color: number, t: number, radiusTiles: number,
): void {
  const maxR = radiusTiles * p.radiusMul;
  for (let i = 0; i < p.rings; i++) {
    const tt = (t - i * p.ringDelay) / (1 - i * p.ringDelay);
    if (tt <= 0) continue;
    const k = easeOutCubic(tt);
    const ra = fadeAfter(tt, 0.2) * (1 - i * 0.22);
    groundRing(g, 0, 0, maxR * k, p.ringW, color, ra);
    groundRing(g, 0, 0, maxR * k, p.ringW * 0.35, lighten(color, p.light), ra * 0.9);
  }
  g.circle(0, 0, p.flashR * (1 - easeOutCubic(t) * 0.8)).fill({ color, alpha: fadeAfter(t, 0.1) });
}

/**
 * 落下型。錨點＝落點。
 * 預示環全程都在，落下的東西還沒到就先讓玩家知道會落在哪。
 */
export function drawDrop(
  g: Graphics, p: DropParams, color: number, t: number,
  shape: ProjectileShape = 'circle',
): void {
  groundRing(g, 0, 0, p.telegraphR, p.telegraphW, color, 0.3 + 0.5 * t);

  /* 斜著落下（`fallTiltX`）—— 垂直落下讀起來像從天花板掉，不是飛過來砸下去 */
  const at = (u: number) => {
    const k = u * u; // 加速落下
    return { x: p.fallTiltX * (1 - k), y: p.fallFromY * (1 - k) };
  };

  for (let i = p.trail; i >= 1; i--) {
    const tt = t - i * p.trailGap;
    if (tt <= 0) continue;
    const f = 1 - i / (p.trail + 1);
    const q = at(tt);
    g.circle(q.x, q.y, Math.max(0.6, p.headSize * f)).fill({ color, alpha: 0.45 * f });
  }

  const head = at(clamp01(t));
  if (shape === 'circle') {
    g.circle(head.x, head.y, p.headSize).fill({ color, alpha: 1 });
  } else {
    /*
     * 箭與長槍要**指著落點**，不是指著飛行方向的反向 ——
     * 落下的東西頭朝下，尾巴在上面。角度由起點到落點算。
     */
    const angle = Math.atan2(-p.fallFromY, -p.fallTiltX);
    drawProjectileHead(g, head.x, head.y, shape, color, p.headSize * 2.6, angle);
  }
}

/** 治癒：光點上升 */
export function drawHeal(g: Graphics, p: HealParams, color: number, t: number): void {
  const a = fadeAfter(t, 0.6);
  groundRing(g, 0, 0, p.ringR, p.ringW, color, a * 0.7 * (1 - t * 0.5));

  for (let i = 0; i < p.motes; i++) {
    /* 每顆光點錯開起飛時間，同時起飛會讀成一條線往上抽 */
    const tt = clamp01((t - (i / p.motes) * 0.35) / 0.65);
    if (tt <= 0) continue;
    const ang = (i / p.motes) * Math.PI * 2;
    const x = Math.cos(ang) * p.spread * (0.4 + tt * 0.6);
    const y = -tt * p.rise;
    const mr = p.moteR * (1 - tt * 0.4);
    g.circle(x, y, mr).fill({ color, alpha: (1 - tt) * a });
    g.circle(x, y, mr * 0.5).fill({ color: lighten(color, p.light), alpha: (1 - tt) * a });
  }
}

/* ═══════════════════════════════════════════════════════════
   § 48.8 Buff／Debuff 場上特效
   ═══════════════════════════════════════════════════════════ */

/**
 * 施加的那一下：腳下環往上擴一次。
 * 顏色只有藍（buff）與紅（debuff）兩種，由呼叫端決定（§ 48.8.1）。
 */
export function drawAura(g: Graphics, p: AuraParams, color: number, t: number): void {
  const k = easeOutCubic(t);
  const a = fadeAfter(t, 0.45);
  groundRing(g, 0, -p.rise * k, p.r0 + (p.r1 - p.r0) * k, p.lineW, color, a);

  for (let i = 0; i < p.motes; i++) {
    const ang = (i / p.motes) * Math.PI * 2 + 0.4;
    const { rx, ry } = tilesToGroundRadius(p.r1 * 0.7);
    const mx = Math.cos(ang) * rx * k;
    const my = Math.sin(ang) * ry * k - p.rise * k * 1.3;
    g.circle(mx, my, p.moteR).fill({ color, alpha: a * 0.9 });
    g.circle(mx, my, p.moteR * 0.5).fill({ color: lighten(color, p.light), alpha: a * 0.9 });
  }
}

/**
 * Buff 徽記：頭上浮一個符號，升一小段後消失（§ 48.8.1）。
 *
 * 三拍與護盾球同一個節奏（浮出 → 停 → 淡掉），但**停的那一拍長得多** ——
 * 環只要讀出「有東西上身」，符號要讀出「上的是哪一類」，後者需要時間。
 *
 * 顏色由呼叫端給（buff 一律藍，§ 48.8.1），不吃技能元素。
 */
export function drawEmblem(
  g: Graphics, p: EmblemParams, kind: EmblemKind, color: number, t: number,
): void {
  const formEnd = p.formT;
  const holdEnd = p.formT + p.holdT;

  let scale: number;
  let alpha: number;
  let progress: number;
  /** 畫到幾成 —— 依筆畫顯示的符號靠它一筆一筆長出來 */
  let drawT: number;

  if (t < formEnd) {
    const k = easeOutCubic(t / formEnd);
    scale = p.fromScale + (1 - p.fromScale) * k;
    alpha = k;
    progress = k * 0.25;
    drawT = t / formEnd;
  } else if (t < holdEnd) {
    scale = 1;
    alpha = 1;
    progress = 0.25 + ((t - formEnd) / p.holdT) * 0.4;
    drawT = 1;
  } else {
    const k = easeOutCubic((t - holdEnd) / (1 - holdEnd));
    scale = 1;
    alpha = 1 - k;
    progress = 0.65 + k * 0.35;
    drawT = 1;
  }

  /*
   * 整段緩緩往上飄 —— 停在原地的符號讀起來像 UI，飄起來才像特效。
   * **水滴相反：從高處加速落下來**，往上飄的水滴就不是水滴了。
   */
  const cy = kind === 'poison'
    ? p.y - p.poisonFall * (1 - progress * progress)
    : p.y - p.rise * progress;
  const c = EMBLEM_COLORS[kind] ?? color;

  switch (kind) {
    case 'sword': drawSwordGlyph(g, p, c, cy, scale, alpha); break;
    case 'haste': drawHasteGlyph(g, p, c, cy, scale, alpha); break;
    case 'poison': drawPoisonGlyph(g, p, c, cy, scale, alpha); break;
    case 'crit': drawCritGlyph(g, p, c, cy, scale, alpha, drawT); break;
    case 'flame': drawFlameGlyph(g, p, c, cy, scale, alpha, t); break;
    case 'statAgi':
    case 'statStr': drawStatGlyph(g, p, kind, c, cy, scale, alpha); break;
  }
}

/**
 * 假發光的一條線：由外而內疊幾層愈來愈細、愈來愈實的描邊。
 *
 * 由外往內畫是必要的 —— 反過來的話寬的那層會蓋掉本體，只剩一團糊。
 */
function glowLine(
  g: Graphics, p: EmblemParams, color: number, alpha: number, width: number,
  from: { x: number; y: number }, to: { x: number; y: number },
): void {
  for (let i = p.glow; i >= 0; i--) {
    const w = width * (1 + i * (p.glowWidthMul - 1));
    const a = i === 0 ? alpha : alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow));
    if (a <= 0) continue;
    g.moveTo(from.x, from.y).lineTo(to.x, to.y)
      .stroke({ width: w, color, alpha: a, cap: 'round' });
  }
}

/** 淬毒：頭上一滴綠色水滴（`23-class-magic.md` § 23.7 的淬毒） */
function drawPoisonGlyph(
  g: Graphics, p: EmblemParams, color: number,
  cy: number, scale: number, alpha: number,
): void {
  if (alpha <= 0) return;

  const h = p.size * scale;
  const r = h * 0.3;
  const tipY = cy - h * 0.5;
  const bulbY = cy + h * 0.22;

  /* 光暈：同一顆水滴放大幾圈疊在後面 */
  for (let i = p.glow; i >= 1; i--) {
    g.circle(0, bulbY, r * (1 + i * 0.22))
      .fill({ color, alpha: alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow)) });
  }

  /* 水滴＝下面一顆圓 ＋ 上面收成尖的三角。尖端在上，讀起來才是「正要滴下去」 */
  g.circle(0, bulbY, r).fill({ color, alpha });
  g.poly([
    { x: 0, y: tipY },
    { x: r * 0.92, y: bulbY + r * 0.1 },
    { x: -r * 0.92, y: bulbY + r * 0.1 },
  ]).fill({ color, alpha });
  /* 高光：偏一側的小白點，沒有它水滴會讀成一顆實心球 */
  g.circle(-r * 0.32, bulbY - r * 0.28, r * 0.24).fill({ color: 0xffffff, alpha: alpha * 0.5 });
}

/**
 * 致命一擊：頭上一個 X，**兩筆依序畫出來**（`23-class-magic.md` § 23.7）。
 *
 * 兩筆同時長出來只會讀成「一個 X 淡入」；一筆一筆畫才有「被畫上去」的感覺，
 * 而那正是「標記了目標」的語意。
 */
function drawCritGlyph(
  g: Graphics, p: EmblemParams, color: number,
  cy: number, scale: number, alpha: number, drawT: number,
): void {
  if (alpha <= 0) return;

  const h = p.size * scale;
  const arm = h * 0.42;
  const w = Math.max(1, p.lineW * scale * 1.6);

  /* 第一筆走前半段，第二筆走後半段 —— 中間不留空檔，連著畫才像一筆接一筆 */
  const strokes: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: -arm, y: cy - arm }, { x: arm, y: cy + arm }],
    [{ x: arm, y: cy - arm }, { x: -arm, y: cy + arm }],
  ];

  strokes.forEach(([a, b], i) => {
    const t = clamp01(drawT * 2 - i);
    if (t <= 0) return;
    glowLine(g, p, color, alpha, w, a, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  });
}

/**
 * 劍的符號。**不是 § 48.6 的武器剪影** ——
 * 那份要在 20px 下分出十種武器類型，這裡只要讀出「跟武器有關」，
 * 而且必須是 Pixi `Graphics`（剪影是 Canvas 2D 烘成的貼圖）。
 */
function drawSwordGlyph(
  g: Graphics, p: EmblemParams, color: number,
  cy: number, scale: number, alpha: number,
): void {
  if (alpha <= 0) return;

  const h = p.size * scale;
  const w = h * 0.13;
  const top = cy - h * 0.62;
  const guardY = cy + h * 0.16;
  const gripBot = cy + h * 0.38;
  const lit = lighten(color, p.light);

  const blade = (k: number) => [
    { x: 0, y: cy - h * 0.62 * k - (1 - k) * 0 },
    { x: w * k, y: top + h * 0.22 },
    { x: w * k, y: guardY },
    { x: -w * k, y: guardY },
    { x: -w * k, y: top + h * 0.22 },
  ];

  /* 發光：同一片刀身放大幾圈疊在後面（不用 filter，§ 48.2） */
  for (let i = p.glow; i >= 1; i--) {
    g.poly(blade(1 + i * 0.5))
      .fill({ color, alpha: alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow)) });
  }

  /* 劍身：兩側平行、尖端收成三角。整把朝上 —— 朝下讀起來是「插劍」＝死亡 */
  g.poly(blade(1)).fill({ color, alpha });
  /* 中間一道亮脊：純色的刀身讀起來是一片紙 */
  g.rect(-w * 0.34, top + h * 0.1, w * 0.68, guardY - top - h * 0.1)
    .fill({ color: lit, alpha: alpha * 0.9 });

  /* 護手：橫過去的一條，沒有它就只是一根釘子 */
  g.rect(-h * 0.3, guardY, h * 0.6, Math.max(1, p.lineW * scale))
    .fill({ color: lit, alpha });

  g.rect(-w * 0.7, guardY, w * 1.4, gripBot - guardY).fill({ color, alpha: alpha * 0.85 });
  g.circle(0, gripBot + w * 0.6, w * 0.9).fill({ color: lit, alpha: alpha * 0.9 });
}

/**
 * 加速的符號：往上疊的幾層人字（加速術／強化加速術）。
 *
 * **層數是必要的** —— 單一個箭頭讀成「往上」（那是升級或增益的通用語彙），
 * 疊起來的人字才讀成「連續、快」。最上層最亮，方向感靠亮度遞減帶出來。
 */
function drawHasteGlyph(
  g: Graphics, p: EmblemParams, color: number,
  cy: number, scale: number, alpha: number,
): void {
  if (alpha <= 0) return;

  const h = p.size * scale;
  const halfW = h * 0.34;
  const rise = h * 0.26;
  const gap = h * 0.3;
  const w = Math.max(1, p.lineW * scale * 1.4);

  const lit = lighten(color, p.light);

  for (let i = 0; i < p.chevrons; i++) {
    /* 由上往下畫，愈下面愈淡 —— 上亮下暗讀起來是往上竄 */
    const y = cy - h * 0.4 + i * gap;
    const a = alpha * (1 - i * 0.25);
    const stroke = (width: number, c: number, al: number) =>
      g.moveTo(-halfW, y + rise).lineTo(0, y).lineTo(halfW, y + rise)
        .stroke({ width, color: c, alpha: al, cap: 'round', join: 'round' });

    /* 發光由外而內 —— 反過來寬的那層會蓋掉本體 */
    for (let L = p.glow; L >= 1; L--) {
      stroke(w * (1 + L * (p.glowWidthMul - 1)), color,
        a * p.glowAlpha * (1 - (L - 1) / Math.max(1, p.glow)));
    }
    stroke(w, color, a);
    /* 最上面那道疊亮版，方向感更強 */
    if (i === 0) stroke(w * 0.45, lit, a);
  }
}

/**
 * 火矢附魔：頭上一團會抖的火（`23-class-magic.md` § 23.4）。
 *
 * **不抖的火讀起來是一片橘色的葉子** —— 火焰的辨識度有一半在「它在動」。
 * 形狀刻意做成**左右不對稱**：對稱的火焰讀起來是水滴，
 * 而水滴那個位置已經被淬毒占走了（§ 48.8.1）。
 */
function drawFlameGlyph(
  g: Graphics, p: EmblemParams, color: number,
  cy: number, scale: number, alpha: number, t: number,
): void {
  if (alpha <= 0) return;

  const wob = Math.sin(t * Math.PI * 2 * p.flameWobbles);
  const h = p.size * scale * (1 - p.flameFlicker * 0.5 * wob);
  const w = p.size * scale * 0.3 * (1 + p.flameFlicker * wob);

  /* 由下往上一圈，左右刻意不對稱 —— 右側鼓、左側收 */
  const body = (k: number): { x: number; y: number }[] => [
    { x: 0, y: cy + h * 0.42 * k },
    { x: w * k, y: cy + h * 0.16 * k },
    { x: w * 0.72 * k, y: cy - h * 0.08 * k },
    { x: w * 0.95 * k, y: cy - h * 0.3 * k },
    { x: 0, y: cy - h * 0.58 * k },
    { x: -w * 0.6 * k, y: cy - h * 0.22 * k },
    { x: -w * 0.88 * k, y: cy + h * 0.04 * k },
    { x: -w * k, y: cy + h * 0.2 * k },
  ];

  for (let i = p.glow; i >= 1; i--) {
    g.poly(body(1 + i * 0.18))
      .fill({ color, alpha: alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow)) });
  }
  g.poly(body(1)).fill({ color, alpha });
  /* 內焰：中間那撮比較亮，少了它整團會讀成一塊平的色塊 */
  g.poly(body(0.5)).fill({ color: 0xffdd66, alpha: alpha * 0.85 });
}

/**
 * 六個字母的**筆畫描邊字型**（A G I S T R），只夠寫 `AGI` 與 `STR`。
 *
 * 座標在 −0.5 ~ 0.5 的方框內，由呼叫端縮放。用描邊而不是 `Text` 物件：
 * 為了兩個字串讓特效層多支援一種節點（外加字型載入與貼圖）不划算，
 * 而且描邊在任何縮放下都不會糊。
 */
const LETTER_STROKES: Record<string, number[][][]> = {
  A: [[[-0.5, 0.5], [0, -0.5], [0.5, 0.5]], [[-0.26, 0.12], [0.26, 0.12]]],
  G: [[
    [0.5, -0.28], [0.22, -0.5], [-0.2, -0.5], [-0.5, -0.24],
    [-0.5, 0.24], [-0.2, 0.5], [0.22, 0.5], [0.5, 0.26], [0.5, 0.05], [0.1, 0.05],
  ]],
  I: [[[0, -0.5], [0, 0.5]], [[-0.24, -0.5], [0.24, -0.5]], [[-0.24, 0.5], [0.24, 0.5]]],
  S: [[
    [0.46, -0.32], [0.14, -0.5], [-0.2, -0.5], [-0.46, -0.3],
    [-0.4, -0.04], [0.36, 0.08], [0.46, 0.3], [0.14, 0.5], [-0.2, 0.5], [-0.46, 0.32],
  ]],
  T: [[[-0.5, -0.5], [0.5, -0.5]], [[0, -0.5], [0, 0.5]]],
  R: [
    [[-0.4, 0.5], [-0.4, -0.5], [0.18, -0.5], [0.44, -0.3], [0.18, -0.06], [-0.4, -0.06]],
    [[-0.02, -0.06], [0.44, 0.5]],
  ],
};

/**
 * 屬性提升：頭上寫 `AGI ↑` / `STR ↑`，整組往上飄（§ 48.8.1）。
 *
 * **文字比抽象符號直接** —— 玩家不用學「藍色的粉＝敏捷」，看字就知道。
 * 箭頭放在右邊而不是把整組再往上推：方向感靠箭頭講，位移講的是「這是特效」。
 */
function drawStatGlyph(
  g: Graphics, p: EmblemParams, kind: EmblemKind, color: number,
  cy: number, scale: number, alpha: number,
): void {
  if (alpha <= 0) return;

  const text = STAT_LABEL_TEXT[kind] ?? '';
  const h = p.labelH * scale;
  const w = p.labelW * scale;
  const gap = p.labelGap * scale;
  const aw = p.arrowW * scale;
  const ah = p.arrowH * scale;
  const agap = p.arrowGap * scale;
  const sw = Math.max(1, p.labelStrokeW * scale);
  const lit = lighten(color, p.light);

  /* 文字加箭頭一起置中 —— 只置中文字的話整組看起來偏左 */
  const textW = text.length * w + (text.length - 1) * gap;
  const totalW = textW + agap + aw;
  let x = -totalW / 2;

  const stroke = (pts: number[][], sx: number, width: number, c: number, a: number) => {
    g.moveTo(sx + pts[0][0] * w, cy + pts[0][1] * h);
    for (let i = 1; i < pts.length; i++) g.lineTo(sx + pts[i][0] * w, cy + pts[i][1] * h);
    g.stroke({ width, color: c, alpha: a, cap: 'round', join: 'round' });
  };

  for (const ch of text) {
    const paths = LETTER_STROKES[ch];
    if (paths) {
      const cx = x + w / 2;
      for (const pts of paths) {
        /* 光暈先畫，本體壓在上面 */
        for (let i = p.glow; i >= 1; i--) {
          stroke(pts, cx, sw * (1 + i * (p.glowWidthMul - 1)), color,
            alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow)));
        }
        stroke(pts, cx, sw, lit, alpha);
      }
    }
    x += w + gap;
  }

  /* 往上的箭頭：一根桿加一個頭 */
  const ax = x + agap + aw / 2;
  const top = cy - ah / 2;
  const bot = cy + ah / 2;
  for (let i = p.glow; i >= 1; i--) {
    const a = alpha * p.glowAlpha * (1 - (i - 1) / Math.max(1, p.glow));
    g.moveTo(ax, bot).lineTo(ax, top)
      .stroke({ width: sw * (1 + i * (p.glowWidthMul - 1)), color, alpha: a, cap: 'round' });
  }
  g.moveTo(ax, bot).lineTo(ax, top).stroke({ width: sw, color: lit, alpha, cap: 'round' });
  g.poly([
    { x: ax, y: top - ah * 0.16 },
    { x: ax - aw / 2, y: top + ah * 0.2 },
    { x: ax + aw / 2, y: top + ah * 0.2 },
  ]).fill({ color: lit, alpha });
}

/**
 * 暈眩的頭頂星星（§ 48.8.3）。`t` 是循環相位（0~1），不是進度。
 * 只有暈眩有頭頂標記 —— 十隻怪各掛三個小圖形，讀不出任何東西。
 */
export function drawMark(g: Graphics, p: MarkParams, kind: MarkKind, t: number): void {
  const color = MARK_COLORS[kind];
  for (let i = 0; i < p.stars; i++) {
    const ang = t * Math.PI * 2 + (i / p.stars) * Math.PI * 2;
    /* 星星繞的是橢圓 —— 正圓在等距畫面上會讀成立起來的圈 */
    g.star(Math.cos(ang) * p.orbitR, p.starY + Math.sin(ang) * p.orbitR * 0.4, 4, p.starR, p.starR * 0.4)
      .fill({ color, alpha: 0.75 + 0.25 * Math.sin(ang) });
  }
}

/**
 * 球形罩的三個構件。護盾與破裂共用，兩邊各畫一份必然走鐘。
 *
 * 只畫一個圓外框的話會讀成「立起來的環」；
 * 補上 2:1 的赤道與貼地的底環，才讀得出那是一顆包住角色的球。
 */
function shieldSphere(
  g: Graphics, p: ShieldParams, color: number, r: number, alphaMul: number,
): void {
  const cy = p.cy;

  /* 發光先畫 —— 疊在本體上面會把球糊掉 */
  for (let i = p.glow; i >= 1; i--) {
    const a = p.glowAlpha * alphaMul * (1 - (i - 1) / Math.max(1, p.glow));
    if (a <= 0) continue;
    g.circle(0, cy, r).stroke({
      width: p.lineW * (1 + i * (p.glowWidthMul - 1)), color, alpha: a,
    });
  }

  if (p.fillAlpha > 0) g.circle(0, cy, r).fill({ color, alpha: p.fillAlpha * alphaMul });
  g.circle(0, cy, r).stroke({ width: p.lineW, color, alpha: p.rimAlpha * alphaMul });
  /* 白色鑲邊貼在外緣，讓球有厚度 —— 純色的圓讀起來是一張剪出來的色紙 */
  if (p.inlayW > 0) {
    g.circle(0, cy, r + p.lineW * 0.55)
      .stroke({ width: p.inlayW, color: 0xffffff, alpha: p.inlayAlpha * alphaMul });
  }
  /* 赤道：球中央的水平切面，等距下是 2:1 */
  g.ellipse(0, cy, r, r * 0.5).stroke({ width: p.lineW * 0.8, color, alpha: p.equatorAlpha * alphaMul });
  /* 底環：球與地面相接的那一圈，讓球站得住而不是浮著 */
  g.ellipse(0, 0, r * 0.82, r * 0.41).stroke({ width: p.lineW * 0.8, color, alpha: p.equatorAlpha * alphaMul });
}

/**
 * 護盾／無敵掛上去的那一下（§ 48.8.3）。**一次性，三拍演完就沒了**：
 * 球長出來 → 停一下 → 撐大淡掉。
 *
 * 不留一顆常駐的球，是因為護盾常常一掛就是 20 秒（§ 24.4.9），
 * 常駐等於每一幀都要重建那顆球的幾何，而它整段時間長得一模一樣。
 * 護盾還在不在由 icon 表達（§ 24.8.1），場上只演「罩上來了」這件事。
 *
 * 收掉時撐大但**不變亮** —— 一顆愈脹愈亮的球讀起來是在爆炸，不是在散掉。
 */
export function drawShield(g: Graphics, p: ShieldParams, kind: ShieldKind, t: number): void {
  const color = MARK_COLORS[kind];
  const formEnd = p.formT;
  const holdEnd = p.formT + p.holdT;

  if (t < formEnd) {
    /* 長出來：由小變大並淡入 */
    const k = easeOutCubic(t / formEnd);
    shieldSphere(g, p, color, p.r * (p.fromScale + (1 - p.fromScale) * k), k);
    return;
  }

  if (t < holdEnd) {
    shieldSphere(g, p, color, p.r, 1);
    return;
  }

  const k = easeOutCubic((t - holdEnd) / (1 - holdEnd));
  const a = 1 - k;
  shieldSphere(g, { ...p, fillAlpha: p.fillAlpha * a }, color, p.r * (1 + (p.expand - 1) * k), a);
}

/** DoT 每跳的小粒子。傷害數字顏色不歸這裡（§ 42.3 一律粉紅） */
export function drawDotTick(g: Graphics, p: DotTickParams, color: number, t: number): void {
  for (let i = 0; i < p.motes; i++) {
    const tt = clamp01((t - (i / p.motes) * 0.3) / 0.7);
    if (tt <= 0) continue;
    const ang = (i / p.motes) * Math.PI * 2 + 0.7;
    g.circle(Math.cos(ang) * p.spread * tt, -tt * p.rise, p.moteR * (1 - tt * 0.5))
      .fill({ color, alpha: (1 - tt) * 0.95 });
  }
}
