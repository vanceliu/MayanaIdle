/**
 * 項鍊與戒指重建。
 *
 * 飾品跟腰帶一樣不吃「全身防禦目標」，它們一律不提供防禦，
 * 價值在 HP／MP、回血／回魔與額外屬性。
 *
 * **從 T2 開始**（T1 是新手裝專屬階級，新手裝沒有項鍊與戒指）。
 *
 * | 階級 | 件數 | 走向 |
 * |---|---|---|
 * | T2~T4 | 各 2 | 生命系（HP＋回血）／法力系（MP＋回魔） |
 * | T5、T7 | 各 3 | ＋屬性系 |
 * | T6（項鍊） | 8 | 生命／法力 ＋ **六種屬性各一條的純屬性線** |
 *
 * T7 上限：項鍊 HP 100／MP 100、戒指 HP 25／MP 25、額外屬性 +1。
 * 回血／回魔上限項鍊 5、戒指 2（比照 HP／MP 的 1/4 比例）。
 * 安定值維持 0（飾品不可穩定強化，§ 6.8）。
 *
 * 用法：cd client && npx vite-node scripts/generateAccessorySeeds.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');
const MIN_TIER = 2;

/** T7 上限。其餘階級以 `round(上限 × tier / 7)` 縮放 */
const CAP = {
  necklace: { hp: 100, mp: 100, regen: 5 },
  ring: { hp: 25, mp: 25, regen: 2 },
} as const;

/**
 * 材質隨機分配、與階級無關（`25-monster-system.md` § 25.5）——
 * 材質決定種族克制而非強弱，綁 tier 會讓每階只剩一種克制走向。
 * 補件先給預設值，之後由 `randomizeMaterials.mts` 統一重新分配。
 */
const MATERIAL = ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];
/** T2/T3 的售價沿用 § 6A.2 的防具區間上緣（飾品是純加成，沒有防禦可比） */
const SHOP_PRICE = { 2: 8000, 3: 15000 } as const;
/** 製作費：T4 5 萬、T5 10 萬（§ 6A.3） */
const CRAFT_GOLD = { 4: 50000, 5: 100000 } as const;
const ATTR_ZH: Record<string, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

type Line = 'life' | 'mana' | 'attr' | 'pureAttr';
interface Spec { tier: number; line: Line; name: string; attr?: string }

const NECKLACES: Spec[] = [
  { tier: 2, line: 'life', name: '生命護符' }, { tier: 2, line: 'mana', name: '智慧項鍊' },
  { tier: 3, line: 'life', name: '守護項鍊' }, { tier: 3, line: 'mana', name: '靜心項鍊' },
  { tier: 4, line: 'life', name: '騎士勳章' }, { tier: 4, line: 'mana', name: '賢者之鏈' },
  { tier: 5, line: 'life', name: '龍心項鍊' }, { tier: 5, line: 'mana', name: '大法師之鏈' },
  { tier: 5, line: 'attr', name: '精靈之淚', attr: 'SPI' },
  { tier: 6, line: 'life', name: '深淵之心' }, { tier: 6, line: 'mana', name: '虛空之鏈' },
  // T6 項鍊另外給「六種屬性各一條」的純屬性線：不帶 HP／MP，只有屬性
  { tier: 6, line: 'pureAttr', name: '力量項鍊', attr: 'STR' },
  { tier: 6, line: 'pureAttr', name: '敏捷項鍊', attr: 'AGI' },
  { tier: 6, line: 'pureAttr', name: '體質項鍊', attr: 'VIT' },
  { tier: 6, line: 'pureAttr', name: '精神項鍊', attr: 'SPI' },
  { tier: 6, line: 'pureAttr', name: '智力項鍊', attr: 'INT' },
  { tier: 6, line: 'pureAttr', name: '魅力項鍊', attr: 'CHA' },
  { tier: 7, line: 'life', name: '天龍之心' }, { tier: 7, line: 'mana', name: '創世之鏈' },
  { tier: 7, line: 'attr', name: '魅影之心', attr: 'CHA' },
];

const RINGS: Spec[] = [
  { tier: 2, line: 'life', name: '生命戒指' }, { tier: 2, line: 'mana', name: '魔力戒指' },
  { tier: 3, line: 'life', name: '守護戒指' }, { tier: 3, line: 'mana', name: '靜心戒指' },
  { tier: 4, line: 'life', name: '騎士戒指' }, { tier: 4, line: 'mana', name: '精神戒指' },
  { tier: 5, line: 'life', name: '龍血戒指' }, { tier: 5, line: 'mana', name: '賢者戒指' },
  { tier: 5, line: 'attr', name: '力之指環', attr: 'STR' },
  { tier: 6, line: 'life', name: '深淵指環' }, { tier: 6, line: 'mana', name: '虛空指環' },
  { tier: 6, line: 'attr', name: '疾風指環', attr: 'AGI' },
  { tier: 7, line: 'life', name: '天龍指環' }, { tier: 7, line: 'mana', name: '創世指環' },
  { tier: 7, line: 'attr', name: '魅惑戒指', attr: 'CHA' },
];

const scale = (cap: number, tier: number) => Math.max(1, Math.round((cap * tier) / 7));

/** 同階已有的製作材料直接沿用，確保材料名稱一定存在於 `materialSeeds` */
function craftMaterialsFor(tier: number): string {
  const donor = EQUIPMENT_SEEDS.find(e => e.tier === tier && e.acquireType === 'craft' && e.craftMaterials?.length);
  if (!donor) throw new Error(`T${tier} 找不到可沿用材料的製作配方`);
  return `[${donor.craftMaterials!.map(m => `{ name: '${m.name}', amount: ${m.amount} }`).join(', ')}]`;
}

function fieldsFor(spec: Spec, kind: 'necklace' | 'ring'): string[] {
  const cap = CAP[kind];
  const out: string[] = [];
  if (spec.line === 'life') {
    out.push(`bonusHp: ${scale(cap.hp, spec.tier)}`, `hpRegen: ${scale(cap.regen, spec.tier)}`);
  } else if (spec.line === 'mana') {
    out.push(`bonusMp: ${scale(cap.mp, spec.tier)}`, `mpRegen: ${scale(cap.regen, spec.tier)}`);
  } else if (spec.line === 'pureAttr') {
    // 純屬性：不帶 HP／MP，只有屬性（T6 項鍊六種屬性各一條）
    out.push(`bonusStats: '${ATTR_ZH[spec.attr!]}+1'`, `bonusAttributes: { ${spec.attr}: 1 }`);
  } else {
    // 屬性系一律 +1，並帶半量的 HP／MP 讓它跨階有成長
    out.push(`bonusHp: ${Math.round(scale(cap.hp, spec.tier) / 2)}`,
      `bonusMp: ${Math.round(scale(cap.mp, spec.tier) / 2)}`,
      `bonusStats: '${ATTR_ZH[spec.attr!]}+1'`, `bonusAttributes: { ${spec.attr}: 1 }`);
  }
  return out;
}

// ------------------------------------------------------------ 盤點

const existing = EQUIPMENT_SEEDS.filter(e => ['necklace', 'ring1', 'ring2'].includes(e.slot));
console.log(`現有飾品 ${existing.length} 件 → 重建為 ${NECKLACES.length + RINGS.length} 件`);
for (let t = 1; t <= 7; t++) {
  const before = existing.filter(e => e.tier === t).length;
  const after = [...NECKLACES, ...RINGS].filter(b => b.tier === t).length;
  console.log(`  T${t}：${before} → ${after} 件`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 產生

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const lines: string[] = [
  '',
  '  // ============ 項鍊與戒指（generateAccessorySeeds.mts）============',
  '  // 飾品不提供防禦，價值在 HP／MP、回血回魔與額外屬性。從 T2 開始。',
];
for (const [kind, specs, slot] of [
  ['necklace', NECKLACES, 'necklace'], ['ring', RINGS, 'ring1'],
] as const) {
  for (const spec of specs) {
    const i = spec.tier - 1;
    const acquire = spec.tier <= 3 ? 'shop' : spec.tier <= 5 ? 'craft' : 'drop_only';
    const f: string[] = [
      `id: ${nextId++}`, `name: '${spec.name}'`, `type: 'armor'`, `slot: '${slot}'`,
      'isTwoHanded: false', 'defense: 0', ...fieldsFor(spec, kind),
      `weight: ${kind === 'necklace' ? 3 : 1}`, `material: '${MATERIAL[i]}'`,
      `buyPrice: ${acquire === 'shop' ? SHOP_PRICE[spec.tier as 2 | 3] : 0}`, 'stability: 0',
      `acquireType: '${acquire}'`, `tier: ${spec.tier}`,
    ];
    if (acquire === 'craft') {
      f.push(`craftGold: ${CRAFT_GOLD[spec.tier as 4 | 5]}`, `craftMaterials: ${craftMaterialsFor(spec.tier)}`);
    }
    lines.push(`  { ${f.join(', ')} },`);
  }
}

const removeIds = new Set(existing.map(e => e.id!));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n')
  .filter(line => {
    const m = /^\s*\{ id: (\d+),/.exec(line);
    return !m || !removeIds.has(Number(m[1]));
  })
  .join('\n');
const idx = src.lastIndexOf('];');
writeFileSync(SEED_PATH, src.slice(0, idx) + lines.join('\n') + '\n' + src.slice(idx), 'utf-8');
console.log(`\n已刪除 ${existing.length} 件舊飾品，寫入 ${NECKLACES.length + RINGS.length} 件`
  + `（id ${nextId - NECKLACES.length - RINGS.length}~${nextId - 1}）`);
console.log(`MIN_TIER=${MIN_TIER}：T1 沒有飾品（新手裝專屬階級）`);
