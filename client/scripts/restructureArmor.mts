/**
 * 防具名額整編 —— 把 T4 以上的每 (部位, 階級) 壓成固定 8 件（`06-equipment.md` § 6A.8.8）。
 *
 * | 定位 | 件數 | 可用職業 |
 * |---|---|---|
 * | 防禦型 | 3（每路線一件） | 該路線 |
 * | 續戰型 | 3（每路線一件） | 該路線 |
 * | 屬性型 | 2（共用件） | 重＋輕：騎士妖精盜賊／輕＋布：妖精盜賊元素師牧師 |
 *
 * **鞋子沒有續戰型**（回復上限 0），每階 5 件。
 *
 * T2（3 件）與 T3（6 件）維持每路線一件／兩件，不動。
 * 名額之外的件直接刪除；留下的件一律把 `requiredClass` 正規化成該名額的職業清單。
 *
 * 用法：cd client && npx vite-node scripts/restructureArmor.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ClassName } from '../src/models/character';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

type Line = 'heavy' | 'light' | 'robe';
type Role = '防禦' | '續戰' | '屬性';
const SLOTS = ['helmet', 'chest', 'gloves', 'boots'];
const CLASS_LINE: Record<ClassName, Line> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
const LINE_RANK: Record<Line, number> = { robe: 0, light: 1, heavy: 2 };
const LINE_CLASSES: Record<Line, ClassName[]> = {
  heavy: ['knight'], light: ['elf', 'thief'], robe: ['elementalist', 'priest'],
};
/** 共用件的兩組。`line` 取組內最弱路線 —— 一個模板只有一組數值 */
const SHARED_GROUPS: { line: Line; classes: ClassName[] }[] = [
  { line: 'light', classes: ['knight', 'elf', 'thief'] },
  { line: 'robe', classes: ['elf', 'thief', 'elementalist', 'priest'] },
];

type Item = (typeof EQUIPMENT_SEEDS)[number];
const classesOf = (e: Item) => (e.requiredClass as ClassName[] | undefined) ?? (Object.keys(CLASS_LINE) as ClassName[]);
const lineOf = (e: Item): Line =>
  classesOf(e).reduce<Line>((best, c) => (LINE_RANK[CLASS_LINE[c]] < LINE_RANK[best] ? CLASS_LINE[c] : best), 'heavy');
const roleOf = (e: Item): Role =>
  e.bonusAttributes ? '屬性' : (e.hpRegen || e.mpRegen || e.bonusHp || e.bonusMp) ? '續戰' : '防禦';

interface Seat { line: Line; role: Role; classes: ClassName[] }
function roster(slot: string, tier: number): Seat[] {
  const lines: Line[] = ['heavy', 'light', 'robe'];
  const seat = (line: Line, role: Role): Seat => ({ line, role, classes: LINE_CLASSES[line] });
  if (tier <= 2) return lines.map(l => seat(l, '防禦'));
  if (tier === 3) return [...lines.map(l => seat(l, '防禦')), ...lines.map(l => seat(l, '屬性'))];
  const attr = SHARED_GROUPS.map(g => ({ line: g.line, role: '屬性' as Role, classes: g.classes }));
  // 鞋子的回復上限是 0（§ 6A.8.8），HP／MP 又不由防具提供，續戰型會變成沒有附加素質的
  // 空殼，因此鞋子沒有續戰名額，每階 5 件
  if (slot === 'boots') return [...lines.map(l => seat(l, '防禦')), ...attr];
  return [...lines.map(l => seat(l, '防禦')), ...lines.map(l => seat(l, '續戰')), ...attr];
}

interface Change { id: number; name: string; slot: string; tier: number; seat?: Seat; from: string }
const changes: Change[] = [];
const doomed: Item[] = [];

for (const slot of SLOTS) {
  for (let tier = 2; tier <= 7; tier++) {
    const here = EQUIPMENT_SEEDS
      .filter(e => e.type === 'armor' && e.slot === slot && e.tier === tier && e.acquireType !== 'starter')
      .sort((a, b) => a.id! - b.id!);
    const seats = roster(slot, tier);
    const free = new Set(here.map(e => e.id!));

    // 先讓 (路線, 定位) 完全吻合的件坐回原位，再用同路線的件補，最後才跨路線硬塞
    const pick = (ok: (e: Item) => boolean) =>
      here.find(e => free.has(e.id!) && ok(e));
    for (const s of seats) {
      const e = pick(x => lineOf(x) === s.line && roleOf(x) === s.role)
        ?? pick(x => lineOf(x) === s.line)
        ?? pick(() => true);
      if (!e) continue;
      free.delete(e.id!);
      const from = `${lineOf(e)}/${roleOf(e)}/[${classesOf(e).join(',')}]`;
      changes.push({ id: e.id!, name: e.name, slot, tier, seat: s, from });
    }
    for (const e of here) if (free.has(e.id!)) doomed.push(e);
  }
}

const reseat = changes.filter(c =>
  JSON.stringify(classesOf(EQUIPMENT_SEEDS.find(e => e.id === c.id)!)) !== JSON.stringify(c.seat!.classes));
console.log(`名額 ${changes.length} 個，職業改寫 ${reseat.length} 件，刪除 ${doomed.length} 件`);
for (const c of reseat) console.log(`  改職業 ${c.name}(T${c.tier} ${c.slot})：${c.from} → [${c.seat!.classes.join(',')}]`);
const byTier = new Map<number, string[]>();
for (const e of doomed) {
  if (!byTier.has(e.tier!)) byTier.set(e.tier!, []);
  byTier.get(e.tier!)!.push(`${e.name}(${e.slot})`);
}
for (const [t, names] of [...byTier].sort((a, b) => a[0] - b[0])) {
  console.log(`  刪 T${t}（${names.length}）：${names.join('、')}`);
}

const referencedIds = new Set(EQUIPMENT_SEEDS
  .map(e => e.craftPrerequisiteWeapon?.templateId).filter(Boolean) as number[]);
const blocked = doomed.filter(e => referencedIds.has(e.id!));
if (blocked.length) throw new Error(`製作前置不可刪：${blocked.map(e => e.name).join('、')}`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

const seatById = new Map(changes.map(c => [c.id, c.seat!]));
const removeIds = new Set(doomed.map(e => e.id!));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let rewritten = 0;
const out: string[] = [];
for (const line of src) {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  const id = m ? Number(m[1]) : null;
  if (id !== null && removeIds.has(id)) continue;
  const seat = id !== null ? seatById.get(id) : undefined;
  if (!seat) { out.push(line); continue; }
  const cls = `requiredClass: [${seat.classes.map(c => `'${c}'`).join(', ')}]`;
  const next = /requiredClass: \[[^\]]*\]/.test(line)
    ? line.replace(/requiredClass: \[[^\]]*\]/, cls)
    : line.replace(/(, buyPrice)/, `, ${cls}$1`);
  if (next !== line) rewritten++;
  out.push(next);
}
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已刪 ${src.length - out.length} 行、改寫 ${rewritten} 行`);
