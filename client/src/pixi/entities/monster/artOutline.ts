/**
 * 怪物 AI 美術的外框（`25-monster-system.md` § 25.2.2）：素材不含外框，
 * 顯示時依最終縮放重新取樣，再畫固定世界像素寬的外框，大小怪的外框粗細一致。
 */

/** 外框貼圖相對世界像素的取樣倍率（涵蓋畫面縮放與高 DPI） */
export const ART_OVERSAMPLE = 4;

/** 外框顏色（同素材後處理的外框色） */
export const ART_OUTLINE_COLOR = '#141414';

export interface OutlinedArtLayout {
  /** 貼圖尺寸（畫素） */
  width: number;
  height: number;
  /** 原圖在貼圖中的尺寸（畫素），左上角在 (pad, pad) */
  imageWidth: number;
  imageHeight: number;
  /** 外框寬（畫素），貼圖四周各留 pad */
  pad: number;
  /** sprite 錨點：腳底中央對齊原圖底緣 */
  anchorX: number;
  anchorY: number;
  /** sprite 縮放：世界像素／貼圖畫素 */
  spriteScale: number;
}

/** 原圖 source 以 scale 顯示、外框 outlinePx 世界像素時的貼圖版面 */
export function outlinedArtLayout(source: { width: number; height: number }, scale: number, outlinePx: number, oversample = ART_OVERSAMPLE): OutlinedArtLayout {
  const imageWidth = Math.max(1, Math.round(source.width * scale * oversample));
  const imageHeight = Math.max(1, Math.round(source.height * scale * oversample));
  const pad = Math.ceil(Math.max(0, outlinePx) * oversample);
  const height = imageHeight + pad * 2;
  return {
    width: imageWidth + pad * 2,
    height,
    imageWidth,
    imageHeight,
    pad,
    anchorX: 0.5,
    anchorY: (pad + imageHeight) / height,
    spriteScale: 1 / oversample,
  };
}

/** 膨脹出外框用的剪影位移：半徑 1…radius 每圈取足夠的方向，最外圈落在 radius 上 */
export function outlineOffsets(radius: number): { x: number; y: number }[] {
  const offsets: { x: number; y: number }[] = [];
  for (let ring = 1; ring <= Math.ceil(radius); ring++) {
    const r = Math.min(ring, radius);
    const steps = Math.max(8, Math.ceil(2 * Math.PI * r));
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      offsets.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
  }
  return offsets;
}

/** drawImage 與合成模式所需的最小 2D 介面 */
export interface OutlineContext {
  globalCompositeOperation: string;
  fillStyle: unknown;
  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** 在 silhouetteCtx（尺寸同 layout 原圖）畫出 image 的單色剪影 */
export function paintSilhouette(silhouetteCtx: OutlineContext, image: CanvasImageSource, layout: OutlinedArtLayout, color = ART_OUTLINE_COLOR): void {
  silhouetteCtx.drawImage(image, 0, 0, layout.imageWidth, layout.imageHeight);
  silhouetteCtx.globalCompositeOperation = 'source-in';
  silhouetteCtx.fillStyle = color;
  silhouetteCtx.fillRect(0, 0, layout.imageWidth, layout.imageHeight);
  silhouetteCtx.globalCompositeOperation = 'source-over';
}

/** 在 targetCtx（尺寸同 layout）畫外框（剪影依位移膨脹）再疊原圖 */
export function paintOutlinedArt(targetCtx: OutlineContext, image: CanvasImageSource, silhouette: CanvasImageSource, layout: OutlinedArtLayout): void {
  const { pad, imageWidth, imageHeight } = layout;
  for (const { x, y } of outlineOffsets(pad)) targetCtx.drawImage(silhouette, pad + x, pad + y, imageWidth, imageHeight);
  targetCtx.drawImage(image, pad, pad, imageWidth, imageHeight);
}

/** 可取得 2D context 的畫布（瀏覽器為 HTMLCanvasElement） */
export interface OutlineCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): OutlineContext | null;
}

/** 依 layout 烤出含外框的畫布：先畫剪影，再膨脹成外框、疊原圖 */
export function bakeOutlinedCanvas<C extends OutlineCanvas>(image: CanvasImageSource, layout: OutlinedArtLayout, createCanvas: () => C, color = ART_OUTLINE_COLOR): C {
  const silhouette = createCanvas();
  silhouette.width = layout.imageWidth;
  silhouette.height = layout.imageHeight;
  paintSilhouette(silhouette.getContext('2d')!, image, layout, color);
  const target = createCanvas();
  target.width = layout.width;
  target.height = layout.height;
  paintOutlinedArt(target.getContext('2d')!, image, silhouette as unknown as CanvasImageSource, layout);
  return target;
}
