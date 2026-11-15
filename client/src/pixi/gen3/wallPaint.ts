/**
 * 第三代背景 render 的牆塊與斷柱柱基 Canvas 繪製（`38-map-control.md` § 38.9「素材來源」）。
 * 一律以螢幕座標（世界像素）作畫，呼叫端以 ctx 變換決定畫到哪裡、放大幾倍。
 */
import { ASSET_SCALE, FLOOR_TEXELS_PER_TILE } from '../../../scripts/comfy/tileSpec.mjs';
import { TILE_H, TILE_W, WALL_HEIGHT, worldToScreen } from '../utils/isometric';
import { tileVariance } from '../utils/tileVariance';
import { OBJECT_ANCHOR } from './objectPlan';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type PatternImage = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** 圖集中的一塊（素材像素） */
export interface SpriteSource {
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 螢幕座標的矩形（世界像素） */
export interface ScreenRect { x: number; y: number; width: number; height: number }

/** 牆的材質：有 stone 為砌石主題，否則貼 top／side */
export interface WallImages {
  stone: PatternImage | null;
  top: PatternImage | null;
  side: PatternImage | null;
}

/**
 * 倒柱（成對石柱）畫成斷柱殘骸：依格座標選一格立柱基、另一格散落碎塊。
 * 柱基 = 直立石柱素材的下段（高 stump 比例），斷口為 jagPoints 段、上下 ±jag 世界像素的鋸齒，描 edgeWidth 世界像素的斷口線（只描在柱身內）；碎塊 = 斷壁素材（依 OBJECT_VARIATION.rubble 變化）。
 */
const BROKEN_PILLAR = { stump: [0.45, 0.6], jagPoints: 6, jag: 3, edgeWidth: 0.8 } as const;

/** 牆／邊界：側面陰影（左、右）、外框 */
const WALL_SHADE = { left: 0.18, right: 0.35 };
const WALL_OUTLINE = '#141414';
const WALL_OUTLINE_WIDTH = 1.2;
/** 每面填色後以同材質描邊的寬度（世界像素），蓋住相鄰面之間的細縫 */
const SEAM_COVER_WIDTH = 0.75;

/** 砌石：側面 courses 層、磚長 brickLength 格，最上層直縫與頂面對齊、往下逐層錯開半塊；頂面石板 slab 格見方、對齊格子不錯開；每塊明暗 ±tint；磚縫 mortar */
const MASONRY = { courses: 2, brickLength: 0.5, slab: 0.5, tint: 0.14, mortar: 'rgba(16,16,16,0.85)', mortarWidth: 0.9 };

/** 牆塊與外框的繪製範圍 */
export function wallBounds(x: number, y: number): ScreenRect {
  const { sx, sy } = worldToScreen(x, y);
  const margin = Math.ceil(WALL_OUTLINE_WIDTH);
  return { x: sx - TILE_W / 2 - margin, y: sy - TILE_H / 2 - WALL_HEIGHT - margin, width: TILE_W + margin * 2, height: TILE_H + WALL_HEIGHT + margin * 2 };
}

/**
 * 牆／邊界立體塊。材質以 pattern 依世界座標貼上（texel → 螢幕的仿射），相鄰牆連續：
 * 頂面 texel (u, v) = 世界 ((u, v) / FLOOR_TEXELS_PER_TILE − 0.5)，抬高 WALL_HEIGHT；
 * 側面 u 沿牆的世界座標、v 由牆頂往下（密度 ASSET_SCALE）。只畫不接牆的側面與邊線。
 * 有 `wall-stone` 的主題為砌石：頂面與側面都貼石面，磚縫依世界座標畫（見 MASONRY）；否則貼 `wall-top`／`wall-side`。
 */
export function createWallPainter(ctx: Ctx2D, images: WallImages):
  (x: number, y: number, isBlockAt: (dx: number, dy: number) => boolean) => void {
  const stoneImg = images.stone;
  const [topImg, sideImg] = stoneImg ? [stoneImg, stoneImg] : [images.top, images.side];
  /** 側面材質預先壓暗，填色後可再以同一 pattern 描邊蓋住相鄰面之間的抗鋸齒細縫 */
  const shaded = (img: PatternImage | null, shade: number) => {
    if (!img) return null;
    const canvas = new OffscreenCanvas(img.width, img.height);
    const c = canvas.getContext('2d')!;
    c.drawImage(img, 0, 0);
    c.fillStyle = `rgba(0,0,0,${shade})`;
    c.fillRect(0, 0, img.width, img.height);
    return canvas;
  };
  const leftImg = shaded(sideImg, WALL_SHADE.left), rightImg = shaded(sideImg, WALL_SHADE.right);
  const pattern = (img: PatternImage | null, matrix: number[], fallback: string) => {
    const p = img ? ctx.createPattern(img, 'repeat') : null;
    if (!p) return fallback;
    p.setTransform(new DOMMatrix(matrix));
    return p;
  };
  const texel = TILE_W / 2 / FLOOR_TEXELS_PER_TILE, vScale = 1 / ASSET_SCALE, h = WALL_HEIGHT;
  const top = pattern(topImg, [texel, texel / 2, -texel, texel / 2, 0, -TILE_H / 2 - h], '#777');

  const path = (points: number[][]) => {
    ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
  };
  const fillFace = (points: number[][], fill: string | CanvasPattern) => {
    path(points);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = SEAM_COVER_WIDTH;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = fill;
    ctx.stroke();
  };

  /**
   * 在一個面上畫錯縫砌法：project(a, b) 把面座標轉成螢幕點，a 沿磚長方向（世界座標）、b 跨層。
   * rows 為各層 [b0, b1]；stagger 時奇數層位移半塊（錯縫），否則各層對齊；磚與縫依世界座標，跨格連續。
   */
  const lay = (project: (a: number, b: number) => number[], aMin: number, aMax: number,
    rows: { index: number; b0: number; b1: number; jointAbove: boolean }[], length: number, stagger: boolean, salt: number) => {
    ctx.lineWidth = MASONRY.mortarWidth;
    for (const { index, b0, b1, jointAbove } of rows) {
      const offset = stagger ? (((index % 2) + 2) % 2) * length / 2 : 0;
      for (let k = Math.floor((aMin - offset) / length); offset + k * length < aMax; k++) {
        const a0 = offset + k * length;
        const c0 = Math.max(a0, aMin), c1 = Math.min(a0 + length, aMax);
        const tone = tileVariance(k, index, salt) - 0.5;
        path([project(c0, b0), project(c1, b0), project(c1, b1), project(c0, b1)]);
        ctx.fillStyle = tone > 0 ? `rgba(255,255,255,${tone * 2 * MASONRY.tint})` : `rgba(0,0,0,${-tone * 2 * MASONRY.tint})`;
        ctx.fill();
        if (a0 >= aMin) {
          ctx.beginPath();
          ctx.moveTo(...(project(a0, b0) as [number, number]));
          ctx.lineTo(...(project(a0, b1) as [number, number]));
          ctx.strokeStyle = MASONRY.mortar;
          ctx.stroke();
        }
      }
      if (jointAbove) {
        ctx.beginPath();
        ctx.moveTo(...(project(aMin, b0) as [number, number]));
        ctx.lineTo(...(project(aMax, b0) as [number, number]));
        ctx.strokeStyle = MASONRY.mortar;
        ctx.stroke();
      }
    }
  };
  const courseHeight = h / MASONRY.courses;
  const courses = Array.from({ length: MASONRY.courses }, (_, i) =>
    ({ index: i, b0: h - i * courseHeight, b1: h - (i + 1) * courseHeight, jointAbove: i > 0 }));
  const at = (wx: number, wy: number, z: number) => {
    const { sx, sy } = worldToScreen(wx, wy);
    return [sx, sy - z];
  };

  return (x, y, isBlockAt) => {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const n = [sx, sy - hh - h], e = [sx + hw, sy - h], s = [sx, sy + hh - h], w = [sx - hw, sy - h];
    const sBottom = [sx, sy + hh], wBottom = [sx - hw, sy], eBottom = [sx + hw, sy];
    const outline = () => {
      ctx.lineWidth = WALL_OUTLINE_WIDTH;
      ctx.strokeStyle = WALL_OUTLINE;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    };
    /** 側面描底邊；直邊只描在牆的轉角（該端不再接牆） */
    const sideFace = (topCorner: number[], bottom: number[], fill: string | CanvasPattern,
      endOpen: boolean, cornerOpen: boolean, masonry: () => void) => {
      fillFace([topCorner, s, sBottom, bottom], fill);
      if (stoneImg) masonry();
      outline();
      ctx.beginPath();
      ctx.moveTo(bottom[0], bottom[1]);
      ctx.lineTo(sBottom[0], sBottom[1]);
      if (cornerOpen) ctx.lineTo(s[0], s[1]);
      if (endOpen) {
        ctx.moveTo(topCorner[0], topCorner[1]);
        ctx.lineTo(bottom[0], bottom[1]);
      }
      ctx.stroke();
    };
    const leftOpen = !isBlockAt(0, 1), rightOpen = !isBlockAt(1, 0);
    if (leftOpen) {
      const left = pattern(leftImg, [texel, texel / 2, 0, vScale, -TILE_W / 2 * (y + 1), TILE_H / 2 * y - h], '#555');
      sideFace(w, wBottom, left, !isBlockAt(-1, 0) || isBlockAt(-1, 1), rightOpen,
        () => lay((a, z) => at(a, y + 0.5, z), x - 0.5, x + 0.5, courses, MASONRY.brickLength, true, 1000 + y));
    }
    if (rightOpen) {
      const right = pattern(rightImg, [-texel, texel / 2, 0, vScale, TILE_W / 2 * (x + 1), TILE_H / 2 * x - h], '#444');
      sideFace(e, eBottom, right, !isBlockAt(0, -1) || isBlockAt(1, -1), leftOpen,
        () => lay((a, z) => at(x + 0.5, a, z), y - 0.5, y + 0.5, courses, MASONRY.brickLength, true, 2000 + x));
    }
    fillFace([n, e, s, w], top);
    if (stoneImg) {
      const perTile = Math.round(1 / MASONRY.slab);
      const rows = Array.from({ length: perTile }, (_, i) => {
        const b0 = y - 0.5 + i * MASONRY.slab;
        return { index: y * perTile + i, b0, b1: b0 + MASONRY.slab, jointAbove: true };
      });
      lay((a, b) => at(a, b, h), x - 0.5, x + 0.5, rows, MASONRY.slab, false, 3000);
    }
    outline();
    const edges: [number, number, number[], number[]][] = [[0, -1, n, e], [1, 0, e, s], [0, 1, s, w], [-1, 0, w, n]];
    ctx.beginPath();
    for (const [dx, dy, a, b] of edges) {
      if (isBlockAt(dx, dy)) continue;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
  };
}

/** 斷柱柱基的繪製範圍 */
export function stumpBounds(sprite: SpriteSource, x: number, y: number): ScreenRect {
  const { sx, sy } = worldToScreen(x, y);
  const width = sprite.width / ASSET_SCALE, height = sprite.height / ASSET_SCALE;
  return { x: sx - width / 2, y: sy + OBJECT_ANCHOR.pillar - height, width, height };
}

/** 斷柱柱基（見 BROKEN_PILLAR）：直立石柱素材的下段，上緣裁成鋸齒斷口；斷口線以素材 alpha 遮罩，不畫出柱身外 */
export function drawStump(ctx: Ctx2D, sprite: SpriteSource, x: number, y: number): void {
  const { stump: [minStump, maxStump], jagPoints, jag, edgeWidth } = BROKEN_PILLAR;
  const { width, height } = sprite;
  const cut = height * (1 - minStump - tileVariance(x, y, 61) * (maxStump - minStump));
  const edge = Array.from({ length: jagPoints + 1 }, (_, i) =>
    [(width * i) / jagPoints, cut + (tileVariance(x, y, 62 + i) * 2 - 1) * jag * ASSET_SCALE]);
  const drawSprite = (c: OffscreenCanvasRenderingContext2D) => c.drawImage(sprite.image, sprite.x, sprite.y, width, height, 0, 0, width, height);
  const canvas = new OffscreenCanvas(width, height);
  const c = canvas.getContext('2d')!;
  c.beginPath();
  c.moveTo(0, height);
  edge.forEach(([px, py]) => c.lineTo(px, py));
  c.lineTo(width, height);
  c.closePath();
  c.save();
  c.clip();
  drawSprite(c);
  c.restore();
  c.beginPath();
  edge.forEach(([px, py], i) => (i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
  c.lineWidth = edgeWidth * ASSET_SCALE;
  c.lineJoin = 'round';
  c.strokeStyle = WALL_OUTLINE;
  c.stroke();
  c.globalCompositeOperation = 'destination-in';
  drawSprite(c);

  const bounds = stumpBounds(sprite, x, y);
  ctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height);
}
