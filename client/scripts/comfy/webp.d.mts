import type { RgbaImage } from './postprocess.mjs';

export const WEBP_QUALITY: number;
export function encodeWebp(img: RgbaImage, quality?: number): Buffer;
export function webpSize(bytes: Buffer): { width: number; height: number };
