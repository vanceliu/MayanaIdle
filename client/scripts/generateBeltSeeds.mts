/**
 * 腰帶重建 —— 腰帶的定位與其他防具不同，單獨一張表（`35-inventory-constraints.md` § 35.1）。
 *
 * 腰帶不吃「全身防禦目標」（§ 6A.8.7），它的價值在**背包格數**與負重，
 * 因此不套用四件套那套配分與三種定位。
 *
 * | 階級 | 件數 | 走向 | 背包格 |
 * |---|---|---|---|
 * | T1 | 1 | 新手裝，跟著整套發，不販售 | 5 |
 * | T2~T4 | 各 1 | 純格數／負重成長 | 6／8／10 |
 * | T5 | 4 | 四種屬性（力量・敏捷・智力・精神） | 15 |
 * | T6 | 1 | 無屬性，改給防禦 1 | 18 |
 * | T7 | 3 | 力量+2／智力+2／敏捷+2，防禦 1 | 20 |
 *
 * 腰帶安定值一律 −1（不可強化，§ 6.8）。
 *
 * 用法：cd client && npx vite-node scripts/generateBeltSeeds.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 背包格數（T1~T7）。基礎背包 50 格，T7 腰帶把上限推到 70 格 */
const BAG_SLOTS = [5, 6, 8, 10, 15, 18, 20];
/** 負重（負重懲罰目前停用，數值保留備用，`20-attributes.md` § 20.7） */
const WEIGHT_BONUS = [1700, 2500, 3300, 5000, 6700, 8300, 10000];
/**
 * 材質隨機分配、與階級無關（`25-monster-system.md` § 25.5）——
 * 材質決定種族克制而非強弱，綁 tier 會讓每階只剩一種克制走向。
 * 補件先給預設值，之後由 `randomizeMaterials.mts` 統一重新分配。
 */
const MATERIAL = ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];
/** T1 不販售（新手裝），T2/T3 才有售價 */
const SHOP_PRICE = [0, 8000, 15000];
/** 製作費：T4 5 萬、T5 10 萬（§ 6A.3） */
const CRAFT_GOLD = [50000, 100000];
const ATTR_ZH: Record<string, string> = { STR: '力量', AGI: '敏捷', INT: '智力', SPI: '精神' };

interface BeltSpec { tier: number; name: string; attr?: [string, number]; defense?: number }

const BELTS: BeltSpec[] = [
  { tier: 1, name: '皮腰帶' },
  { tier: 2, name: '鐵扣腰帶' },
  { tier: 3, name: '龍皮腰帶' },
  { tier: 4, name: '銀扣腰帶' },
  // T5 分四種屬性走向
  { tier: 5, name: '力之腰帶', attr: ['STR', 1] },
  { tier: 5, name: '暗殺者腰帶', attr: ['AGI', 1] },
  { tier: 5, name: '賢者腰帶', attr: ['INT', 1] },
  { tier: 5, name: '祈禱者腰帶', attr: ['SPI', 1] },
  // T6 不給屬性，改給防禦
  { tier: 6, name: '守護者腰帶', defense: 1 },
  // T7 三種屬性走向，並保有防禦
  { tier: 7, name: '天龍腰帶', attr: ['STR', 2], defense: 1 },
  { tier: 7, name: '星辰腰帶', attr: ['INT', 2], defense: 1 },
  { tier: 7, name: '幻影腰帶', attr: ['AGI', 2], defense: 1 },
];

/** 同階已有的製作材料直接沿用，確保材料名稱一定存在於 `materialSeeds` */
function craftMaterialsFor(tier: number): string {
  const donor = EQUIPMENT_SEEDS.find(e => e.tier === tier && e.acquireType === 'craft' && e.craftMaterials?.length);
  if (!donor) throw new Error(`T${tier} 找不到可沿用材料的製作配方`);
  return `[${donor.craftMaterials!.map(m => `{ name: '${m.name}', amount: ${m.amount} }`).join(', ')}]`;
}

const existing = EQUIPMENT_SEEDS.filter(e => e.slot === 'belt');
console.log(`現有腰帶 ${existing.length} 件 → 重建為 ${BELTS.length} 件`);
for (let t = 1; t <= 7; t++) {
  const before = existing.filter(e => e.tier === t).map(e => e.name);
  const after = BELTS.filter(b => b.tier === t).map(b => b.name);
  console.log(`  T${t}（${BAG_SLOTS[t - 1]} 格）：${before.join('、') || '—'} → ${after.join('、')}`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 產生

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const lines: string[] = [
  '',
  '  // ============ 腰帶（generateBeltSeeds.mts）============',
  '  // 腰帶不吃全身防禦目標，價值在背包格數與負重（`35-inventory-constraints.md` § 35.1）',
];
for (const b of BELTS) {
  const i = b.tier - 1;
  // T1 是新手裝專屬階級：皮腰帶跟著整套新手裝發，不販售也不能賣掉
  const acquire = b.tier === 1 ? 'starter' : b.tier <= 3 ? 'shop' : b.tier <= 5 ? 'craft' : 'drop_only';
  const f: string[] = [
    `id: ${nextId++}`, `name: '${b.name}'`, `type: 'armor'`, `slot: 'belt'`,
    'isTwoHanded: false', `defense: ${b.defense ?? 0}`,
    `bonusWeight: ${WEIGHT_BONUS[i]}`, `bonusBagSlots: ${BAG_SLOTS[i]}`,
  ];
  if (b.attr) {
    const [key, value] = b.attr;
    f.push(`bonusStats: '${ATTR_ZH[key]}+${value}'`, `bonusAttributes: { ${key}: ${value} }`);
  }
  f.push(`weight: ${10 + i * 2}`, `material: '${MATERIAL[i]}'`,
    `buyPrice: ${acquire === 'shop' ? SHOP_PRICE[i] : 0}`, 'stability: -1',
    `acquireType: '${acquire}'`, `tier: ${b.tier}`);
  if (acquire === 'craft') f.push(`craftGold: ${CRAFT_GOLD[b.tier - 4]}`, `craftMaterials: ${craftMaterialsFor(b.tier)}`);
  lines.push(`  { ${f.join(', ')} },`);
}

// 先刪掉所有舊腰帶，再把新的一批接到檔尾
const removeIds = new Set(existing.map(e => e.id!));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n')
  .filter(line => {
    const m = /^\s*\{ id: (\d+),/.exec(line);
    return !m || !removeIds.has(Number(m[1]));
  })
  .join('\n');
const idx = src.lastIndexOf('];');
writeFileSync(SEED_PATH, src.slice(0, idx) + lines.join('\n') + '\n' + src.slice(idx), 'utf-8');
console.log(`\n已刪除 ${existing.length} 件舊腰帶，寫入 ${BELTS.length} 件（id ${nextId - BELTS.length}~${nextId - 1}）`);
