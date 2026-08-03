/**
 * 補上「某職業在某部位某階看不到某種定位」的缺口（§ 6A.8.8）。
 *
 * 每個 (職業, 部位, 階級) 有 3 件可選，但其中一個名額可能被**跨路線共用的防禦型**佔走
 * （例：盜賊手套 T3 看到輕甲防禦型 ＋ 共用防禦型 ＋ 屬性型，就少了續戰型）。
 * 這裡只針對真正缺的組合各補一件，不是為了湊數。
 *
 * 補完後要重跑 `rebalanceArmorDefense.mts --write` 才會套上素質。
 *
 * 用法：cd client && npx vite-node scripts/fillArmorRoleGaps.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ClassName } from '../src/models/character';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

type Line = 'heavy' | 'light' | 'robe';
const CLASS_LINE: Record<ClassName, Line> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
const LINE_CLASSES: Record<Line, ClassName[]> = {
  heavy: ['knight'], light: ['elf', 'thief'], robe: ['elementalist', 'priest'],
};
const CLASSES = Object.keys(CLASS_LINE) as ClassName[];
const SLOTS = ['helmet', 'chest', 'gloves', 'boots'];
/**
 * 材質隨機分配、與階級無關（`25-monster-system.md` § 25.5）——
 * 材質決定種族克制而非強弱，綁 tier 會讓每階只剩一種克制走向。
 * 補件先給預設值，之後由 `randomizeMaterials.mts` 統一重新分配。
 */
const MATERIAL = ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];
const SHOP_PRICE = [3000, 20000, 90000];

/** 命名沿用 `generateArmorSeeds.mts` 的路線字首，字尾另取以免重複 */
const LINE_PREFIX: Record<Line, string[]> = {
  heavy: ['鐵衛', '鋼衛', '精鋼', '銀衛', '秘銀', '龍衛', '天龍'],
  light: ['皮革', '獵手', '獵風', '銀羽', '秘羽', '影狼', '幻影'],
  robe: ['布織', '學徒', '祈禱', '銀紋', '秘紋', '賢者', '星辰'],
};
const SLOT_SUFFIX: Record<string, Record<Line, string>> = {
  helmet: { heavy: '面甲', light: '額帶', robe: '之環' },
  chest: { heavy: '胸甲', light: '戰衣', robe: '聖袍' },
  gloves: { heavy: '拳套', light: '指套', robe: '長手套' },
  boots: { heavy: '重靴', light: '軟靴', robe: '踏靴' },
};
const SLOT_WEIGHT: Record<string, number[]> = {
  helmet: [15, 30, 45, 42, 46, 50, 52],
  chest: [30, 60, 72, 70, 78, 85, 88],
  gloves: [10, 30, 33, 30, 32, 35, 36],
  boots: [10, 30, 38, 35, 32, 30, 34],
};
const LINE_WEIGHT: Record<Line, number> = { heavy: 1.0, light: 0.4, robe: 0.25 };

/** 依素質反推定位（與 `generateArmorDocs.mts` 一致） */
const roleOf = (e: (typeof EQUIPMENT_SEEDS)[number]) =>
  e.bonusAttributes ? '屬性' : (e.hpRegen || e.mpRegen || e.bonusHp || e.bonusMp) ? '續戰' : '防禦';
const ALL_ROLES = ['防禦', '續戰', '屬性'];

// ------------------------------------------------------------ 盤點缺口

/** (路線, 部位, 階級) → 還缺幾件（同一組只補一次，多個職業共用同一條路線） */
const need = new Map<string, number>();
for (const cls of CLASSES) {
  for (const slot of SLOTS) {
    for (let tier = 1; tier <= 7; tier++) {
      const view = EQUIPMENT_SEEDS.filter(e => e.tier === tier && e.slot === slot && e.type === 'armor'
        && (!e.requiredClass || (e.requiredClass as ClassName[]).includes(cls)));
      // T1~T2 只要求兩種定位（防禦目標 1~3 點撐不出三種落差，§ 6A.8.3）
      const wanted = tier <= 2 ? [] : tier === 3 ? ['防禦', '屬性'] : ALL_ROLES;
      if (view.length < wanted.length) continue;
      const missing = wanted.filter(r => !view.some(e => roleOf(e) === r)).length;
      if (!missing) continue;
      const key = `${CLASS_LINE[cls]}|${slot}|${tier}`;
      need.set(key, Math.max(need.get(key) ?? 0, missing));
    }
  }
}

const total = [...need.values()].reduce((a, b) => a + b, 0);
console.log(`需補 ${total} 件（${need.size} 個 路線×部位×階級 組合）`);
for (const [key, n] of [...need].sort()) console.log(`  ${key}: ${n} 件`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會寫進 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 產生

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const usedNames = new Set(EQUIPMENT_SEEDS.map(e => e.name));
const lines: string[] = [
  '',
  '  // ============ 定位缺口補件（fillArmorRoleGaps.mts）============',
  '  // 補上「某職業在某部位某階看不到某種定位」的組合（§ 6A.8.8），素質由 rebalanceArmorDefense.mts 套用',
];
for (const [key, n] of [...need].sort()) {
  const [line, slot, tierStr] = key.split('|') as [Line, string, string];
  const tier = Number(tierStr);
  const i = tier - 1;
  for (let k = 0; k < n; k++) {
    let name = `${LINE_PREFIX[line][i]}${SLOT_SUFFIX[slot][line]}`;
    while (usedNames.has(name)) name += '·改';
    usedNames.add(name);
    const acquire = tier <= 3 ? 'shop' : tier <= 5 ? 'craft' : 'drop_only';
    lines.push('  { ' + [
      `id: ${nextId++}`, `name: '${name}'`, `type: 'armor'`, `slot: '${slot}'`,
      'isTwoHanded: false', 'defense: 1',
      `weight: ${Math.max(1, Math.round(SLOT_WEIGHT[slot][i] * LINE_WEIGHT[line]))}`,
      `material: '${MATERIAL[i]}'`,
      `requiredClass: [${LINE_CLASSES[line].map(c => `'${c}'`).join(', ')}]`,
      `buyPrice: ${acquire === 'shop' ? SHOP_PRICE[i] : 0}`, 'stability: 4',
      `acquireType: '${acquire}'`, `tier: ${tier}`,
    ].join(', ') + ' },');
  }
}

const src = readFileSync(SEED_PATH, 'utf-8');
const idx = src.lastIndexOf('];');
writeFileSync(SEED_PATH, src.slice(0, idx) + lines.join('\n') + '\n' + src.slice(idx), 'utf-8');
console.log(`\n已寫入 ${total} 件（id ${nextId - total}~${nextId - 1}）`);
console.log('接著跑：npx vite-node scripts/rebalanceArmorDefense.mts --write');
