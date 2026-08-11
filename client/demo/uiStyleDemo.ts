/**
 * 介面風格調校頁（`ui-style.html`）的橋接層。
 *
 * 這頁要回答的問題只有一個：**介面的線條與彩度要多重，才跟角色 sprite 是同一套語言**。
 * 所以三邊的顏色必須來自各自的真來源，不能在這裡另抄一份：
 *
 * 1. 介面色 —— 讀 `src/App.css` `:root` 上的 token（頁面 `<link>` 進來的那份）
 * 2. 地圖色 —— `src/pixi/mapThemes.ts` 的 `MAP_THEME_PALETTES`
 * 3. 角色  —— `pawnDemo.ts` 轉接的 `src/pixi/entities/pawn/`（遊戲跑的同一份繪製）
 *
 * 調校只做**同一組色的變換**（飽和度 × 倍率、亮度 ± 偏移），不引入新色票 ——
 * 定案後階段 3 才把變換結果寫死回 token。變換函式（`tuneColor`）是這頁與階段 3
 * 之間的合約：頁面上看到什麼，就是把它套在來源色上算出來的。
 */
import { MAP_THEME_PALETTES } from '../src/pixi/mapThemes';
import { drawPawn, drawTile, PRESETS, TILE_W, TILE_H } from './pawnDemo';
import { PAWN_DIRECTIONS } from '../src/pixi/entities/pawn/geometry';

/* ═══════════ 色彩變換 ═══════════ */

export interface Tune {
  /** 飽和度倍率。1 = 不動 */
  sat: number;
  /** 亮度偏移（百分點）。**預設 0** —— 動它會直接改變文字對比 */
  light: number;
}

const NO_TUNE: Tune = { sat: 1, light: 0 };

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 單色變換。**只動 S 與 L，H 一律保留** ——
 * 動色相等於換一套配色，那是另一個決定，不該藏在「彩度」滑桿裡。
 */
export function tuneColor(hex: string, t: Tune): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h, clamp01(s * t.sat), clamp01(l + t.light / 100));
  return '#' + [nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/**
 * 把一段 CSS 值裡的每個 `#rrggbb` 都套上變換，其餘原樣留著。
 * 漸層（`--hp-bar` 那類）靠這個處理 —— 它們是字串不是色，逐個抽出來換比重寫一份安全。
 */
export function tuneCssValue(value: string, t: Tune): string {
  return value.replace(/#[0-9a-fA-F]{6}\b/g, (m) => tuneColor(m, t));
}

/** 0xRRGGBB（Pixi 用的數字色）→ `#rrggbb` */
export function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** 依比例把色推向黑，畫立體面用。t=0 不變，t=1 全黑 */
function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (n: number) => Math.round(n * (1 - t)).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

/* ═══════════ 地圖 + 角色的小場景 ═══════════ */

const COLS = 9;
const ROWS = 7;

/** 場景的 CSS 尺寸（實際畫布會再乘 DPR） */
export const SCENE_W = (COLS + ROWS) * (TILE_W / 2);
export const SCENE_H = (COLS + ROWS) * (TILE_H / 2) + 96;

/** 房舍：以格座標的矩形足跡 + 高度（px）描述 */
interface Building {
  gx0: number; gy0: number; gx1: number; gy1: number; h: number;
}

const BUILDINGS: Building[] = [
  { gx0: 5, gy0: 0, gx1: 7, gy1: 1, h: 34 },
  { gx0: 1, gy0: 1, gx1: 2, gy1: 2, h: 28 },
];

/** 站在場上的角色（格座標 + `pawnDemo` 的造型預設 id） */
const ACTORS: Array<{ gx: number; gy: number; preset: string }> = [
  { gx: 3, gy: 4, preset: 'elementalist' },
  { gx: 5, gy: 3, preset: 'blacksmith' },
  { gx: 6, gy: 5, preset: 'knight' },
];

interface Origin { x: number; y: number }

function iso(gx: number, gy: number, o: Origin): { x: number; y: number } {
  return {
    x: o.x + (gx - gy) * (TILE_W / 2),
    y: o.y + (gx + gy) * (TILE_H / 2),
  };
}

/** 等距立方體：頂面菱形 + 左右兩側面。側面用頂面色壓暗，維持單一光源 */
function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, top: string, o: Origin): void {
  const n = iso(b.gx0, b.gy0, o);        // 北角
  const e = iso(b.gx1 + 1, b.gy0, o);    // 東角
  const s = iso(b.gx1 + 1, b.gy1 + 1, o); // 南角
  const w = iso(b.gx0, b.gy1 + 1, o);    // 西角
  const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - b.h });

  // 左側面（西南面）
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - TILE_H / 2);
  ctx.lineTo(s.x, s.y - TILE_H / 2);
  ctx.lineTo(up(s).x, up(s).y - TILE_H / 2);
  ctx.lineTo(up(w).x, up(w).y - TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = darken(top, 0.38);
  ctx.fill();

  // 右側面（東南面）
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - TILE_H / 2);
  ctx.lineTo(e.x, e.y - TILE_H / 2);
  ctx.lineTo(up(e).x, up(e).y - TILE_H / 2);
  ctx.lineTo(up(s).x, up(s).y - TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = darken(top, 0.2);
  ctx.fill();

  // 頂面
  ctx.beginPath();
  ctx.moveTo(up(n).x, up(n).y - TILE_H / 2);
  ctx.lineTo(up(e).x, up(e).y - TILE_H / 2);
  ctx.lineTo(up(s).x, up(s).y - TILE_H / 2);
  ctx.lineTo(up(w).x, up(w).y - TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();
}

function isInsideBuilding(gx: number, gy: number): boolean {
  return BUILDINGS.some((b) => gx >= b.gx0 && gx <= b.gx1 && gy >= b.gy0 && gy <= b.gy1);
}

/**
 * 畫一小塊城鎮地圖 + 三個角色。
 * `mapTune` 只作用在地磚與房舍（Pixi 那側的色），角色一律原色 ——
 * 角色是這頁的**對照基準**，把它一起調就沒有東西可以對齊了。
 */
export function renderScene(canvas: HTMLCanvasElement, mapTune: Tune = NO_TUNE): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(SCENE_W * dpr);
  canvas.height = Math.round(SCENE_H * dpr);
  canvas.style.width = `${SCENE_W}px`;
  canvas.style.height = `${SCENE_H}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);

  const p = MAP_THEME_PALETTES.town;
  const c = {
    ground: tuneColor(numToHex(p.ground), mapTune),
    groundAlt: tuneColor(numToHex(p.groundAlt), mapTune),
    grass: tuneColor(numToHex(p.grass), mapTune),
    obstacle: tuneColor(numToHex(p.obstacle), mapTune),
    water: tuneColor(numToHex(p.water), mapTune),
  };

  const o: Origin = { x: ROWS * (TILE_W / 2), y: 48 };

  // 地板：石板棋盤，最外圈換草地，中央一格水井
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const { x, y } = iso(gx, gy, o);
      const edge = gx === 0 || gy === ROWS - 1;
      const well = gx === 4 && gy === 3;
      const fill = well ? c.water : edge ? c.grass : (gx + gy) % 2 ? c.ground : c.groundAlt;
      drawTile(ctx, x, y, fill, true);
    }
  }

  // 房舍與角色一起依「深度」排序後畫，後面的才會被前面的擋住
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];

  for (const b of BUILDINGS) {
    items.push({ depth: b.gx1 + b.gy1, draw: () => drawBuilding(ctx, b, c.obstacle, o) });
  }
  for (const a of ACTORS) {
    if (isInsideBuilding(a.gx, a.gy)) continue;
    const preset = PRESETS.find((x) => x.id === a.preset) ?? PRESETS[0];
    const { x, y } = iso(a.gx, a.gy, o);
    items.push({
      depth: a.gx + a.gy + 0.5,
      draw: () => drawPawn(ctx, x, y, PAWN_DIRECTIONS[0], {
        hair: preset.hair,
        skin: preset.skin,
        hairColor: preset.hairColor,
        eyeColor: preset.eyeColor ?? '#2b2b33',
        cloth: preset.cloth,
        eyes: preset.eyes,
        lash: preset.lash,
      }),
    });
  }

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
}
