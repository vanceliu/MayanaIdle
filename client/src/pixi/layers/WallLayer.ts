import { Container, Graphics } from 'pixi.js';
import type { MapData, MapTheme } from '../../models/mapControl';
import { createMapRenderPlan } from '../mapRenderPlan';
import { TileType, getTileDefinition } from '../../models/mapControl';
import { getFallenPillarAxis } from '../../models/mapDesignRules';
import { MAP_THEME_PALETTES } from '../mapThemes';
import { TILE_W, TILE_H, WALL_HEIGHT, getDepth, worldToScreen } from '../utils/isometric';

/**
 * 人造建築主題：塔、遺跡、監獄。這些地方**不會有天然巨石**——
 * 地上的每一塊石頭都是崩落的砌體，一律畫成斷壁。
 */
const BUILT_THEMES: readonly MapTheme[] = ['ivory', 'ancient', 'tower', 'frost-tower', 'lava-tower', 'prison'];

/**
 * 岩石要畫成方正的斷壁還是圓潤的野外巨石。
 *
 * 兩種情況算斷壁：**貼著牆或邊界**（那是從那道牆崩下來的），
 * 或**位於人造建築主題**（塔裡的石頭不可能是天然巨石）。
 */
export function isRubbleSite(mapData: MapData, x: number, y: number): boolean {
  if (BUILT_THEMES.includes(mapData.theme ?? 'grassland')) return true;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= mapData.width || ny >= mapData.height) return true;
    const role = getTileDefinition(mapData.tiles[ny][nx])?.role;
    if (role === 'wall' || role === 'boundary') return true;
  }
  return false;
}

/**
 * 由格座標算出 0~1 的變化量。同一格永遠得到同一個值，
 * 地圖重繪或視角移動時石頭不會跳動。
 */
export function tileVariance(x: number, y: number, salt = 0): number {
  const h = Math.imul(x * 73856093 ^ y * 19349663 ^ salt * 83492791, 0x45d9f3b);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}

export class WallLayer {
  private graphics: Container[] = [];

  buildInto(container: Container, mapData: MapData): void {
    this.removeFrom(container);
    const palette = MAP_THEME_PALETTES[mapData.theme ?? 'grassland'];
    for (const item of createMapRenderPlan(mapData)) {
      if (!['boundary', 'wall', 'tree', 'rock', 'pillar', 'decoration'].includes(item.role)) continue;
      const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);

      let graphic: Graphics;
      switch (item.role) {
        case 'decoration':
          graphic = this.drawDecoration(sx, sy, palette.decoration, item.x, item.y);
          break;
        case 'tree':
          graphic = this.drawTree(sx, sy, palette.decoration, palette.boundaryRight, item.x, item.y);
          break;
        case 'rock':
          graphic = isRubbleSite(mapData, item.x, item.y)
            ? this.drawRubbleBlock(sx, sy, palette.obstacle, palette.boundaryLeft, palette.boundaryRight, item.x, item.y)
            : this.drawRock(sx, sy, palette.obstacle, palette.boundaryLeft, item.x, item.y);
          break;
        case 'pillar': {
          const axis = getFallenPillarAxis(mapData, item.x, item.y);
          graphic = axis
            ? this.drawFallenPillar(sx, sy, palette.obstacle, palette.boundaryLeft, mapData, item.x, item.y, axis)
            : this.drawPillar(sx, sy, palette.obstacle, palette.boundaryLeft);
          break;
        }
        default:
          graphic = this.drawBlock(sx, sy, item.role === 'wall' ? palette.obstacle : palette.boundaryTop, palette.boundaryLeft, palette.boundaryRight);
      }
      graphic.zIndex = getDepth(item, item.elevation);
      this.graphics.push(graphic);
      container.addChild(graphic);
    }
  }

  private removeFrom(container: Container): void {
    for (const graphic of this.graphics) {
      container.removeChild(graphic);
      graphic.destroy();
    }
    this.graphics = [];
  }

  private drawBlock(sx: number, sy: number, top: number, left: number, right: number): Graphics {
    const graphic = new Graphics();
    const halfWidth = TILE_W / 2;
    const halfHeight = TILE_H / 2;
    graphic.poly([sx, sy - halfHeight - WALL_HEIGHT, sx + halfWidth, sy - WALL_HEIGHT, sx, sy + halfHeight - WALL_HEIGHT, sx - halfWidth, sy - WALL_HEIGHT]).fill({ color: top });
    graphic.poly([sx - halfWidth, sy - WALL_HEIGHT, sx, sy + halfHeight - WALL_HEIGHT, sx, sy + halfHeight, sx - halfWidth, sy]).fill({ color: left });
    graphic.poly([sx + halfWidth, sy - WALL_HEIGHT, sx, sy + halfHeight - WALL_HEIGHT, sx, sy + halfHeight, sx + halfWidth, sy]).fill({ color: right });
    return graphic;
  }

  /** 樹冠大小與高度依格座標微調 */
  private drawTree(sx: number, sy: number, foliage: number, trunk: number, x: number, y: number): Graphics {
    const scale = 0.85 + tileVariance(x, y, 4) * 0.3;    // 0.85 ~ 1.15
    const lean = Math.round((tileVariance(x, y, 5) - 0.5) * 6);
    const trunkH = Math.round(24 * scale);
    const crown = 15 * scale;
    const side = 10 * scale;
    return new Graphics()
      .rect(sx - 4, sy - trunkH, 8, trunkH).fill({ color: trunk })
      .circle(sx + lean, sy - trunkH - crown * 0.65, crown).fill({ color: foliage })
      .circle(sx + lean - side, sy - trunkH - side * 0.4, side).fill({ color: foliage, alpha: 0.9 })
      .circle(sx + lean + side, sy - trunkH - side * 0.4, side).fill({ color: foliage, alpha: 0.9 });
  }

  /**
   * 野外岩石：不規則多角形。
   *
   * 過去每一格畫的都是同一個六邊形，成片鋪開時會變成一張重複的貼皮。
   * 這裡讓**頂點數（5~8）與整體尺寸都隨格座標變化**，再加上左右鏡射與頂點擾動，
   * 相鄰的石頭外形各異；同一格永遠得到同一個結果，重繪不會跳動。
   */
  private drawRock(sx: number, sy: number, top: number, side: number, x: number, y: number): Graphics {
    const sides = 5 + Math.floor(tileVariance(x, y, 6) * 4);        // 5~8 角
    const scale = 0.55 + tileVariance(x, y, 1) * 0.85;              // 0.55 ~ 1.40
    const flip = tileVariance(x, y, 2) < 0.5 ? -1 : 1;
    const lift = Math.round(tileVariance(x, y, 3) * 4) - 2;
    const radiusX = 15 * scale;
    const radiusY = 11 * scale;

    const points: number[] = [];
    for (let i = 0; i < sides; i++) {
      // 上半圈是輪廓，下半壓平成貼地的底邊
      const angle = Math.PI + (Math.PI * i) / (sides - 1);
      const jitter = 0.7 + tileVariance(x, y, 20 + i) * 0.6;
      points.push(
        sx + Math.cos(angle) * radiusX * jitter * flip,
        sy + Math.sin(angle) * radiusY * jitter + lift,
      );
    }
    points.push(sx + radiusX * 0.55 * flip, sy + radiusY * 0.35 + lift);
    points.push(sx - radiusX * 0.65 * flip, sy + radiusY * 0.35 + lift);

    return new Graphics()
      .poly(points).fill({ color: top })
      .poly([
        sx - radiusX * 0.65 * flip, sy + radiusY * 0.35 + lift,
        sx + radiusX * 0.55 * flip, sy + radiusY * 0.35 + lift,
        sx + radiusX * 0.3 * flip, sy + radiusY * 0.75 + lift,
        sx - radiusX * 0.5 * flip, sy + radiusY * 0.75 + lift,
      ]).fill({ color: side });
  }

  /**
   * 斷壁：從旁邊那道牆崩落下來的石材堆。
   *
   * **不可把整格切開**——沿中軸劈成兩半時，那條垂直斷面在等距畫面上
   * 就是一條把地磚劈開的直線，看起來像畫面被切割，而不是地上有東西。
   * 改成 2~3 塊各自獨立的方形石材，彼此錯開高低與位置：
   * 整體是緊湊的一堆，邊緣不與地磚的菱形對齊，就不會產生切割感。
   */
  private drawRubbleBlock(
    sx: number, sy: number, top: number, left: number, right: number, x: number, y: number,
  ): Graphics {
    const graphic = new Graphics();
    const count = 2 + Math.floor(tileVariance(x, y, 7) * 2);        // 2~3 塊
    for (let i = 0; i < count; i++) {
      const w = (TILE_W / 2) * (0.26 + tileVariance(x, y, 80 + i) * 0.16);
      const h = (TILE_H / 2) * (0.26 + tileVariance(x, y, 90 + i) * 0.16);
      const tall = WALL_HEIGHT * (0.14 + tileVariance(x, y, 100 + i) * 0.22);   // 遠低於牆高
      const ox = (tileVariance(x, y, 110 + i) - 0.5) * 18;
      const oy = (tileVariance(x, y, 120 + i) - 0.5) * 9;
      const cx = sx + ox, cy = sy + oy;
      graphic
        .poly([cx, cy - h - tall, cx + w, cy - tall, cx, cy + h - tall, cx - w, cy - tall])
        .fill({ color: top })
        .poly([cx - w, cy - tall, cx, cy + h - tall, cx, cy + h, cx - w, cy]).fill({ color: left })
        .poly([cx + w, cy - tall, cx, cy + h - tall, cx, cy + h, cx + w, cy]).fill({ color: right });
    }
    return graphic;
  }

  /**
   * 倒塌石柱：柱身橫躺在地上，跨兩格。
   *
   * 由**成對中座標較小的那一格**負責畫出整根柱身，另一半不重複繪製——
   * 兩半各畫一次會完全重疊，看起來只會是一塊扁平的板子。
   *
   * 投影方向要跟 `worldToScreen` 一致：+x 是 (+32,+16)、**+y 是 (−32,+16)**。
   * 兩端各有一個圓形斷面（柱基與斷裂的柱頭），柱身帶明暗才有圓柱感。
   */
  private drawFallenPillar(
    sx: number, sy: number, top: number, side: number,
    mapData: MapData, x: number, y: number, axis: 'horizontal' | 'vertical',
  ): Graphics {
    const [dx, dy] = axis === 'horizontal' ? [1, 0] : [0, 1];
    const isHead = mapData.tiles[y + dy]?.[x + dx] === TileType.Pillar;
    if (!isHead) return new Graphics();                       // 另一半交給前一格畫

    const vx = (dx - dy) * (TILE_W / 2);
    const vy = (dx + dy) * (TILE_H / 2);
    const over = 0.32;                                        // 兩端各多伸出去一點
    const ax = sx - vx * over, ay = sy - vy * over;
    const bx = sx + vx * (1 + over), by = sy + vy * (1 + over);
    const r = 7;

    return new Graphics()
      // 柱身：下半用暗面
      .poly([ax, ay, bx, by, bx, by + r, ax, ay + r]).fill({ color: side })
      // 柱身：上半用亮面，兩者交界就是圓柱的高光線
      .poly([ax, ay - r, bx, by - r, bx, by, ax, ay]).fill({ color: top })
      // 兩端的圓形斷面
      .ellipse(ax, ay, r * 0.5, r).fill({ color: side })
      .ellipse(bx, by, r * 0.5, r).fill({ color: top })
      .ellipse(bx, by, r * 0.26, r * 0.55).fill({ color: side });
  }

  private drawPillar(sx: number, sy: number, top: number, side: number): Graphics {
    return new Graphics()
      // Keep the shaft flush with the floor; a separate base creates a visible diamond/triangle.
      .rect(sx - 10, sy - 42, 20, 42).fill({ color: side })
      .poly([sx + 3, sy - 42, sx + 10, sy - 39, sx + 10, sy, sx + 3, sy - 3]).fill({ color: 0x000000, alpha: 0.2 })
      .poly([sx - 10, sy - 39, sx - 5, sy - 42, sx - 5, sy - 3, sx - 10, sy]).fill({ color: top, alpha: 0.7 })
      .poly([sx - 14, sy - 42, sx, sy - 49, sx + 14, sy - 42, sx, sy - 35]).fill({ color: top })
      .poly([sx - 14, sy - 42, sx, sy - 35, sx, sy - 32, sx - 14, sy - 39]).fill({ color: side });
  }

  /**
   * 堆放的雜物：箱堆、陶罐、布捆、散落的碎片，四種樣式依格座標輪替。
   * 可通行但不生怪。
   */
  private drawDecoration(sx: number, sy: number, color: number, x = 0, y = 0): Graphics {
    const graphic = new Graphics();
    const kind = Math.floor(tileVariance(x, y, 13) * 4);
    const lean = (tileVariance(x, y, 14) - 0.5) * 4;

    if (kind === 0) {                                   // 箱堆：大小不一的木箱疊起來
      const count = 2 + Math.floor(tileVariance(x, y, 15) * 2);
      for (let i = 0; i < count; i++) {
        const w = 4 + tileVariance(x, y, 30 + i) * 5;
        const h = 3 + tileVariance(x, y, 40 + i) * 4;
        const ox = (tileVariance(x, y, 50 + i) - 0.5) * 14;
        const oy = (tileVariance(x, y, 60 + i) - 0.5) * 6;
        graphic.poly([
          sx + ox, sy + oy - h * 2,
          sx + ox + w + lean, sy + oy - h,
          sx + ox + lean, sy + oy,
          sx + ox - w, sy + oy - h,
        ]).fill({ color, alpha: 0.9 - i * 0.12 });
      }
    } else if (kind === 1) {                            // 陶罐：兩三個高矮不一的圓肚罐
      const count = 2 + Math.floor(tileVariance(x, y, 16) * 2);
      for (let i = 0; i < count; i++) {
        const r = 3 + tileVariance(x, y, 31 + i) * 2.5;
        const ox = (tileVariance(x, y, 51 + i) - 0.5) * 16;
        const tall = 4 + tileVariance(x, y, 61 + i) * 5;
        graphic
          .ellipse(sx + ox, sy - tall, r, r * 0.9).fill({ color, alpha: 0.92 })
          .rect(sx + ox - r * 0.35, sy - tall - r - 2, r * 0.7, 3).fill({ color, alpha: 0.75 });
      }
    } else if (kind === 2) {                            // 布捆：斜靠著的長條包裹
      const count = 2 + Math.floor(tileVariance(x, y, 17) * 2);
      for (let i = 0; i < count; i++) {
        const w = 9 + tileVariance(x, y, 32 + i) * 6;
        const h = 4 + tileVariance(x, y, 42 + i) * 3;
        const ox = (tileVariance(x, y, 52 + i) - 0.5) * 12;
        const oy = -i * (h - 1);
        graphic.roundRect(sx + ox - w / 2, sy + oy - h, w, h, h / 2)
          .fill({ color, alpha: 0.88 - i * 0.1 });
      }
    } else {                                            // 碎片：散落一地的小塊
      const count = 3 + Math.floor(tileVariance(x, y, 18) * 3);
      for (let i = 0; i < count; i++) {
        const r = 2 + tileVariance(x, y, 33 + i) * 2;
        const ox = (tileVariance(x, y, 53 + i) - 0.5) * 22;
        const oy = (tileVariance(x, y, 63 + i) - 0.5) * 10;
        graphic.poly([
          sx + ox, sy + oy - r,
          sx + ox + r, sy + oy,
          sx + ox, sy + oy + r * 0.6,
          sx + ox - r, sy + oy,
        ]).fill({ color, alpha: 0.85 });
      }
    }
    return graphic;
  }

  destroy(): void {
    for (const graphic of this.graphics) graphic.destroy();
    this.graphics = [];
  }
}
