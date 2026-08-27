/**
 * 防具名額整編 —— 每（部位 × 階級）壓成 **3 件：布／輕／重各一**（`06-equipment.md` § 6A.8.8）。
 *
 * 職業限制改成素質需求後，同一階級不再需要為每個職業各備一套：
 * 三條路線一件，誰穿得上看 `requiredAttributes`（由 `rebalanceArmorDefense.mts` 寫入）。
 *
 * | 部位 | 路線判定 |
 * |---|---|
 * | 頭盔／胸甲／手套／鞋子 | 原 `requiredClass`（騎士＝重、妖精盜賊＝輕、元素師牧師＝布） |
 * | 左手 | 裝備類型（盾牌＝重、臂甲＝輕、魔導書＝布） |
 * | 上衣／斗篷 | 下方 `SHIRT_CLOAK_ROSTER` 逐件指定，缺口補新條目 |
 *
 * 每個名額留**同路線防禦最高**的那件（即原防禦型），其餘刪除。
 * T1 新手裝不動 —— 它維持職業專屬且無詞綴。
 *
 * 留下的件同時清掉 `requiredClass`／`hpRegen`／`mpRegen`／`bonusHp`／`bonusMp`／
 * `bonusStats`／`bonusAttributes`／`stability`：回復與額外屬性改由詞綴提供（`07-affix.md` § 7.3.1），
 * 安定值改在實例生成時抽 4~6（§ 6.10）。
 *
 * 用法：cd client && npx vite-node scripts/restructureArmor.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { ArmorLine } from '../src/models/equipment';
import type { ClassName } from '../src/models/character';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

type Item = (typeof EQUIPMENT_SEEDS)[number];

const LINES: ArmorLine[] = ['heavy', 'light', 'robe'];
const CLASS_LINE: Record<ClassName, ArmorLine> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
const OFFHAND_LINE: Record<string, ArmorLine> = {
  shield: 'heavy', armGuard: 'light', magicBook: 'robe',
};
/**
 * 左手的職業限制（`06-equipment.md` § 6.6）。**只有盾牌全職業**；
 * 魔導書與臂甲維持職業專屬 —— 它們不只是防禦件，各自帶著該職業的核心素質
 * （魔導書的魔攻進 § 21.4 的乘區、臂甲不佔手讓盜賊的雙手武器仍裝得下副手）。
 */
const OFFHAND_CLASSES: Record<string, ClassName[] | null> = {
  shield: null,
  magicBook: ['elementalist', 'priest'],
  armGuard: ['thief'],
};
/** 混合職業的舊件取**最弱**路線 —— 一個模板只有一組數值 */
const LINE_RANK: Record<ArmorLine, number> = { robe: 0, light: 1, heavy: 2 };

const BODY_SLOTS = ['helmet', 'chest', 'gloves', 'boots'];
const NEW_SLOTS = ['shirt', 'cloak'];

/**
 * 上衣與斗篷的逐件名單（T4~T7 × 布／輕／重）。原本是全職業共用、每階 1~3 件，
 * 沒有路線之分，因此這裡逐件指名；不在清單上的舊件刪除，清單上沒有的補新條目。
 */
const SHIRT_CLOAK_ROSTER: Record<string, Record<number, Record<ArmorLine, string>>> = {
  shirt: {
    4: { heavy: '銀線襯衣', light: '銀羽襯衣', robe: '銀紋襯衣' },
    5: { heavy: '秘銀襯衣', light: '秘羽襯衣', robe: '秘紋襯衣' },
    6: { heavy: '龍紋襯衣', light: '影狼襯衣', robe: '賢者襯衣' },
    7: { heavy: '天龍襯衣', light: '幻影襯衣', robe: '星辰襯衣' },
  },
  cloak: {
    4: { heavy: '銀邊斗篷', light: '銀羽披風', robe: '銀紋披風' },
    5: { heavy: '秘銀斗篷', light: '秘羽披風', robe: '秘紋披風' },
    6: { heavy: '龍鱗斗篷', light: '影狼披風', robe: '賢者披風' },
    7: { heavy: '天龍斗篷', light: '幻影披風', robe: '星辰披風' },
  },
};
/** 補新條目時沿用同（部位 × 階級）既有件的重量與取得管道，材質輪替避免三件全同 */
const FILL_MATERIALS = ['iron', 'silver', 'dragon'] as const;

const classesOf = (e: Item) => (e.requiredClass as ClassName[] | undefined) ?? (Object.keys(CLASS_LINE) as ClassName[]);
/**
 * 路線判定。**已經有 `line` 的件直接沿用** —— 這支腳本要可以重跑，
 * 而改版後防具的 `requiredClass` 已經清掉，再從職業反推會把全部件判成布甲。
 */
const bodyLineOf = (e: Item): ArmorLine =>
  (e as { line?: ArmorLine }).line
  ?? classesOf(e).reduce<ArmorLine>((best, c) => (LINE_RANK[CLASS_LINE[c]] < LINE_RANK[best] ? CLASS_LINE[c] : best), 'heavy');

const isStarter = (e: Item) => e.acquireType === 'starter';
const keep = new Map<number, ArmorLine>();
const doomed: Item[] = [];
const missing: { slot: string; tier: number; line: ArmorLine; name: string }[] = [];

/** 同路線留防禦最高的那件（原防禦型）；同分取小 id，讓結果可重現 */
function pickBest(items: Item[]): Item {
  return [...items].sort((a, b) => (b.defense ?? 0) - (a.defense ?? 0) || a.id! - b.id!)[0];
}

function restructure(slot: string, lineOf: (e: Item) => ArmorLine, minTier: number) {
  for (let tier = minTier; tier <= 7; tier++) {
    const here = EQUIPMENT_SEEDS.filter(e => e.slot === slot && e.tier === tier && !isStarter(e));
    if (!here.length) continue;
    const byLine = new Map<ArmorLine, Item[]>();
    for (const e of here) {
      const l = lineOf(e);
      byLine.set(l, [...(byLine.get(l) ?? []), e]);
    }
    for (const line of LINES) {
      const group = byLine.get(line) ?? [];
      if (!group.length) { missing.push({ slot, tier, line, name: '' }); continue; }
      const best = pickBest(group);
      keep.set(best.id!, line);
      doomed.push(...group.filter(e => e.id !== best.id));
    }
  }
}

for (const slot of BODY_SLOTS) restructure(slot, bodyLineOf, 2);
restructure('leftHand', e => OFFHAND_LINE[e.type as string] ?? bodyLineOf(e), 2);

// 上衣／斗篷：逐件對名單，名單外的刪、名單缺的補
for (const slot of NEW_SLOTS) {
  for (let tier = 4; tier <= 7; tier++) {
    const roster = SHIRT_CLOAK_ROSTER[slot][tier];
    const here = EQUIPMENT_SEEDS.filter(e => e.slot === slot && e.tier === tier);
    for (const line of LINES) {
      const found = here.find(e => e.name === roster[line]);
      if (found) keep.set(found.id!, line);
      else missing.push({ slot, tier, line, name: roster[line] });
    }
    doomed.push(...here.filter(e => !keep.has(e.id!)));
  }
}

const gaps = missing.filter(m => !m.name);
if (gaps.length) throw new Error(`無件可留的名額：${gaps.map(g => `${g.slot} T${g.tier} ${g.line}`).join('、')}`);

const referencedIds = new Set(EQUIPMENT_SEEDS
  .map(e => e.craftPrerequisiteWeapon?.templateId).filter(Boolean) as number[]);
const blocked = doomed.filter(e => referencedIds.has(e.id!));
if (blocked.length) throw new Error(`製作前置不可刪：${blocked.map(e => e.name).join('、')}`);

console.log(`保留 ${keep.size} 件、刪除 ${doomed.length} 件、新增 ${missing.length} 件`);
const byTier = new Map<number, string[]>();
for (const e of doomed) byTier.set(e.tier!, [...(byTier.get(e.tier!) ?? []), `${e.name}(${e.slot})`]);
for (const [t, names] of [...byTier].sort((a, b) => a[0] - b[0])) {
  console.log(`  刪 T${t}（${names.length}）：${names.join('、')}`);
}
for (const m of missing) console.log(`  新增 ${m.name}（${m.slot} T${m.tier} ${m.line}）`);

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

/** 回復、額外屬性、安定值都不再放模板（§ 6A.8.8、§ 6.10） */
const STRIP = ['requiredClass', 'hpRegen', 'mpRegen', 'bonusHp', 'bonusMp', 'bonusStats', 'bonusAttributes', 'stability'];
/** 魔導書與臂甲的職業限制在 STRIP 之後寫回（§ 6.6） */
const classesFor = (type: string) => OFFHAND_CLASSES[type] ?? null;
function stripFields(line: string): string {
  let out = line;
  for (const f of STRIP) {
    out = out.replace(new RegExp(`, ${f}: (\\[[^\\]]*\\]|\\{[^}]*\\}|'[^']*'|-?\\d+)`), '');
  }
  return out;
}

let nextId = Math.max(...EQUIPMENT_SEEDS.map(e => e.id!)) + 1;
function newSeedLine(m: { slot: string; tier: number; line: ArmorLine; name: string }, i: number): string {
  const sibling = EQUIPMENT_SEEDS.find(e => e.slot === m.slot && e.tier === m.tier && keep.has(e.id!));
  if (!sibling) throw new Error(`${m.slot} T${m.tier} 沒有可參照的既有件`);
  const material = FILL_MATERIALS[i % FILL_MATERIALS.length];
  const craft = sibling.craftMaterials
    ? `, craftGold: 0, craftMaterials: ${JSON.stringify(sibling.craftMaterials).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`
    : '';
  return `  { id: ${nextId++}, name: '${m.name}', type: 'armor', slot: '${m.slot}', isTwoHanded: false, `
    + `defense: 0, line: '${m.line}', weight: ${sibling.weight ?? 0}, material: '${material}', buyPrice: 0, `
    + `acquireType: '${sibling.acquireType}', tier: ${m.tier}${craft} },`;
}

const removeIds = new Set(doomed.map(e => e.id!));
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
const out: string[] = [];
let rewritten = 0;
let lastKeptIndexBySlot = new Map<string, number>();
for (const raw of src) {
  const m = /^\s*\{ id: (\d+),/.exec(raw);
  const id = m ? Number(m[1]) : null;
  if (id !== null && removeIds.has(id)) continue;
  const line = id !== null ? keep.get(id) : undefined;
  if (!line) { out.push(raw); continue; }
  const slotMatch = /slot: '(\w+)'/.exec(raw);
  let next = stripFields(raw);
  next = /line: '\w+'/.test(next)
    ? next.replace(/line: '\w+'/, `line: '${line}'`)
    : next.replace(/(, weight:)/, `, line: '${line}'$1`);
  const typeMatch = /type: '(\w+)'/.exec(raw);
  const cls = typeMatch ? classesFor(typeMatch[1]) : null;
  if (cls) {
    next = next.replace(/(, buyPrice)/, `, requiredClass: [${cls.map(c => `'${c}'`).join(', ')}]$1`);
  }
  if (next !== raw) rewritten++;
  out.push(next);
  if (slotMatch) lastKeptIndexBySlot.set(slotMatch[1], out.length - 1);
}

// 新條目插在同部位最後一件之後，維持 seed 檔按部位分組的排列
const inserts = new Map<number, string[]>();
missing.forEach((m, i) => {
  const at = lastKeptIndexBySlot.get(m.slot);
  if (at === undefined) throw new Error(`${m.slot} 沒有可插入的位置`);
  inserts.set(at, [...(inserts.get(at) ?? []), newSeedLine(m, i)]);
});
const final: string[] = [];
out.forEach((l, i) => {
  final.push(l);
  for (const add of inserts.get(i) ?? []) final.push(add);
});

writeFileSync(SEED_PATH, final.join('\n'), 'utf-8');
console.log(`\n已刪 ${src.length - out.length} 行、新增 ${missing.length} 行、改寫 ${rewritten} 行`);
