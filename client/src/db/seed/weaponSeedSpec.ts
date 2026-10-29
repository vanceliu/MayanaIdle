import type { AcquireType, EquipmentTemplate, EquipmentTier, WeaponMaterial, WeaponType } from '../../models/equipment';
import type { Attributes } from '../../models/attributes';

/**
 * 武器 seed 產生規格（`docs/design/06-equipment-requirement.md`）。
 *
 * `buildWeaponSeeds()` 的輸出必須與 `equipmentSeeds.ts` 的武器完全一致（`weaponSeedSpec.test.ts`）。
 * 寫回檔案由 `scripts/generateWeaponSeeds.mts` 負責。
 * 盾牌／魔導書／臂甲是防具（`06-equipment.md` § 6A.8.8），不在本規格內。
 */

type Cls = 'knight' | 'elf' | 'thief' | 'elementalist' | 'priest';
const ALL_CLASSES: Cls[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];

/** 走向：決定素質偏移與附加屬性 */
type Variant = 'attack' | 'support' | 'int' | 'spi' | 'agi' | 'str';

interface Spec {
  type: WeaponType;
  /** T1~T7 各幾把 */
  counts: [number, number, number, number, number, number, number];
  /** 走向輪替順序（不足時取前 N 個） */
  variants: Variant[];
  /** 各職業能用到第幾階；0 = 不能用 */
  caps: Record<Cls, number>;
  /** T2 與 T7 的素質錨點（小怪/大怪/額外攻擊），中間等比內插 */
  anchor: { t2: [number, number, number]; t7: [number, number, number] };
  /** 全走向的攻擊成功加成 */
  hitBonus?: number;
  twoHanded: boolean;
  weight: number;
}

export const WEAPON_SPEC: Spec[] = [
  { type: 'sword', counts: [1, 2, 3, 5, 5, 3, 3], variants: ['attack', 'support', 'int'],
    caps: { knight: 7, elf: 7, thief: 7, elementalist: 6, priest: 6 },
    anchor: { t2: [5, 4, 2], t7: [19, 18, 5] }, twoHanded: false, weight: 24 },
  { type: 'axe', counts: [0, 1, 2, 2, 2, 2, 1], variants: ['attack', 'support'],
    caps: { knight: 7, elf: 6, thief: 6, elementalist: 6, priest: 7 },
    anchor: { t2: [5, 4, 2], t7: [20, 19, 5] }, twoHanded: false, weight: 34 },
  { type: 'mace', counts: [1, 1, 1, 2, 1, 1, 1], variants: ['attack', 'support'],
    caps: { knight: 7, elf: 5, thief: 5, elementalist: 5, priest: 7 },
    anchor: { t2: [3, 6, 2], t7: [14, 19, 5] }, twoHanded: false, weight: 36 },
  { type: 'staff', counts: [1, 2, 3, 4, 4, 3, 3], variants: ['int', 'spi', 'str'],
    caps: { knight: 3, elf: 3, thief: 3, elementalist: 7, priest: 7 },
    anchor: { t2: [4, 4, 1], t7: [19, 19, 5] }, twoHanded: false, weight: 16 },
  { type: 'bow', counts: [1, 2, 2, 4, 3, 4, 3], variants: ['attack', 'support', 'int'],
    caps: { knight: 4, elf: 7, thief: 6, elementalist: 4, priest: 4 },
    anchor: { t2: [7, 6, 3], t7: [23, 20, 9] }, twoHanded: true, weight: 20 },
  { type: 'twoHandSword', counts: [0, 1, 2, 3, 2, 2, 1], variants: ['attack', 'spi'],
    caps: { knight: 7, elf: 4, thief: 4, elementalist: 3, priest: 3 },
    anchor: { t2: [12, 10, 2], t7: [31, 28, 9] }, twoHanded: true, weight: 60 },
  { type: 'twoHandAxe', counts: [0, 1, 2, 3, 2, 2, 1], variants: ['attack', 'agi'],
    caps: { knight: 7, elf: 4, thief: 4, elementalist: 3, priest: 3 },
    anchor: { t2: [8, 13, 2], t7: [24, 31, 7] }, twoHanded: true, weight: 70 },
  { type: 'twoHandStaff', counts: [0, 2, 3, 4, 4, 3, 3], variants: ['attack', 'support', 'str'],
    caps: { knight: 3, elf: 3, thief: 3, elementalist: 7, priest: 6 },
    anchor: { t2: [7, 7, 1], t7: [26, 26, 9] }, twoHanded: true, weight: 30 },
  { type: 'dualBlade', counts: [1, 1, 2, 2, 2, 2, 2], variants: ['str', 'agi'],
    caps: { knight: 0, elf: 6, thief: 7, elementalist: 0, priest: 0 },
    anchor: { t2: [5, 4, 1], t7: [15, 13, 5] }, hitBonus: 3, twoHanded: true, weight: 19 },
  { type: 'claw', counts: [0, 1, 2, 2, 2, 2, 1], variants: ['str', 'int'],
    caps: { knight: 0, elf: 0, thief: 7, elementalist: 0, priest: 0 },
    anchor: { t2: [7, 5, 1], t7: [17, 15, 5] }, twoHanded: true, weight: 14 },
];

/** 第一把武器的 id，之後依 SPEC 順序連號 */
const FIRST_ID = 1000;

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
const VARIANT: Record<Variant, { dmg: number; hit: number; stat?: [keyof Attributes, string] }> = {
  attack:  { dmg: 1.00, hit: 0 },
  support: { dmg: 0.90, hit: +2 },
  int:     { dmg: 0.95, hit: +1, stat: ['INT', '智力'] },
  spi:     { dmg: 0.90, hit: +1, stat: ['SPI', '精神'] },
  agi:     { dmg: 0.92, hit: +2, stat: ['AGI', '敏捷'] },
  str:     { dmg: 0.98, hit: -1, stat: ['STR', '力量'] },
};

/** 各階的取得管道（`06-equipment-acquire.md` § 6A.1）：T6 同類型每隔一件可製作 */
function acquireOf(tier: number, idx: number): AcquireType {
  if (tier === 1) return 'starter';
  if (tier <= 3) return 'shop';
  if (tier <= 5) return 'craft';
  if (tier === 6) return idx % 2 === 0 ? 'craft' : 'drop_only';
  return 'drop_only';
}
/** 前置武器（§ 6A.3）：T5 全部、T6 僅同類型第一件，皆為同類型前一階的第一件 */
function needsPrerequisite(tier: number, idx: number): boolean {
  return tier === 5 || (tier === 6 && idx === 0);
}
/** 製作費一律 0（`06-equipment-acquire.md` § 6A.3） */
const CRAFT_GOLD = 0;
/** `06-equipment-acquire.md` § 6A.1：米索利與奧里哈魯根只出現在 T4 以上 */
const MAT_LOW: WeaponMaterial[] = ['iron', 'silver', 'wood', 'dragon'];
const MAT_HIGH: WeaponMaterial[] = ['mithril', 'orichalcum', 'dragon', 'silver', 'wood', 'iron'];

/** T1 是新手裝專屬階級（§ 6A.1）：每個職業恰好一把主手，不走 caps */
const STARTER: Partial<Record<WeaponType, { name: string; classes: Cls[] }>> = {
  sword: { name: '新手劍', classes: ['knight'] },
  bow: { name: '新手弓', classes: ['elf'] },
  staff: { name: '新手法杖', classes: ['elementalist'] },
  mace: { name: '新手鐵鎚', classes: ['priest'] },
  dualBlade: { name: '新手雙刀', classes: ['thief'] },
};

/** 名稱池：依 (類型 × 階梯) 依序取用，用完才退回既有 seed 同階的名字 */
const NAME_POOL: Partial<Record<WeaponType, Record<number, string[]>>> = {
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
};

export const WEAPON_SPEC_TYPES: ReadonlySet<string> = new Set(WEAPON_SPEC.map(s => s.type));

/**
 * 依規格產生全部武器。`existing` 為現行 seed：
 * - 名稱避開非武器裝備（DB 有以 name 查表的路徑，§ 99.1 第 3 條）
 * - `buyPrice` 與 `craftMaterials` 依名稱沿用（由 `repriceShopGear`／`assignCraftMaterials` 寫入）；
 *   新武器為 0 與 `[]`
 */
export function buildWeaponSeeds(existing: readonly EquipmentTemplate[]): EquipmentTemplate[] {
  const existingByName = new Map(existing.filter(e => WEAPON_SPEC_TYPES.has(e.type)).map(e => [e.name, e]));
  const existingNames: Record<string, string[]> = {};
  for (const e of existing) {
    if (WEAPON_SPEC_TYPES.has(e.type)) (existingNames[`${e.type}|${e.tier}`] ??= []).push(e.name);
  }
  const used = new Set(existing.filter(e => !WEAPON_SPEC_TYPES.has(e.type)).map(e => e.name));
  const take = (name: string) => { used.add(name); return name; };
  const nameFor = (type: WeaponType, tier: number, idx: number): string => {
    if (tier === 1 && STARTER[type]) return take(STARTER[type]!.name);
    for (const n of NAME_POOL[type]?.[tier] ?? []) if (!used.has(n)) return take(n);
    for (const n of existingNames[`${type}|${tier}`] ?? []) if (!used.has(n)) return take(n);
    throw new Error(`${type} T${tier} 第 ${idx + 1} 把沒有可用名稱 —— 請在 NAME_POOL 補上`);
  };

  const firstIdOf: Record<string, number> = {};
  const out: EquipmentTemplate[] = [];
  let nextId = FIRST_ID;

  for (const sp of WEAPON_SPEC) {
    for (let tier = 1; tier <= 7; tier++) {
      const n = sp.counts[tier - 1];
      if (n === 0) continue;
      const classes = tier === 1
        ? (STARTER[sp.type]?.classes ?? [])
        : ALL_CLASSES.filter(c => sp.caps[c] >= tier);
      if (classes.length === 0) continue;
      for (let i = 0; i < n; i++) {
        const id = nextId++;
        const mod = VARIANT[sp.variants[i % sp.variants.length]];
        const name = nameFor(sp.type, tier, i);
        const acquireType = acquireOf(tier, i);
        const prev = existingByName.get(name);
        const [s2, l2, x2] = sp.anchor.t2, [s7, l7, x7] = sp.anchor.t7;
        const statAmount = tier >= 5 ? 2 : 1;
        const prereqId = firstIdOf[`${sp.type}|${tier - 1}`];

        // 欄位順序即 seed 檔的書寫順序
        out.push({
          id, name, type: sp.type, slot: 'rightHand', isTwoHanded: sp.twoHanded,
          smallMonsterDamage: Math.max(1, Math.round(lerpGeo(s2, s7, tier) * mod.dmg)),
          largeMonsterDamage: Math.max(1, Math.round(lerpGeo(l2, l7, tier) * mod.dmg)),
          attackSuccess: Math.max(0, Math.round(tier / 2) + mod.hit + (sp.hitBonus ?? 0)),
          extraAttack: Math.max(0, lerpLin(x2, x7, tier)),
          ...(mod.stat && {
            bonusStats: `${mod.stat[1]}+${statAmount}`,
            bonusAttributes: { [mod.stat[0]]: statAmount },
          }),
          weight: sp.weight,
          material: tier >= 4 ? MAT_HIGH[i % MAT_HIGH.length] : MAT_LOW[i % MAT_LOW.length],
          ...(classes.length < ALL_CLASSES.length && { requiredClass: [...classes] }),
          buyPrice: prev?.buyPrice ?? 0,
          stability: 6,
          canBreak: tier < 7,
          acquireType,
          tier: tier as EquipmentTier,
          ...(acquireType === 'craft' && {
            craftGold: CRAFT_GOLD,
            craftMaterials: (prev?.craftMaterials ?? []).map(m => ({ ...m })),
            ...(needsPrerequisite(tier, i) && prereqId != null && {
              craftPrerequisiteWeapon: { templateId: prereqId, quantity: 1 },
            }),
          }),
        });
        if (i === 0) firstIdOf[`${sp.type}|${tier}`] = id;
      }
    }
  }
  return out;
}
