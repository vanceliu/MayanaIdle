/**
 * 第三代背景 render 的物件配置（`38-map-control.md` § 38.9「素材來源」）。純函式：
 * 依地圖與各物件變體的尺寸，算出每個 Sprite、牆塊、斷柱柱基的位置與深度。
 */
import { getTileDefinition, type MapData, type TileVisualRole } from '../../models/mapControl';
import { getFallenPillarAxis } from '../../models/mapDesignRules';
import { ASSET_SCALE } from '../../../scripts/comfy/tileSpec.mjs';
import { isRubbleSite } from '../layers/WallLayer';
import { TILE_W, worldToScreen } from '../utils/isometric';
import { tileVariance } from '../utils/tileVariance';

export const OBJECT_NAMES = ['tree', 'tuft', 'rock', 'rubble', 'pillar', 'clutter', 'wall-rock'] as const;
export type ObjectName = (typeof OBJECT_NAMES)[number];

/** 對每個物件名取值 */
export function byObjectName<T>(value: (name: ObjectName) => T): Record<ObjectName, T> {
  return Object.fromEntries(OBJECT_NAMES.map(name => [name, value(name)])) as Record<ObjectName, T>;
}

/** 各物件的變體尺寸（素材像素，密度 ASSET_SCALE） */
export type ObjectSizes = Record<ObjectName, readonly { width: number; height: number }[]>;

/** 物件錨點：素材底邊相對格中心的 y 偏移（世界像素） */
export const OBJECT_ANCHOR = { tree: 6, rock: 8, rubble: 6, pillar: 6, clutter: 4, tuft: 1 } as const;

/** 物件依格座標的變化：縮放範圍、格內位置偏移（±格）、左右鏡射（有設定者一律隨機鏡射） */
interface ObjectVariation { scale: readonly [number, number]; jitter: number }
const OBJECT_VARIATION: Partial<Record<ObjectName, ObjectVariation>> = {
  tree: { scale: [0.85, 1.15], jitter: 0.05 },
  rock: { scale: [0.65, 1.2], jitter: 0.1 },
  rubble: { scale: [0.65, 1.2], jitter: 0.1 },
  clutter: { scale: [0.85, 1.1], jitter: 0.08 },
};

/**
 * 天然岩壁的岩塊（每主題多種造型）：每格一塊，寬 width × TILE_W（依格座標），高不超過 maxHeight 世界像素（等比例縮）；
 * 格內偏移 ±jitter 格、深度依實際位置；底邊在格中心下 baseOffset；不墊方塊。
 */
const WALL_ROCK = { width: [1.0, 1.25], maxHeight: 52, jitter: 0.08, baseOffset: 10 } as const;

/** 天然岩壁主題的內牆：以 4 連通牆段為單位，MASONRY_WALL_RATIO 機率（依牆段第一格座標）整段畫砌石，其餘畫岩塊 */
const MASONRY_WALL_RATIO = 0.35;

/** 草叢格的小草：每格數量 GRASS_TUFT_MIN～MIN+RANGE−1，位置在格中心 ±GRASS_TUFT_SPREAD 內 */
const GRASS_TUFT_MIN = 3;
const GRASS_TUFT_RANGE = 3;
const GRASS_TUFT_SPREAD = 0.35;

/** 素材 Sprite：底邊中心在螢幕座標 (sx, sy)，寬高為世界像素 */
export interface SpritePlacement {
  kind: 'sprite';
  name: ObjectName;
  variant: number;
  sx: number;
  sy: number;
  width: number;
  height: number;
  flip: 1 | -1;
  depth: number;
}

/** 牆／邊界立體塊；isBlockAt(dx, dy) 表示相鄰格是否也是立體塊 */
export interface WallPlacement {
  kind: 'wall';
  x: number;
  y: number;
  isBlockAt: (dx: number, dy: number) => boolean;
  depth: number;
}

/** 斷柱柱基（直立石柱素材的下段） */
export interface StumpPlacement {
  kind: 'stump';
  x: number;
  y: number;
  variant: number;
  depth: number;
}

export type ObjectPlacement = SpritePlacement | WallPlacement | StumpPlacement;

/** 被選為砌石的內牆格（索引 y × width + x） */
function masonryWallTiles(map: MapData): Set<number> {
  const isWall = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && getTileDefinition(map.tiles[y][x])?.role === 'wall';
  const seen = new Set<number>(), chosen = new Set<number>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWall(x, y) || seen.has(y * map.width + x)) continue;
      const segment: number[] = [];
      const stack = [[x, y]];
      seen.add(y * map.width + x);
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        segment.push(cy * map.width + cx);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (!isWall(nx, ny) || seen.has(ny * map.width + nx)) continue;
          seen.add(ny * map.width + nx);
          stack.push([nx, ny]);
        }
      }
      if (tileVariance(x, y, 70) < MASONRY_WALL_RATIO) segment.forEach(i => chosen.add(i));
    }
  }
  return chosen;
}

/** 依深度由後往前排序的全部物件 */
export function planObjects(map: MapData, sizes: ObjectSizes): ObjectPlacement[] {
  const roleAt = (i: number, j: number): TileVisualRole | null =>
    (i >= 0 && j >= 0 && i < map.width && j < map.height ? getTileDefinition(map.tiles[j][i])?.role ?? null : null);
  const rocky = sizes['wall-rock'].length > 0;
  const masonryWalls = rocky ? masonryWallTiles(map) : null;
  /** 方塊：邊界一律是；內牆在非天然岩壁主題、或被選為砌石的牆段才是 */
  const isWallBlockAt = (i: number, j: number) => {
    const role = roleAt(i, j);
    return role === 'boundary' || (role === 'wall' && (!masonryWalls || masonryWalls.has(j * map.width + i)));
  };

  const placements: ObjectPlacement[] = [];
  const pick = (name: ObjectName, x: number, y: number, salt = 0) =>
    (sizes[name].length > 0 ? Math.floor(tileVariance(x, y, salt) * sizes[name].length) : -1);
  const place = (name: ObjectName, variant: number, wx: number, wy: number, baseOffset: number, variation?: ObjectVariation) => {
    if (variant < 0) return;
    const tx = Math.round(wx), ty = Math.round(wy);
    const [minScale, maxScale] = variation?.scale ?? [1, 1];
    const scale = minScale + tileVariance(tx, ty, 40) * (maxScale - minScale);
    const jitter = variation?.jitter ?? 0;
    const px = wx + (tileVariance(tx, ty, 41) * 2 - 1) * jitter, py = wy + (tileVariance(tx, ty, 42) * 2 - 1) * jitter;
    const flip = variation && tileVariance(tx, ty, 43) < 0.5 ? -1 : 1;
    const { sx, sy } = worldToScreen(px, py);
    const size = sizes[name][variant];
    placements.push({
      kind: 'sprite', name, variant, sx, sy: sy + baseOffset * scale, flip, depth: wx + wy,
      width: size.width / ASSET_SCALE * scale, height: size.height / ASSET_SCALE * scale,
    });
  };

  /** 天然岩壁：每格一塊岩塊（見 WALL_ROCK） */
  const placeWallRock = (x: number, y: number) => {
    const variant = pick('wall-rock', x, y, 51);
    const size = sizes['wall-rock'][variant];
    const [minWidth, maxWidth] = WALL_ROCK.width;
    const width = TILE_W * (minWidth + tileVariance(x, y, 52) * (maxWidth - minWidth));
    const scale = Math.min(width / size.width, WALL_ROCK.maxHeight / size.height);
    const wx = x + (tileVariance(x, y, 54) * 2 - 1) * WALL_ROCK.jitter;
    const wy = y + (tileVariance(x, y, 56) * 2 - 1) * WALL_ROCK.jitter;
    const { sx, sy } = worldToScreen(wx, wy);
    placements.push({
      kind: 'sprite', name: 'wall-rock', variant, sx, sy: sy + WALL_ROCK.baseOffset,
      width: size.width * scale, height: size.height * scale, flip: tileVariance(x, y, 58) < 0.5 ? -1 : 1, depth: wx + wy,
    });
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      switch (roleAt(x, y)) {
        case 'tree':
          place('tree', pick('tree', x, y), x, y, OBJECT_ANCHOR.tree, OBJECT_VARIATION.tree);
          break;
        case 'decoration':
          place('clutter', pick('clutter', x, y), x, y, OBJECT_ANCHOR.clutter, OBJECT_VARIATION.clutter);
          break;
        case 'rock': {
          const rubble = isRubbleSite(map, x, y) && sizes.rubble.length > 0;
          const name = rubble || sizes.rock.length === 0 ? 'rubble' : 'rock';
          place(name, pick(name, x, y), x, y, OBJECT_ANCHOR[name], OBJECT_VARIATION[name]);
          break;
        }
        case 'pillar': {
          const axis = getFallenPillarAxis(map, x, y);
          if (!axis) {
            place('pillar', pick('pillar', x, y), x, y, OBJECT_ANCHOR.pillar);
            break;
          }
          const [dx, dy] = axis === 'horizontal' ? [1, 0] : [0, 1];
          if (roleAt(x - dx, y - dy) === 'pillar') break;
          const [x2, y2] = [x + dx, y + dy];
          const stumpFirst = tileVariance(x, y, 60) < 0.5;
          const [stumpX, stumpY, debrisX, debrisY] = stumpFirst ? [x, y, x2, y2] : [x2, y2, x, y];
          const variant = pick('pillar', stumpX, stumpY);
          if (variant >= 0) placements.push({ kind: 'stump', x: stumpX, y: stumpY, variant, depth: stumpX + stumpY });
          place('rubble', pick('rubble', debrisX, debrisY), debrisX, debrisY, OBJECT_ANCHOR.rubble, OBJECT_VARIATION.rubble);
          break;
        }
        case 'grass':
          for (let k = GRASS_TUFT_MIN + Math.floor(tileVariance(x, y, 1) * GRASS_TUFT_RANGE) - 1; k >= 0; k--) {
            const du = (tileVariance(x, y, 10 + k) * 2 - 1) * GRASS_TUFT_SPREAD;
            const dv = (tileVariance(x, y, 20 + k) * 2 - 1) * GRASS_TUFT_SPREAD;
            place('tuft', pick('tuft', x, y, 30 + k), x + du, y + dv, OBJECT_ANCHOR.tuft);
          }
          break;
        case 'boundary':
        case 'wall':
          if (!isWallBlockAt(x, y)) {
            if (rocky) placeWallRock(x, y);
            break;
          }
          placements.push({ kind: 'wall', x, y, depth: x + y, isBlockAt: (dx, dy) => isWallBlockAt(x + dx, y + dy) });
          break;
      }
    }
  }
  return placements.sort((a, b) => a.depth - b.depth);
}
