/**
 * 刪掉「被嚴格支配」的防具 —— 防禦不比別人高、附加也不比別人多，就是純粹的廢品。
 *
 * 低階最嚴重：T1 頭盔的防禦目標只有 1，三種定位全被壓成 1 防，
 * 於是「防禦型（1 防、零附加）」被「屬性型（1 防、+1 屬性）」完全蓋過。
 * 每階 3 件的規則（§ 6A.8.3）在數值撐不開的階級會產出這種湊數品。
 *
 * 保護條件：
 * - 只刪**產生器產出**的件，手寫的舊裝備一律保留
 * - 支配者必須對**更廣或相同的職業**可用，否則刪掉會讓某個職業少一個選項
 * - 每個 (職業, 部位, 階級) 至少保留 2 件
 *
 * 用法：cd client && npx vite-node scripts/pruneDominatedArmor.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ClassName } from '../src/models/character';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');
const MIN_KEEP = 2;

const CLASSES: ClassName[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];
const SLOTS = ['helmet', 'chest', 'gloves', 'boots'];

/** 與 `rebalanceArmorDefense.mts` 的 NAME_PREFIX 同一份清單 */
const GENERATED_PREFIXES = [
  '鐵衛', '鐵壁', '鐵誓', '鋼衛', '鋼壁', '鋼心', '精鋼', '銳鋼', '鋼魂',
  '銀衛', '銀盾', '銀誓', '秘銀', '秘盾', '秘誓', '龍衛', '龍鱗', '龍魂',
  '天龍', '龍威', '聖龍',
  '皮革', '獵徑', '輕巧', '獵手', '追風', '輕羽', '獵風', '疾行', '風痕',
  '銀羽', '銀翼', '迅羽', '秘羽', '秘翼', '幽羽', '影狼', '月影', '暗行',
  '幻影', '夜影', '疾風',
  '布織', '初咒', '靜心', '學徒', '初語', '沉思', '祈禱', '聖詠', '冥思',
  '銀紋', '銀符', '聖紋', '秘紋', '秘符', '玄紋', '賢者', '智者', '秘典',
  '星辰', '星輝', '天啟',
];
const isGenerated = (name: string) => GENERATED_PREFIXES.some(p => name.startsWith(p));

type Item = (typeof EQUIPMENT_SEEDS)[number];
const classesOf = (e: Item) => (e.requiredClass as ClassName[] | undefined) ?? CLASSES;
const statsOf = (e: Item) => [
  e.defense ?? 0, e.hpRegen ?? 0, e.mpRegen ?? 0, e.bonusHp ?? 0, e.bonusMp ?? 0,
  Object.values(e.bonusAttributes ?? {}).reduce((a, b) => a + b, 0),
];

/** a 是否被 b 嚴格支配：每項素質都不高於 b，且至少一項更低（或完全相同＝重複品） */
function dominatedBy(a: Item, b: Item): boolean {
  if (a.id === b.id) return false;
  const sa = statsOf(a);
  const sb = statsOf(b);
  if (sa.some((v, i) => v > sb[i])) return false;
  // 支配者必須服務到 a 的所有職業，否則刪掉 a 會讓某職業少一個選項
  const cb = new Set(classesOf(b));
  return classesOf(a).every(c => cb.has(c));
}

// ------------------------------------------------------------ 盤點

const doomed: Item[] = [];
for (const slot of SLOTS) {
  for (let tier = 1; tier <= 7; tier++) {
    const here = EQUIPMENT_SEEDS.filter(e => e.type === 'armor' && e.slot === slot && e.tier === tier);
    const alive = new Set(here.map(e => e.id!));

    const canRemove = (e: Item) => CLASSES.every(c => {
      if (!classesOf(e).includes(c)) return true;
      const left = here.filter(x => alive.has(x.id!) && x.id !== e.id && classesOf(x).includes(c));
      return left.length >= MIN_KEEP;
    });

    // 素質最差的先刪，避免「兩件互相支配」時刪掉比較好的那件
    for (const e of [...here].sort((x, y) =>
      statsOf(x).reduce((a, b) => a + b, 0) - statsOf(y).reduce((a, b) => a + b, 0))) {
      if (!isGenerated(e.name) || !alive.has(e.id!)) continue;
      const dominator = here.find(o => alive.has(o.id!) && dominatedBy(e, o));
      if (!dominator || !canRemove(e)) continue;
      alive.delete(e.id!);
      doomed.push(e);
    }
  }
}

console.log(`可刪 ${doomed.length} 件被支配的防具`);
const byTier = new Map<number, string[]>();
for (const e of doomed) {
  if (!byTier.has(e.tier!)) byTier.set(e.tier!, []);
  byTier.get(e.tier!)!.push(e.name);
}
for (const [t, names] of [...byTier].sort((a, b) => a[0] - b[0])) {
  console.log(`  T${t}（${names.length} 件）：${names.join('、')}`);
}

// 被別的配方當前置的不能刪
const referenced = new Set(EQUIPMENT_SEEDS
  .map(e => e.craftPrerequisiteWeapon?.name).filter(Boolean) as string[]);
const blocked = doomed.filter(e => referenced.has(e.name));
if (blocked.length) {
  console.log(`\n⚠ 有 ${blocked.length} 件是製作前置，未刪：${blocked.map(e => e.name).join('、')}`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會從 equipmentSeeds.ts 刪除）');
  process.exit(0);
}

const removeIds = new Set(doomed.filter(e => !referenced.has(e.name)).map(e => e.id!));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
const out = src.filter(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  return !m || !removeIds.has(Number(m[1]));
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已刪除 ${src.length - out.length} 行`);
console.log('接著跑：npx vite-node scripts/rebalanceArmorDefense.mts --write');
