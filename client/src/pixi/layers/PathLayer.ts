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
  private renderKey = '';

  updatePath(path: Position[], fromIndex: number, map: MapData, sortedContainer: Container): void {
    const renderKey = `${fromIndex}:${path.map(point => `${point.x},${point.y}`).join('|')}`;
    if (renderKey === this.renderKey && sortedContainer === this.markerOwner) return;
    this.clear();
    this.renderKey = renderKey;
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
    this.renderKey = '';
  }

  destroy(): void {
    this.clear();
    this.container.removeChildren();
  }
}
