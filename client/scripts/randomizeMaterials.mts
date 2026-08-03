/**
 * 材質隨機化 —— 材質決定種族克制，不決定強弱（§ 99.1 第 33 條、`25-monster-system.md` § 25.5）。
 *
 * 改版前材質是綁 tier 的（T4 一律銀、T5 一律米索利…），結果同一階只有一種克制走向：
 * T6 整階只能克龍、T7 整階只能克不死，玩家沒有「換武器應付不同種族」的空間。
 * 改成隨機分配後，每一階都摸得到各種克制。
 *
 * 用 id 的雜湊當亂數種子，同一份 seed 重跑結果一致（不用 Math.random）。
 *
 * 用法：cd client && npx vite-node scripts/randomizeMaterials.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

/** 克制強度（`25-monster-system.md` § 25.5） */
const COUNTER: Record<string, string> = {
  wood: '無', iron: '無',
  silver: '不死・惡魔 +1~4', mithril: '不死 +1~6',
  dragon: '龍 +1~6', orichalcum: '不死 +1~10',
};

/**
 * 各階可用的材質池。**強克制材質有階級下限**：
 * 米索利（+1~6）與奧里哈魯根（+1~10）只出現在 T4 以上。
 *
 * 完全隨機的話，一把傷害 5 的 T2 商店劍若拿到奧里哈魯根，打不死系會變成 6~15 傷，
 * 比 T4 武器還強 —— 低階區本來就有骷髏、殭屍這類不死怪，那不是「有趣的意外」，
 * 是「低階區最優解」，玩家會發現買那把比升級裝備更划算。
 */
const LOW_TIER_MATERIALS = ['wood', 'iron', 'silver', 'dragon'] as const;
const MATERIALS = ['wood', 'iron', 'silver', 'mithril', 'dragon', 'orichalcum'] as const;
const STRONG_MATERIAL_MIN_TIER = 4;

const poolFor = (tier: number): readonly string[] =>
  (tier < STRONG_MATERIAL_MIN_TIER ? LOW_TIER_MATERIALS : MATERIALS);

/** 以 id 為種子的雜湊，確保重跑結果一致 */
const pick = (id: number, tier: number) => {
  const pool = poolFor(tier);
  return pool[(id * 2654435761 >>> 0) % pool.length];
};

const targets = EQUIPMENT_SEEDS.filter(e => e.material && e.acquireType !== 'starter');
const changes = targets.map(e => ({ id: e.id!, name: e.name, tier: e.tier ?? 0, from: e.material!, to: pick(e.id!, e.tier ?? 0) }));

console.log(`${changes.length} 件裝備重新分配材質`);
for (let t = 1; t <= 7; t++) {
  const list = changes.filter(c => c.tier === t);
  if (!list.length) continue;
  const dist = MATERIALS.map(m => `${m} ${list.filter(c => c.to === m).length}`).join('  ');
  console.log(`  T${t}（${list.length} 件）：${dist}`);
}
console.log('\n各材質的克制效果：');
for (const m of MATERIALS) console.log(`  ${m.padEnd(11)} ${COUNTER[m]}`);

const strongLow = changes.filter(c => c.tier < STRONG_MATERIAL_MIN_TIER
  && (c.to === 'orichalcum' || c.to === 'mithril'));
console.log(strongLow.length
  ? `\n⚠ 低階拿到強克制材質：${strongLow.length} 件（不該發生）`
  : `\n✓ 米索利／奧里哈魯根只出現在 T${STRONG_MATERIAL_MIN_TIER} 以上`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

const byId = new Map(changes.map(c => [c.id, c]));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let n = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const c = byId.get(Number(m[1]));
  if (!c) return line;
  const next = line.replace(/material: '\w+'/, `material: '${c.to}'`);
  if (next !== line) n++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${n} 行`);
