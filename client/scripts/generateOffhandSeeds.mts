/**
 * 左手裝備補件 —— 讓盾牌／魔導書／臂甲各自「每個 tier 1~3 件可選」。
 *
 * 改版前左手每階只有 1 件（魔導書 T3 甚至是空的），與四件套的「每階 3 件」規則不一致。
 * 臂甲（`armGuard`）是本次新增的盜賊專屬左手防具：盜賊的雙刀／鋼爪佔雙手時無法裝備，
 * 但單手武器流派原本完全沒有左手可選，等於少一整組詞綴欄。
 *
 * 防禦值不在本腳本決定 —— 產生後由 `rebalanceArmorDefense.mts` 統一套目標值。
 * 這裡只給暫定值與其他素質（格擋率／魔法攻擊／重量／附加）。
 *
 * 用法：cd client && npx vite-node scripts/generateOffhandSeeds.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');
/** T1~T2 一件、T3 兩件、T4 以上三件（低階從簡） */
const minPerTier = (tier: number) => (tier <= 1 ? 0 : tier === 2 ? 1 : tier === 3 ? 2 : 3);

/**
 * 材質隨機分配、與階級無關（`25-monster-system.md` § 25.5）——
 * 材質決定種族克制而非強弱，綁 tier 會讓每階只剩一種克制走向。
 * 補件先給預設值，之後由 `randomizeMaterials.mts` 統一重新分配。
 */
const MATERIAL = ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];
const SHOP_PRICE = [5000, 50000, 150000];
/** 製作費一律 0（§ 6A.3） */
const CRAFT_GOLD = 0;
const BLOCK_RATE = [5, 8, 10, 12, 14, 16, 18];

/** 候選名稱：每階列出足夠的備選，只取需要的數量 */
const NAMES: Record<string, string[][]> = {
  shield: [
    ['圓盾', '皮蒙盾'], ['鋼緣盾', '衛兵盾'], ['十字盾', '聖徽盾'],
    ['秘銀圓盾', '荊棘盾'], ['巨龍壁盾', '聖光盾'], ['深淵護盾', '星辰盾'],
    ['天罰之盾', '永恆守望'],
  ],
  magicBook: [
    ['初階咒本', '祈禱書'], ['元素筆記', '聖言錄'], ['賢者手札', '秘儀典籍', '光輝聖詠'],
    ['元素真典', '星辰卷軸'], ['深淵魔典', '虛空殘章'], ['虛空之書', '聖裁之典'],
    ['終焉之書', '神域聖典'],
  ],
  armGuard: [
    ['皮製臂甲', '鐵護臂', '布纏臂甲'], ['鋼護臂', '獵人臂甲', '影紋護臂'],
    ['銀鑲臂甲', '疾風護臂', '毒牙臂甲'], ['秘銀臂甲', '夜行護臂', '荊棘臂甲'],
    ['龍鱗臂甲', '暗殺者護臂', '幻影臂甲'], ['深淵臂甲', '月影護臂', '血刃臂甲'],
    ['弒神臂甲', '虛空護臂', '無形之臂'],
  ],
};
const REQUIRED_CLASS: Record<string, string[]> = {
  shield: ['knight', 'elf', 'priest'],
  magicBook: ['elementalist', 'priest'],
  armGuard: ['thief'],
};
const BASE_WEIGHT: Record<string, number[]> = {
  shield: [20, 30, 35, 35, 45, 40, 42],
  magicBook: [8, 9, 10, 12, 12, 13, 14],
  armGuard: [10, 12, 14, 15, 16, 17, 18],
};
/** 魔導書的魔法攻擊階梯（既有件已在此範圍內，補件取 −1 讓同階有差異） */
const MAGIC_ATTACK = [2, 4, 5, 6, 8, 9, 11];

/** 同階已有的製作材料直接沿用，確保材料名稱一定存在於 `materialSeeds` */
function craftMaterialsFor(tier: number): string {
  const donor = EQUIPMENT_SEEDS.find(e => e.tier === tier && e.acquireType === 'craft' && e.craftMaterials?.length);
  if (!donor) throw new Error(`T${tier} 找不到可沿用材料的製作配方`);
  return `[${donor.craftMaterials!.map(m => `{ name: '${m.name}', amount: ${m.amount} }`).join(', ')}]`;
}

// ------------------------------------------------------------ 盤點缺口

const need: { type: string; tier: number; count: number }[] = [];
for (const type of ['shield', 'magicBook', 'armGuard']) {
  for (let tier = 1; tier <= 7; tier++) {
    const have = EQUIPMENT_SEEDS.filter(e => e.type === type && e.tier === tier).length;
    if (have < minPerTier(tier)) need.push({ type, tier, count: minPerTier(tier) - have });
  }
}
const total = need.reduce((a, n) => a + n.count, 0);
console.log(`需補 ${total} 件左手裝備`);
for (const type of ['shield', 'magicBook', 'armGuard']) {
  const n = need.filter(x => x.type === type).reduce((a, x) => a + x.count, 0);
  if (n) console.log(`  ${type}: ${n} 件`);
}

/** 已在 seed 裡的名字要跳過（補件可能只補回被刪掉的那幾件） */
const usedNames = new Set(EQUIPMENT_SEEDS.map(e => e.name));
const pickNames = (type: string, tier: number, count: number) => {
  const free = NAMES[type][tier - 1].filter(n => !usedNames.has(n));
  if (free.length < count) throw new Error(`${type} T${tier} 名稱不足（需 ${count}，可用 ${free.length}）`);
  const picked = free.slice(0, count);
  for (const n of picked) usedNames.add(n);
  return picked;
};
const chosen = new Map<string, string[]>();
for (const { type, tier, count } of need) chosen.set(`${type}|${tier}`, pickNames(type, tier, count));

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會寫進 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 產生

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const lines: string[] = [
  '',
  '  // ============ 左手裝備補件（generateOffhandSeeds.mts）============',
  '  // 盾牌／魔導書／臂甲各自每階 1~3 件；防禦值由 rebalanceArmorDefense.mts 統一套用',
];
for (const { type, tier, count } of need) {
  const i = tier - 1;
  chosen.get(`${type}|${tier}`)!.forEach((name, k) => {
    const acquire = tier <= 3 ? 'shop' : tier <= 5 ? 'craft' : 'drop_only';
    const f: string[] = [
      `id: ${nextId++}`, `name: '${name}'`, `type: '${type}'`, `slot: 'leftHand'`,
      'isTwoHanded: false', `defense: ${Math.max(1, Math.ceil((tier + 1) / 2))}`,
    ];
    if (type === 'shield') f.push(`blockRate: ${BLOCK_RATE[i]}`);
    if (type === 'magicBook') f.push(`magicAttack: ${Math.max(1, MAGIC_ATTACK[i] - 1 - k)}`);
    f.push(`weight: ${BASE_WEIGHT[type][i] + k * 2}`, `material: '${MATERIAL[i]}'`,
      `buyPrice: ${acquire === 'shop' ? SHOP_PRICE[i] : 0}`, 'stability: 4',
      `requiredClass: [${REQUIRED_CLASS[type].map(c => `'${c}'`).join(', ')}]`,
      `acquireType: '${acquire}'`, `tier: ${tier}`);
    if (acquire === 'craft') f.push(`craftGold: ${CRAFT_GOLD}`, `craftMaterials: ${craftMaterialsFor(tier)}`);
    lines.push(`  { ${f.join(', ')} },`);
  });
}

const src = readFileSync(SEED_PATH, 'utf-8');
const idx = src.lastIndexOf('];');
writeFileSync(SEED_PATH, src.slice(0, idx) + lines.join('\n') + '\n' + src.slice(idx), 'utf-8');
console.log(`\n已寫入 ${total} 件（id ${nextId - total}~${nextId - 1}）`);
