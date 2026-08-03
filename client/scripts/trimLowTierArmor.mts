/**
 * 低階防具瘦身 —— T1~T2 每個 (路線, 部位, 階級) 只留 1 件。
 *
 * 低階的防禦目標只有 1~7 點，三種定位（§ 6A.8.8）的落差在這個量級下分不開，
 * 硬留三件只會產生一堆「只有 tier 不一樣」的裝備。
 * 低階的差異來源本來就是**購買時隨機抽的 4 個詞綴**（§ 6A.6），不是模板素質。
 *
 * 保留優先序：手寫的舊裝備 > 防禦較高者 > id 較小者。
 * 保底：每個 (職業, 部位, 階級) 至少留 1 件可裝備的。
 *
 * 用法：cd client && npx vite-node scripts/trimLowTierArmor.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ClassName } from '../src/models/character';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');
const MIN_TIER = 2;
const MAX_TIER = 2;

type Line = 'heavy' | 'light' | 'robe';
const CLASS_LINE: Record<ClassName, Line> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
const LINE_RANK: Record<Line, number> = { robe: 0, light: 1, heavy: 2 };
const CLASSES = Object.keys(CLASS_LINE) as ClassName[];
const SUIT_SLOTS = ['helmet', 'chest', 'gloves', 'boots'];

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
const lineOf = (e: Item) => classesOf(e)
  .reduce<Line>((best, c) => (LINE_RANK[CLASS_LINE[c]] < LINE_RANK[best] ? CLASS_LINE[c] : best), 'heavy');

/** 手寫的舊裝備優先留下（名稱是玩家熟悉的），其次留防禦高的 */
const keepScore = (e: Item) =>
  (isGenerated(e.name) ? 0 : 1000) + (e.defense ?? 0) * 10 + classesOf(e).length;

// ------------------------------------------------------------ 挑選

const groups = new Map<string, Item[]>();
for (const e of EQUIPMENT_SEEDS) {
  if (!e.tier || e.tier > MAX_TIER || e.acquireType === 'starter') continue;
  const key = e.type === 'armor' && SUIT_SLOTS.includes(e.slot)
    ? `${lineOf(e)}|${e.slot}|${e.tier}`
    : e.slot === 'leftHand' ? `${e.type}|leftHand|${e.tier}` : '';
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(e);
}

const kept = new Set<number>();
for (const items of groups.values()) {
  // 完全共用的件（無 requiredClass）一律保留：它們是每個職業都能用的入門裝，
  // 若拿去跟路線件競爭會把「法師頭巾」這種有辨識度的舊名擠掉。
  const shared = items.filter(e => !e.requiredClass);
  for (const e of shared) kept.add(e.id!);
  const rest = items.filter(e => e.requiredClass);
  if (!rest.length) continue;
  kept.add([...rest].sort((a, b) => keepScore(b) - keepScore(a) || a.id! - b.id!)[0].id!);
}

// 保底：每個 (職業, 部位, 階級) 至少留 1 件
const all = [...groups.values()].flat();
for (const cls of CLASSES) {
  for (const slot of [...SUIT_SLOTS, 'leftHand']) {
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const mine = all.filter(e => e.tier === tier && e.slot === slot && classesOf(e).includes(cls));
      if (!mine.length || mine.some(e => kept.has(e.id!))) continue;
      kept.add([...mine].sort((a, b) => keepScore(b) - keepScore(a))[0].id!);
    }
  }
}

const doomed = all.filter(e => !kept.has(e.id!));
console.log(`T1~T${MAX_TIER}：${all.length} 件 → 保留 ${kept.size} 件，刪除 ${doomed.length} 件`);
for (let tier = 1; tier <= MAX_TIER; tier++) {
  const d = doomed.filter(e => e.tier === tier);
  console.log(`  T${tier}：刪 ${d.length} 件 —— ${d.map(e => e.name).join('、')}`);
}

// 被別的配方當前置的不能刪
const referenced = new Set(EQUIPMENT_SEEDS
  .map(e => e.craftPrerequisiteWeapon?.name).filter(Boolean) as string[]);
const blocked = doomed.filter(e => referenced.has(e.name));
if (blocked.length) console.log(`\n⚠ ${blocked.length} 件是製作前置，保留：${blocked.map(e => e.name).join('、')}`);

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
