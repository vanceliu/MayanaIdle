/**
 * 製作材料重新分配（§ 6A.3）。
 *
 * 四條規則：
 * 1. **試煉高地（Lv.21）才開始有製作材料** —— 新手區（曙光草原～迷霧沼澤）的材料
 *    是純賣錢的雜物，不進配方，否則前期撿到的東西全是「以後要用的」而不是「現在能賣的」。
 * 2. **一份配方的材料盡量集中在同一個區域**，玩家不必為了一把武器跑遍全地圖。
 * 3. **允許少量跨區**：每份配方有一種材料來自同階的另一個區域，避免單一區域被刷爆。
 * 4. **材料平均分配、可重複利用**：配方以輪替方式指派區域，讓每個區域的材料
 *    被差不多數量的配方使用。
 *
 * 階級對應的區域帶：
 * - T4（中階）→ Lv.21~34 的野外（試煉高地、雪原、妖魔森林、鏡之森、龍之谷地表）
 * - T5（中階頂）→ Lv.40 以上的野外與副本（古戰場、百柱塔、迷霧洞窟、水底監獄、龍之谷）
 *
 * 用法：cd client && npx vite-node scripts/assignCraftMaterials.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../src/db/seed/dropSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed/itemSeeds';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 每個階級的材料來源區域，順序即為配方輪替的順序 */
const TIER_AREAS: Record<number, string[]> = {
  4: [
    'trial-highlands', 'trial-highlands-top', 'snow-field', 'demon-forest',
    'mirror-forest', 'dragon-valley-surface', 'snow-field-deep',
  ],
  5: [
    'ancient-battlefield',
    'hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f',
    'hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f',
    'misty-cave-1f', 'misty-cave-2f', 'misty-cave-3f',
    'underwater-prison-1f', 'underwater-prison-2f', 'underwater-prison-3f', 'underwater-prison-4f',
    'dragon-valley-1f', 'dragon-valley-2f', 'dragon-valley-3f', 'dragon-valley-4f', 'dragon-valley-5f',
    'ivory-tower-1f', 'ivory-tower-2f', 'ivory-tower-3f', 'ivory-tower-4f', 'ivory-tower-5f',
  ],
};
/** 每份配方的材料需求量（由多到少） */
const AMOUNTS: Record<number, number[]> = { 4: [4, 3, 2], 5: [6, 5, 4, 3] };

/**
 * 不進配方的材料：魔法書材料是魔法書系統專用（`08-magicbook.md`）。
 * 印記已改歸 `scroll`，本來就不在 `category === 'material'` 的篩選裡，不需另外排除。
 */
const EXCLUDED = (name: string) => name.startsWith('魔法書材料');

// ------------------------------------------------------------ 區域 → 材料

const itemById = new Map((ITEM_DEFINITIONS as { id: number; name: string; category: string }[])
  .map(i => [i.id, i]));
const areaMaterials = new Map<string, string[]>();
for (const d of [...DROP_TABLE_SEEDS, ...BOSS_DROP_TABLE_SEEDS] as { area?: string; itemTemplateId?: number }[]) {
  const it = d.itemTemplateId != null ? itemById.get(d.itemTemplateId) : undefined;
  if (!it || it.category !== 'material' || EXCLUDED(it.name) || !d.area) continue;
  const list = areaMaterials.get(d.area) ?? [];
  if (!list.includes(it.name)) list.push(it.name);
  areaMaterials.set(d.area, list);
}

for (const [tier, areas] of Object.entries(TIER_AREAS)) {
  for (const a of areas) {
    const n = areaMaterials.get(a)?.length ?? 0;
    if (n < 2) throw new Error(`T${tier} 的 ${a} 只有 ${n} 種材料，湊不出配方`);
  }
}

// ------------------------------------------------------------ 指派

interface Assignment { id: number; name: string; tier: number; area: string; mats: { name: string; amount: number }[] }
const assignments: Assignment[] = [];
const usage = new Map<string, number>();

// 同階的配方依 id 排序後輪替區域，讓每個區域分到的配方數接近
for (const tier of [4, 5]) {
  const areas = TIER_AREAS[tier];
  const recipes = EQUIPMENT_SEEDS
    .filter(e => e.acquireType === 'craft' && e.tier === tier)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  recipes.forEach((e, i) => {
    const primary = areas[i % areas.length];
    // 跨區的那一份取「下一個區域」，讓相鄰區域彼此有交集
    const neighbour = areas[(i + 1) % areas.length];
    const amounts = AMOUNTS[tier];

    const pool = areaMaterials.get(primary)!;
    const mats: { name: string; amount: number }[] = [];
    // 主區域取 amounts.length - 1 種，起點隨配方序號位移，避免同區域的配方長一樣
    for (let k = 0; k < amounts.length - 1; k++) {
      mats.push({ name: pool[(i + k) % pool.length], amount: amounts[k] });
    }
    const cross = areaMaterials.get(neighbour)!;
    const crossName = cross.find(m => !mats.some(x => x.name === m)) ?? cross[0];
    mats.push({ name: crossName, amount: amounts[amounts.length - 1] });

    for (const m of mats) usage.set(m.name, (usage.get(m.name) ?? 0) + 1);
    assignments.push({ id: e.id!, name: e.name, tier, area: primary, mats });
  });
}

// ------------------------------------------------------------ 報告

console.log(`重新指派 ${assignments.length} 份配方的材料`);
for (const tier of [4, 5]) {
  const list = assignments.filter(a => a.tier === tier);
  console.log(`\nT${tier}：${list.length} 份，分佈於 ${TIER_AREAS[tier].length} 個區域`);
  for (const area of TIER_AREAS[tier]) {
    const n = list.filter(a => a.area === area).length;
    console.log(`  ${area.padEnd(24)} ${n} 份　材料：${areaMaterials.get(area)!.join('、')}`);
  }
}

const usedNames = new Set(assignments.flatMap(a => a.mats.map(m => m.name)));
const allMats = (ITEM_DEFINITIONS as { name: string; category: string }[])
  .filter(i => i.category === 'material' && !EXCLUDED(i.name)).map(i => i.name);
console.log(`\n材料使用：${usedNames.size}/${allMats.length} 種`);
const counts = [...usage.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  最常用：${counts.slice(0, 3).map(([m, n]) => `${m}(${n})`).join('、')}`);
console.log(`  最少用：${counts.slice(-3).map(([m, n]) => `${m}(${n})`).join('、')}`);
const orphans = allMats.filter(m => !usedNames.has(m));
console.log(`  仍無用途：${orphans.length} 種${orphans.length ? `　${orphans.slice(0, 12).join('、')}${orphans.length > 12 ? '…' : ''}` : ''}`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 寫回

const nameToId = new Map((ITEM_DEFINITIONS as { id: number; name: string }[]).map(i => [i.name, i.id]));
const byId = new Map(assignments.map(a => [a.id, a]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const a = byId.get(Number(m[1]));
  if (!a) return line;
  // seed 存 id 不存名稱（`99-ai-constraints.md`）：名稱只在這支腳本裡當中間表示
  const mats = `[${a.mats.map(x => `{ itemId: ${nameToId.get(x.name)}, amount: ${x.amount} }`).join(', ')}]`;
  const next = line.replace(/craftMaterials: \[[^\]]*\]/, `craftMaterials: ${mats}`);
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
