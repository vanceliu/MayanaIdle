/**
 * 武器 seed 產生器 —— 依 `src/db/seed/weaponSeedSpec.ts` 的規格重寫 `equipmentSeeds.ts` 的武器區塊。
 *
 * 規格（件數、走向、職業上限、素質錨點）改在 `weaponSeedSpec.ts`；`buyPrice` 與 `craftMaterials` 依名稱沿用 seed。
 * 盾牌／魔導書／臂甲是防具，不經本腳本。
 *
 * 流程：改規格 → 跑本腳本 → 有新武器時跑 `repriceShopGear.mts --write`（T2／T3 售價）、
 * 為新製作品補 `craftMaterials` → 跑 `generateWeaponDocs.mts` → 跑 TTK 驗收。
 *
 * 用法：cd client && npx vite-node scripts/generateWeaponSeeds.mts --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { buildWeaponSeeds, WEAPON_SPEC_TYPES } from '../src/db/seed/weaponSeedSpec';

const SEED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

const HEADER = [
  '  // ============ 武器（由 scripts/generateWeaponSeeds.mts 依',
  '  // src/db/seed/weaponSeedSpec.ts 產生，勿手改）============',
];
/** 歷次產生器寫入的標頭，重寫時一併清除 */
const STALE_HEADER = /^\s*\/\/ (============ 武器(與副手)?（由 scripts\/generateWeaponSeeds\.mts 依|(docs\/design\/06-equipment-requirement\.md|src\/db\/seed\/weaponSeedSpec\.ts) 產生，勿手改）============)$/;

function literal(v: unknown): string {
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (v && typeof v === 'object') {
    const body = Object.entries(v).map(([k, x]) => `${k}: ${literal(x)}`).join(', ');
    return body ? `{ ${body} }` : '{}';
  }
  return String(v);
}

const weapons = buildWeaponSeeds(EQUIPMENT_SEEDS);
const rows = weapons.map(w => `  ${literal(w)},`);

const kept: string[] = [];
let inserted = false;
for (const ln of readFileSync(SEED_FILE, 'utf-8').split('\n')) {
  if (STALE_HEADER.test(ln)) continue;
  const m = /name: '[^']*', type: '([^']*)'/.exec(ln);
  if (m && WEAPON_SPEC_TYPES.has(m[1])) {
    if (!inserted) {
      inserted = true;
      kept.push(...HEADER, ...rows);
    }
    continue;
  }
  kept.push(ln);
}
if (!inserted) throw new Error('equipmentSeeds.ts 找不到武器區塊');

const before = EQUIPMENT_SEEDS.filter(e => WEAPON_SPEC_TYPES.has(e.type)).length;
console.log(`產生武器 ${weapons.length} 把（原 ${before} 把）`);
if (WRITE) { writeFileSync(SEED_FILE, kept.join('\n'), 'utf-8'); console.log('已寫入 equipmentSeeds.ts'); }
else console.log('（未寫入，加 --write）');
