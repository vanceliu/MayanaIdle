import { Container, Graphics } from 'pixi.js';
import type { MapData, TileVisualRole } from '../../models/mapControl';
import { GEN2_STYLE, type Gen2Style } from '../backgroundRender';
import { createMapRenderPlan, type TerrainDrawItem } from '../mapRenderPlan';
import { MAP_THEME_PALETTES, type MapThemePalette } from '../mapThemes';
import { traceTerrainOutlines } from '../terrainOutline';
import { LEVEL_HEIGHT, TILE_H, TILE_W, worldToScreen } from '../utils/isometric';

/** 第二代背景 render 的特殊地形色槽；其餘 role 一律用 `ground` */
const SURFACE_SLOTS: Partial<Record<TileVisualRole, keyof MapThemePalette>> = {
  water: 'water',
  lava: 'lava',
  chasm: 'chasm',
  grass: 'grass',
  sand: 'sand',
  carpet: 'carpet',
};

function diamond(sx: number, sy: number): number[] {
  return [sx, sy - TILE_H / 2, sx + TILE_W / 2, sy, sx, sy + TILE_H / 2, sx - TILE_W / 2, sy];
}

function worldPoints(points: { x: number; y: number }[]): number[] {
  return points.flatMap(p => {
    const { sx, sy } = worldToScreen(p.x, p.y);
    return [sx, sy];
  });
}

/**
 * 第二代背景 render 的地板（`38-map-control.md` § 38.9）：單色地面、特殊地形各自色、
 * 水／岩漿／深淵整圈邊線；格線為獨立圖層，由設定切換顯示。
 */
export class FloorLayerGen2 {
  public container = new Container();
  private grid: Graphics | null = null;
  private gridVisible = false;
  private readonly style: Readonly<Gen2Style>;

  constructor(style: Readonly<Gen2Style> = GEN2_STYLE) {
    this.style = style;
  }

  buildFromMap(mapData: MapData): void {
    this.container.removeChildren().forEach(child => child.destroy());
    const palette = MAP_THEME_PALETTES[mapData.theme ?? 'grassland'];
    const plan = createMapRenderPlan(mapData);

    this.container.addChild(
      this.drawSurfaces(mapData, plan, palette),
      this.grid = this.drawGrid(plan, palette),
      this.drawTerrainEdges(mapData),
    );
    this.grid.visible = this.gridVisible;
  }

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    if (this.grid) this.grid.visible = visible;
  }

  private drawSurfaces(mapData: MapData, plan: TerrainDrawItem[], palette: MapThemePalette): Graphics {
    const graphics = new Graphics();
    const right = mapData.width - 0.5;
    const bottom = mapData.height - 0.5;
    graphics.poly(worldPoints([
      { x: -0.5, y: -0.5 }, { x: right, y: -0.5 }, { x: right, y: bottom }, { x: -0.5, y: bottom },
    ])).fill({ color: palette.ground });

    for (const item of plan) {
      if (item.role === 'boundary' || item.role === 'wall') continue;
      const slot = SURFACE_SLOTS[item.role];
      if (slot === undefined && item.elevation === 0) continue;
      const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
      graphics.poly(diamond(sx, sy)).fill({ color: slot ? palette[slot] : palette.ground });
      if (item.drawSouthFace) {
        graphics.poly([
          sx - TILE_W / 2, sy, sx, sy + TILE_H / 2,
          sx, sy + TILE_H / 2 + LEVEL_HEIGHT, sx - TILE_W / 2, sy + LEVEL_HEIGHT,
        ]).fill({ color: palette.boundaryLeft });
      }
      if (item.drawEastFace) {
        graphics.poly([
          sx + TILE_W / 2, sy, sx, sy + TILE_H / 2,
          sx, sy + TILE_H / 2 + LEVEL_HEIGHT, sx + TILE_W / 2, sy + LEVEL_HEIGHT,
        ]).fill({ color: palette.boundaryRight });
      }
    }
    return graphics;
  }

  private drawGrid(plan: TerrainDrawItem[], palette: MapThemePalette): Graphics {
    const graphics = new Graphics();
    for (const item of plan) {
      if (item.role === 'boundary' || item.role === 'wall') continue;
      const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
      graphics.poly(diamond(sx, sy)).stroke({ color: palette.grid, width: 0.5, alpha: 0.35 });
    }
    return graphics;
  }

  private drawTerrainEdges(mapData: MapData): Graphics {
    const graphics = new Graphics();
    for (const loop of traceTerrainOutlines(mapData)) {
      graphics.poly(worldPoints(loop), true);
    }
    return graphics.stroke({
      color: this.style.outlineColor,
      width: this.style.terrainEdgeWidth,
      alpha: this.style.terrainEdgeAlpha,
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.grid = null;
  }
}
