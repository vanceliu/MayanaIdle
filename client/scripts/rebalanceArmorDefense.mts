/**
 * 防具防禦重算 —— 依「全身防禦目標」寫回每件的**基礎** `defense` 與 `requiredAttributes`。
 *
 * 一件防具的實際防禦是三段（`06-equipment.md` § 6A.8.8）：
 *
 * ```
 * 基礎固定值 + 隨機額外(+0~+2) + 強化等級
 * ```
 *
 * 後兩段在實例生成時決定，不寫進 seed。目標表是**全套**的期望值，
 * 因此反推基礎時要先扣掉「平均隨機 +1／件」與「平均強化 +5／件」（安定值抽 4~6）。
 * T2~T3 的可穿件是頭胸手腳＋左手五件，T4 起多了上衣與斗篷共七件。
 *
 * | 路線 | T2 | T3 | T4 | T5 | T6 | T7 |
 * |---|---|---|---|---|---|---|
 * | 重（力量／體質） | 42 | 50 | 62 | 69 | 76 | 82 |
 * | 輕（敏捷／體質） | 41 | 49 | 60 | 66 | 71 | 76 |
 * | 布（智力／精神） | 40 | 47 | 57 | 62 | 66 | 71 |
 *
 * 名額與路線由 `restructureArmor.mts` 決定，本腳本只認 seed 現況的 `line`，不自行指派。
 *
 * 用法：cd client && npx vite-node scripts/rebalanceArmorDefense.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { getArmorRequirement } from '../src/models/equipment';
import type { ArmorLine, EquipmentTier } from '../src/models/equipment';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 全套防禦目標（§ 6A.8.8）。索引即 tier，T0/T1 未使用 */
const SUIT_TARGET: Record<ArmorLine, number[]> = {
  heavy: [0, 0, 42, 50, 62, 69, 76, 82],
  light: [0, 0, 41, 49, 60, 66, 71, 76],
  robe: [0, 0, 40, 47, 57, 62, 66, 71],
};

/**
 * 逐部位的**基礎**防禦（T2~T7）。百分比配分做不到「每部位階梯平滑」與「總和命中目標」
 * 兩者兼顧，整數化的餘數永遠先補給同幾個部位，因此直接列表。
 *
 * **T4 是上衣與斗篷的開放階**：可穿件從五件變七件，隨機與強化的固定加成從 30 變 42，
 * 基礎總量因此在 T4 掉一階再往上長。
 */
const BASE: Record<ArmorLine, Record<string, number[]>> = {
  heavy: {
    helmet: [2, 4, 4, 5, 6, 7],
    chest: [4, 6, 6, 8, 10, 12],
    gloves: [2, 3, 3, 4, 5, 6],
    boots: [2, 4, 3, 4, 5, 6],
    leftHand: [2, 3, 2, 3, 4, 5],
    shirt: [0, 0, 0, 1, 1, 1],
    cloak: [0, 0, 2, 2, 3, 3],
  },
  light: {
    helmet: [2, 4, 3, 4, 5, 6],
    chest: [4, 6, 5, 7, 8, 10],
    gloves: [2, 3, 3, 3, 4, 4],
    boots: [2, 3, 3, 4, 4, 5],
    leftHand: [1, 3, 2, 3, 4, 5],
    shirt: [0, 0, 0, 1, 1, 1],
    cloak: [0, 0, 2, 2, 3, 3],
  },
  robe: {
    helmet: [2, 3, 3, 4, 4, 5],
    chest: [3, 6, 4, 6, 7, 8],
    gloves: [2, 3, 2, 3, 3, 4],
    boots: [2, 3, 2, 3, 3, 4],
    leftHand: [1, 2, 2, 2, 3, 4],
    shirt: [0, 0, 0, 0, 1, 1],
    cloak: [0, 0, 2, 2, 3, 3],
  },
};

/** 上衣與斗篷從 T4 才開放（§ 6A.8.9）—— T2~T3 不計入可穿件 */
const NEW_SLOT_MIN_TIER = 4;
const NEW_SLOTS = ['shirt', 'cloak'];
/** 隨機額外的期望值（0~2 均等）與強化的期望值（安定值 4~6 均等） */
const AVG_DEFENSE_BONUS = 1;
const AVG_ENHANCE = 5;

const wearableSlots = (tier: number) =>
  Object.keys(BASE.heavy).filter(s => tier >= NEW_SLOT_MIN_TIER || !NEW_SLOTS.includes(s));

// 目標表自我驗算：逐部位基礎的總和 + 固定加成必須命中全套目標
for (const line of Object.keys(BASE) as ArmorLine[]) {
  for (let tier = 2; tier <= 7; tier++) {
    const slots = wearableSlots(tier);
    const base = slots.reduce((sum, s) => sum + BASE[line][s][tier - 2], 0);
    const fixed = slots.length * (AVG_DEFENSE_BONUS + AVG_ENHANCE);
    const target = SUIT_TARGET[line][tier];
    if (base + fixed !== target) {
      throw new Error(`${line} T${tier}：基礎 ${base} + 固定 ${fixed} = ${base + fixed}，目標 ${target}`);
    }
  }
}

interface Change { id: number; name: string; defense: number; req: string; from: number }
const changes: Change[] = [];
for (const e of EQUIPMENT_SEEDS) {
  const line = (e as { line?: ArmorLine }).line;
  if (!line || !e.tier || e.tier < 2) continue;
  const table = BASE[line][e.slot];
  if (!table) throw new Error(`${e.name}：部位 ${e.slot} 不在防禦表內`);
  const defense = table[e.tier - 2];
  const req = getArmorRequirement(line, e.tier as EquipmentTier);
  const reqText = `{ ${Object.entries(req).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
  changes.push({ id: e.id!, name: e.name, defense, req: reqText, from: e.defense ?? 0 });
}

console.log(`${changes.length} 件`);
for (const line of Object.keys(BASE) as ArmorLine[]) {
  const row = [2, 3, 4, 5, 6, 7].map(t => {
    const slots = wearableSlots(t);
    const base = slots.reduce((s, sl) => s + BASE[line][sl][t - 2], 0);
    return `T${t} ${base}→${SUIT_TARGET[line][t]}（強化占比 ${Math.round(slots.length * AVG_ENHANCE / SUIT_TARGET[line][t] * 100)}%）`;
  });
  console.log(`  ${line}: ${row.join('  ')}`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

const byId = new Map(changes.map(c => [c.id, c]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let rewritten = 0;
const out = src.map(raw => {
  const m = /^\s*\{ id: (\d+),/.exec(raw);
  const c = m ? byId.get(Number(m[1])) : undefined;
  if (!c) return raw;
  let next = raw.replace(/defense: -?\d+/, `defense: ${c.defense}`);
  next = /requiredAttributes: \{[^}]*\}/.test(next)
    ? next.replace(/requiredAttributes: \{[^}]*\}/, `requiredAttributes: ${c.req}`)
    : next.replace(/(, line: '\w+')/, `$1, requiredAttributes: ${c.req}`);
  if (next !== raw) rewritten++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已改寫 ${rewritten} 行`);
