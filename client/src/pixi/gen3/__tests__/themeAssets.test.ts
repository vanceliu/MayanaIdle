/** 第三代背景 render 主題圖集（`38-map-control.md` § 38.9「第三代實作限制」） */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { webpSize } from '../../../../scripts/comfy/webp.mjs';
import type { MapTheme } from '../../../models/mapControl';
import { MAP_THEME_PALETTES } from '../../mapThemes';
import { hasThemeAssets, type ThemeManifest } from '../themeAssets';

const DIR = join(__dirname, '../../../assets/map-gen3');
const themes = Object.keys(MAP_THEME_PALETTES) as MapTheme[];

describe('主題圖集', () => {
  it.each(themes)('%s：有圖集、地面材質，frame 都在圖內', theme => {
    expect(hasThemeAssets(theme)).toBe(true);
    const manifest = JSON.parse(readFileSync(join(DIR, `${theme}.json`), 'utf8')) as ThemeManifest;
    const atlas = webpSize(readFileSync(join(DIR, `${theme}.webp`)));
    expect(manifest.textures.ground).toMatchObject({ w: 256, h: 256 });
    const frames = [...Object.values(manifest.textures), ...Object.values(manifest.objects).flat()];
    for (const frame of frames) {
      expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.width);
      expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.height);
    }
  });
});
