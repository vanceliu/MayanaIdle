/**
 * 打包怪物美術圖集（`25-monster-system.md` § 25.2.2「載入」）。
 *
 *   node scripts/comfy/packMonsters.mjs
 *
 * 輸入：assets-src/monsters/<key>-<view>-full.png（未裁腿版）
 * 輸出：src/assets/monsters/batch-<NN>.webp（`webp.mjs`，需 cwebp）、batch-<NN>.json（產圖批次依清單順序編號）、index.json
 *   batch JSON：{ <key>: { front, side, back } }，各為 frame { x, y, w, h }
 *   index.json：{ <key>: { batch: "batch-<NN>", id: <產圖用的怪物 id> } }
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packAtlas } from './atlas.mjs';
import { MONSTER_JOBS } from './monsterJobs.mjs';
import { MONSTER_VIEWS } from './monsterPostprocess.mjs';
import { decodePng } from './postprocess.mjs';
import { encodeWebp } from './webp.mjs';

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(CLIENT, 'assets-src', 'monsters');
const OUT_DIR = join(CLIENT, 'src', 'assets', 'monsters');

/** 產圖批次 → 圖集名（依清單中第一次出現的順序） */
export function monsterBatches(jobs) {
  const groups = [...new Set(jobs.map(job => job.group))];
  return groups.map((group, i) => ({ name: `batch-${String(i).padStart(2, '0')}`, jobs: jobs.filter(job => job.group === group) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) if (/^batch-\d+\.(png|webp|json)$/.test(file)) rmSync(join(OUT_DIR, file));
  const index = {};
  for (const { name, jobs } of monsterBatches(MONSTER_JOBS)) {
    const entries = jobs.flatMap(job => MONSTER_VIEWS.map(view => ({
      name: `${job.key}:${view}`,
      image: decodePng(readFileSync(join(SRC_DIR, `${job.key}-${view}-full.png`))),
    })));
    const { image, frames } = packAtlas(entries);
    const manifest = {};
    for (const [frameName, frame] of Object.entries(frames)) {
      const [key, view] = frameName.split(':');
      (manifest[key] ??= {})[view] = frame;
    }
    for (const job of jobs) index[job.key] = { batch: name, id: job.id };
    writeFileSync(join(OUT_DIR, `${name}.webp`), encodeWebp(image));
    writeFileSync(join(OUT_DIR, `${name}.json`), `${JSON.stringify(manifest)}\n`);
    console.log(`${name}（${jobs[0].group}）：${image.width}×${image.height}，${jobs.length} 隻`);
  }
  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(index)}\n`);
}
