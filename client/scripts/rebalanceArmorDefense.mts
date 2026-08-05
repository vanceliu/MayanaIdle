/**
 * 防具防禦重算 —— 依「全身防禦目標」反推每件裝備的 defense。
 *
 * 目標是**全套強化到 +4 的防禦總和**：頭＋胸＋手＋腳＋左手五件，各取該職業該階的最佳值。
 * 防具強化每 +1 給 1 點防禦（§ 6.10），五件 +4 固定貢獻 **+20**，因此
 * 「基礎值 = 目標 − 20」。這也是 T1 打不到 20 的原因：五件最少各 1 點，
 * 地板就落在 24~26，那是 +4 本身撐起來的，無法再壓。
 *
 * | 職業 | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
 * |---|---|---|---|---|---|---|---|
 * | 騎士（重甲＋盾） | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
 * | 妖精（輕甲＋盾） | 30 | 39 | 48 | 56 | 65 | 73 | 82 |
 * | 盜賊（輕甲＋臂甲） | 30 | 39 | 48 | 56 | 65 | 73 | 82 |
 * | 元素師／牧師（布甲＋書或盾） | 30 | 38 | 46 | 54 | 62 | 69 | 77 |
 *
 * **T1 的起點是新手裝的兩倍**：新手裝一律 1 防（五件合計 5），T1 基礎合計 10。
 * 舊表把 T1 壓在地板（基礎合計 5），結果新手裝的騎士總防禦 10 反而比 T1 高一倍，
 * 商店第一階完全沒有購買動機。
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
const CLASS_LINE: Record<ClassName, Line> = {
  knight: 'heavy', elf: 'light', thief: 'light', elementalist: 'robe', priest: 'robe',
};
/** 共用件（或跨路線的件）取**最弱**的那條路線，避免布甲職業拿到重甲數值 */
const LINE_RANK: Record<Line, number> = { robe: 0, light: 1, heavy: 2 };

/** 四件套的**基礎**防禦目標（T1~T7），左手另計。＝（含+4 目標 − 20 − 左手基礎） */
const SUIT_TOTAL: Record<Line, number[]> = {
  heavy: [0, 15, 25, 34, 44, 53, 62],
  light: [0, 14, 23, 30, 39, 46, 54],
  robe: [0, 13, 21, 28, 36, 42, 49],
};
/** 防具與左手裝備沒有 T1：新手裝已經涵蓋那個量級，商店從 T2 開始賣 */
const ARMOR_MIN_TIER = 2;
/** 五件全部 +4 時的固定加成（防具強化每 +1 → 防禦 +1） */
const ENHANCE_BONUS = 4 * 5;
/**
 * 每個部位的防禦階梯（T1~T7），直接列表而不是用百分比配分。
 *
 * 配分比重大致是 胸甲 32%／頭盔 24%／鞋子 24%／手套 20%
 * （原本胸甲吃 42%，一件抵掉其他三件的總和，太重）。
 * 但**百分比配分做不到兩邊都平滑**：整數化之後不是某個部位的階梯忽大忽小
 * （餘數永遠先補給同幾個部位），就是各部位平滑而總和忽大忽小。
 * 改成直接列表，錯開各部位的增量節奏，讓每個部位的階梯與全身總和同時平滑。
 *
 * 每一列的總和必須等於 `SUIT_TOTAL`，由 `assertSuitTotals()` 檢查。
 */
const SLOT_SHARE: Record<string, number> = { chest: 0.32, helmet: 0.24, boots: 0.24, gloves: 0.20 };
const SUIT_SLOTS = ['helmet', 'chest', 'gloves', 'boots'];

/**
 * 左手三種副手的防禦（T1 是新手裝，不由本表決定）。
 *
 * 原本封頂 4 點 —— 副手只佔一格卻抵一整套防具是改版前的問題根源。
 * 但**新手盾本身就有 4 防**，封在 4 等於整條商店線都買不到比新手盾好的盾，
 * 因此放寬到 8（仍只佔 T7 全身 62 點的 11%）。
 * 主要價值仍在格擋率（盾）、魔法攻擊（魔導書）與額外詞綴欄。
 */
const OFFHAND_DEFENSE: Record<string, number[]> = {
  shield: [0, 5, 5, 6, 6, 7, 8],
  magicBook: [0, 5, 5, 6, 6, 7, 8],
  armGuard: [0, 5, 5, 6, 6, 7, 8],
};
/** 盾牌格擋率改為單調遞增（原本 T4 15% > T5 12% 是倒置的） */
const BLOCK_RATE = [5, 8, 10, 12, 14, 16, 18];

/**
 * 防禦值**只由定位決定**（不是由排序決定）。
 *
 * 曾經用「第一件打滿、其餘 ×0.94」的排序式差異，結果 T7 胸甲是
 * 防禦型 23 vs 續戰型 22 —— 差 1 點防禦換 100 HP，防禦型完全沒人要，
 * 三件變成純粹湊數。落差拉到 25%／15% 之後才是真的取捨。
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

// ------------------------------------------------------------ 三件的定位

/**
 * 每個 (職業, 部位, 階級) 有 3 件可選，靠**定位**區分而不是靠數值高低：
 *
 * | 定位 | 防禦 | 附加 |
 * |---|---|---|
 * | 防禦型 | 目標滿值 | 無 |
 * | 續戰型 | 目標 −1 | 回血／回魔 ＋ HP／MP |
 * | 屬性型 | 目標 −1 | 額外屬性 +1 ＋ 1/3 量的 HP／MP |
 */
type Role = '防禦' | '續戰' | '屬性';

/** 回血／回魔的**部位上限**（T7 值）。鞋子不給回復。 */
const REGEN_CAP: Record<string, number> = { helmet: 5, chest: 15, gloves: 2, boots: 0, leftHand: 3 };
/** HP／MP 的部位上限（T7 值） */
const HP_CAP: Record<string, number> = { helmet: 40, chest: 100, gloves: 20, boots: 30, leftHand: 30 };
const MP_CAP: Record<string, number> = { helmet: 60, chest: 60, gloves: 20, boots: 20, leftHand: 30 };

/**
 * 屬性型的模式（T1~T7）：**一律 +1，不帶負屬性**。
 *
 * 曾試過「低階 +1、高階 +2 搭 −1」，但同一屬性會出現在多個部位，
 * 全身湊起來單一屬性可堆到 +8（盜賊敏捷），相對 35 點屬性上限是 +23%，
 * 而且 T3 就能拿滿、階級之間毫無差別。統一 +1 後最大堆疊降到 +4。
 * 帶負屬性的取捨變體在 +1 的量級下淨值為 0，沒有意義，因此不使用
 * （要恢復帶負屬性的變體，把 pos 調成 2 即可）。
 */
const ATTR_PATTERN: { pos: number; neg: number }[] = [
  { pos: 1, neg: 0 }, { pos: 1, neg: 0 }, { pos: 1, neg: 0 },
  { pos: 1, neg: 0 }, { pos: 1, neg: 0 }, { pos: 1, neg: 0 }, { pos: 1, neg: 0 },
];
/**
 * 屬性型額外帶的 HP／MP 比例。
 *
 * 屬性固定 +1、防禦在低階又被最小落差壓成同一個值，於是同一部位的
 * T2 與 T3 屬性型會長得一模一樣（例：沉思之環 T2 與 冥思之環 T3 都是「防 1、智力+1」）。
 * 讓屬性型每階都帶一份隨階級縮放的 HP／MP，跨階才有成長。
 * 取 1/3 是為了跟續戰型（滿量或 60%）保持明顯區隔。
 */
const ATTR_HPMP_RATIO = 1 / 3;

/**
 * 正屬性依「部位 × 路線」決定走向。
 * 三個原則：
 * - 物理傷害的來源是力量，所以**每條路線都要有力量裝**，包含布甲
 * - 智力同時給技能威力與冷卻縮減（§ 20.6），對每個職業都有用，所以**每條路線都有智力裝**
 * - 同一條路線的 5 個部位盡量走不同屬性，避免全身湊同一個屬性堆疊過量
 */
const ATTR_POSITIVE: Record<string, Record<string, string>> = {
  helmet: { heavy: 'VIT', light: 'AGI', robe: 'INT' },
  chest: { heavy: 'STR', light: 'STR', robe: 'SPI' },
  gloves: { heavy: 'INT', light: 'INT', robe: 'STR' },
  boots: { heavy: 'AGI', light: 'VIT', robe: 'AGI' },
  leftHand: { shield: 'VIT', magicBook: 'INT', armGuard: 'AGI' },
};
/** 負屬性的候選順序，取第一個與正屬性不同者 */
const ATTR_NEGATIVE: Record<string, string[]> = {
  heavy: ['AGI', 'INT', 'SPI'], light: ['STR', 'SPI', 'INT'], robe: ['STR', 'VIT', 'AGI'],
  shield: ['AGI', 'INT'], magicBook: ['STR', 'VIT'], armGuard: ['STR', 'VIT'],
};
const ATTR_ZH: Record<string, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

/** 上限依階級線性縮放；上限為 0 的部位維持 0 */
const scale = (cap: number, tier: number) => (cap === 0 ? 0 : Math.max(1, Math.round((cap * tier) / 7)));

/**
 * 續戰型的三種走向。全部都給滿回血又給滿回魔的話，每件續戰裝都長一樣；
 * 分成偏回血／偏回魔／兩者兼具之後，同一套裝備裡的續戰件才有取捨。
 * 走向依 (部位, 階級, 同組序號) 輪替，所以跨部位與跨階級都看得到不同組合。
 */
const REGEN_VARIANTS = [
  { key: '生命', hp: 1.0, mp: 0, bonusHp: 1.0, bonusMp: 0 },
  { key: '法力', hp: 0, mp: 1.0, bonusHp: 0, bonusMp: 1.0 },
  { key: '兼具', hp: 0.6, mp: 0.6, bonusHp: 0.6, bonusMp: 0.6 },
];

/** 產生該件裝備的附加素質欄位（不含 defense／blockRate／magicAttack） */
function bonusFields(role: Role, slot: string, group: string, tier: number, variant = 0): string[] {
  if (role === '防禦') return [];
  const out: string[] = [];

  if (role === '續戰') {
    const v = REGEN_VARIANTS[variant % REGEN_VARIANTS.length];
    const regen = scale(REGEN_CAP[slot], tier);
    // cap 為 0 的部位（鞋子沒有回血回魔）必須維持 0，不能被 Math.max(1, …) 撐成 1
    const part = (ratio: number, cap: number) =>
      (ratio === 0 || cap === 0 ? 0 : Math.max(1, Math.round(cap * ratio)));
    const hpR = part(v.hp, regen);
    const mpR = part(v.mp, regen);
    const hp = part(v.bonusHp, scale(HP_CAP[slot], tier));
    const mp = part(v.bonusMp, scale(MP_CAP[slot], tier));
    if (hpR > 0) out.push(`hpRegen: ${hpR}`);
    if (mpR > 0) out.push(`mpRegen: ${mpR}`);
    if (hp > 0) out.push(`bonusHp: ${hp}`);
    if (mp > 0) out.push(`bonusMp: ${mp}`);
    // 鞋子沒有回血回魔，若走向又把 HP／MP 歸零就會變成空殼，退回兼具走向
    if (!out.length) return bonusFields(role, slot, group, tier, 2);
    return out;
  }

  const { pos, neg } = ATTR_PATTERN[tier - 1];
  const posKey = ATTR_POSITIVE[slot][group];
  const negKey = ATTR_NEGATIVE[group].find(k => k !== posKey)!;
  const parts = [`${ATTR_ZH[posKey]}+${pos}`];
  const attrs = [`${posKey}: ${pos}`];
  if (neg !== 0) {
    parts.push(`${ATTR_ZH[negKey]}${neg}`);
    attrs.push(`${negKey}: ${neg}`);
  }
  const hp = Math.max(1, Math.round(scale(HP_CAP[slot], tier) * ATTR_HPMP_RATIO));
  const mp = Math.max(1, Math.round(scale(MP_CAP[slot], tier) * ATTR_HPMP_RATIO));
  out.push(`bonusHp: ${hp}`, `bonusMp: ${mp}`);
  out.push(`bonusStats: '${parts.join('、')}'`, `bonusAttributes: { ${attrs.join(', ')} }`);
  return out;
}


// ------------------------------------------------------------ 命名

/**
 * 產生器產出的防具原本叫「幻影護腕」「幻影護腕·壹」「幻影護腕·貳」，一看就是湊數。
 * 改成**每個定位有自己的字首與部位名**，同一階同一路線的三件會是三個不同的名字。
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
/** T1~T2 是過渡期：一律純防禦，不給額外屬性也不給回復 */
const LOW_TIER_MAX = 2;
/** 產生器字首（第一組）= 判斷「這件是產生器產出的」依據 */
const GENERATED_PREFIXES = new Set(
  Object.values(NAME_PREFIX).flatMap(tiers => tiers.flatMap(v => v)));

function isGenerated(name: string): boolean {
  return [...GENERATED_PREFIXES].some(pre => name.startsWith(pre));
}

// ------------------------------------------------------------ 各部位目標值

/**
 * 每部位目標：先取整數下界，餘數用**最大餘數法**分給小數部分最大的部位。
 * 固定順序補餘數會讓同幾個部位的階梯忽大忽小；最大餘數法會輪流落在不同部位，
 * 既命中總和又讓每個部位的階梯保持平滑。
 */
function suitTargets(line: Line, tier: number): Record<string, number> {
  const total = SUIT_TOTAL[line][tier - 1];
  const raw = SUIT_SLOTS.map(s => ({ s, v: total * SLOT_SHARE[s] }));
  const out: Record<string, number> = {};
  for (const { s, v } of raw) out[s] = Math.max(1, Math.floor(v));
  let left = total - SUIT_SLOTS.reduce((a, s) => a + out[s], 0);
  for (const { s } of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) {
    if (left-- <= 0) break;
    out[s] += 1;
  }
  return out;
}



function lineOf(requiredClass: readonly string[] | undefined): Line {
  const classes = (requiredClass as ClassName[] | undefined) ?? (Object.keys(CLASS_LINE) as ClassName[]);
  return classes.reduce<Line>((best, c) => {
    const l = CLASS_LINE[c];
    return l && LINE_RANK[l] < LINE_RANK[best] ? l : best;
  }, 'heavy');
}

// ------------------------------------------------------------ 分組並指派

interface Assignment {
  id: number; name: string; slot: string; tier: number; group: string;
  from: number; to: number; role: Role; bonuses: string[]; newName?: string;
}
const groups = new Map<string, typeof EQUIPMENT_SEEDS>();
for (const e of EQUIPMENT_SEEDS) {
  if (!e.tier || e.tier < ARMOR_MIN_TIER) continue;
  let key: string | null = null;
  if (e.type === 'armor' && SUIT_SLOTS.includes(e.slot)) key = `${lineOf(e.requiredClass)}|${e.slot}|${e.tier}`;
  else if (e.slot === 'leftHand' && OFFHAND_DEFENSE[e.type]) key = `${e.type}|leftHand|${e.tier}`;
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(e);
}

const LINE_CLASSES: Record<Line, ClassName[]> = {
  heavy: ['knight'], light: ['elf', 'thief'], robe: ['elementalist', 'priest'],
};
/** 副手三種各自的可用職業（用於「每職業至少一件滿值」的保證） */
const OFFHAND_CLASSES: Record<string, ClassName[]> = {
  shield: ['knight', 'elf', 'priest'], magicBook: ['elementalist', 'priest'], armGuard: ['thief'],
};

const assignments: Assignment[] = [];
for (const [key, items] of groups) {
  const [head, slot, tierStr] = key.split('|');
  const tier = Number(tierStr);
  const isOffhand = slot === 'leftHand';
  const base = isOffhand ? OFFHAND_DEFENSE[head][tier - 1] : suitTargets(head as Line, tier)[slot];
  const need = new Set(isOffhand ? OFFHAND_CLASSES[head] : LINE_CLASSES[head as Line]);

  // 定位與防禦都在後面的全域指派決定，這裡先建骨架
  for (const e of items) {
    assignments.push({
      id: e.id!, name: e.name, slot, tier, group: head, from: e.defense ?? 0,
      to: base, role: '防禦', bonuses: [],
    });
  }
}

// ------------------------------------------------------------ 定位修復

/**
 * 群組是依「路線」切的，但一個職業會跨群組取件（共用件被歸到最弱的路線），
 * 所以群組內輪替不保證「每個職業每個部位每階都看得到三種定位」。
 *
 * 改以 (部位, 階級) 為單位重新指派：每件裝備選「能補到最多職業缺口」的定位。
 * 逐職業事後修補行不通 —— 共用件會被不同職業反覆翻轉，永遠收斂不了。
 */
const ALL_ROLES: Role[] = ['防禦', '續戰', '屬性'];
const ALL_CLASSES = Object.keys(CLASS_LINE) as ClassName[];

for (const slot of [...SUIT_SLOTS, 'leftHand']) {
  for (let tier = ARMOR_MIN_TIER; tier <= 7; tier++) {
    const here = assignments.filter(a => a.slot === slot && a.tier === tier);
    if (!here.length) continue;

    const classesOf = (a: Assignment) => {
      const e = EQUIPMENT_SEEDS.find(x => x.id === a.id)!;
      return (e.requiredClass as ClassName[] | undefined) ?? ALL_CLASSES;
    };
    // 只有「該階這個部位有 3 件以上可選」的職業才需要湊齊三種定位
    const needRoles = new Map<ClassName, Set<Role>>();
    for (const cls of ALL_CLASSES) {
      if (here.filter(a => classesOf(a).includes(cls)).length >= 3) {
        needRoles.set(cls, new Set(ALL_ROLES));
      }
    }

    const base = (a: Assignment) => slot === 'leftHand'
      ? OFFHAND_DEFENSE[a.group][tier - 1]
      : suitTargets(a.group as Line, tier)[slot];
    let variant = SUIT_SLOTS.indexOf(slot) + tier;
    const apply = (a: Assignment, role: Role) => {
      a.role = role;
      a.to = roleDefense(role, base(a));
      a.bonuses = bonusFields(role, slot, a.group, tier, role === '續戰' ? variant++ : 0);
      for (const c of classesOf(a)) needRoles.get(c)?.delete(role);
    };

    // 每條路線（或每種副手）的**每個職業**都必須看得到一件防禦型，
    // 否則該職業摸不到防禦目標（例：輕甲防禦型只掛妖精時，盜賊就少 1~2 點）。
    // 先選涵蓋最廣的那件，不足才補件，把剩下的名額留給其他定位。
    const done = new Set<number>();
    for (const g of new Set(here.map(a => a.group))) {
      // T4 以上才分定位；T1~T3 全部是防禦型，直接由下方的 REST 指派
      if (tier > LOW_TIER_MAX && base(here.find(a => a.group === g)!) <= 1) continue;
      // 只需要覆蓋「這條路線本來就該服務的職業」，而且要**先挑覆蓋最多職業的那件**。
      // 否則一件只掛 ['knight','elf'] 的輕甲會先被選走、盜賊仍未覆蓋，
      // 於是又多出一件素質完全相同的防禦型（純湊數）。
      const owners = slot === 'leftHand' ? OFFHAND_CLASSES[g] : LINE_CLASSES[g as Line];
      const ownerCount = (a: Assignment) => classesOf(a).filter(c => owners.includes(c)).length;
      const pool = here.filter(a => a.group === g)
        .sort((x, y) => ownerCount(y) - ownerCount(x) || x.id - y.id);
      const present = new Set(pool.flatMap(classesOf));
      const uncovered = new Set(owners.filter(c => present.has(c)));
      for (const a of pool) {
        if (!classesOf(a).some(c => uncovered.has(c))) continue;
        apply(a, '防禦');
        done.add(a.id);
        for (const c of classesOf(a)) uncovered.delete(c);
      }
    }

    // 其餘依「能補到最多職業缺口」指派。**只在續戰／屬性之間選**：
    // 防禦型已經在上面配滿覆蓋需求，再給就會排擠掉另外兩種定位。
    // T1~T2 一律純防禦：低階不給額外屬性也不給回復，差異全部交給
    // 「購買時隨機抽的 4 個詞綴」（§ 6A.6）。T3 開始給屬性，T4 起三種定位齊全。
    const REST: Role[] = tier <= LOW_TIER_MAX ? ['防禦']
      : tier === 3 ? ['屬性'] : ['續戰', '屬性'];
    for (const a of here.filter(x => !done.has(x.id))) {
      const mine = classesOf(a).filter(c => needRoles.has(c));
      const score = (r: Role) => mine.filter(c => needRoles.get(c)!.has(r)).length;
      apply(a, [...REST].sort((x, y) =>
        score(y) - score(x) || REST.indexOf(x) - REST.indexOf(y))[0]);
    }
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
console.log(`  重新命名 ${assignments.filter(a => a.newName).length} 件`);

// ------------------------------------------------------------ 缺口檢查

const gaps: string[] = [];
for (const line of ['heavy', 'light', 'robe'] as Line[]) {
  for (const slot of SUIT_SLOTS) {
    for (let t = ARMOR_MIN_TIER; t <= 7; t++) if (!groups.has(`${line}|${slot}|${t}`)) gaps.push(`${line} ${slot} T${t}`);
  }
}
for (const type of Object.keys(OFFHAND_DEFENSE)) {
  for (let t = ARMOR_MIN_TIER; t <= 7; t++) {
    const n = groups.get(`${type}|leftHand|${t}`)?.length ?? 0;
    if (n < (t === 2 ? 1 : t === 3 ? 2 : 3)) gaps.push(`${type} T${t}（只有 ${n} 件，需 3 件）`);
  }
}

console.log(`重算 ${assignments.length} 件的防禦與附加素質`);
const roleCount = assignments.reduce<Record<string, number>>((a, x) => {
  a[x.role] = (a[x.role] ?? 0) + 1;
  return a;
}, {});
console.log(`  定位分布：${Object.entries(roleCount).map(([r, n]) => `${r}型 ${n}`).join('、')}`);
if (gaps.length) {
  console.log(`\n⚠ 缺口 ${gaps.length} 項：`);
  for (const g of gaps) console.log(`  ${g}`);
}

// ------------------------------------------------------------ 驗算：各職業全身總和

const CLS: ClassName[] = ['knight', 'elf', 'priest', 'elementalist', 'thief'];
const ZH: Record<string, string> = { knight: '騎士', elf: '妖精', priest: '牧師', elementalist: '元素師', thief: '盜賊' };
const newDef = new Map(assignments.map(a => [a.id, a.to]));
const defOf = (e: (typeof EQUIPMENT_SEEDS)[number]) => newDef.get(e.id!) ?? e.defense ?? 0;
const bestFor = (cls: ClassName, slot: string, tier: number, types?: string[]) => Math.max(0,
  ...EQUIPMENT_SEEDS.filter(e => e.tier === tier && e.slot === slot
    && (!types || types.includes(e.type))
    && (!e.requiredClass || (e.requiredClass as string[]).includes(cls))).map(defOf));

console.log('\n各職業全身防禦：');
console.log('| 職業 | | T1 | T2 | T3 | T4 | T5 | T6 | T7 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const cls of CLS) {
  const base = [1, 2, 3, 4, 5, 6, 7].map(t =>
    SUIT_SLOTS.reduce((a, s) => a + bestFor(cls, s, t), 0) + bestFor(cls, 'leftHand', t));
  console.log(`| ${ZH[cls]} | 基礎 | ${base.join(' | ')} |`);
  console.log(`| | **全套+4** | ${base.map(v => `**${v + ENHANCE_BONUS}**`).join(' | ')} |`);
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
  let next = line.replace(STRIP, '').replace(/defense: \d+/, `defense: ${a.to}`);
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
