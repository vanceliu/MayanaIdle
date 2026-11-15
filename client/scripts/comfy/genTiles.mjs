/**
 * 以 ComfyUI 產出地圖素材（`38-map-control.md` § 38.9「素材來源」）。
 *
 *   node scripts/comfy/genTiles.mjs <theme> [--only <name>] [--reuse]
 *
 * --only   只處理清單中的指定項目
 * --reuse  不呼叫 ComfyUI，沿用 assets-src/ai-raw/ 既有原圖重跑後處理
 *
 * 原圖：assets-src/ai-raw/<theme>/<name>_<n>.png
 * 材質：assets-src/ai-textures/<theme>-<name>.png（無縫，FLOOR_PERIOD 格一週期）
 * 物件：assets-src/tiles/object/<theme>-<name>_<n>.png（密度 ASSET_SCALE）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runWorkflow, zImageWorkflow } from './comfyClient.mjs';
import { decodePng, encodePng, processFloorTexture, processObject } from './postprocess.mjs';
import { TILE_JOBS } from './tileJobs.mjs';
import { ASSET_SCALE, RAW_SIZE } from './tileSpec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets-src');

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { only: { type: 'string' }, reuse: { type: 'boolean', default: false } },
});
const theme = positionals[0];
const jobs = TILE_JOBS[theme];
if (!jobs) {
  console.error(`未知主題：${theme ?? '(未指定)'}；可用：${Object.keys(TILE_JOBS).join(', ')}`);
  process.exit(1);
}

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

async function loadRaw(name, index, prompt, seed) {
  const path = join(ROOT, 'ai-raw', theme, `${name}_${index}.png`);
  if (values.reuse) {
    if (!existsSync(path)) throw new Error(`--reuse 找不到原圖：${path}`);
  } else {
    const [image] = await runWorkflow(zImageWorkflow({ prompt, width: RAW_SIZE, height: RAW_SIZE, seed, prefix: `mayana-${theme}-${name}` }));
    write(path, image);
  }
  return decodePng(readFileSync(path));
}

const failures = [];
for (const job of jobs) {
  if (values.only && job.name !== values.only) continue;
  if (job.kind === 'texture') {
    const texture = processFloorTexture(await loadRaw(job.name, 0, job.prompt, job.seed));
    write(join(ROOT, 'ai-textures', `${theme}-${job.name}.png`), encodePng(texture));
    console.log(`texture ${theme}-${job.name}：${texture.width}×${texture.height}`);
  } else {
    for (const [index, seed] of job.seeds.entries()) {
      const out = join(ROOT, 'tiles', 'object', `${theme}-${job.name}_${index}.png`);
      try {
        const sprite = processObject(await loadRaw(job.name, index, job.prompts?.[index] ?? job.prompt, seed), (job.maxWidths?.[index] ?? job.maxWidth) * ASSET_SCALE, { outline: job.outline });
        write(out, encodePng(sprite));
        console.log(`object ${theme}-${job.name}_${index}：${sprite.width}×${sprite.height}`);
      } catch (error) {
        rmSync(out, { force: true });
        failures.push(`${theme}-${job.name}_${index}（seed ${seed}）：${error.message}`);
      }
    }
  }
}
if (failures.length > 0) {
  console.error(`失敗 ${failures.length} 項：\n${failures.join('\n')}`);
  process.exitCode = 1;
}
