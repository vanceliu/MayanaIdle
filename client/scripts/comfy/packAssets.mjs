/**
 * 打包第三代背景 render 的主題圖集（`38-map-control.md` § 38.9「第三代實作限制」）。
 *
 *   node scripts/comfy/packAssets.mjs [theme...]
 *
 * 輸入：assets-src/ai-textures/<theme>-<name>.png、assets-src/tiles/object/<theme>-<name>_<n>.png
 * 輸出：src/assets/map-gen3/<theme>.webp（`webp.mjs`，需 cwebp）、<theme>.json
 *   JSON：{ "textures": { <name>: frame }, "objects": { <name>: [frame, ...] } }，frame = { x, y, w, h }
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packAtlas } from './atlas.mjs';
import { decodePng } from './postprocess.mjs';
import { encodeWebp } from './webp.mjs';
import { TILE_JOBS } from './tileJobs.mjs';

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXTURE_DIR = join(CLIENT, 'assets-src', 'ai-textures');
const OBJECT_DIR = join(CLIENT, 'assets-src', 'tiles', 'object');
const OUT_DIR = join(CLIENT, 'src', 'assets', 'map-gen3');

const themes = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(TILE_JOBS);
const unknown = themes.filter(theme => !TILE_JOBS[theme]);
if (unknown.length > 0) {
  console.error(`未知主題：${unknown.join(', ')}；可用：${Object.keys(TILE_JOBS).join(', ')}`);
  process.exit(1);
}

const textureFiles = readdirSync(TEXTURE_DIR);
const objectFiles = readdirSync(OBJECT_DIR);
mkdirSync(OUT_DIR, { recursive: true });

for (const theme of themes) {
  const prefix = `${theme}-`;
  const textures = textureFiles.filter(f => f.startsWith(prefix) && f.endsWith('.png'))
    .map(f => ({ name: `texture:${f.slice(prefix.length, -4)}`, image: decodePng(readFileSync(join(TEXTURE_DIR, f))) }));
  const objects = objectFiles.filter(f => f.startsWith(prefix) && /_\d+\.png$/.test(f))
    .map(f => ({ name: `object:${f.slice(prefix.length, -4)}`, image: decodePng(readFileSync(join(OBJECT_DIR, f))) }));
  const { image, frames } = packAtlas([...textures, ...objects]);

  const manifest = { textures: {}, objects: {} };
  for (const [key, frame] of Object.entries(frames)) {
    const [kind, id] = key.split(':');
    if (kind === 'texture') {
      manifest.textures[id] = frame;
    } else {
      const [, name, index] = id.match(/^(.*)_(\d+)$/);
      (manifest.objects[name] ??= [])[Number(index)] = frame;
    }
  }
  rmSync(join(OUT_DIR, `${theme}.png`), { force: true });
  writeFileSync(join(OUT_DIR, `${theme}.webp`), encodeWebp(image));
  writeFileSync(join(OUT_DIR, `${theme}.json`), `${JSON.stringify(manifest)}\n`);
  console.log(`${theme}：${image.width}×${image.height}，材質 ${textures.length}、物件 ${objects.length}`);
}
