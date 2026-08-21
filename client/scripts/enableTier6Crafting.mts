/**
 * T6 開放部分製作（`06-equipment-acquire.md` § 6A.1）。
 *
 * T6 原本是「僅一般怪物掉落」，結果 Lv.57 以上的頂級材料完全沒有用途
 * （T6/T7 都不可製作，鐵匠階梯止於 T5），撿到只能賣錢。
 *
 * 改為：**T6 有一半可以製作，但全部仍然照掉**。
 * 掉落池是以 `tier` 比對的（`drops.ts`），與 `acquireType` 無關，
 * 所以把一件 T6 改成 `craft` 之後它同時可製作、可掉落。
 *
 * **飾品（腰帶／項鍊／戒指）不開放製作**，維持純掉落。
 *
 * 材料取自 Lv.57 以上的區域，讓百柱塔深層與龍之谷底層的頂級材料有出口。
 *
 * 用法：cd client && npx vite-node scripts/enableTier6Crafting.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROP_TABLE_SEEDS } from '../src/db/seed/dropSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed/itemSeeds';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 製作費一律 0（§ 6A.3） */
const CRAFT_GOLD = 0;
/** 每份 T6 配方的材料需求量 */
const AMOUNTS = [8, 6, 5, 4];
/** 材料來源：Lv.57 以上的深層區域 */
const AREAS = [
  'hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f',
  'hundred-pillar-91-100f', 'dragon-valley-5f',
];
/** 飾品不開放製作，維持純掉落 */
const ACCESSORY_SLOTS = ['belt', 'necklace', 'ring1', 'ring2'];
const EXCLUDED_MATERIAL = (name: string) =>
  name === '品質石' || name === '強化石' || name.startsWith('魔法書材料');

// ------------------------------------------------------------ 區域 → 材料

const itemById = new Map((ITEM_DEFINITIONS as { id: number; name: string; category: string }[])
  .map(i => [i.id, i]));
const areaMaterials = new Map<string, string[]>();
for (const d of DROP_TABLE_SEEDS as { area?: string; itemTemplateId?: number }[]) {
  const it = d.itemTemplateId != null ? itemById.get(d.itemTemplateId) : undefined;
  if (!it || it.category !== 'material' || EXCLUDED_MATERIAL(it.name) || !d.area) continue;
  if (!AREAS.includes(d.area)) continue;
  const list = areaMaterials.get(d.area) ?? [];
  if (!list.includes(it.name)) list.push(it.name);
  areaMaterials.set(d.area, list);
}
for (const a of AREAS) {
  const n = areaMaterials.get(a)?.length ?? 0;
  if (n < AMOUNTS.length - 1) throw new Error(`${a} 只有 ${n} 種材料，湊不出 T6 配方`);
}

// ------------------------------------------------------------ 挑選要開放製作的件

/** 同類型內每隔一件開放一件，讓每種武器／部位都摸得到製作管道 */
const candidates = EQUIPMENT_SEEDS
  .filter(e => e.tier === 6 && !ACCESSORY_SLOTS.includes(e.slot))
  .sort((a, b) => (a.type + a.slot).localeCompare(b.type + b.slot) || (a.id ?? 0) - (b.id ?? 0));

const byGroup = new Map<string, typeof candidates>();
for (const e of candidates) {
  const key = `${e.type}|${e.slot}`;
  if (!byGroup.has(key)) byGroup.set(key, []);
  byGroup.get(key)!.push(e);
}

interface Pick { id: number; name: string; area: string; mats: { name: string; amount: number }[] }
const picks: Pick[] = [];
let n = 0;
for (const items of byGroup.values()) {
  items.forEach((e, i) => {
    if (i % 2 !== 0) return; // 每組取一半
    const area = AREAS[n % AREAS.length];
    const neighbour = AREAS[(n + 1) % AREAS.length];
    const pool = areaMaterials.get(area)!;
    const mats = AMOUNTS.slice(0, -1).map((amount, k) => ({ name: pool[(n + k) % pool.length], amount }));
    const cross = areaMaterials.get(neighbour)!;
    mats.push({
      name: cross.find(m => !mats.some(x => x.name === m)) ?? cross[0],
      amount: AMOUNTS[AMOUNTS.length - 1],
    });
    picks.push({ id: e.id!, name: e.name, area, mats });
    n++;
  });
}

// ------------------------------------------------------------ 報告

const total = candidates.length;
console.log(`T6 非飾品共 ${total} 件 → 開放 ${picks.length} 件可製作（其餘維持純掉落）`);
console.log(`飾品 ${EQUIPMENT_SEEDS.filter(e => e.tier === 6 && ACCESSORY_SLOTS.includes(e.slot)).length} 件不開放製作`);
for (const area of AREAS) {
  const list = picks.filter(p => p.area === area);
  console.log(`  ${area.padEnd(24)} ${list.length} 份　材料：${areaMaterials.get(area)!.join('、')}`);
}
const used = new Set(picks.flatMap(p => p.mats.map(m => m.name)));
console.log(`\n本次用到的頂級材料：${[...used].join('、')}`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 寫回

const byId = new Map(picks.map(p => [p.id, p]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const p = byId.get(Number(m[1]));
  if (!p) return line;
  const mats = `[${p.mats.map(x => `{ name: '${x.name}', amount: ${x.amount} }`).join(', ')}]`;
  let next = line.replace(/acquireType: 'drop_only'/, `acquireType: 'craft'`);
  if (/craftGold: \d+/.test(next)) {
    next = next.replace(/craftGold: \d+/, `craftGold: ${CRAFT_GOLD}`)
      .replace(/craftMaterials: \[[^\]]*\]/, `craftMaterials: ${mats}`);
  } else {
    next = next.trimEnd().replace(/\},?$/, '').trimEnd().replace(/,$/, '')
      + `, craftGold: ${CRAFT_GOLD}, craftMaterials: ${mats} },`;
  }
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
