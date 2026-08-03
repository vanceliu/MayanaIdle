/**
 * 武器 seed 產生器 —— `06-equipment-balance.md` § 6A.8.4。
 *
 * 依 `06-equipment-balance.md` § 6A.8 的三張表產生 243 筆武器：
 *  - § 6A.8.2  數量矩陣（類型 × tier）
 *  - § 6A.8.2a `requiredClass` 逐件指派（讓各職業可用總數拉平）
 *  - § 6A.8.4  素質曲線 + § 6A.8.5 職業效率反向補償
 *
 * 產出寫到 stdout，由呼叫端貼回 `equipmentSeeds.ts` 的武器區塊。
 * 防具不在本腳本範圍（Phase 5 另行處理）。
 *
 * 用法：cd client && npx vite-node scripts/generateWeaponSeeds.mts > /tmp/weapons.txt
 */

type ClassName = 'knight' | 'elf' | 'elementalist' | 'priest' | 'thief';
type WeaponType =
  | 'sword' | 'dagger' | 'axe' | 'mace' | 'staff' | 'bow'
  | 'twoHandSword' | 'twoHandAxe' | 'twoHandStaff' | 'dualBlade' | 'claw'
  | 'shield' | 'magicBook';

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];

/** § 6.7 職業武器偏好（**不可修改**）：main = 全 tier 可用；low = 只到 T3 */
const PREF: Record<WeaponType, { main: ClassName[]; low: ClassName[] }> = {
  sword:        { main: ['knight', 'elf'],           low: ['elementalist', 'priest', 'thief'] },
  dagger:       { main: ['thief'],                   low: ['knight', 'elf', 'elementalist', 'priest'] },
  axe:          { main: ['knight', 'elf'],           low: ['elementalist', 'priest'] },
  mace:         { main: ['knight', 'priest'],        low: ['elf'] },
  staff:        { main: ['elementalist', 'priest'],  low: ['knight'] },
  bow:          { main: ['elf', 'thief'],            low: ['knight', 'elementalist'] },
  twoHandSword: { main: ['knight', 'elf'],           low: [] },
  twoHandAxe:   { main: ['knight'],                  low: [] },
  twoHandStaff: { main: ['elementalist', 'priest'],  low: [] },
  dualBlade:    { main: ['elf', 'thief'],            low: [] },
  claw:         { main: ['thief'],                   low: [] },
  shield:       { main: ['knight', 'elf', 'priest'], low: [] },
  magicBook:    { main: ['elementalist', 'priest'],  low: [] },
};

/** § 6A.8.2 數量矩陣：index 0 = T1 */
const MATRIX: Record<WeaponType, number[]> = {
  //             T1 T2 T3 T4 T5 T6 T7
  sword:        [3, 3, 3, 4, 4, 4, 0],  // 21　全職業共用的大宗
  dagger:       [1, 1, 2, 2, 2, 2, 0],  // 10
  axe:          [1, 1, 2, 2, 2, 2, 0],  // 10
  mace:         [1, 1, 2, 2, 2, 2, 0],  // 10
  staff:        [2, 2, 2, 3, 3, 3, 0],  // 15
  bow:          [1, 2, 2, 2, 2, 2, 3],  // 14　妖精招牌
  twoHandSword: [1, 1, 2, 2, 2, 2, 3],  // 13　騎士招牌
  twoHandAxe:   [1, 1, 2, 2, 2, 2, 0],  // 10　騎士的 bonus 走向，止於 T6
  twoHandStaff: [1, 2, 2, 2, 2, 2, 6],  // 17　元素師＋牧師招牌（各 3）
  dualBlade:    [1, 1, 2, 2, 2, 2, 0],  // 10
  claw:         [1, 1, 2, 2, 2, 1, 3],  // 12　盜賊招牌
  shield:       [1, 1, 2, 2, 2, 2, 0],  // 10
  magicBook:    [1, 1, 2, 2, 2, 2, 0],  // 10
};

/**
 * T7 的招牌武器：**T7 一律角色專屬**，每職業 3 把同類型變體（攻擊／均衡命中／智力），
 * 讓玩家不必為了 T7 改玩別的武器類型。
 * 招牌依 `44-dps-prediction.md` § 44.5 的實測 BiS 決定。
 */
const SIGNATURE: Record<ClassName, WeaponType> = {
  knight: 'twoHandSword',   // 雙手斧為 bonus 走向，止於 T6
  elf: 'bow',
  elementalist: 'twoHandStaff',
  priest: 'twoHandStaff',
  thief: 'claw',
};

/**
 * 素質曲線分成兩層，避免「匕首與雙手劍同一個量級」的失真：
 *
 *  1. `TYPE_RANGE`：**武器類型本身的量級**（T1 → T7），沿用現有遊戲的數值感
 *     —— 匕首 3→12、單手劍 4→15、雙手劍 10→28、雙手斧 13→30
 *  2. `CLASS_FACTOR`：職業效率的**反向補償**（§ 6A.8.5）
 *
 * 最終值 = 該類型在該 tier 的量級 × 職業係數。
 *
 * 補償刻意做得溫和（0.95~1.15），不是求解器算出的 2.2 倍 ——
 * 求解器在「神裝打弱怪 3.5 秒」下要求騎士 81 基傷，數字會膨脹到失真。
 * 使用者選擇維持現有數值感，代價是 2~5 秒的 TTK 目標達不到（實測 7~9 秒）。
 */
const TYPE_RANGE: Record<WeaponType, [number, number]> = {
  sword:        [4, 15],
  dagger:       [3, 12],
  axe:          [5, 16],
  mace:         [6, 20],   // 大怪傷害
  staff:        [2, 14],
  bow:          [5, 20],
  twoHandSword: [10, 28],
  twoHandAxe:   [13, 30],  // 大怪傷害
  twoHandStaff: [5, 25],
  dualBlade:    [6, 16],
  claw:         [7, 18],
  shield:       [5, 20],   // 防禦力
  magicBook:    [2, 14],   // 魔法攻擊
};

const CLASS_FACTOR: Record<ClassName, number> = {
  knight: 1.15,        // 輪替最貧乏（基礎魔法上限 1 級），需要最高武器基傷
  thief: 1.05,
  elf: 0.95,           // 三連射一個 tick 打 3 下，效率最高
  elementalist: 0.95,
  priest: 0.95,
};

/** 依 TYPE_RANGE 在 7 階之間等比內插 */
function tierBase(type: WeaponType, tier: number): number {
  const [lo, hi] = TYPE_RANGE[type];
  const ratio = (hi / lo) ** (1 / 6);
  return lo * ratio ** (tier - 1);
}

/**
 * 各武器類型的型態特徵（由現有資料統計而來，縮放時保持不變）：
 *  - largeRatio：大怪傷害 / 小怪傷害。鈍器與雙手斧 > 1（對大怪強），鋼爪最低
 *  - headline：曲線值套在哪個欄位。鈍器／雙手斧以大怪傷害為基準（§ 6A.4）
 */
const PROFILE: Record<WeaponType, {
  largeRatio: number; headline: 'small' | 'large';
  atk: [number, number]; extra: [number, number]; weight: [number, number];
}> = {
  sword:        { largeRatio: 0.88, headline: 'small', atk: [0, 5], extra: [0, 7], weight: [16, 30] },
  dagger:       { largeRatio: 0.72, headline: 'small', atk: [1, 5], extra: [1, 9], weight: [8, 12] },
  axe:          { largeRatio: 0.87, headline: 'small', atk: [0, 2], extra: [0, 6], weight: [30, 40] },
  mace:         { largeRatio: 1.60, headline: 'large', atk: [0, 3], extra: [0, 6], weight: [15, 40] },
  staff:        { largeRatio: 1.00, headline: 'small', atk: [0, 4], extra: [0, 6], weight: [10, 18] },
  bow:          { largeRatio: 0.85, headline: 'small', atk: [1, 5], extra: [0, 8], weight: [14, 22] },
  twoHandSword: { largeRatio: 0.89, headline: 'small', atk: [0, 2], extra: [0, 6], weight: [48, 70] },
  twoHandAxe:   { largeRatio: 1.40, headline: 'large', atk: [0, 1], extra: [0, 6], weight: [60, 75] },
  twoHandStaff: { largeRatio: 0.99, headline: 'small', atk: [1, 4], extra: [0, 6], weight: [20, 32] },
  dualBlade:    { largeRatio: 0.83, headline: 'small', atk: [2, 5], extra: [2, 8], weight: [16, 20] },
  claw:         { largeRatio: 0.64, headline: 'small', atk: [0, 2], extra: [2, 8], weight: [12, 14] },
  shield:       { largeRatio: 1, headline: 'small', atk: [0, 0], extra: [0, 0], weight: [20, 40] },
  magicBook:    { largeRatio: 1, headline: 'small', atk: [0, 0], extra: [0, 0], weight: [10, 16] },
};

/** 材質依 tier（§ 6A.1 分級判定原則） */
const MATERIAL = ['iron', 'iron', 'iron', 'silver', 'mithril', 'dragon', 'orichalcum'] as const;

/**
 * 命名池：每個類型由弱到強排列，長度必須等於該類型的總把數。
 * 既有武器名稱全部保留（使用者已熟悉），不足的依既有命名規則（材質／意象／稱號）補齊。
 */
const NAMES: Record<WeaponType, string[]> = {
  sword: ['短劍', '軍用長劍', '疾風劍', '鋼鐵之劍', '護衛之劍', '騎士長劍',
    '月光長劍', '火焰長劍', '精鋼劍', '暗影彎刀', '銀騎士之劍', '寒冰之劍', '祝福騎士劍',
    '魔族殺手', '秘銀之劍', '精靈王之劍', '碎星之劍', '巴風特之刃', '龍牙聖劍', '聖銀之劍',
    '古代君王劍'],
  dagger: ['匕首', '鋼鐵匕首', '影牙', '毒蛇之牙', '血影之刺', '黑暗短刃', '夜精靈匕首',
    '暗殺者之牙', '深淵之牙', '死亡宣告'],
  axe: ['手斧', '戰斧', '鋼鐵戰斧', '狂戰士之斧', '獸人戰斧', '血戰巨斧', '龍骨戰斧',
    '霜狼之斧', '毀滅之斧', '裂魂斧'],
  mace: ['木棍', '鐵鎚', '戰鬥鐵鎚', '晨星鎚', '聖堂戰鎚', '雷鳴戰鎚', '破邪之鎚',
    '神聖制裁者', '審判之鎚', '終焉之鎚'],
  staff: ['水晶法杖', '木製法杖', '祈禱之杖', '學徒法杖', '魔力法杖', '生命法杖', '白樺法杖',
    '象牙塔法杖', '精靈法杖', '聖光之杖', '古代法杖', '星霜法杖', '大魔導法杖', '奧術權杖', '創世之杖'],
  bow: ['木弓', '長弓', '影襲者之弓', '獵人長弓', '白羽長弓', '精靈之弓', '月光之弓',
    '銀翼弓', '風行者之弓', '神射者之弓', '星辰之弓', '龍翼長弓', '精靈王長弓', '蒼穹之弓'],
  twoHandSword: ['巨劍', '蠻族巨劍', '重劍', '鋼鐵巨劍', '王國巨劍', '騎士大劍', '斷罪之劍',
    '屠魔巨劍', '龍牙巨劍', '裂空巨劍', '王者之劍', '終焉巨劍', '屠龍聖劍'],
  twoHandAxe: ['重型戰斧', '鐵壁戰斧', '狂戰巨斧', '裂地巨斧', '獸王戰斧', '血怒戰斧',
    '龍骨巨斧', '泰坦戰斧', '深淵巨斧', '毀滅巨斧'],
  twoHandStaff: ['長木杖', '魔法長杖', '祈禱長杖', '古代長杖', '魔導長杖', '象牙塔長杖',
    '賢者長杖', '星辰長杖', '天啟法杖', '大法師長杖', '深淵長杖', '創世長杖',
    '虹光長杖', '靈魂長杖', '永恆長杖', '終焉長杖', '萬象長杖'],
  dualBlade: ['雙短刀', '風刃雙刀', '月牙雙刀', '銀刃雙刀', '暗影雙刀', '精靈連刃',
    '幻影雙刀', '疾風雙牙', '星光連刃', '終焉雙牙'],
  claw: ['鐵爪', '鋼鐵戰爪', '獸牙爪', '毒蠍之爪', '夜影戰爪', '秘銀之爪', '血腥之爪',
    '幻影之爪', '月神之爪', '死神之爪', '虛空之爪', '終焉之爪'],
  shield: ['木盾', '鐵盾', '圓盾', '騎士盾', '銀騎士盾', '龍鱗盾', '精鋼塔盾',
    '龍骨盾', '守護者之盾', '神聖壁壘'],
  magicBook: ['學徒魔導書', '魔力魔導書', '咒文集', '聖典', '精靈魔導書', '神諭之書',
    '星辰之書', '古代魔導書', '深淵之書', '永恆之書'],
};

/**
 * 額外攻擊的配分（§ 6A.8.4a）。
 *
 * `extraAttack` 是**傷害算出後平加**的固定值（§ 99.1 第 63 條），
 * 與基傷同樣吃攻擊力% 乘區，因此把一部分傷害移過去是**總量中性**的，
 * 但會改變手感：基傷分小怪／大怪，額外攻擊則對兩者一視同仁 ——
 * 移得越多，武器對不同體型的表現越平均。
 *
 * 比例隨階級遞增（低階幾乎沒有、高階約三~四成），
 * 對照改版前的頂級武器：屠龍者 6/14（43%）、死神之爪 8/17（47%）、精靈王長弓 7/22（32%）。
 */
const EXTRA_SHARE_BY_TIER = [0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];

/**
 * 額外攻擊的下限（依階級）。純用比例會讓低階被取整壓成 1 ——
 * T1 單手劍基傷才 4，30% 只有 1 點，看不出這個欄位存在。
 */
const EXTRA_FLOOR_BY_TIER = [1, 2, 3, 4, 6, 8, 10];

/**
 * 類型調整：連擊型武器多分一些到額外攻擊。
 * 重型武器**不做折減** —— 額外攻擊代表武器本身的殺傷結構，與單手／雙手無關；
 * 折減會讓雙手劍的額外攻擊細到看不出來（實測 T5 只有 4 點）。
 */
const EXTRA_SHARE_MULT: Partial<Record<WeaponType, number>> = {
  dagger: 1.2, claw: 1.2, dualBlade: 1.15,
};

/**
 * 額外攻擊是**加在基傷之上**的，不是從基傷裡切出來。
 * 改版前就是這個結構（屠龍者「傷害 14 + 額外 6」，不是把 20 拆成 14+6）；
 * 切出來會讓低階基傷反而低於改版前（實測匕首 T1 從 3 掉到 2）。
 */
function extraAttackOf(type: WeaponType, tier: number, base: number, roleMult = 1): number {
  const share = EXTRA_SHARE_BY_TIER[tier - 1] * (EXTRA_SHARE_MULT[type] ?? 1) * roleMult;
  return Math.max(EXTRA_FLOOR_BY_TIER[tier - 1], Math.round(base * share));
}

// ---------------------------------------------------------------- 定位（同階武器的走向差異）

/**
 * 武器定位。同一個 (類型, tier) 內的多把武器走不同路線，避免只有名字不同。
 *
 * 硬性規則（使用者確認）：
 *  - **武器不附加回血／回魔**（`hpRegen` / `mpRegen` 只在防具上生效）
 *  - `bonusHp` / `bonusMp` 可用，**上限 100**
 *  - `bonusAttributes` 單一屬性、**最高 +2**（`99-ai-constraints.md` 第 35 條）
 *
 * 屬性的間接效果見 `20-attributes.md`：
 *  體質→HP與回血　敏捷→命中與迴避　精神→MP與魔抗　力量→物理攻擊　智力→技能威力
 */
interface Role {
  label: string;
  /**
   * 基傷調整**倍率**（不是固定值）。
   * 用固定 -1 會讓低階武器崩壞 —— 對 30 傷的雙手劍是 -3%，
   * 對 3 傷的匕首卻是 -33%，足以把 T4 壓到 T3 以下造成階梯倒置。
   */
  dmg?: number;
  atk?: number;
  /**
   * 額外攻擊的**分配比例倍率**（不是平加值）。
   * 平加會在低階變成白送傷害 —— T1 的 +3 相當於基傷的一半，足以蓋過整個階梯。
   * 改成調整比例後，走向差異存在但總傷害中性。
   */
  extraMult?: number;
  attr?: 'STR' | 'VIT' | 'AGI' | 'SPI' | 'INT';
  hp?: boolean;
  mp?: boolean;
  block?: number;
}

/** 物理職業（騎士／妖精／盜賊）的武器走向 */
const PHYSICAL_ROLES: Role[] = [
  { label: '均衡' },
  { label: '高攻擊', atk: -1, extraMult: 1.8 },
  { label: '高命中', dmg: 0.92, atk: 3 },
  { label: '力量', dmg: 0.94, attr: 'STR' },
  { label: '體質', dmg: 0.94, attr: 'VIT', hp: true },
  { label: '敏捷', dmg: 0.94, atk: 1, attr: 'AGI' },
  { label: '精神', dmg: 0.94, attr: 'SPI', mp: true },
];

/** 智力走向所有職業都給（含騎士）—— 智力同時提供技能威力與冷卻縮減（§ 20.6） */
const INT_ROLE: Role = { label: '智力', dmg: 0.94, attr: 'INT' };

/** 法系（元素師／牧師）的武器走向 */
const CASTER_ROLES: Role[] = [
  { label: '均衡' },
  { label: '力量', dmg: 1.08, attr: 'STR' },      // 高力量高物理攻擊
  { label: '精神', dmg: 0.94, attr: 'SPI', mp: true },  // 回魔＋魔抗
  { label: '智力', dmg: 0.94, attr: 'INT' },      // 增加技能輸出
  { label: '高命中', dmg: 0.92, atk: 3 },
];

const SHIELD_ROLES: Role[] = [
  { label: '均衡' },
  { label: '高格擋', block: 4 },
  { label: '體質', attr: 'VIT', hp: true },
  { label: '精神', attr: 'SPI', mp: true },
];

const BOOK_ROLES: Role[] = [
  { label: '均衡' },
  { label: '智力', attr: 'INT' },
  { label: '精神', attr: 'SPI', mp: true },
];

/** 額外屬性值：T1~T2 不給，T3~T5 為 +1，T6~T7 為 +2（上限 +2） */
const attrValue = (tier: number) => (tier <= 2 ? 0 : tier <= 5 ? 1 : 2);
/** bonusHp / bonusMp 依 tier 遞增，上限 100 */
const BONUS_POOL = [0, 10, 20, 35, 50, 75, 100];

const ATTR_ZH: Record<string, string> = { STR: '力量', VIT: '體質', AGI: '敏捷', SPI: '精神', INT: '智力' };

/**
 * T7（Boss 限定的最高階）只有三種 build：**攻擊 / 均衡命中 / 智力**。
 * 每個職業的 T7 恰好 3 把，正好一種一把。
 */
const T7_ROLES: Role[] = [
  { label: '攻擊', atk: -1, extraMult: 1.8 },
  { label: '均衡命中', atk: 2 },
  INT_ROLE,
];
function rolesFor(type: WeaponType, cls: ClassName[], tier: number): Role[] {
  if (tier === 7) return T7_ROLES;
  if (type === 'shield') return SHIELD_ROLES;
  if (type === 'magicBook') return BOOK_ROLES;
  const caster = cls.every(c => c === 'elementalist' || c === 'priest');
  if (caster) return CASTER_ROLES;
  return [...PHYSICAL_ROLES, INT_ROLE];
}

// ---------------------------------------------------------------- 製作配方（T4 / T5）

/**
 * 製作素材（`06-equipment-acquire.md` § 6A.3）。
 *  - T4：3 種素材（2 種區域素材 + 銀礦石），各 2~5 個
 *  - T5：4 種素材（同一區域的 3 種 + 米索利碎片），各 3~8 個，並需前置武器 x1
 *
 * T5 的區域素材必須來自**同一區域**，讓玩家在該區域農怪即可湊齊大部分材料。
 */
const T4_REGIONAL = [
  ['獅鷲羽毛', '雪狼毛皮'],
  ['山賊鐵塊', '凍骨碎片'],
  ['石像碎片', '冰霜蛛絲'],
];

/** § 6A.3 的 6 種區域配方組合 */
const T5_REGIONAL = [
  ['高等妖魔角', '蟲殼碎片', '洞窟菌絲'],       // 艾爾薩斯
  ['妖魔鬥士護符', '幻獸水晶', '巨人指骨'],     // 艾爾薩斯
  ['鏡面碎片', '亡靈碎骨', '潮汐珠'],           // 瓦爾登
  ['光影狐尾毛', '深海藻液', '幻光鱗粉'],       // 瓦爾登
  ['飛龍鱗片', '剝皮蛛牙', '死亡靈魂殘片'],     // 龍之谷
  ['骷髏兵裝飾', '大莫蛛眼', '亞利安結晶'],     // 龍之谷
];

/** 製作金幣：武器每 +1 傷 = 100,000、防具每 +1 防 = 50,000，上限 1,000,000（§ 6A.7） */
function craftGoldOf(type: WeaponType, tier: number, power: number): number {
  const t3Ceiling = Math.round(tierBase(type, 3) * Math.max(...Object.values(CLASS_FACTOR)));
  const perPoint = type === 'shield' ? 50_000 : 100_000;
  const diff = Math.max(1, power - t3Ceiling);
  return Math.min(1_000_000, diff * perPoint);
}

function craftMaterialsOf(tier: number, seed: number): string {
  if (tier === 4) {
    const pair = T4_REGIONAL[seed % T4_REGIONAL.length];
    return `[{ name: '${pair[0]}', amount: ${3 + (seed % 3)} }, `
      + `{ name: '${pair[1]}', amount: ${2 + (seed % 3)} }, `
      + `{ name: '銀礦石', amount: ${2 + (seed % 2)} }]`;
  }
  const trio = T5_REGIONAL[seed % T5_REGIONAL.length];
  return `[{ name: '${trio[0]}', amount: ${5 + (seed % 4)} }, `
    + `{ name: '${trio[1]}', amount: ${4 + (seed % 4)} }, `
    + `{ name: '${trio[2]}', amount: ${3 + (seed % 3)} }, `
    + `{ name: '米索利碎片', amount: ${3 + (seed % 2)} }]`;
}

// ---------------------------------------------------------------- 指派

interface Slot {
  type: WeaponType;
  tier: number;
  shared: boolean;
  classes: ClassName[] | null;
}

const TYPES = Object.keys(MATRIX) as WeaponType[];
/**
 * 共用範圍（§ 6A.8.2a）。預設 T1~T2；
 * **單手劍例外，共用到 T6** —— 它是全遊戲唯一五職業都碰得到的類型，
 * 定位就是「通用武器」，只有 T7 才收成職業專屬。
 *
 * 註：T3 以下的共用含「低階可用」職業；T4~T6 的共用只在該類型的主力職業之間
 * （單手劍即騎士＋妖精），不會讓法系拿到高階單手劍，符合 § 6.7。
 */
const SHARED_MAX_TIER = 2;
/**
 * 部分共用：某些類型在 T3~T6 仍保留固定數量的共用款。
 * 單手劍是全遊戲唯一五職業都碰得到的類型，定位為「通用武器」，
 * 因此每階留 1 把共用，其餘仍指派職業以維持可用數平均。
 */
const SHARED_PER_TIER: Partial<Record<WeaponType, number>> = { sword: 1 };

/**
 * T6 也可以共用，但**只有曲線相同的職業之間**才行 —— 一把武器只有一組數值，
 * 騎士 T7 需 81 基傷、妖精需 37，硬要共用會一邊過強一邊沒用。
 * 妖精／元素師／牧師三者曲線完全相同，法杖類的 T6 因此可自然共用。
 */
const sameCurve = (cs: ClassName[]) =>
  cs.every(c => CLASS_FACTOR[c] === CLASS_FACTOR[cs[0]]);

const slots: Slot[] = [];
for (const type of TYPES) {
  MATRIX[type].forEach((count, i) => {
    const tier = i + 1;
    for (let k = 0; k < count; k++) {
      const mains = PREF[type].main;
      // T1~T2 全共用；T3~T6 依 SHARED_PER_TIER 保留固定數量的共用款；
      // T6 若該類型主力職業係數相同（法杖類）則整階共用
      const quota = SHARED_PER_TIER[type] ?? 0;
      const canShare = tier <= SHARED_MAX_TIER
        || (tier <= 6 && k < quota)
        || (tier === 6 && mains.length > 1 && sameCurve(mains));
      slots.push(canShare
        ? { type, tier, shared: true, classes: tier <= SHARED_MAX_TIER ? [...mains, ...PREF[type].low] : [...mains] }
        : { type, tier, shared: false, classes: null });
    }
  });
}

const eligibleOf = (s: Slot): ClassName[] =>
  s.tier <= 3 ? [...PREF[s.type].main, ...PREF[s.type].low] : PREF[s.type].main;

const totals = Object.fromEntries(CLASSES.map(c => [c, 0])) as Record<ClassName, number>;
const perTier = Object.fromEntries(CLASSES.map(c => [c, Array(8).fill(0)])) as Record<ClassName, number[]>;
for (const s of slots) if (s.shared) for (const c of s.classes!) { totals[c]++; perTier[c][s.tier]++; }

const tierTotal = (t: number) => TYPES.reduce((sum, ty) => sum + MATRIX[ty][t - 1], 0);
/** 稀有階（T6/T7）本來款式就少，最低選擇數自適應 */
const minPerTier = (t: number) => Math.min(6, Math.floor(tierTotal(t) / CLASSES.length));

const pending = slots.filter(s => !s.shared)
  .sort((a, b) => eligibleOf(a).length - eligibleOf(b).length);
const give = (s: Slot, c: ClassName) => { s.classes = [c]; totals[c]++; perTier[c][s.tier]++; };

// 第一段：補足每階最低選擇數
for (const s of pending) {
  const needy = eligibleOf(s).filter(c => perTier[c][s.tier] < minPerTier(s.tier));
  if (needy.length) give(s, needy.reduce((lo, c) => perTier[c][s.tier] < perTier[lo][s.tier] ? c : lo, needy[0]));
}
// 第二段：其餘補給可用總數最少者
for (const s of pending) {
  if (s.classes) continue;
  const e = eligibleOf(s);
  give(s, e.reduce((lo, c) => totals[c] < totals[lo] ? c : lo, e[0]));
}

// ---------------------------------------------------------------- 素質

const lerp = (r: [number, number], t: number) => Math.round(r[0] + (r[1] - r[0]) * t);

/** 共用武器取合格職業中最低的係數，避免高效率職業撿到超規武器（§ 6A.8.4） */
function headlineOf(s: Slot): number {
  const base = tierBase(s.type, s.tier);
  const factors = s.classes!.map(c => CLASS_FACTOR[c]);
  const f = s.shared ? Math.min(...factors) : factors[0];
  return Math.max(1, Math.round(base * f));
}

interface Weapon extends Slot { name: string; index: number }

const byType = new Map<WeaponType, Slot[]>();
for (const s of slots) {
  if (!byType.has(s.type)) byType.set(s.type, []);
  byType.get(s.type)!.push(s);
}

const out: string[] = [];
let id = 1;
/** T5 的前置武器：同類型、同職業的 T4 —— 讓升級鏈實際可走 */
const t4ByLine = new Map<string, string>();
let recipeSeed = 0;
/**
 * 走向輪替的計數器，key = `類型-職業`。
 *
 * 不能用 `類型-tier` 當 key —— 那樣「每階只拿到 1 把」的職業會永遠固定同一種走向
 * （實測騎士的單手劍線只會拿到高命中／高攻擊，永遠沒有均衡或力量款）。
 * 改以職業為單位輪替，同一條升級線上就會依序出現不同定位。
 */
const roleIndex = new Map<string, number>();

for (const type of TYPES) {
  const list = byType.get(type)!.sort((a, b) => a.tier - b.tier);
  const names = NAMES[type];
  if (names.length !== list.length) {
    throw new Error(`${type} 命名池 ${names.length} 個 ≠ 需求 ${list.length} 個`);
  }
  const p = PROFILE[type];

  list.forEach((s, i) => {
    const name = names[i];
    const tier = s.tier;
    const frac = list.length > 1 ? i / (list.length - 1) : 0;

    // 走向：同格子內依序輪替，讓每把武器有不同定位
    // T7 依「職業」輪替（每職業僅 3~4 把，要湊齊三種 build）；
    // 其餘階依「類型×職業」輪替，讓每條升級線上的走向依序變化
    const key = tier === 7
      ? `T7-${s.classes!.join('/')}`
      : `${type}-${s.shared ? 'shared' : s.classes!.join('/')}`;
    const k = roleIndex.get(key) ?? 0;
    roleIndex.set(key, k + 1);
    const roles = rolesFor(type, s.classes!, tier);
    const role = roles[k % roles.length];

    const isTwoHanded = ['twoHandSword', 'twoHandAxe', 'twoHandStaff', 'dualBlade', 'claw', 'bow'].includes(type);
    const fields: string[] = [
      `id: ${id++}`,
      `name: '${name}'`,
      `type: '${type}'`,
      `slot: '${type === 'shield' || type === 'magicBook' ? 'leftHand' : 'rightHand'}'`,
      `isTwoHanded: ${isTwoHanded}`,
    ];

    if (type === 'shield') {
      fields.push(`defense: ${Math.round(tierBase('shield', tier))}`,
        `blockRate: ${lerp([5, 14], frac) + (role.block ?? 0)}`);
    } else if (type === 'magicBook') {
      fields.push(`defense: 0`, `magicAttack: ${Math.round(tierBase('magicBook', tier))}`);
    } else {
      const head = Math.max(1, Math.round(headlineOf(s) * (role.dmg ?? 1)));
      const extra = extraAttackOf(type, tier, head, role.extraMult ?? 1);
      const small = p.headline === 'small' ? head : Math.max(1, Math.round(head / p.largeRatio));
      const large = p.headline === 'small' ? Math.max(1, Math.round(head * p.largeRatio)) : head;
      fields.push(`smallMonsterDamage: ${small}`, `largeMonsterDamage: ${large}`,
        `attackSuccess: ${Math.max(0, lerp(p.atk, frac) + (role.atk ?? 0))}`,
        `extraAttack: ${extra}`);
    }

    // bonusHp / bonusMp 上限 100；武器一律不給 hpRegen / mpRegen
    if (role.hp) fields.push(`bonusHp: ${BONUS_POOL[tier - 1]}`);
    if (role.mp) fields.push(`bonusMp: ${BONUS_POOL[tier - 1]}`);
    // 額外屬性單一、最高 +2（第 35 條）
    const av = role.attr ? attrValue(tier) : 0;
    if (role.attr && av > 0) {
      fields.push(`bonusStats: '${ATTR_ZH[role.attr]}+${av}'`,
        `bonusAttributes: { ${role.attr}: ${av} }`);
    }

    fields.push(`weight: ${lerp(p.weight, frac)}`, `material: '${MATERIAL[tier - 1]}'`);
    if (!s.shared) fields.push(`requiredClass: ${JSON.stringify(s.classes)}`);

    if (tier <= 3) {
      const price = [5000, 30000, 150000][tier - 1] * (1 + frac);
      fields.push(`buyPrice: ${Math.round(price / 1000) * 1000}`);
    } else {
      fields.push(`buyPrice: 0`);
    }
    // T4/T5 的製作配方（§ 6A.3）
    if (tier === 4 || tier === 5) {
      const power = type === 'shield'
        ? Math.round(tierBase('shield', tier))
        : type === 'magicBook' ? Math.round(tierBase('magicBook', tier)) : headlineOf(s);
      fields.push(`craftGold: ${craftGoldOf(type, tier, power)}`,
        `craftMaterials: ${craftMaterialsOf(tier, recipeSeed++)}`);
      const line = `${type}-${s.classes!.join('/')}`;
      if (tier === 4) {
        if (!t4ByLine.has(line)) t4ByLine.set(line, name);
      } else {
        const prereq = t4ByLine.get(line);
        // 匕首→雙刀／鋼爪的前置為 x2（§ 6A.3 前置武器需求）
        if (prereq) {
          const qty = type === 'dualBlade' || type === 'claw' ? 2 : 1;
          fields.push(`craftPrerequisiteWeapon: { name: '${prereq}', quantity: ${qty} }`);
        }
      }
    }
    fields.push(`stability: ${tier >= 7 ? 0 : type === 'shield' ? 4 : 6}`,
      `canBreak: ${type !== 'shield'}`);
    const acquire = tier <= 3 ? 'shop' : tier <= 5 ? 'craft' : 'drop_only';
    fields.push(`acquireType: '${acquire}'`, `tier: ${tier}`);

    out.push(`  { ${fields.join(', ')} }, // ${role.label}`);
  });
}

console.log(`// 產生自 scripts/generateWeaponSeeds.mts —— 共 ${out.length} 把`);
console.log(out.join('\n'));

console.error('\n=== 各職業可用武器數 ===');
for (const c of CLASSES) console.error(`${c}: ${totals[c]}　每階 ${perTier[c].slice(1).join('/')}`);
console.error(`總數 ${slots.length}`);
