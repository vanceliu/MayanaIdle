import { Container } from 'pixi.js';
import type { TileVisualRole } from '../../models/mapControl';
import { GEN2_STYLE, createOutline, type Gen2Style } from '../backgroundRender';
import type { PlacedObject } from './WallLayer';

/** 外框合併成一整片的 role：相鄰方塊互相蓋掉彼此的外框，接縫不畫線 */
const MERGED_ROLES: readonly TileVisualRole[] = ['boundary', 'wall'];

/** 外框排在同深度所有物件之前；深度最小間距是高度差的 0.01 */
export const OUTLINE_DEPTH_BIAS = 0.001;

/**
 * 第二代背景 render 的背景物外框（`38-map-control.md` § 38.9）。
 *
 * 牆／邊界的外框放在 `mergedContainer`（地板之上、EntityLayer 之下）；
 * 其餘物件的外框放進 EntityLayer，深度比本體略小。
 * 外框共用物件圖形的 GraphicsContext，**`WallLayer` 重建或銷毀前必須先 `clear()`**。
 */
export class ObjectOutlineLayer {
  readonly mergedContainer = new Container();
  private sorted: Container[] = [];
  private readonly style: Readonly<Gen2Style>;

  constructor(style: Readonly<Gen2Style> = GEN2_STYLE) {
    this.style = style;
  }

  build(entityContainer: Container, objects: readonly PlacedObject[]): void {
    this.clear();
    const { objectOutlineWidth: width, outlineColor: color } = this.style;
    for (const { graphic, role } of objects) {
      const outline = createOutline(graphic, width, color);
      if (MERGED_ROLES.includes(role)) {
        this.mergedContainer.addChild(outline);
      } else {
        outline.zIndex = graphic.zIndex - OUTLINE_DEPTH_BIAS;
        entityContainer.addChild(outline);
        this.sorted.push(outline);
      }
    }
  }

  clear(): void {
    for (const outline of this.mergedContainer.removeChildren()) outline.destroy({ children: true });
    for (const outline of this.sorted) {
      outline.removeFromParent();
      outline.destroy({ children: true });
    }
    this.sorted = [];
  }

  destroy(): void {
    this.clear();
    this.mergedContainer.destroy();
  }
}
