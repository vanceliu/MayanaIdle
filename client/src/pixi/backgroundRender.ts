import { Container, Graphics } from 'pixi.js';

/** 背景 render 代別（`38-map-control.md` § 38.9）：1＝第一代、2＝第二代 */
export type BackgroundRenderGeneration = 1 | 2;

export const BACKGROUND_RENDER_GENERATION: BackgroundRenderGeneration = 2;

/** 第二代背景 render 的外框與邊線樣式（`38-map-control.md` § 38.9） */
export interface Gen2Style {
  outlineColor: number;
  /** 背景物、怪物球體、Boss 角的外框粗細（px） */
  objectOutlineWidth: number;
  /** 怪物血條外框粗細（px） */
  hpBarOutlineWidth: number;
  /** 水／岩漿／深淵邊線粗細（px） */
  terrainEdgeWidth: number;
  terrainEdgeAlpha: number;
}

export const GEN2_STYLE: Readonly<Gen2Style> = {
  outlineColor: 0x000000,
  objectOutlineWidth: 1.5,
  hpBarOutlineWidth: 0.75,
  terrainEdgeWidth: 1.5,
  terrainEdgeAlpha: 0.6,
};

const OUTLINE_DIRECTIONS = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 8;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

/**
 * 外框：共用 `graphic` 的 GraphicsContext、塗成外框色的剪影往 8 方向各偏移 `width`。
 * 原圖重繪時外框跟著變；必須在原圖銷毀前先銷毀。
 */
export function createOutline(graphic: Graphics, width: number, color: number): Container {
  const outline = new Container();
  for (const [dx, dy] of OUTLINE_DIRECTIONS) {
    const silhouette = new Graphics(graphic.context);
    silhouette.tint = color;
    silhouette.position.set(graphic.x + dx * width, graphic.y + dy * width);
    outline.addChild(silhouette);
  }
  return outline;
}

/** 把外框插在 `graphic` 正下方（同一個父容器）；`graphic` 尚無父容器時不做事 */
export function outlineInPlace(graphic: Graphics, width: number, color: number): Container | null {
  const parent = graphic.parent;
  if (!parent) return null;
  const outline = createOutline(graphic, width, color);
  parent.addChildAt(outline, parent.getChildIndex(graphic));
  return outline;
}
