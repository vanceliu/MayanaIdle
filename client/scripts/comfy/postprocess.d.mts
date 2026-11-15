/** RGBA8888 影像，與 pngjs 相同格式 */
export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

export function createImage(width: number, height: number): RgbaImage;
export function decodePng(buffer: Buffer): RgbaImage;
export function encodePng(img: RgbaImage): Buffer;
export function boxDownscale(img: RgbaImage, width: number, height: number): RgbaImage;
export function makeSeamless(img: RgbaImage): RgbaImage;
export function keyOutBackground(img: RgbaImage, tolerance?: number, enclosedTolerance?: number): RgbaImage;
export const TEXTURE_BORDER_CROP: number;
export function crop(img: RgbaImage, x: number, y: number, width: number, height: number): RgbaImage;
export function cropToContent(img: RgbaImage): RgbaImage;
export const SPECK_RATIO: number;
export function removeSpecks(img: RgbaImage): RgbaImage;
export const OUTLINE: { width: number; color: number[] };
export function smoothMask(img: RgbaImage): RgbaImage;
export function addOutline(source: RgbaImage): RgbaImage;
export function processObject(raw: RgbaImage, maxWidth: number, options?: { outline?: boolean }): RgbaImage;
export function processFloorTexture(raw: RgbaImage): RgbaImage;
