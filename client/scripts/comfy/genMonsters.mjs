/**
 * 以 ComfyUI 產出怪物三視圖（`25-monster-system.md` § 25.2.2）。
 *
 *   node scripts/comfy/genMonsters.mjs [--only <key>] [--reuse]
 *
 * --only   只處理清單中的指定項目
 * --reuse  不呼叫 ComfyUI，沿用 assets-src/ai-raw/monsters/ 既有原圖重跑後處理
 *
 * 人形底圖：assets-src/monster-bases/<key>.png（`demo/monster-base.html` 匯出）
 * 原圖：assets-src/ai-raw/monsters/<key>.png
 * 輸出：assets-src/monsters/<key>-<view>.png（裁腿）、<key>-<view>-full.png（未裁腿）；view = front／side／back，側面朝右
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runWorkflow, uploadImage, zImageWorkflow } from './comfyClient.mjs';
import { MONSTER_JOBS } from './monsterJobs.mjs';
import { MONSTER_RAW, MONSTER_VIEWS, processMonster } from './monsterPostprocess.mjs';
import { decodePng, encodePng } from './postprocess.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets-src');
const RAW_DIR = join(ROOT, 'ai-raw', 'monsters');
const BASE_DIR = join(ROOT, 'monster-bases');
const OUT_DIR = join(ROOT, 'monsters');

const { values } = parseArgs({
  options: { only: { type: 'string' }, reuse: { type: 'boolean', default: false } },
});
const jobs = MONSTER_JOBS.filter(job => !values.only || job.key === values.only);
if (jobs.length === 0) {
  console.error(`未知項目：${values.only}；可用：${MONSTER_JOBS.map(job => job.key).join(', ')}`);
  process.exit(1);
}

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

const failures = [];
for (const job of jobs) {
  const rawPath = join(RAW_DIR, `${job.key}.png`);
  const outputs = MONSTER_VIEWS.flatMap(view => [join(OUT_DIR, `${job.key}-${view}.png`), join(OUT_DIR, `${job.key}-${view}-full.png`)]);
  try {
    if (values.reuse) {
      if (!existsSync(rawPath)) throw new Error(`--reuse 找不到原圖：${rawPath}`);
    } else {
      let base;
      if (job.base) {
        const basePath = join(BASE_DIR, `${job.key}.png`);
        if (!existsSync(basePath)) throw new Error(`找不到底圖 ${basePath}，先用 demo/monster-base.html 匯出`);
        base = await uploadImage(readFileSync(basePath), `mayana-base-${job.key}.png`);
      }
      const [image] = await runWorkflow(zImageWorkflow({
        prompt: job.prompt, ...MONSTER_RAW, seed: job.seed, prefix: `mayana-monster-${job.key}`, image: base, denoise: job.denoise,
      }));
      write(rawPath, image);
    }
    const views = processMonster(decodePng(readFileSync(rawPath)), { legs: job.legs, sideFacesLeft: job.sideFacesLeft, enclosedTolerance: job.enclosedTolerance, legTrim: job.legTrim });
    for (const view of MONSTER_VIEWS) {
      write(join(OUT_DIR, `${job.key}-${view}.png`), encodePng(views[view].trimmed));
      write(join(OUT_DIR, `${job.key}-${view}-full.png`), encodePng(views[view].full));
    }
    console.log(`${job.id} ${job.key}：${MONSTER_VIEWS.map(view => `${views[view].trimmed.width}×${views[view].trimmed.height}`).join(' ')}`);
  } catch (error) {
    for (const path of outputs) rmSync(path, { force: true });
    failures.push(`${job.key}（seed ${job.seed}）：${error.message}`);
  }
}
if (failures.length > 0) {
  console.error(`失敗 ${failures.length} 項：\n${failures.join('\n')}`);
  process.exitCode = 1;
}
