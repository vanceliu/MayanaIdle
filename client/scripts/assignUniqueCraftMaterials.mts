/**
 * 獨特配方分配（`06-equipment-acquire.md` § 6A.3.1「獨特配方分配規則」）。
 * 規則實作在 `src/models/uniqueCraft.ts` 的 `assignUniqueCraftMaterials`，本腳本只負責報告與寫回 seed。
 *
 * 用法：cd client && npx vite-node scripts/assignUniqueCraftMaterials.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_DEFINITIONS } from '../src/db/seed/itemSeeds';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { UNIQUE_CRAFT_TIERS, assignUniqueCraftMaterials } from '../src/models/uniqueCraft';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

const nameOf = (id: number) => ITEM_DEFINITIONS.find(i => i.id === id)?.name ?? `#${id}`;
const assignments = assignUniqueCraftMaterials(EQUIPMENT_SEEDS);
const tierOf = new Map(EQUIPMENT_SEEDS.map(e => [e.id!, e.tier]));

console.log(`指派 ${assignments.size} 份獨特配方`);
for (const tier of UNIQUE_CRAFT_TIERS) {
  const list = [...assignments].filter(([id]) => tierOf.get(id) === tier).map(([, mats]) => mats);
  const usage = new Map<number, number>();
  for (const mats of list) for (const m of mats) usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + 1);
  const signatures = new Set(list.map(mats => mats.map(m => m.itemId).sort((a, b) => a - b).join(',')));
  console.log(`\nT${tier}：${list.length} 份，不同材料組合 ${signatures.size}/${list.length}`);
  console.log(`  使用次數：${[...usage].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${nameOf(m)}${n}`).join(' ')}`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const mats = assignments.get(Number(m[1]));
  if (!mats) return line;
  const literal = `uniqueCraftMaterials: [${mats.map(x => `{ itemId: ${x.itemId}, amount: ${x.amount} }`).join(', ')}]`;
  const next = /uniqueCraftMaterials: \[[^\]]*\]/.test(line)
    ? line.replace(/uniqueCraftMaterials: \[[^\]]*\]/, literal)
    : line.replace(/(craftMaterials: \[[^\]]*\])/, `$1, ${literal}`);
  if (next === line && !line.includes(literal)) throw new Error(`id ${m[1]} 找不到 craftMaterials 可接`);
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
