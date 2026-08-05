/**
 * 防具補齊產生器 —— 讓「每個職業 × 每個部位 × 每個 tier」至少有 3 件可選。
 *
 * 只**補足缺口**，不動既有防具（既有素質與名稱全部保留）。
 * **戒指、項鍊、腰帶不在此腳本範圍**（另行討論）。
 *
 * 用法：cd client && npx vite-node scripts/generateArmorSeeds.mts
 *   預設只印出缺口報告；加 `--write` 才會把新條目寫進 equipmentSeeds.ts。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ClassName } from '../src/models/character';
import type { EquipSlot } from '../src/models/equipment';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');
/**
 * 每個 (職業, 部位, tier) 的最低可選件數。
 * T1~T2 的防禦目標只有 1~3 點，撐不出三種定位的落差，硬湊第三件只會產出
 * 被完全支配的廢品，所以降為 2 件。
 */
/** 防具沒有 T1（新手裝涵蓋該量級）；T2 一件、T3 兩件、T4 以上三件 */
const minPerCombo = (tier: number) => (tier <= 1 ? 0 : tier === 2 ? 1 : tier === 3 ? 2 : 3);

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const SLOTS: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots'];
const SLOT_ZH: Record<string, string> = {
  helmet: '頭盔', chest: '胸甲', gloves: '手套', boots: '鞋子',
};

/**
 * 三條「路線」，對應各職業的定位。共用件會同時算進多個職業的可選數，
 * 因此補一件輕甲能同時服務妖精與盜賊。
 */
type Line = 'heavy' | 'light' | 'robe';
const LINE_CLASSES: Record<Line, ClassName[]> = {
  heavy: ['knight'],
  light: ['elf', 'thief'],
  robe: ['elementalist', 'priest'],
};
/** 各路線的防禦倍率（相對該部位的基準值） */
const LINE_DEFENSE: Record<Line, number> = { heavy: 1.0, light: 0.65, robe: 0.4 };
/** 各路線的重量倍率 */
const LINE_WEIGHT: Record<Line, number> = { heavy: 1.0, light: 0.4, robe: 0.25 };

/** 各部位在 T1~T7 的防禦基準（heavy 路線的值；沿用既有資料的量級） */
const SLOT_DEFENSE: Record<string, number[]> = {
  helmet: [2, 3, 4, 5, 6, 7, 9],
  chest:  [3, 6, 7, 9, 12, 15, 20],
  gloves: [2, 3, 4, 5, 6, 7, 8],
  boots:  [2, 3, 4, 5, 6, 7, 8],
};
const SLOT_WEIGHT: Record<string, number[]> = {
  helmet: [15, 30, 45, 42, 46, 50, 52],
  chest:  [30, 60, 72, 70, 78, 85, 88],
  gloves: [10, 30, 33, 30, 32, 35, 36],
  boots:  [10, 30, 38, 35, 32, 30, 34],
};
/**
 * 材質隨機分配、與階級無關（`25-monster-system.md` § 25.5）——
 * 材質決定種族克制而非強弱，綁 tier 會讓每階只剩一種克制走向。
 * 補件先給預設值，之後由 `randomizeMaterials.mts` 統一重新分配。
 */
const MATERIAL = ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];
const ACQUIRE = (tier: number) => (tier <= 3 ? 'shop' : tier <= 5 ? 'craft' : 'drop_only');

/** 命名：路線 × 部位 × tier */
const LINE_PREFIX: Record<Line, string[]> = {
  heavy: ['鐵衛', '鋼衛', '精鋼', '銀衛', '秘銀', '龍衛', '天龍'],
  light: ['皮革', '獵手', '獵風', '銀羽', '秘羽', '影狼', '幻影'],
  robe:  ['布織', '學徒', '祈禱', '銀紋', '秘紋', '賢者', '星辰'],
};
const SLOT_SUFFIX: Record<string, Record<Line, string>> = {
  helmet: { heavy: '頭盔', light: '頭巾', robe: '之冠' },
  chest:  { heavy: '鎧甲', light: '皮衣', robe: '長袍' },
  gloves: { heavy: '護手', light: '護腕', robe: '手套' },
  boots:  { heavy: '戰靴', light: '之靴', robe: '布鞋' },
};

// ---------------------------------------------------------------- 盤點

interface Existing { tier: number; slot: string; classes: ClassName[] | null }
const existing: Existing[] = [];
for (const e of EQUIPMENT_SEEDS) {
  if (e.acquireType === 'starter' || !e.tier) continue;
  if (!SLOTS.includes(e.slot)) continue;
  existing.push({ tier: e.tier, slot: e.slot, classes: (e.requiredClass as ClassName[]) ?? null });
}
const countFor = (cls: ClassName, slot: string, tier: number, extra: Existing[] = []) =>
  [...existing, ...extra].filter(e =>
    e.tier === tier && e.slot === slot && (e.classes === null || e.classes.includes(cls))).length;

// ---------------------------------------------------------------- 補齊

const added: { line: Line; slot: string; tier: number; name: string }[] = [];
const pending: Existing[] = [];
const usedNames = new Set(EQUIPMENT_SEEDS.map(e => e.name));

for (let tier = 1; tier <= 7; tier++) {
  for (const slot of SLOTS) {
    // 對每條路線反覆補件，直到該路線的所有職業都達標
    for (const line of ['heavy', 'light', 'robe'] as Line[]) {
      const classes = LINE_CLASSES[line];
      let guard = 0;
      while (classes.some(c => countFor(c, slot, tier, pending) < minPerCombo(tier)) && guard++ < 6) {
        const idx = added.filter(a => a.line === line && a.slot === slot && a.tier === tier).length;
        let name = `${LINE_PREFIX[line][tier - 1]}${SLOT_SUFFIX[slot][line]}`;
        if (idx > 0) name = `${name}·${['壹', '貳', '參', '肆', '伍'][idx - 1] ?? idx}`;
        if (usedNames.has(name)) { name = `${name}+`; }
        usedNames.add(name);
        added.push({ line, slot, tier, name });
        pending.push({ tier, slot, classes });
      }
    }
  }
}

console.log(`需補 ${added.length} 件防具`);
const byTier = new Map<number, number>();
for (const a of added) byTier.set(a.tier, (byTier.get(a.tier) ?? 0) + 1);
for (const [t, n] of [...byTier].sort()) console.log(`  T${t}: ${n} 件`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會寫進 equipmentSeeds.ts）');
  process.exit(0);
}

// ---------------------------------------------------------------- 產生 seed 條目

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const lines: string[] = [
  '',
  '  // ============ 防具補齊（generateArmorSeeds.mts）============',
  '  // 讓「每個職業 × 每個部位 × 每個 tier」至少有 2~3 件可選',
  '  // 三條路線：heavy（騎士）／light（妖精・盜賊）／robe（元素師・牧師）',
];
for (const a of added) {
  const i = a.tier - 1;
  const def = Math.max(0, Math.round(SLOT_DEFENSE[a.slot][i] * LINE_DEFENSE[a.line]));
  const wt = Math.max(1, Math.round(SLOT_WEIGHT[a.slot][i] * LINE_WEIGHT[a.line]));
  const cls = LINE_CLASSES[a.line];
  const f: string[] = [
    `id: ${nextId++}`, `name: '${a.name}'`, `type: 'armor'`, `slot: '${a.slot}'`,
    'isTwoHanded: false', `defense: ${def}`,
  ];
  f.push(`weight: ${wt}`, `material: '${MATERIAL[i]}'`,
    `requiredClass: [${cls.map(c => `'${c}'`).join(', ')}]`);
  f.push(`buyPrice: ${a.tier <= 3 ? [3000, 20000, 90000][a.tier - 1] : 0}`);
  f.push('stability: 4');
  f.push(`acquireType: '${ACQUIRE(a.tier)}'`, `tier: ${a.tier}`);
  lines.push(`  { ${f.join(', ')} },`);
}

const src = readFileSync(SEED_PATH, 'utf-8');
const idx = src.lastIndexOf('];');
writeFileSync(SEED_PATH, src.slice(0, idx) + lines.join('\n') + '\n' + src.slice(idx), 'utf-8');
console.log(`\n已寫入 ${added.length} 件（id ${nextId - added.length}~${nextId - 1}）`);
