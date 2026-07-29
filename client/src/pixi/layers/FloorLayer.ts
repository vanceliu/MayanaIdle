import { Container, Graphics } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { createMapRenderPlan, type TerrainDrawItem } from '../mapRenderPlan';
import { MAP_THEME_PALETTES } from '../mapThemes';
import { LEVEL_HEIGHT, TILE_H, TILE_W, worldToScreen } from '../utils/isometric';

export class FloorLayer {
  public container = new Container();
  private terrainGraphics: Graphics[] = [];

  buildFromMap(mapData: MapData, worldContainer?: Container): void {
    this.container.removeChildren().forEach(child => child.destroy());
    this.removeTerrainGraphics(worldContainer);
    const baseGraphics = new Graphics();
    const palette = MAP_THEME_PALETTES[mapData.theme ?? 'grassland'];

    for (const item of createMapRenderPlan(mapData)) {
      if (item.role === 'boundary' || item.role === 'wall') continue;

      this.drawSurface(baseGraphics, item, palette);
      this.drawVerticalFaces(baseGraphics, item, palette);
    }
    this.container.addChild(baseGraphics);
  }

  private drawSurface(
    graphics: Graphics,
    item: TerrainDrawItem,
    palette: typeof MAP_THEME_PALETTES[keyof typeof MAP_THEME_PALETTES],
  ): void {
    const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
    let color: number;

    switch (item.role) {
      case 'water':
        color = palette.water;
        break;
      case 'lava':
        color = palette.lava;
        break;
      case 'chasm':
        color = palette.chasm;
        break;
      case 'grass':
        color = palette.grass;
        break;
      case 'sand':
        color = palette.sand;
        break;
      case 'carpet':
        color = palette.carpet;
        break;
      default:
        color = (item.x + item.y) % 2 === 0 ? palette.ground : palette.groundAlt;
        break;
    }

    graphics.poly([
      sx, sy - TILE_H / 2, sx + TILE_W / 2, sy,
      sx, sy + TILE_H / 2, sx - TILE_W / 2, sy,
    ]).fill({ color }).stroke({ color: palette.grid, width: 0.5, alpha: 0.35 });
  }

  private drawVerticalFaces(
    graphics: Graphics,
    item: TerrainDrawItem,
    palette: typeof MAP_THEME_PALETTES[keyof typeof MAP_THEME_PALETTES],
  ): void {
    const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
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

  private removeTerrainGraphics(worldContainer?: Container): void {
    for (const graphic of this.terrainGraphics) {
      worldContainer?.removeChild(graphic);
      graphic.destroy();
    }
    this.terrainGraphics = [];
  }

  destroy(): void {
    this.container.removeChildren().forEach(child => child.destroy());
    for (const graphic of this.terrainGraphics) graphic.destroy();
    this.terrainGraphics = [];
  }
}
