/**
 * 第三代背景 render 的地板烘焙（`38-map-control.md` § 38.9「素材來源」）。純函式，可在 Worker 執行。
 *
 * 材質依世界座標雙線性取樣；沙地以雜訊邊界融入地面、地毯整格鋪並描邊、
 * 水／岩漿／深淵依「周圍同類格覆蓋率＋雜訊」分層成本體／淺層／岸線／岸邊。
 */
import { getTileDefinition, type MapData, type TileVisualRole } from '../../models/mapControl';
import { FLOOR_TEXELS_PER_TILE } from '../../../scripts/comfy/tileSpec.mjs';
import { TILE_H, TILE_W, worldToScreen } from '../utils/isometric';
import { tileVariance } from '../utils/tileVariance';

/** RGBA8888 點陣，與 `ImageData` 同格式 */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type Rgb = [number, number, number];

/**
 * 池（水、岩漿、深淵）分層：f = 以點為中心、邊長 2 × SHORE_RADIUS 方框內同類格的覆蓋率 + 雜訊。
 * f 跨過 bank 岸邊、line 岸線、shallow 淺層、deep 本體，每層在門檻 ±SHORE_BLEND / 2 內漸變疊上。
 * 非同類格只加負向雜訊（直線岸邊的本體與岸線不畫進該格；三面被池包圍的格角依覆蓋率圓滑切入）。淺層 = 本體材質混入 tint。
 * textureScale：本體材質放大倍數（岩漿 2 倍，8 格才重複一次）。
 */
const SHORE_RADIUS = 0.5;
const NOISE_AMP = 0.14;
const NOISE_FREQ = 2.5;
const SHORE = { deep: 0.68, shallow: 0.6, line: 0.565, bank: 0.33 };
const SHORE_BLEND = 0.015;

type PoolRole = 'water' | 'lava' | 'chasm';
interface PoolStyle { role: PoolRole; bank: string; line: Rgb; tint: Rgb; tintAmount: number; textureScale?: number }
const POOLS: PoolStyle[] = [
  { role: 'water', bank: 'shore', line: [24, 32, 28], tint: [255, 255, 255], tintAmount: 0.28 },
  { role: 'lava', bank: 'lava-bank', line: [40, 14, 6], tint: [255, 214, 110], tintAmount: 0.35, textureScale: 2 },
  { role: 'chasm', bank: 'chasm-bank', line: [0, 0, 0], tint: [0, 0, 0], tintAmount: 0.45 },
];

/** 沙地：f = 沙格覆蓋率 + 雜訊，在 SAND_THRESHOLD ±SAND_BLEND / 2 內漸變 */
const SAND_THRESHOLD = 0.5;
const SAND_BLEND = 0.08;

/** 地毯：整格鋪；接非地毯格的邊內 CARPET_EDGE 格寬畫深色邊線 */
const CARPET_EDGE = 0.05;
const CARPET_EDGE_DARKEN = 0.45;

/** 地板用到的材質名（`assets-src/ai-textures/<theme>-<name>.png`）；除 ground 外缺少即不畫該地形 */
export const FLOOR_TEXTURE_NAMES = ['ground', 'sand', 'carpet', ...POOLS.flatMap(pool => [pool.role, pool.bank])] as const;

export type FloorTextures = Partial<Record<(typeof FLOOR_TEXTURE_NAMES)[number], Raster>> & { ground: Raster };

/** 地板範圍（世界像素，螢幕座標）：左上角 (x, y)、寬高 */
export interface FloorBounds { x: number; y: number; width: number; height: number }

export function floorBounds(map: Pick<MapData, 'width' | 'height'>): FloorBounds {
  const corners = [worldToScreen(0, 0), worldToScreen(map.width - 1, 0), worldToScreen(0, map.height - 1), worldToScreen(map.width - 1, map.height - 1)];
  const x = Math.floor(Math.min(...corners.map(c => c.sx)) - TILE_W / 2);
  const y = Math.floor(Math.min(...corners.map(c => c.sy)) - TILE_H / 2);
  return {
    x,
    y,
    width: Math.ceil(Math.max(...corners.map(c => c.sx)) + TILE_W / 2 - x),
    height: Math.ceil(Math.max(...corners.map(c => c.sy)) + TILE_H / 2 - y),
  };
}

/** 平滑 value noise，輸出約 −1～1 */
function valueNoise(x: number, y: number): number {
  const lattice = (ix: number, iy: number) => tileVariance(ix, iy, 7) * 2 - 1;
  const fade = (t: number) => t * t * (3 - 2 * t);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const top = lattice(x0, y0) + (lattice(x0 + 1, y0) - lattice(x0, y0)) * fx;
  const bottom = lattice(x0, y0 + 1) + (lattice(x0 + 1, y0 + 1) - lattice(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

/** 方框 [x−r, x+r]×[y−r, y+r] 內符合格的覆蓋率（格 (i, j) 佔 [i−0.5, i+0.5]×[j−0.5, j+0.5]） */
function coverage(matches: (i: number, j: number) => boolean, x: number, y: number, r: number): number {
  let covered = 0;
  for (let j = Math.round(y - r); j <= Math.round(y + r); j++) {
    const oy = Math.min(y + r, j + 0.5) - Math.max(y - r, j - 0.5);
    if (oy <= 0) continue;
    for (let i = Math.round(x - r); i <= Math.round(x + r); i++) {
      if (!matches(i, j)) continue;
      const ox = Math.min(x + r, i + 0.5) - Math.max(x - r, i - 0.5);
      if (ox > 0) covered += ox * oy;
    }
  }
  return covered / (4 * r * r);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramp = (f: number, threshold: number, blend = SHORE_BLEND) => Math.min(1, Math.max(0, (f - threshold) / blend + 0.5));

/** 依世界座標雙線性取樣（可循環）；scale 為材質放大倍數 */
function sampleTexture(texture: Raster, x: number, y: number, scale = 1): Rgb {
  const size = texture.width;
  const u = (x + 0.5) * FLOOR_TEXELS_PER_TILE / scale - 0.5, v = (y + 0.5) * FLOOR_TEXELS_PER_TILE / scale - 0.5;
  const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
  const wrap = (n: number) => ((n % size) + size) % size;
  const texel = (tu: number, tv: number, c: number) => texture.data[(wrap(tv) * size + wrap(tu)) * 4 + c];
  const channel = (c: number) =>
    (texel(u0, v0, c) * (1 - fu) + texel(u0 + 1, v0, c) * fu) * (1 - fv) + (texel(u0, v0 + 1, c) * (1 - fu) + texel(u0 + 1, v0 + 1, c) * fu) * fv;
  return [channel(0), channel(1), channel(2)];
}

/** 整張地板烘焙；scale = 點陣像素 ÷ 世界像素；地圖外的像素透明 */
export function bakeFloor(map: MapData, textures: FloorTextures, bounds: FloorBounds, scale: number): Raster {
  const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
  const out: Raster = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const roles = map.tiles.map(row => row.map(tile => getTileDefinition(tile)?.role ?? null));
  const roleAt = (i: number, j: number) => (i >= 0 && j >= 0 && i < map.width && j < map.height ? roles[j][i] : null);
  const is = (role: TileVisualRole) => (i: number, j: number) => roleAt(i, j) === role;
  /** 該格 3×3 內是否有指定 role（沒有就不必算覆蓋率） */
  const near = (role: TileVisualRole) => roles.map((row, j) => row.map((_, i) =>
    [-1, 0, 1].some(dj => [-1, 0, 1].some(di => roleAt(i + di, j + dj) === role))));
  const pools = POOLS.flatMap(style => {
    const main = textures[style.role];
    if (!main) return [];
    const bank = textures[style.bank as keyof FloorTextures] ?? null;
    return [{ style, main, bank, matches: is(style.role), near: near(style.role) }];
  });
  const isSand = is('sand');
  const nearSand = near('sand');

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const sx = bounds.x + (px + 0.5) / scale;
      const sy = bounds.y + (py + 0.5) / scale;
      const x = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
      const y = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
      const tx = Math.round(x), ty = Math.round(y);
      const role = roleAt(tx, ty);
      if (role === null) continue;
      const noise = valueNoise(x * NOISE_FREQ, y * NOISE_FREQ) * NOISE_AMP;

      let rgb = sampleTexture(textures.ground, x, y);
      if (textures.sand && nearSand[ty][tx]) {
        rgb = mix(rgb, sampleTexture(textures.sand, x, y), ramp(coverage(isSand, x, y, SHORE_RADIUS) + noise, SAND_THRESHOLD, SAND_BLEND));
      }
      if (textures.carpet && role === 'carpet') {
        rgb = sampleTexture(textures.carpet, x, y);
        const edges: [number, number, number][] = [[x - tx, 1, 0], [tx - x, -1, 0], [y - ty, 0, 1], [ty - y, 0, -1]];
        if (edges.some(([d, di, dj]) => 0.5 - d < CARPET_EDGE && roleAt(tx + di, ty + dj) !== 'carpet')) {
          rgb = mix(rgb, [0, 0, 0], CARPET_EDGE_DARKEN);
        }
      }
      for (const pool of pools) {
        if (!pool.near[ty][tx]) continue;
        const covered = coverage(pool.matches, x, y, SHORE_RADIUS);
        if (covered === 0) continue;
        const f = covered + (role === pool.style.role ? noise : Math.min(0, noise));
        const main = sampleTexture(pool.main, x, y, pool.style.textureScale);
        if (pool.bank) rgb = mix(rgb, sampleTexture(pool.bank, x, y), ramp(f, SHORE.bank));
        rgb = mix(rgb, pool.style.line, ramp(f, SHORE.line));
        rgb = mix(rgb, mix(main, pool.style.tint, pool.style.tintAmount), ramp(f, SHORE.shallow));
        rgb = mix(rgb, main, ramp(f, SHORE.deep));
      }
      const o = (py * width + px) * 4;
      out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2]; out.data[o + 3] = 255;
    }
  }
  return out;
}
