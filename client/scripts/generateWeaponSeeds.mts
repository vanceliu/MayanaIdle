/**
 * 武器／副手 seed 產生器 —— 從 `docs/design/06-equipment-requirement.md` 的規格產生。
 *
 * **規格是唯一真實來源**：每個 (類型 × 階梯) 幾把、有哪些走向、各職業能用到第幾階。
 * 改規格 → 跑本腳本 → 跑 `repriceShopGear.mts --write` 與 `assignCraftMaterials.mts --write`
 * → 跑 `generateWeaponDocs.mts` → 跑 TTK 驗收。
 *
 * 不逐把手改 seed（平衡只能調數值或刪武器，不准新增）——
 * 要調整就改本檔的 SPEC 或 ANCHORS，重跑。
 *
 * 用法：cd client && npx vite-node scripts/generateWeaponSeeds.mts --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

const SEED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seed/equipmentSeeds.ts');
const WRITE = process.argv.includes('--write');

type Cls = 'knight' | 'elf' | 'thief' | 'elementalist' | 'priest';
const ALL_CLASSES: Cls[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];

/** 走向：決定素質偏移與附加屬性 */
type Variant = 'attack' | 'support' | 'int' | 'spi' | 'agi' | 'str' | 'defense';

interface Spec {
  type: string;
  zh: string;
  /** T1~T7 各幾把 */
  counts: [number, number, number, number, number, number, number];
  /** 走向輪替順序（依序套用；不足時取前 N 個） */
  variants: Variant[];
  /** 各職業能用到第幾階；0 = 不能用 */
  caps: Record<Cls, number>;
  /** T2 與 T7 的素質錨點（小怪/大怪/額外攻擊），中間等比內插 */
  anchor?: { t2: [number, number, number]; t7: [number, number, number] };
  /** 副手：防禦與專屬素質的錨點 */
  offhand?: { def: [number, number]; block?: [number, number]; magic?: [number, number] };
  twoHanded: boolean;
  weight: number;
}

const SPEC: Spec[] = [
  { type: 'sword', zh: '單手劍', counts: [1, 2, 3, 5, 5, 3, 3], variants: ['attack', 'support', 'int'],
    caps: { knight: 7, elf: 7, thief: 7, elementalist: 6, priest: 6 },
    anchor: { t2: [5, 4, 2], t7: [19, 18, 5] }, twoHanded: false, weight: 24 },
  { type: 'axe', zh: '單手斧', counts: [0, 1, 2, 2, 2, 2, 1], variants: ['attack', 'support'],
    caps: { knight: 7, elf: 6, thief: 6, elementalist: 6, priest: 7 },
    anchor: { t2: [5, 4, 2], t7: [20, 19, 5] }, twoHanded: false, weight: 34 },
  { type: 'mace', zh: '單手鈍器', counts: [1, 1, 1, 2, 1, 1, 1], variants: ['attack', 'support'],
    caps: { knight: 7, elf: 5, thief: 5, elementalist: 5, priest: 7 },
    anchor: { t2: [3, 6, 2], t7: [14, 19, 5] }, twoHanded: false, weight: 36 },
  { type: 'staff', zh: '法杖', counts: [1, 2, 3, 4, 4, 3, 3], variants: ['int', 'spi', 'str'],
    caps: { knight: 3, elf: 3, thief: 3, elementalist: 7, priest: 7 },
    anchor: { t2: [4, 4, 1], t7: [19, 19, 5] }, twoHanded: false, weight: 16 },
  { type: 'bow', zh: '弓', counts: [1, 2, 2, 4, 3, 4, 3], variants: ['attack', 'support', 'int'],
    caps: { knight: 4, elf: 7, thief: 6, elementalist: 4, priest: 4 },
    anchor: { t2: [7, 6, 3], t7: [23, 20, 9] }, twoHanded: true, weight: 20 },
  { type: 'twoHandSword', zh: '雙手劍', counts: [0, 1, 2, 3, 2, 2, 1], variants: ['attack', 'spi'],
    caps: { knight: 7, elf: 4, thief: 4, elementalist: 3, priest: 3 },
    anchor: { t2: [12, 10, 2], t7: [31, 28, 9] }, twoHanded: true, weight: 60 },
  { type: 'twoHandAxe', zh: '雙手斧', counts: [0, 1, 2, 3, 2, 2, 1], variants: ['attack', 'agi'],
    caps: { knight: 7, elf: 4, thief: 4, elementalist: 3, priest: 3 },
    anchor: { t2: [8, 13, 2], t7: [24, 31, 7] }, twoHanded: true, weight: 70 },
  { type: 'twoHandStaff', zh: '雙手法杖', counts: [0, 2, 3, 4, 4, 3, 3], variants: ['attack', 'support', 'str'],
    caps: { knight: 3, elf: 3, thief: 3, elementalist: 7, priest: 6 },
    anchor: { t2: [7, 7, 1], t7: [26, 26, 9] }, twoHanded: true, weight: 30 },
  { type: 'dualBlade', zh: '雙刀', counts: [1, 1, 2, 2, 2, 2, 2], variants: ['str', 'agi'],
    caps: { knight: 0, elf: 6, thief: 7, elementalist: 0, priest: 0 },
    anchor: { t2: [6, 5, 1], t7: [16, 14, 5] }, twoHanded: true, weight: 19 },
  { type: 'claw', zh: '鋼爪', counts: [0, 1, 2, 2, 2, 2, 1], variants: ['str', 'int'],
    caps: { knight: 0, elf: 0, thief: 7, elementalist: 0, priest: 0 },
    anchor: { t2: [6, 3, 1], t7: [16, 12, 5] }, twoHanded: true, weight: 14 },
  { type: 'shield', zh: '盾牌', counts: [1, 1, 2, 3, 3, 3, 3], variants: ['defense', 'spi', 'agi'],
    caps: { knight: 7, elf: 6, thief: 5, elementalist: 5, priest: 6 },
    offhand: { def: [5, 8], block: [8, 18] }, twoHanded: false, weight: 40 },
  { type: 'magicBook', zh: '魔導書', counts: [1, 1, 2, 3, 3, 3, 3], variants: ['int', 'spi', 'agi'],
    caps: { knight: 0, elf: 0, thief: 0, elementalist: 7, priest: 7 },
    offhand: { def: [5, 8], magic: [4, 11] }, twoHanded: false, weight: 12 },
  { type: 'armGuard', zh: '臂甲', counts: [0, 1, 2, 3, 3, 3, 3], variants: ['defense', 'agi', 'spi'],
    caps: { knight: 0, elf: 0, thief: 7, elementalist: 0, priest: 0 },
    offhand: { def: [5, 8], block: [3, 8] }, twoHanded: false, weight: 18 },
];

/** 等比內插：T2 與 T7 為錨點 */
function lerpGeo(t2: number, t7: number, tier: number): number {
  if (tier <= 2) return t2;
  const r = Math.pow(t7 / Math.max(t2, 0.5), 1 / 5);
  return Math.max(1, Math.round(t2 * Math.pow(r, tier - 2)));
}
function lerpLin(a: number, b: number, tier: number): number {
  return Math.round(a + (b - a) * (tier - 2) / 5);
}

/** 走向對素質的偏移 */
const VARIANT: Record<Variant, { dmg: number; hit: number; stat?: [string, string]; }> = {
  attack:  { dmg: 1.00, hit: 0 },
  support: { dmg: 0.90, hit: +2 },
  int:     { dmg: 0.95, hit: +1, stat: ['INT', '智力'] },
  spi:     { dmg: 0.90, hit: +1, stat: ['SPI', '精神'] },
  agi:     { dmg: 0.92, hit: +2, stat: ['AGI', '敏捷'] },
  str:     { dmg: 0.98, hit: -1, stat: ['STR', '力量'] },
  defense: { dmg: 1.00, hit: 0 },
};

/** 各階的取得管道（`06-equipment-acquire.md` § 6A.1） */
function acquireOf(tier: number, idx: number): 'starter' | 'shop' | 'craft' | 'drop_only' {
  if (tier === 1) return 'starter';
  if (tier <= 3) return 'shop';
  if (tier <= 5) return 'craft';
  if (tier === 6) return idx === 0 ? 'craft' : 'drop_only'; // T6 一半可製作
  return 'drop_only';
}
const CRAFT_GOLD: Record<number, number> = { 4: 50000, 5: 100000, 6: 200000 };
/** `06-equipment-acquire.md` § 6A.1：米索利與奧里哈魯根只出現在 T4 以上 */
const MAT_LOW = ['iron', 'silver', 'wood', 'dragon'];
const MAT_HIGH = ['mithril', 'orichalcum', 'dragon', 'silver', 'wood', 'iron'];

/** 沿用既有名稱：同類型依 tier 排序後逐一取用，不足才造新名 */
const EXISTING: Record<string, string[]> = {};
for (const e of EQUIPMENT_SEEDS as any[]) {
  if (!SPEC.some(s => s.type === e.type)) continue;
  (EXISTING[`${e.type}|${e.tier}`] ??= []).push(e.name);
}
/**
 * 補名池：既有名稱用完時，依 (類型 × 階梯) 取用。
 * 每一階獨立一組名字，不加「·壹」這種序號後綴。
 */
const NAME_POOL: Record<string, Record<number, string[]>> = {
  sword: { 2: ['短鋒劍'], 3: ['旅者之劍', '銀紋劍'], 4: ['鋼心劍', '霜紋劍', '獵魂劍'],
    5: ['碎星劍', '烈焰劍', '幽藍劍'], 6: ['破曉之刃', '銀月劍', '霜語劍'],
    7: ['終焉之刃', '曦光聖劍', '寂夜之劍'] },
  axe: { 2: ['伐木斧'], 3: ['裂石斧', '鐵脊斧'], 4: ['狼牙斧', '碎顱斧'],
    5: ['血月斧', '雷紋斧'], 6: ['崩岩斧', '嘯風斧'], 7: ['天罰之斧'] },
  mace: { 2: ['木槌'], 3: ['鐵槌'], 4: ['星辰鎚', '祈禱之鎚'], 5: ['審判鎚'],
    6: ['聖裁鎚'], 7: ['神罰之鎚'] },
  staff: { 2: ['橡木杖', '學徒短杖'], 3: ['靈息杖', '白樺杖', '古紋杖'],
    4: ['月讀杖', '灰燼杖', '碧泉杖', '聖光杖'], 5: ['星霜杖', '溯源杖', '晨曦杖', '幽谷杖'],
    6: ['奧術權杖', '賢者權杖', '秘紋權杖'], 7: ['星辰權杖', '創世權杖', '虹光權杖'] },
  bow: { 2: ['獵人短弓', '木弓'], 3: ['風鳴弓', '獵手長弓'],
    4: ['銀翼弓', '穿雲弓', '月弦弓', '白羽弓'], 5: ['龍翼長弓', '流星弓', '暗夜弓'],
    6: ['精靈王長弓', '星辰之弓', '雷鳴之弓', '疾影弓'], 7: ['蒼穹之弓', '天穹獵手', '星辰王弓'] },
  twoHandSword: { 2: ['重劍'], 3: ['鋼鐵巨劍', '斷岳劍'],
    4: ['霜刃巨劍', '破軍巨劍', '龍息大劍'], 5: ['屠魔巨劍', '龍牙巨劍'],
    6: ['王者之劍', '寂滅劍'], 7: ['天罰聖劍'] },
  twoHandAxe: { 2: ['重型戰斧'], 3: ['狂戰巨斧', '碎地斧'],
    4: ['巨岩戰斧', '裂鋼巨斧', '狂嵐巨斧'], 5: ['泰坦戰斧', '龍骨巨斧'],
    6: ['毀滅巨斧', '深淵巨斧'], 7: ['滅世巨斧'] },
  twoHandStaff: { 2: ['魔法長杖', '星軌長杖'], 3: ['古代長杖', '虛空長杖', '曦光長杖'],
    4: ['秘紋長杖', '星辰長杖', '深淵長杖', '聖典長杖'],
    5: ['賢者長杖', '象牙塔長杖', '幽冥長杖', '天啟長杖'],
    6: ['大法師長杖', '虹光長杖', '萬象長杖'], 7: ['創世長杖', '永恆長杖', '神諭長杖'] },
  dualBlade: { 2: ['風刃雙刀'], 3: ['疾風雙刀', '銀月雙刀'],
    4: ['烈風連刃', '影襲雙刀'], 5: ['月牙雙刀', '精靈連刃'],
    6: ['疾風雙牙', '星光連刃'], 7: ['疾影雙牙', '星隕連刃'] },
  claw: { 2: ['鋼鐵戰爪'], 3: ['裂骨戰爪', '銳齒之爪'],
    4: ['狂嵐之爪', '噬魂戰爪'], 5: ['血腥之爪', '夜影戰爪'],
    6: ['死神之爪', '月神之爪'], 7: ['虛空之爪'] },
  shield: { 2: ['鐵盾'], 3: ['騎士盾', '十字盾'], 4: ['龍鱗盾', '秘銀圓盾', '荊棘盾'],
    5: ['精鋼塔盾', '巨龍壁盾', '聖光盾'], 6: ['守護者之盾', '深淵護盾', '星辰盾'],
    7: ['不朽壁壘', '天罰之盾', '永恆守望'] },
  magicBook: { 2: ['魔力魔導書'], 3: ['秘儀典籍', '賢者手札'],
    4: ['聖典', '元素真典', '星辰卷軸'], 5: ['精靈魔導書', '神諭之書', '深淵魔典'],
    6: ['古代魔導書', '虛空之書', '聖裁之典'], 7: ['創世之書', '終焉之書', '神域聖典'] },
  armGuard: { 2: ['皮革護腕'], 3: ['鐵鑄護腕', '影織護腕'],
    4: ['疾風護腕', '龍鱗臂甲', '暗影臂環'], 5: ['深淵臂甲', '殘影護腕', '鐵誓護腕'],
    6: ['月影臂甲', '暗行護腕', '龍魂臂甲'], 7: ['終焉臂甲', '虛空護腕', '星隕臂甲'] },
};
/** 新手裝的名字是固定的（§ 99.1 第 4 條：名單只有 seed 一個來源） */
const STARTER_NAME: Record<string, string> = {
  sword: '新手劍', bow: '新手弓', staff: '新手法杖', mace: '新手鐵鎚',
  dualBlade: '新手雙刀', shield: '新手盾', magicBook: '新手魔導書',
};
// 防具／飾品的名稱也要避開 —— DB 有以 name 查表的路徑，撞名會撈到別件（§ 99.1 第 3 條）
const used = new Set<string>(
  (EQUIPMENT_SEEDS as any[]).filter(e => !SPEC.some(sp => sp.type === e.type)).map(e => e.name as string),
);
function nameFor(type: string, tier: number, idx: number): string {
  if (tier === 1 && STARTER_NAME[type]) { used.add(STARTER_NAME[type]); return STARTER_NAME[type]; }
  // 先用該 (類型 × 階梯) 的補名池，再退回既有 seed 的名字
  for (const n of NAME_POOL[type]?.[tier] ?? []) if (!used.has(n)) { used.add(n); return n; }
  for (const n of EXISTING[`${type}|${tier}`] ?? []) if (!used.has(n)) { used.add(n); return n; }
  throw new Error(`${type} T${tier} 第 ${idx + 1} 把沒有可用名稱 —— 請在 NAME_POOL 補上`);
}

const firstOf: Record<string, string> = {};
interface Row { id: number; line: string; }
const rows: Row[] = [];
let nextId = 1000;

for (const sp of SPEC) {
  for (let tier = 1; tier <= 7; tier++) {
    const n = sp.counts[tier - 1];
    if (n === 0) continue;
    // T1 是新手裝專屬階級（`06-equipment-acquire.md` § 6A.1）：每個職業恰好一把主手，不走 caps
    const STARTER: Record<string, Cls[]> = {
      sword: ['knight'], bow: ['elf'], staff: ['elementalist'], mace: ['priest'],
      dualBlade: ['thief'], shield: ['knight', 'priest'], magicBook: ['elementalist'],
    };
    const classes = tier === 1
      ? (STARTER[sp.type] ?? [])
      : ALL_CLASSES.filter(c => sp.caps[c] >= tier);
    if (classes.length === 0) continue;
    for (let i = 0; i < n; i++) {
      // 走向：不足 3 把時依 variants 順序取前 N 個（攻擊 > 輔助 > 其他）
      const v = sp.variants[i % sp.variants.length];
      const mod = VARIANT[v];
      const name = nameFor(sp.type, tier, i);
      const acquire = acquireOf(tier, i);
      const mats = tier >= 4 ? (MAT_HIGH[i % MAT_HIGH.length]) : (MAT_LOW[i % MAT_LOW.length]);
      const f: string[] = [
        `id: ${nextId++}`, `name: '${name}'`, `type: '${sp.type}'`,
        `slot: '${sp.offhand ? 'leftHand' : 'rightHand'}'`, `isTwoHanded: ${sp.twoHanded}`,
      ];
      if (sp.anchor) {
        const [s2, l2, x2] = sp.anchor.t2, [s7, l7, x7] = sp.anchor.t7;
        const s = Math.max(1, Math.round(lerpGeo(s2, s7, tier) * mod.dmg));
        const l = Math.max(1, Math.round(lerpGeo(l2, l7, tier) * mod.dmg));
        const x = Math.max(0, lerpLin(x2, x7, tier));
        f.push(`smallMonsterDamage: ${s}`, `largeMonsterDamage: ${l}`,
               `attackSuccess: ${Math.max(0, Math.round(tier / 2) + mod.hit)}`, `extraAttack: ${x}`);
      } else if (sp.offhand) {
        // § 6A.8.7 的固定階梯，不可內插 —— 防具全套 +4 的防禦目標由它反推
        const OFFHAND_DEF = [0, 4, 5, 5, 6, 6, 7, 8];        // index = tier
        const MAGIC_ATTACK = [0, 1, 4, 5, 6, 7, 8, 11];
        f.push(`defense: ${OFFHAND_DEF[tier]}`);
        if (sp.offhand.block) f.push(`blockRate: ${lerpLin(sp.offhand.block[0], sp.offhand.block[1], tier)}`);
        if (sp.offhand.magic) f.push(`magicAttack: ${MAGIC_ATTACK[tier]}`);
      }
      if (mod.stat) {
        const amount = tier >= 5 ? 2 : 1;
        f.push(`bonusStats: '${mod.stat[1]}+${amount}'`, `bonusAttributes: { ${mod.stat[0]}: ${amount} }`);
      }
      f.push(`weight: ${sp.weight}`, `material: '${mats}'`);
      if (classes.length < ALL_CLASSES.length) f.push(`requiredClass: [${classes.map(c => `'${c}'`).join(', ')}]`);
      f.push('buyPrice: 0', `stability: ${sp.offhand ? 4 : 6}`, `canBreak: ${tier < 7}`,
             `acquireType: '${acquire}'`, `tier: ${tier}`);
      if (acquire === 'craft') {
        f.push(`craftGold: ${CRAFT_GOLD[tier]}`, 'craftMaterials: []');
        // 製作鏈：T5／T6 需要同類型前一階的第一把當前置
        const prev = firstOf[`${sp.type}|${tier - 1}`];
        if (tier >= 5 && prev) f.push(`craftPrerequisiteWeapon: { name: '${prev}', quantity: 1 }`);
      }
      if (i === 0) firstOf[`${sp.type}|${tier}`] = name;
      rows.push({ id: nextId - 1, line: `  { ${f.join(', ')} },` });
    }
  }
}

// ---- 寫回 equipmentSeeds.ts：抽掉舊的武器／副手，塞入新的 ----
// 產生時要清掉的舊型別：SPEC 內的全部重生，另加已廢除的類型（匕首整型移除）
const WEAPON_TYPES = new Set([...SPEC.map(s => s.type), 'dagger']);
const src = readFileSync(SEED_FILE, 'utf-8');
const kept: string[] = [];
let inserted = false;
for (const ln of src.split('\n')) {
  const m = /name: '[^']*', type: '([^']*)'/.exec(ln);
  if (m && WEAPON_TYPES.has(m[1])) {
    if (!inserted) {
      inserted = true;
      kept.push('  // ============ 武器與副手（由 scripts/generateWeaponSeeds.mts 依');
      kept.push('  // docs/design/06-equipment-requirement.md 產生，勿手改）============');
      kept.push(...rows.map(r => r.line));
    }
    continue;
  }
  if (/^\s*\/\/ === .*（(商店|製作|掉落)）/.test(ln) && WEAPON_TYPES.size) continue;
  kept.push(ln);
}
const out = kept.join('\n');

const byType: Record<string, number> = {};
for (const sp of SPEC) byType[sp.zh] = sp.counts.reduce((a, b) => a + b, 0);
console.log('產生武器／副手：' + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('、'));
console.log(`合計 ${rows.length} 把（原 ${(EQUIPMENT_SEEDS as any[]).filter(e => WEAPON_TYPES.has(e.type)).length} 把）`);
if (WRITE) { writeFileSync(SEED_FILE, out, 'utf-8'); console.log('已寫入 equipmentSeeds.ts'); }
else console.log('（未寫入，加 --write）');
