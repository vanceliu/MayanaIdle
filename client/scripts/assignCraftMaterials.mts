/**
 * 製作材料分配（`06-equipment-acquire.md` § 6A.3）。
 *
 * - 每階有一組來源區域，同一區域所有樓層的材料合成一個材料池
 * - 配方依 id 排序後輪替區域：主區域取 N−1 種，鄰區（下一個區域）取 1 種，同配方不重複
 * - 同階內優先取使用次數最少的材料
 * - T6 每 3 份配方有 1 份的鄰區材料改取自補充區域（百柱塔 61~100F）
 * - 魔法書碎片每階最多 3 份配方
 *
 * 用法：cd client && npx vite-node scripts/assignCraftMaterials.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROP_TABLE_SEEDS } from '../src/db/seed/dropSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed/itemSeeds';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { CRAFT_SOURCE_REGIONS, CRAFT_SUPPLEMENT_REGION, type CraftRegion } from '../src/db/seed/craftSourceRegions';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 每份配方的材料需求量（由多到少，最後一項為鄰區材料） */
const AMOUNTS: Record<number, number[]> = { 4: [4, 3, 2], 5: [6, 5, 4, 3], 6: [8, 6, 5, 4] };
const MAGIC_BOOK_SHARD_ID = 127;
const MATERIAL_USAGE_LIMIT: Record<number, number> = { [MAGIC_BOOK_SHARD_ID]: 3 };

// ------------------------------------------------------------ 區域 → 材料

const items = ITEM_DEFINITIONS as { id: number; name: string; category: string }[];
const itemById = new Map(items.map(i => [i.id, i]));
const isCraftMaterial = (id: number) => {
  const it = itemById.get(id);
  return !!it && it.category === 'material' && !it.name.startsWith('魔法書材料');
};
const areaMaterials = new Map<string, number[]>();
for (const d of DROP_TABLE_SEEDS as { area?: string; itemTemplateId?: number }[]) {
  if (!d.area || d.itemTemplateId == null || !isCraftMaterial(d.itemTemplateId)) continue;
  const list = areaMaterials.get(d.area) ?? [];
  if (!list.includes(d.itemTemplateId)) list.push(d.itemTemplateId);
  areaMaterials.set(d.area, list);
}
const regionPool = (region: CraftRegion): number[] => {
  const pool: number[] = [];
  for (const area of region.areas) {
    const mats = areaMaterials.get(area);
    if (!mats) throw new Error(`${region.name} 的 ${area} 沒有可用材料`);
    for (const m of mats) if (!pool.includes(m)) pool.push(m);
  }
  return pool;
};

// ------------------------------------------------------------ 指派

function* combinations(pool: number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let j = start; j < pool.length; j++) yield* combinations(pool, k, j + 1, [...acc, pool[j]]);
}

interface Assignment { id: number; name: string; tier: number; region: string; mats: { itemId: number; amount: number }[] }
const assignments: Assignment[] = [];

for (const tier of [4, 5, 6]) {
  const regions = CRAFT_SOURCE_REGIONS[tier];
  const pools = regions.map(regionPool);
  const supplement = CRAFT_SUPPLEMENT_REGION[tier];
  const supplementPool = supplement ? regionPool(supplement.region) : undefined;
  const amounts = AMOUNTS[tier];
  const usage = new Map<number, number>();
  const used = (m: number) => usage.get(m) ?? 0;
  const capped = (m: number) => used(m) >= (MATERIAL_USAGE_LIMIT[m] ?? Infinity);

  const signatures = new Set<string>();
  const signature = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');

  /**
   * 候選＝主區域取 need 種的所有組合 × 鄰區 1 種。
   * 排序：未用過的材料組合優先 → 額滿材料少者優先 → 使用次數總和少者優先 → 依配方序號輪轉
   */
  const choose = (pool: number[], crossPool: number[], need: number, i: number) => {
    const candidates: number[][] = [];
    for (const combo of combinations(pool, need)) {
      for (const c of crossPool) if (!combo.includes(c)) candidates.push([...combo, c]);
    }
    if (candidates.length === 0) throw new Error(`T${tier} 第 ${i} 份湊不出材料`);
    const n = candidates.length;
    const scored = candidates.map((ids, k) => ({
      ids,
      dup: signatures.has(signature(ids)) ? 1 : 0,
      over: ids.filter(capped).length,
      sum: ids.reduce((s, m) => s + used(m), 0),
      turn: (k - (i * 7) % n + n) % n,
    }));
    scored.sort((a, b) => a.dup - b.dup || a.over - b.over || a.sum - b.sum || a.turn - b.turn);
    const best = scored[0].ids;
    const primary = best.slice(0, need).sort((a, b) => used(a) - used(b) || pool.indexOf(a) - pool.indexOf(b));
    return [...primary, best[need]];
  };

  const recipes = EQUIPMENT_SEEDS
    .filter(e => e.acquireType === 'craft' && e.tier === tier)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  recipes.forEach((e, i) => {
    const r = i % regions.length;
    const useSupplement = !!supplement && i % supplement.every === supplement.every - 1;
    const crossPool = useSupplement ? supplementPool! : pools[(r + 1) % regions.length];
    const ids = choose(pools[r], crossPool, amounts.length - 1, i);
    signatures.add(signature(ids));
    for (const m of ids) usage.set(m, used(m) + 1);
    assignments.push({
      id: e.id!, name: e.name, tier, region: regions[r].name,
      mats: ids.map((itemId, k) => ({ itemId, amount: amounts[k] })),
    });
  });
}

// ------------------------------------------------------------ 報告

const nameOf = (id: number) => itemById.get(id)?.name ?? `#${id}`;
console.log(`重新指派 ${assignments.length} 份配方的材料`);
for (const tier of [4, 5, 6]) {
  const list = assignments.filter(a => a.tier === tier);
  console.log(`\nT${tier}：${list.length} 份`);
  for (const region of CRAFT_SOURCE_REGIONS[tier]) {
    const n = list.filter(a => a.region === region.name).length;
    console.log(`  ${region.name.padEnd(14, '　')} ${n} 份　材料：${regionPool(region).map(nameOf).join('、')}`);
  }
  const usage = new Map<number, number>();
  for (const a of list) for (const m of a.mats) usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + 1);
  console.log(`  使用次數：${[...usage].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${nameOf(m)}${n}`).join(' ')}`);
  const signatures = new Set(list.map(a => a.mats.map(m => m.itemId).sort((x, y) => x - y).join(',')));
  console.log(`  不同材料組合：${signatures.size}/${list.length}`);
}
const usedIds = new Set(assignments.flatMap(a => a.mats.map(m => m.itemId)));
const orphans = [...areaMaterials.values()].flat().filter((m, k, arr) => arr.indexOf(m) === k && !usedIds.has(m));
console.log(`\n區域材料未進配方：${orphans.map(nameOf).join('、') || '無'}`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 寫回

const byId = new Map(assignments.map(a => [a.id, a]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const a = byId.get(Number(m[1]));
  if (!a) return line;
  const mats = `[${a.mats.map(x => `{ itemId: ${x.itemId}, amount: ${x.amount} }`).join(', ')}]`;
  const next = line.replace(/craftMaterials: \[[^\]]*\]/, `craftMaterials: ${mats}`);
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
