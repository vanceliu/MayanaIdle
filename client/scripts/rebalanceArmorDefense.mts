/**
 * 防具防禦重算 —— 依「全身防禦目標」寫回每件裝備的 defense 與附加素質。
 *
 * 目標是**全套強化到 +4 的防禦總和**，各職業該階能穿到的最佳值相加。
 * 防具強化每 +1 給 1 點防禦（§ 6.10）。T2~T3 的可穿件是頭胸手腳＋左手五件（+4 共 20），
 * T4 起多了上衣與斗篷，變成七件（+4 共 28）。
 *
 * | 職業 | T2 | T3 | T4 | T5 | T6 | T7 |
 * |---|---|---|---|---|---|---|
 * | 騎士（重甲＋盾） | 40 | 50 | 60 | 70 | 80 | 90 |
 * | 妖精（輕甲＋盾） | 39 | 48 | 56 | 65 | 73 | 81 |
 * | 盜賊（輕甲＋臂甲） | 39 | 48 | 56 | 65 | 73 | 82 |
 * | 元素師／牧師（布甲＋書或盾） | 38 | 46 | 54 | 62 | 69 | 77 |
 *
 * 名額與職業由 `restructureArmor.mts` 決定，本腳本只認 seed 現況（路線＝可用職業、
 * 定位＝現有附加素質），不自行指派。
 *
 * 用法：cd client && npx vite-node scripts/rebalanceArmorDefense.mts [--write]
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
const CLASS_LINE: Record<ClassName, Line> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
/** 共用件（或跨路線的件）取**最弱**的那條路線，避免布甲職業拿到重甲數值 */
const LINE_RANK: Record<Line, number> = { robe: 0, light: 1, heavy: 2 };

/**
 * 四件套的**基礎**防禦目標，逐部位直接列表（T2~T7）。
 *
 * 百分比配分做不到「每部位階梯平滑」與「總和命中目標」兩者兼顧，
 * 整數化的餘數永遠先補給同幾個部位。直接列表才能錯開各部位的增量節奏。
 *
 * **T4 是新欄位的開放階**：上衣與斗篷加入後，全套 +4 的固定加成從 20 變 28，
 * 基礎總量因此必須少 8。重甲的 T4 剛好持平 T3，輕甲與布甲各有兩個部位 −1，
 * 那一階的成長由上衣與斗篷承擔。
 */
const SUIT_TARGET: Record<Line, Record<string, number[]>> = {
  heavy: {
    helmet: [0, 4, 6, 6, 8, 9, 11],
    chest: [0, 5, 8, 8, 10, 12, 14],
    gloves: [0, 3, 5, 5, 6, 8, 9],
    boots: [0, 3, 6, 6, 8, 9, 10],
  },
  light: {
    helmet: [0, 3, 6, 5, 6, 8, 9],
    chest: [0, 5, 7, 7, 9, 10, 12],
    gloves: [0, 3, 5, 4, 6, 6, 7],
    boots: [0, 3, 5, 5, 6, 7, 8],
  },
  robe: {
    helmet: [0, 3, 5, 5, 6, 6, 8],
    chest: [0, 4, 7, 6, 8, 9, 10],
    gloves: [0, 3, 4, 4, 5, 6, 6],
    boots: [0, 3, 5, 4, 5, 6, 7],
  },
};
/** 防具與左手裝備沒有 T1：新手裝已經涵蓋那個量級，商店從 T2 開始賣 */
const ARMOR_MIN_TIER = 2;
/** 上衣與斗篷的開放階（`06-equipment.md` § 6A.8.9） */
const NEW_SLOT_MIN_TIER = 4;
/** 全套 +4 的固定加成：T2~T3 五件、T4 起七件 */
const enhanceBonus = (tier: number) => 4 * (tier >= NEW_SLOT_MIN_TIER ? 7 : 5);
const SUIT_SLOTS = ['helmet', 'chest', 'gloves', 'boots'];

/**
 * 上衣與斗篷的防禦階梯（T4~T7）。全職業共用，同階兩件同值 ——
 * 兩件的差異走附加素質，不走防禦（§ 6A.8.9）。
 *
 * 上衣 T4 的 0 是有意的：防禦全部來自強化。強化計入防禦看的是裝備分類，
 * 不是基礎防禦數值（`21-combat-formula.md` § 21.5）。
 */
const NEW_SLOT_DEFENSE: Record<string, number[]> = {
  shirt: [0, 1, 2, 3],
  cloak: [1, 3, 5, 7],
};
/**
 * 上衣：T5 起每階兩件，偏回血／偏回魔。
 * **T4 不給回復** —— 該階的防禦也是 0，所以 T4 只有一件，價值全在詞綴欄與強化。
 */
const SHIRT_VARIANTS = ['hpRegen', 'mpRegen'];
const SHIRT_REGEN = [0, 3, 4, 5];
/**
 * 斗篷逐階指定走向與件數（T4 3 件、T5~T6 各 2 件、T7 1 件）。
 * 順序必須與 `generateShirtCloakSeeds.mts` 的名稱清單一致 —— 兩邊都依 id 遞增比對。
 */
interface CloakSpec { attr?: 'STR' | 'VIT' | 'INT'; hpRegen?: number; mpRegen?: number }
const CLOAK_ROSTER: Record<number, CloakSpec[]> = {
  4: [{ attr: 'INT' }, { attr: 'STR' }, { attr: 'VIT' }],
  5: [{ mpRegen: 3 }, { attr: 'VIT', hpRegen: 3 }],
  6: [{ attr: 'INT', mpRegen: 3 }, { attr: 'STR' }],
  7: [{ hpRegen: 5, mpRegen: 5 }],
};

/**
 * 左手三種副手的防禦（T1 是新手裝，不由本表決定）。
 *
 * 原本封頂 4 點 —— 副手只佔一格卻抵一整套防具是改版前的問題根源。
 * 但**新手盾本身就有 4 防**，封在 4 等於整條商店線都買不到比新手盾好的盾，
 * 因此放寬到 8。主要價值仍在格擋率（盾）、魔法攻擊（魔導書）與額外詞綴欄。
 */
const OFFHAND_DEFENSE: Record<string, number[]> = {
  shield: [0, 5, 5, 6, 6, 7, 8],
  magicBook: [0, 5, 5, 6, 6, 7, 8],
  armGuard: [0, 5, 5, 6, 6, 7, 8],
};
/** 盾牌格擋率單調遞增 */
const BLOCK_RATE = [5, 8, 10, 12, 14, 16, 18];

/**
 * 防禦值**只由定位決定**（不是由排序決定）。
 *
 * 曾經用「第一件打滿、其餘 ×0.94」的排序式差異，結果 T7 胸甲是
 * 防禦型 23 vs 續戰型 22 —— 差 1 點防禦換一堆回復，防禦型完全沒人要。
 * 落差拉到 25%／15% 之後才是真的取捨。
 */
const ROLE_DEFENSE_CUT: Record<string, { pct: number; min: number }> = {
  防禦: { pct: 0, min: 0 },
  屬性: { pct: 0.15, min: 1 },
  續戰: { pct: 0.25, min: 2 },
};
/**
 * 落差同時看百分比與**絕對最小值**。只用百分比的話低階會被四捨五入吃掉 ——
 * T2 輕甲胸甲目標 3，3 × 0.85 = 2.55 → 3，屬性型跟防禦型防禦一樣卻多一個力量+1，
 * 防禦型直接變成沒人會選的選項。
 */
const roleDefense = (role: string, target: number) => {
  const { pct, min } = ROLE_DEFENSE_CUT[role];
  return Math.max(1, target - Math.max(min, Math.round(target * pct)));
};

// ------------------------------------------------------------ 附加素質

/**
 * 回血／回魔的**部位上限**（T7 值）。鞋子與斗篷不給回復。
 * **防具不給 HP／MP** —— 那兩項只來自詞綴與飾品（`06-equipment.md` § 6A.8.8）。
 */
const REGEN_CAP: Record<string, number> = {
  helmet: 5, chest: 15, shirt: 5, gloves: 2, boots: 0, cloak: 5, leftHand: 3,
};

/** 屬性型一律 +1、不帶負屬性 —— +2 在 T3 就拿得滿，階級之間會沒有差別 */
const ATTR_POS = 1;
/**
 * 正屬性依「部位 × 路線」決定走向。
 * - 物理傷害的來源是力量，所以**每條路線都要有力量裝**，包含布甲
 * - 智力同時給技能威力與冷卻縮減（§ 20.6），對每個職業都有用，所以**每條路線都有智力裝**
 * - 同一條路線的部位盡量走不同屬性，避免全身湊同一個屬性堆疊過量
 */
const ATTR_POSITIVE: Record<string, Record<string, string>> = {
  helmet: { heavy: 'VIT', light: 'AGI', robe: 'INT' },
  chest: { heavy: 'STR', light: 'STR', robe: 'SPI' },
  gloves: { heavy: 'INT', light: 'INT', robe: 'STR' },
  boots: { heavy: 'AGI', light: 'VIT', robe: 'AGI' },
  leftHand: { shield: 'VIT', magicBook: 'INT', armGuard: 'AGI' },
};
const ATTR_ZH: Record<string, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

/** 上限依階級線性縮放；上限為 0 的部位維持 0 */
const scale = (cap: number, tier: number) => (cap === 0 ? 0 : Math.max(1, Math.round((cap * tier) / 7)));

/**
 * 續戰型的三種走向。全部都給滿回血又給滿回魔的話，每件續戰裝都長一樣；
 * 分成偏回血／偏回魔／兩者兼具之後，同一套裝備裡的續戰件才有取捨。
 */
const REGEN_VARIANTS = [
  { hp: 1.0, mp: 0 },
  { hp: 0, mp: 1.0 },
  { hp: 0.6, mp: 0.6 },
];

/** 產生該件裝備的附加素質欄位（不含 defense／blockRate／magicAttack） */
function bonusFields(role: Role, slot: string, group: string, tier: number, variant = 0): string[] {
  if (role === '防禦') return [];

  if (role === '續戰') {
    const v = REGEN_VARIANTS[variant % REGEN_VARIANTS.length];
    const regen = scale(REGEN_CAP[slot], tier);
    const part = (ratio: number) => (ratio === 0 || regen === 0 ? 0 : Math.max(1, Math.round(regen * ratio)));
    const out: string[] = [];
    if (part(v.hp) > 0) out.push(`hpRegen: ${part(v.hp)}`);
    if (part(v.mp) > 0) out.push(`mpRegen: ${part(v.mp)}`);
    // 回復上限 0 的部位（鞋子、斗篷）沒有續戰型名額，見 `restructureArmor.mts` 的 roster
    return out;
  }

  const posKey = ATTR_POSITIVE[slot][group];
  return [`bonusStats: '${ATTR_ZH[posKey]}+${ATTR_POS}'`, `bonusAttributes: { ${posKey}: ${ATTR_POS} }`];
}

// ------------------------------------------------------------ 命名

/**
 * 產生器產出的防具原本叫「幻影護腕」「幻影護腕·壹」，一看就是湊數。
 * 改成**每個定位有自己的字首與部位名**，同一階同一路線的件會是不同的名字。
 * 只改產生器產出的件（字首在下表內），手寫的舊裝備名稱一律保留。
 */
const NAME_PREFIX: Record<Line, string[][]> = {
  heavy: [
    ['鐵衛', '鐵壁', '鐵誓'], ['鋼衛', '鋼壁', '鋼心'], ['精鋼', '銳鋼', '鋼魂'],
    ['銀衛', '銀盾', '銀誓'], ['秘銀', '秘盾', '秘誓'], ['龍衛', '龍鱗', '龍魂'],
    ['天龍', '龍威', '聖龍'],
  ],
  light: [
    ['皮革', '獵徑', '輕巧'], ['獵手', '追風', '輕羽'], ['獵風', '疾行', '風痕'],
    ['銀羽', '銀翼', '迅羽'], ['秘羽', '秘翼', '幽羽'], ['影狼', '月影', '暗行'],
    ['幻影', '夜影', '疾風'],
  ],
  robe: [
    ['布織', '初咒', '靜心'], ['學徒', '初語', '沉思'], ['祈禱', '聖詠', '冥思'],
    ['銀紋', '銀符', '聖紋'], ['秘紋', '秘符', '玄紋'], ['賢者', '智者', '秘典'],
    ['星辰', '星輝', '天啟'],
  ],
};
/** 部位名同樣依定位換字，避免「同字首＋同部位」的重複感 */
const NAME_NOUN: Record<string, Record<Line, string[]>> = {
  helmet: {
    heavy: ['頭盔', '面甲', '頭冠'], light: ['頭巾', '額帶', '兜帽'], robe: ['之冠', '頭環', '之環'],
  },
  chest: {
    heavy: ['鎧甲', '胸甲', '板甲'], light: ['皮衣', '戰衣', '輕甲'], robe: ['長袍', '法衣', '聖袍'],
  },
  gloves: {
    heavy: ['護手', '拳套', '手甲'], light: ['護腕', '指套', '臂環'], robe: ['手套', '之手', '咒手'],
  },
  boots: {
    heavy: ['戰靴', '重靴', '鐵靴'], light: ['之靴', '軟靴', '疾靴'], robe: ['布鞋', '踏靴', '之履'],
  },
};
const ROLE_NAME_INDEX: Record<string, number> = { 防禦: 0, 續戰: 1, 屬性: 2 };
const GENERATED_PREFIXES = new Set(
  Object.values(NAME_PREFIX).flatMap(tiers => tiers.flatMap(v => v)));

function isGenerated(name: string): boolean {
  return [...GENERATED_PREFIXES].some(pre => name.startsWith(pre));
}

// ------------------------------------------------------------ 讀 seed 現況

type Item = (typeof EQUIPMENT_SEEDS)[number];
const ALL_CLASSES = Object.keys(CLASS_LINE) as ClassName[];
const classesOf = (e: Item) => (e.requiredClass as ClassName[] | undefined) ?? ALL_CLASSES;
const lineOf = (e: Item): Line =>
  classesOf(e).reduce<Line>((best, c) => (LINE_RANK[CLASS_LINE[c]] < LINE_RANK[best] ? CLASS_LINE[c] : best), 'heavy');
const roleOf = (e: Item): Role =>
  e.bonusAttributes ? '屬性' : (e.hpRegen || e.mpRegen || e.bonusHp || e.bonusMp) ? '續戰' : '防禦';

interface Assignment {
  id: number; name: string; slot: string; tier: number; group: string;
  from: number; to: number; role: Role; bonuses: string[]; newName?: string;
  /** true = 該件的附加素質不由本腳本管，寫回時原封不動 */
  keepBonuses?: boolean;
}
const assignments: Assignment[] = [];

/** 頭胸手腳＋左手：定位讀 seed 現況，防禦由目標表決定 */
for (const slot of [...SUIT_SLOTS, 'leftHand']) {
  for (let tier = ARMOR_MIN_TIER; tier <= 7; tier++) {
    const here = EQUIPMENT_SEEDS
      .filter(e => e.tier === tier && e.slot === slot && e.acquireType !== 'starter'
        && (slot === 'leftHand' ? OFFHAND_DEFENSE[e.type] : e.type === 'armor'))
      .sort((a, b) => a.id! - b.id!);
    let variant = SUIT_SLOTS.indexOf(slot) + tier;
    for (const e of here) {
      const group = slot === 'leftHand' ? e.type : lineOf(e);
      const base = slot === 'leftHand'
        ? OFFHAND_DEFENSE[e.type][tier - 1]
        : SUIT_TARGET[group as Line][slot][tier - 1];
      const role = roleOf(e);
      // 左手（盾牌／魔導書／臂甲）**不套三定位**（§ 6A.8.8）：防禦一律給滿，
      // 附加素質**完全不動** —— 三件的走向（攻擊型 INT／輔助型 SPI／敏捷型 AGI）
      // 由 `06-equipment-requirement.md` 的武器規格決定，是手工維護的資料。
      // 交給 `bonusFields()` 會把三種走向洗成同一個屬性。
      const isOffhand = slot === 'leftHand';
      assignments.push({
        id: e.id!, name: e.name, slot, tier, group, from: e.defense ?? 0,
        to: isOffhand ? base : roleDefense(role, base), role,
        bonuses: isOffhand ? [] : bonusFields(role, slot, group, tier, role === '續戰' ? variant++ : 0),
        keepBonuses: isOffhand,
      });
    }
  }
}

/** 上衣／斗篷：全職業共用，同階兩件同防禦，差異走附加素質 */
for (const slot of ['shirt', 'cloak']) {
  for (let tier = NEW_SLOT_MIN_TIER; tier <= 7; tier++) {
    const here = EQUIPMENT_SEEDS
      .filter(e => e.tier === tier && e.slot === slot).sort((a, b) => a.id! - b.id!);
    if (slot === 'cloak' && here.length !== CLOAK_ROSTER[tier].length) {
      throw new Error(`斗篷 T${tier}：seed ${here.length} 件，走向表 ${CLOAK_ROSTER[tier].length} 件`);
    }
    here.forEach((e, i) => {
      const def = NEW_SLOT_DEFENSE[slot][tier - NEW_SLOT_MIN_TIER];
      const spec: CloakSpec = slot === 'cloak' ? CLOAK_ROSTER[tier][i] : {};
      const shirtRegen = SHIRT_REGEN[tier - NEW_SLOT_MIN_TIER];
      const bonuses = slot === 'shirt'
        ? (shirtRegen > 0 ? [`${SHIRT_VARIANTS[i % 2]}: ${shirtRegen}`] : [])
        : [
            ...(spec.hpRegen ? [`hpRegen: ${spec.hpRegen}`] : []),
            ...(spec.mpRegen ? [`mpRegen: ${spec.mpRegen}`] : []),
            ...(spec.attr
              ? [`bonusStats: '${ATTR_ZH[spec.attr]}+${ATTR_POS}'`,
                 `bonusAttributes: { ${spec.attr}: ${ATTR_POS} }`]
              : []),
          ];
      assignments.push({
        id: e.id!, name: e.name, slot, tier, group: 'shared', from: e.defense ?? 0,
        to: def, role: slot === 'cloak' && spec.attr ? '屬性' : '續戰', bonuses,
      });
    });
  }
}

// ------------------------------------------------------------ 依定位重新命名

const takenNames = new Set(EQUIPMENT_SEEDS
  .filter(e => !(e.type === 'armor' && SUIT_SLOTS.includes(e.slot) && isGenerated(e.name)))
  .map(e => e.name));

for (const a of assignments) {
  if (!SUIT_SLOTS.includes(a.slot) || !isGenerated(a.name)) continue;
  const line = a.group as Line;
  const prefixes = NAME_PREFIX[line][a.tier - 1];
  const nouns = NAME_NOUN[a.slot][line];
  const start = ROLE_NAME_INDEX[a.role];
  // 先試「該定位的字首＋該定位的部位名」，撞名再依序換其他組合
  let picked = '';
  for (let d = 0; d < prefixes.length * nouns.length && !picked; d++) {
    const cand = prefixes[(start + d) % prefixes.length]
      + nouns[(start + Math.floor(d / prefixes.length)) % nouns.length];
    if (!takenNames.has(cand)) picked = cand;
  }
  if (!picked) throw new Error(`${a.name}：命名組合用盡`);
  takenNames.add(picked);
  a.newName = picked;
}
console.log(`重算 ${assignments.length} 件；重新命名 ${assignments.filter(a => a.newName).length} 件`);

const roleCount = assignments.reduce<Record<string, number>>((a, x) => {
  a[x.role] = (a[x.role] ?? 0) + 1;
  return a;
}, {});
console.log(`  定位分布：${Object.entries(roleCount).map(([r, n]) => `${r}型 ${n}`).join('、')}`);

// 只檢查本腳本負責寫附加素質的件。左手不歸這裡管；
// T4 上衣沒有回復也沒有防禦，是刻意的空殼（價值在詞綴欄與強化）
const empty = assignments.filter(a =>
  a.role !== '防禦' && !a.bonuses.length && !a.keepBonuses
  && !(a.slot === 'shirt' && a.tier === NEW_SLOT_MIN_TIER));
if (empty.length) {
  console.log(`\n⚠ ${empty.length} 件非防禦型卻沒有附加素質：${empty.map(a => `${a.name}(${a.slot} T${a.tier})`).join('、')}`);
}

// ------------------------------------------------------------ 驗算：各職業全身總和

const CLS: ClassName[] = ['knight', 'elf', 'priest', 'elementalist', 'thief'];
const ZH: Record<string, string> = { knight: '騎士', elf: '妖精', priest: '牧師', elementalist: '元素師', thief: '盜賊' };
const newDef = new Map(assignments.map(a => [a.id, a.to]));
const defOf = (e: Item) => newDef.get(e.id!) ?? e.defense ?? 0;
const bestFor = (cls: ClassName, slot: string, tier: number) => Math.max(0,
  ...EQUIPMENT_SEEDS.filter(e => e.tier === tier && e.slot === slot && e.acquireType !== 'starter'
    && (!e.requiredClass || (e.requiredClass as string[]).includes(cls))).map(defOf));
/** 左手的階梯上限依職業各自不同，到頂之後角色不會空手，是繼續戴上一階 */
const bestOffhand = (cls: ClassName, tier: number) => Math.max(0,
  ...[2, 3, 4, 5, 6, 7].filter(t => t <= tier).map(t => bestFor(cls, 'leftHand', t)));

console.log('\n各職業全身防禦：');
console.log('| 職業 | | T2 | T3 | T4 | T5 | T6 | T7 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const cls of CLS) {
  const base = [2, 3, 4, 5, 6, 7].map(t =>
    [...SUIT_SLOTS, 'shirt', 'cloak'].reduce((a, s) => a + bestFor(cls, s, t), 0) + bestOffhand(cls, t));
  console.log(`| ${ZH[cls]} | 基礎 | ${base.join(' | ')} |`);
  console.log(`| | **全套+4** | ${base.map((v, i) => `**${v + enhanceBonus(i + 2)}**`).join(' | ')} |`);
}

if (!WRITE) {
  console.log('\n（未寫入。加 --write 才會改 equipmentSeeds.ts）');
  process.exit(0);
}

// ------------------------------------------------------------ 寫回

const byId = new Map(assignments.map(a => [a.id, a]));
const shieldIds = new Set(EQUIPMENT_SEEDS.filter(e => e.type === 'shield').map(e => e.id!));
/** 附加素質整批重寫，所以先把舊值全部剝掉，避免殘留 */
const STRIP = /, (?:hpRegen|mpRegen|bonusHp|bonusMp): \d+|, bonusStats: '[^']*'|, bonusAttributes: \{[^}]*\}/g;
const src = readFileSync(SEED_PATH, 'utf-8').split('\n');
let changed = 0;
const out = src.map(line => {
  const m = /^\s*\{ id: (\d+),/.exec(line);
  if (!m) return line;
  const a = byId.get(Number(m[1]));
  if (!a) return line;
  let next = (a.keepBonuses ? line : line.replace(STRIP, ''))
    .replace(/defense: \d+/, `defense: ${a.to}`);
  if (a.newName) next = next.replace(/name: '[^']*'/, `name: '${a.newName}'`);
  if (shieldIds.has(a.id)) next = next.replace(/blockRate: \d+/, `blockRate: ${BLOCK_RATE[a.tier - 1]}`);
  if (a.bonuses.length) {
    next = next.replace(/(defense: \d+)/, `$1, ${a.bonuses.join(', ')}`);
  }
  if (next !== line) changed++;
  return next;
});
writeFileSync(SEED_PATH, out.join('\n'), 'utf-8');
console.log(`\n已寫入 ${changed} 行`);
