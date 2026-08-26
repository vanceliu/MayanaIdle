/**
 * 上衣／斗篷 seed 產生器（`06-equipment.md` § 6A.8.9）。
 *
 * 兩個部位 T4 起開放、全職業共用（不寫 `requiredClass`）。上衣每階 2 件，斗篷 3／2／2／1。
 * 防禦與附加素質由 `rebalanceArmorDefense.mts` 統一寫入，這裡只建立條目與固定欄位。
 * 已存在的條目不重複產生。
 *
 * 用法：cd client && npx vite-node scripts/generateShirtCloakSeeds.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/**
 * 名稱的順序＝素質走向的順序：`rebalanceArmorDefense.mts` 依 id 遞增比對同一份清單，
 * 兩邊的每階件數必須一致（該腳本會檢查）。
 */
const NAMES: Record<string, Record<number, string[]>> = {
  shirt: {
    4: ['銀線襯衣'], 5: ['秘銀襯衣', '秘紋襯衣'],
    6: ['龍紋襯衣', '賢者襯衣'], 7: ['天龍襯衣', '星辰襯衣'],
  },
  cloak: {
    4: ['銀邊斗篷', '銀紋披風', '銀羽披風'], 5: ['秘銀斗篷', '秘紋披風'],
    6: ['龍鱗斗篷', '賢者披風'], 7: ['天龍斗篷'],
  },
};
/** 上衣貼身、斗篷外披，兩者都要讓布甲職業穿得起，重量壓在手套與頭盔之下 */
const WEIGHT: Record<string, number[]> = {
  shirt: [18, 19, 21, 22],
  cloak: [21, 23, 25, 26],
};
const ACQUIRE = (tier: number) => (tier <= 5 ? 'craft' : 'drop_only');

const existing = new Set(EQUIPMENT_SEEDS.map(e => e.name));
let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id ?? 0)) + 1;
const rows: string[] = [];
for (const slot of ['shirt', 'cloak']) {
  for (let tier = 4; tier <= 7; tier++) {
    for (const name of NAMES[slot][tier]) {
      if (existing.has(name)) continue;
      const f = [
        `id: ${nextId++}`, `name: '${name}'`, `type: 'armor'`, `slot: '${slot}'`,
        'isTwoHanded: false', 'defense: 0',
        `weight: ${WEIGHT[slot][tier - 4]}`, `material: 'iron'`,
        'buyPrice: 0', 'stability: 4', `acquireType: '${ACQUIRE(tier)}'`, `tier: ${tier}`,
      ];
      // 製作階要先有空欄位，`assignCraftMaterials.mts` 只替換既有的 craftMaterials
      if (ACQUIRE(tier) === 'craft') f.push('craftGold: 0', 'craftMaterials: []');
      rows.push(`  { ${f.join(', ')} },`);
    }
  }
}

console.log(`需新增 ${rows.length} 件上衣／斗篷`);
if (!rows.length || !WRITE) {
  if (rows.length) console.log('（未寫入。加 --write 才會寫進 equipmentSeeds.ts）');
  process.exit(0);
}

const src = readFileSync(SEED_PATH, 'utf-8');
const idx = src.lastIndexOf('];');
const block = ['', '  // ============ 上衣／斗篷（generateShirtCloakSeeds.mts）============',
  '  // T4 起開放、全職業共用（`06-equipment.md` § 6A.8.9）', ...rows].join('\n');
writeFileSync(SEED_PATH, src.slice(0, idx) + block + '\n' + src.slice(idx), 'utf-8');
console.log(`已寫入 ${rows.length} 件（id ${nextId - rows.length}~${nextId - 1}）`);
