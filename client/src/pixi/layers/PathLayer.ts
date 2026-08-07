import { Container, Graphics } from 'pixi.js';
import type { MapData, Position } from '../../models/mapControl';
import { getRenderedElevation } from '../../models/mapControl';
import { getDepth, worldToScreen, TILE_W, TILE_H } from '../utils/isometric';

const PATH_COLOR = 0x4488ff;
const PATH_ALPHA = 0.4;
const PATH_DEPTH_OFFSET = 0.25;

export class PathLayer {
  public container = new Container();
  private markers: Graphics[] = [];
  private markerOwner: Container | null = null;
  /**
   * 以路徑**陣列本身**當快取鍵。`mapControlStore` 的 `currentPath` 一律整條換掉、
   * 不做原地修改，所以參照比對既精確又是 O(1) ——
   * 這支每幀都會被呼叫，逐點組字串等於每幀配置一條字串。
   */
  private renderedPath: Position[] | null = null;
  private renderedFrom = -1;

  updatePath(path: Position[], fromIndex: number, map: MapData, sortedContainer: Container): void {
    if (path === this.renderedPath && fromIndex === this.renderedFrom && sortedContainer === this.markerOwner) return;
    this.clear();
    this.renderedPath = path;
    this.renderedFrom = fromIndex;
    this.markerOwner = sortedContainer;

    const hw = TILE_W / 4;
    const hh = TILE_H / 4;

    for (let i = fromIndex; i < path.length; i++) {
      const elevation = getRenderedElevation(map, path[i]);
      const { sx, sy } = worldToScreen(path[i].x, path[i].y, elevation);
      const marker = new Graphics()
        .poly([
          sx, sy - hh,
          sx + hw, sy,
          sx, sy + hh,
          sx - hw, sy,
        ])
        .fill({ color: PATH_COLOR, alpha: PATH_ALPHA });
      marker.zIndex = getDepth(path[i], elevation) + PATH_DEPTH_OFFSET;
      this.markers.push(marker);
      sortedContainer.addChild(marker);
    }
  }

  clear(): void {
    for (const marker of this.markers) {
      this.markerOwner?.removeChild(marker);
      marker.destroy();
    }
    this.markers = [];
    this.markerOwner = null;
    this.renderedPath = null;
    this.renderedFrom = -1;
  }

  destroy(): void {
    this.clear();
    this.container.removeChildren();
  }
}
