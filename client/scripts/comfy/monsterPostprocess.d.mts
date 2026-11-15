import type { RgbaImage } from './postprocess.mjs';

export type MonsterView = 'front' | 'side' | 'back';

export const MONSTER_VIEWS: MonsterView[];
export const MONSTER_RAW: { width: number; height: number };
export const LEG_BODY_COVERAGE: number;
export const LEG_STUB: number;
export const MONSTER_MAX_HEIGHT: number;
export function splitViews(img: RgbaImage): RgbaImage[];
export function bodyBottom(img: RgbaImage, coverage?: number, options?: { region?: number }): number;
export function trimLegs(img: RgbaImage, options?: { coverage?: number; stub?: number; region?: number }): RgbaImage;
export function mirror(img: RgbaImage): RgbaImage;
export function processMonster(
  raw: RgbaImage,
  options?: { legs?: 'trim' | 'keep'; sideFacesLeft?: boolean; maxHeight?: number; enclosedTolerance?: number; legTrim?: { region?: number; coverage?: number } },
): Record<MonsterView, { full: RgbaImage; trimmed: RgbaImage }>;
