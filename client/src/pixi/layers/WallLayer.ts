import { Container, Graphics } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { createMapRenderPlan } from '../mapRenderPlan';
import { MAP_THEME_PALETTES } from '../mapThemes';
import { TILE_W, TILE_H, WALL_HEIGHT, getDepth, worldToScreen } from '../utils/isometric';

export class WallLayer {
  private graphics: Graphics[] = [];

  buildInto(container: Container, mapData: MapData): void {
    this.removeFrom(container);
    const palette = MAP_THEME_PALETTES[mapData.theme ?? 'grassland'];
    for (const item of createMapRenderPlan(mapData)) {
      if (!['boundary', 'wall', 'tree', 'rock', 'pillar', 'decoration'].includes(item.role)) continue;
      const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
      let graphic: Graphics;
      switch (item.role) {
        case 'decoration':
          graphic = this.drawDecoration(sx, sy, palette.decoration);
          break;
        case 'tree':
          graphic = this.drawTree(sx, sy, palette.decoration, palette.boundaryRight);
          break;
        case 'rock':
          graphic = this.drawRock(sx, sy, palette.obstacle, palette.boundaryLeft);
          break;
        case 'pillar':
          graphic = this.drawPillar(sx, sy, palette.obstacle, palette.boundaryLeft);
          break;
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

  private drawTree(sx: number, sy: number, foliage: number, trunk: number): Graphics {
    return new Graphics()
      .rect(sx - 4, sy - 24, 8, 24).fill({ color: trunk })
      .circle(sx, sy - 34, 15).fill({ color: foliage })
      .circle(sx - 10, sy - 28, 10).fill({ color: foliage, alpha: 0.9 })
      .circle(sx + 10, sy - 28, 10).fill({ color: foliage, alpha: 0.9 });
  }

  private drawRock(sx: number, sy: number, top: number, side: number): Graphics {
    return new Graphics()
      .poly([sx - 16, sy - 4, sx - 8, sy - 18, sx + 10, sy - 20, sx + 17, sy - 4, sx + 8, sy + 4, sx - 10, sy + 4])
      .fill({ color: top })
      .poly([sx - 16, sy - 4, sx + 8, sy + 4, sx - 10, sy + 4]).fill({ color: side });
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

  private drawDecoration(sx: number, sy: number, color: number): Graphics {
    return new Graphics().circle(sx, sy - 5, 5).fill({ color, alpha: 0.9 }).circle(sx + 4, sy - 2, 3).fill({ color, alpha: 0.75 });
  }

  destroy(): void {
    for (const graphic of this.graphics) graphic.destroy();
    this.graphics = [];
  }
}
