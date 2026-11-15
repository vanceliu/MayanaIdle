import type { RgbaImage } from './postprocess.mjs';

export interface AtlasFrame { x: number; y: number; w: number; h: number }

export const ATLAS_WIDTH: number;
export const ATLAS_PADDING: number;
export function packAtlas(
  entries: { name: string; image: RgbaImage }[],
  options?: { width?: number; padding?: number },
): { image: RgbaImage; frames: Record<string, AtlasFrame> };
