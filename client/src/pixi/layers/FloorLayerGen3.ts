import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { drawFloorGrid } from '../floorGrid';
import type { FloorBounds, Raster } from '../gen3/floorBake';
import { createMapRenderPlan } from '../mapRenderPlan';
import { MAP_THEME_PALETTES } from '../mapThemes';
import { worldToScreen } from '../utils/isometric';

/** 烘焙地板切塊的邊長上限（px） */
export const FLOOR_CHUNK_SIZE = 2048;

/** 把點陣切成邊長 ≤ size 的塊（左上角座標與尺寸，單位 px） */
export function floorChunks(width: number, height: number, size = FLOOR_CHUNK_SIZE): { x: number; y: number; width: number; height: number }[] {
  const chunks = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) chunks.push({ x, y, width: Math.min(size, width - x), height: Math.min(size, height - y) });
  }
  return chunks;
}

function copyChunk(raster: Raster, chunk: { x: number; y: number; width: number; height: number }): Uint8Array {
  const out = new Uint8Array(chunk.width * chunk.height * 4);
  for (let row = 0; row < chunk.height; row++) {
    const start = ((chunk.y + row) * raster.width + chunk.x) * 4;
    out.set(raster.data.subarray(start, start + chunk.width * 4), row * chunk.width * 4);
  }
  return out;
}

/**
 * 第三代背景 render 的地板（`38-map-control.md` § 38.9）：烘焙點陣切塊成貼圖；
 * 烘焙完成前顯示主題 `ground` 底色。格線為獨立圖層，由設定切換顯示。
 */
export class FloorLayerGen3 {
  public container = new Container();
  private base = new Container();
  private grid: Graphics | null = null;
  private gridVisible = false;
  private chunkTextures: Texture[] = [];

  /** 底色＋格線（烘焙完成前） */
  showPlaceholder(mapData: MapData): void {
    this.clear();
    const palette = MAP_THEME_PALETTES[mapData.theme ?? 'grassland'];
    const right = mapData.width - 0.5, bottom = mapData.height - 0.5;
    const corners = [[-0.5, -0.5], [right, -0.5], [right, bottom], [-0.5, bottom]].flatMap(([x, y]) => {
      const { sx, sy } = worldToScreen(x, y);
      return [sx, sy];
    });
    this.base.addChild(new Graphics().poly(corners).fill({ color: palette.ground }));
    this.grid = drawFloorGrid(createMapRenderPlan(mapData), palette);
    this.grid.visible = this.gridVisible;
    this.container.addChild(this.base, this.grid);
  }

  /** 換上烘焙好的地板；scale = 點陣像素 ÷ 世界像素 */
  setBaked(raster: Raster, bounds: FloorBounds, scale: number): void {
    this.clearBase();
    for (const chunk of floorChunks(raster.width, raster.height)) {
      const texture = new Texture({ source: new BufferImageSource({ resource: copyChunk(raster, chunk), width: chunk.width, height: chunk.height }) });
      this.chunkTextures.push(texture);
      const sprite = new Sprite(texture);
      sprite.position.set(bounds.x + chunk.x / scale, bounds.y + chunk.y / scale);
      sprite.scale.set(1 / scale);
      this.base.addChild(sprite);
    }
  }

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    if (this.grid) this.grid.visible = visible;
  }

  private clearBase(): void {
    this.base.removeChildren().forEach(child => child.destroy());
    for (const texture of this.chunkTextures) texture.destroy(true);
    this.chunkTextures = [];
  }

  private clear(): void {
    this.clearBase();
    this.container.removeChildren();
    this.grid?.destroy();
    this.grid = null;
  }

  destroy(): void {
    this.clearBase();
    this.container.destroy({ children: true });
    this.grid = null;
  }
}
