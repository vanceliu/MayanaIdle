/**
 * 商店價格重算 —— T2／T3 的售價依「同階同類的素質高低」在區間內內插。
 *
 * 改版前的價格是手寫的，與素質完全脫節，出現「便宜四倍、只少 1 防、還多一個屬性」
 * 這種顯然沒人會選貴的那件的情況（§ 6A.8.6）。
 *
 * | 商店 | T2 | T3 |
 * |---|---|---|
 * | 防具（含盾牌／魔導書／臂甲） | 5,000~8,000 | 9,000~15,000 |
 * | 武器 | 5,000~7,000 | 8,000~10,000 |
 *
 * 飾品（腰帶／項鍊／戒指）不在此腳本範圍，素質與定價另案討論。
 *
 * 用法：cd client && npx vite-node scripts/repriceShopGear.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentTemplate } from '../src/models/equipment';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 售價區間（T2、T3） */
export const SHOP_PRICE_RANGE = {
  armor: { 2: [5000, 8000], 3: [9000, 15000] },
  weapon: { 2: [5000, 7000], 3: [8000, 10000] },
} as const;

const ARMOR_SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'leftHand'];
/** 飾品另案討論，不重新定價 */
const SKIP_SLOTS = ['belt', 'necklace', 'ring1', 'ring2'];

const isArmorShop = (t: EquipmentTemplate) => ARMOR_SLOTS.includes(t.slot);

/**
 * 定價依據的「素質分數」。
 * 防具用防禦；左手的防禦刻意壓得很低，另外把格擋率與魔法攻擊算進來，
 * 否則同階的盾牌／魔導書會因為防禦一樣而全部同價。
 */
function powerOf(t: EquipmentTemplate): number {
  if (isArmorShop(t)) {
    return (t.defense ?? 0) + (t.blockRate ?? 0) * 0.5 + (t.magicAttack ?? 0);
  }
  return (t.smallMonsterDamage ?? 0) + (t.largeMonsterDamage ?? 0) + (t.extraAttack ?? 0);
}

// ------------------------------------------------------------ 計算

interface Repriced { id: number; name: string; from: number; to: number; tier: number; kind: string }
const changes: Repriced[] = [];

for (const kind of ['armor', 'weapon'] as const) {
  for (const tier of [2, 3] as const) {
    const items = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop' && t.tier === tier
      && !SKIP_SLOTS.includes(t.slot) && isArmorShop(t) === (kind === 'armor'));
    if (!items.length) continue;

    const [lo, hi] = SHOP_PRICE_RANGE[kind][tier];
    const powers = items.map(powerOf);
    const min = Math.min(...powers);
    const max = Math.max(...powers);
    for (const t of items) {
      // 同階素質全部相同時一律取區間下限，避免除以 0
      const ratio = max > min ? (powerOf(t) - min) / (max - min) : 0;
      const to = Math.round((lo + (hi - lo) * ratio) / 100) * 100;
      changes.push({ id: t.id!, name: t.name, from: t.buyPrice ?? 0, to, tier, kind });
    }
  }
}

for (const kind of ['armor', 'weapon'] as const) {
  for (const tier of [2, 3] as const) {
    const list = changes.filter(c => c.kind === kind && c.tier === tier);
    if (!list.length) continue;
    const prices = list.map(c => c.to);
    console.log(`${kind === 'armor' ? '防具' : '武器'} T${tier}：${list.length} 件，`
      + `${Math.min(...prices).toLocaleString()}~${Math.max(...prices).toLocaleString()}G`);
  }
}

const skipped = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop'
  && [2, 3].includes(t.tier ?? 0) && SKIP_SLOTS.includes(t.slot));
if (skipped.length) {
  console.log(`\n飾品未動（另案討論）：${skipped.map(t => `${t.name}(T${t.tier})`).join('、')}`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 寫回

const byId = new Map(changes.map(c => [c.id, c]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const c = byId.get(Number(m[1]));
  if (!c) return line;
  const next = line.replace(/buyPrice: \d+/, `buyPrice: ${c.to}`);
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
