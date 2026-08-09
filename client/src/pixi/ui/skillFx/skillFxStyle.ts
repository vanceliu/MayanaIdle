/**
 * 技能 → 演出原型的判定（`48-vfx.md` § 48.7.3）。
 *
 * **這裡是純函式，沒有 Pixi**，所以判定本身可以直接跑 unit test ——
 * 75 個技能有沒有人掉出所有規則之外，測試掃一次就知道。
 *
 * 判定盡量從 `Skill` 既有欄位推導，**新增技能不需要改這個檔案**。
 * 兩張逐技能表是例外，因為那兩件事讀不出任何欄位（見下方註解）。
 */
import type { SkillElement, SkillTarget, SkillType } from '../../../models/skill';
import type { ProjectileShape } from '../projectileStyle';
import { getElementProjectileColor } from '../projectileStyle';
import {
  BUFF_AURA_COLOR, DEBUFF_AURA_COLOR,
  resolveBuffEmblem, resolveBuffShield, resolveDebuffAccent,
  type EmblemKind, type ShieldKind,
} from './geometry';

/** 判定只吃這幾個欄位 —— 傳整個 `Skill` 也可以 */
export interface SkillFxInput {
  id: string;
  element: SkillElement;
  type: SkillType;
  target: SkillTarget;
  range?: number;
  aoeCenter?: 'target' | 'self';
  aoeRadius?: number;
  requiredWeaponType?: string;
  /** buff 的分類。決定要不要在頭上放徽記（§ 48.8.1） */
  buffCategory?: string;
  /** 多段判定的段數（`23-class-magic.md` § 23.1.1 的三連射） */
  hits?: number;
  /** 命中時附加的 debuff。決定命中要點綴什麼顏色（§ 48.7.4.3） */
  applyDebuff?: { tags: string[] };
  /**
   * buff 提升哪些數值。沒有 `buffCategory` 的 buff 靠它決定徽記
   * （敏捷提升／力量提升，§ 48.8.1）。
   */
  buffModifiers?: readonly { stat: string }[];
}

/** 送達方式：從施法者到落點這一段怎麼走 */
export type SkillFxDelivery = 'none' | 'travel' | 'drop' | 'melee' | 'chain';

/**
 * 這一招要不要起動武器演出（§ 48.6）。
 *
 * `swing` 近戰揮擊、`shoot` 拉弓放箭、`none` 不碰武器。
 * **弓也是武器演出的一部分** —— § 48.6 的十種造型含弓，它有自己的拉弦動作；
 * 只給近戰起動的話，弓箭手放技能時手上會是空的。
 *
 * 法杖類的遠程魔法**不算** —— 那是把魔法丟出去，不是用武器打人；
 * § 48.6.1 說武器「只在攻擊的那一次演出中出現」，施法不是攻擊動作。
 */
export type SkillFxWeaponAction = 'none' | 'swing' | 'shoot';

/** 落點演什麼。`none` ＝ 沿用普攻的演出，技能自己不加東西 */
export type SkillFxLanding =
  | 'none' | 'impact' | 'burst' | 'nova' | 'heal' | 'aura' | 'pillar';

/** 飛行途中額外跟著演的東西（目前只有地裂術的地縫） */
export type SkillFxTrailFx = 'crack';

export interface SkillFxPlan {
  /** 起手要不要演（§ 48.7.3 的 `cast`） */
  cast: boolean;
  delivery: SkillFxDelivery;
  /**
   * 齊射：**每個目標各一發**，各自命中，沒有範圍爆（§ 48.7.4）。
   *
   * `false` 的 AoE 是相反的一件事：一發飛到圓心、在圓心爆一次。
   * 兩者玩家讀到的完全不同 —— 前者是「射了六箭」，後者是「炸了一片」。
   */
  volley: boolean;
  landing: SkillFxLanding;
  /** 元素色（§ 48.7.2，唯一出處是 § 42.4 的色表） */
  color: number;
  /** 飛行段的外型；`delivery` 不是 `travel` 時無意義 */
  shape: ProjectileShape;
  /** `burst`／`nova` 的半徑（格）。其他 landing 為 0 */
  radiusTiles: number;
  /**
   * 施加 buff 時頭上要浮什麼符號（§ 48.8.1）。`null` ＝ 只有藍環，沒有符號。
   * 由 `buffCategory` 推導，不是逐技能列。
   */
  emblem: EmblemKind | null;
  /**
   * 施加 buff 時改演球形罩，而不是腳下的藍環（§ 48.8.3）。
   * `null` ＝ 走一般的藍環。由 `buffCategory` 推導。
   */
  shield: ShieldKind | null;
  /**
   * 同一個目標連著吃幾發（§ 48.7.3）。1 ＝ 一般的單發。
   *
   * 與 `volley` 不同：齊射是**每個目標各一發**，多段是**同一個目標連吃好幾發**。
   */
  hits: number;
  /** 要不要起動武器演出（§ 48.6） */
  weapon: SkillFxWeaponAction;
  /**
   * 命中時的點綴色（§ 48.7.4.3）。`null` ＝ 不點綴。
   *
   * 由 `applyDebuff.tags` 推導，吃的是 `DEBUFF_TINT` 那張表 ——
   * 裂傷斬造成流血，那一下就該有紅色，而紅色在染色那邊已經是流血的顏色。
   */
  accent: number | null;
  /** 命中用最小型態（普攻，§ 48.7.6） */
  minimalImpact: boolean;
  /** `delivery: 'chain'` 時連鎖長什麼樣。其餘為 `null` */
  chainStyle: SkillFxChainStyle | null;
  /** 飛行途中額外跟著演的東西。`null` ＝ 沒有 */
  trailFx: SkillFxTrailFx | null;
}

/**
 * 落下名單（§ 48.7.3）。
 *
 * 「從天而降」讀不出任何欄位 —— 落石與冰槍在資料上完全一樣（單體、遠程、有元素），
 * 差別只在美術意象。所以這是**唯一必須逐技能列**的一張表。
 */
export const DROP_FX_SKILL_IDS: readonly string[] = [
  'rock-fall',      // 落石
  'meteor-shot',    // 隕石彈
  'meteor-shower',  // 流星雨
  'earth-shatter',  // 震裂術
];

/**
 * 近戰演出的例外名單。
 *
 * 一般規則是 `range <= 1.5` → 走武器揮擊，六個近戰技能有五個吃得到。
 * **挑釁怒吼的 `range` 是 3**（它是喊出去的，不是砍出去的），
 * 但它同樣是騎士的物理技能（`23-class-magic.md` § 23.1.1），
 * 演成一顆白球飛出去會很怪 —— 所以放在這裡當例外，而不是去改它的 `range`
 * （`range` 是戰鬥規則，特效不得改變任何規則，§ 48.1）。
 */
export const MELEE_FX_SKILL_IDS: readonly string[] = [
  'taunt',          // 挑釁怒吼
];

/**
 * 齊射名單（§ 48.7.4）。名單內的 AoE **每個目標各一發**，沒有範圍爆。
 *
 * 讀不出任何欄位：火球與炎爆的 `aoeCenter`／`aoeRadius`／`maxTargets` 是同一種結構，
 * 但一個是「丟三顆火球」、一個是「炸開一片」—— 差別只在技能本身的意象。
 * 所以與落下名單一樣，只能逐技能列。
 *
 * 名單以外的 `target: 'aoe'` 一律走「一發到圓心、炸一次」。
 */
/**
 * 連鎖名單（§ 48.7.3）。名單內的 AoE **從第一隻怪再往下一隻跳**，
 * 不是從施法者各射一發（齊射），也不是在圓心炸一片（範圍爆）。
 *
 * 讀不出任何欄位：閃電鎖鏈與暗影爆發的 `aoeCenter`／`aoeRadius`／`maxTargets`
 * 結構一模一樣，差別只在「電會跳」這個意象。與落下、齊射同理，只能逐技能列。
 *
 * **只影響演出順序，不影響誰被打到。** 連鎖照實際命中名單走，
 * 不會連到沒被選中的怪 —— 那會變成畫面在騙人（§ 48.1）。
 */
export const CHAIN_FX_SKILL_IDS: readonly string[] = [
  'chain-lightning',   // 閃電鎖鏈（風＝電弧）
  'hellfire',          // 業火（火＝火球彈跳）
];

/** 連鎖的兩種樣式：電弧或彈跳的投射物 */
export type SkillFxChainStyle = 'bolt' | 'bounce';

/**
 * 連鎖長什麼樣子，**由元素決定，不用第二張名單**。
 *
 * 風系（`22-basic-magic.md` § 22.2 明文「風系包含雷屬性魔法」）走電弧 ——
 * 電就是一瞬間跳過去的東西。其餘走彈跳：火球從第一隻怪彈到第二隻，
 * 那是實體的東西在飛，用電弧演會讀成「火在放電」。
 */
export function resolveChainStyle(element: SkillElement): SkillFxChainStyle {
  return element === 'wind' ? 'bolt' : 'bounce';
}

export const VOLLEY_FX_SKILL_IDS: readonly string[] = [
  'fireball',       // 火球（半徑 3、最多 3 隻 → 三顆火球）
  'ice-fog',        // 冰霧（同上）
  'arrow-rain',     // 穿透箭雨
  'meteor-shower',  // 流星雨（同時在落下名單，兩者疊加＝多顆隕石各自落下）
];

/**
 * 施放當下的外在條件 —— 同一個技能在不同狀態下顏色會不一樣（§ 42.4）。
 *
 * 只影響顏色，不影響原型判定。沒傳就當作兩者都沒有。
 */
export interface SkillFxContext {
  /** 武器的元素刻印詞綴（`07-affix.md` § 7.4） */
  weaponElement?: string;
  /** 生效中的附魔 buff 元素（火矢附魔＝火、淬毒沒有元素） */
  enchantElement?: string;
}

/**
 * 逐技能的外觀特例（§ 48.7.3）。
 *
 * **一張表收完，不要每加一個特例就多一份名單** —— 散成五、六份之後，
 * 「這個技能到底長什麼樣」要翻五個地方才拼得出來。
 * 成員資格的名單（落下／齊射／連鎖／近戰）是另一回事，那些是分類不是外觀。
 *
 * 這裡的每一條都是「資料上看不出來、只能逐個指定」的美術決定。
 */
export interface SkillFxOverride {
  /** 投射物換外型（冰槍的長槍、火焰箭的箭） */
  shape?: ProjectileShape;
  /** 換送達方式（吸血鬼之吻改成遠程） */
  delivery?: SkillFxDelivery;
  /** 換落點演出（炎柱的火柱） */
  landing?: SkillFxLanding;
  /** 飛行途中加東西（地裂術的地縫） */
  trailFx?: SkillFxTrailFx;
  /** 覆寫武器動作（改成遠程之後就不該再揮武器） */
  weapon?: SkillFxWeaponAction;
  /** 覆寫齊射（每個目標各一發） */
  volley?: boolean;
  /** 覆寫連鎖樣式。`null` ＝ 依元素推導 */
  chainStyle?: SkillFxChainStyle | null;
  /** 覆寫起手 */
  cast?: boolean;
}

export const SKILL_FX_OVERRIDES: Record<string, SkillFxOverride> = {
  /* ── 投射外型 ── */
  'wind-blade': { shape: 'arrow' },            // 風刃
  'ice-bolt': { shape: 'lance' },              // 冰彈
  'frost': { shape: 'lance' },                 // 寒霜
  'ice-fog': { shape: 'lance' },               // 冰霧
  'ice-lance': { shape: 'lance' },             // 冰槍
  'blizzard': { shape: 'lance' },              // 冰暴
  'absolute-zero': { shape: 'lance' },         // 極冰封印
  'flame-arrow': { shape: 'arrow' },           // 火焰箭

  /* ── 命中換成火柱 ── */
  'flame-pillar': { landing: 'pillar' },       // 炎柱
  'purgatory': { landing: 'pillar' },          // 煉獄火
  'earth-rend': { trailFx: 'crack', landing: 'pillar' },   // 地裂術
  'element-storm': { trailFx: 'crack', landing: 'pillar' }, // 元素風暴
  'armor-break': { shape: 'arrow', landing: 'pillar' },     // 護甲崩壞

  /* ── 途中地面裂開 ── */
  'curse': { trailFx: 'crack' },               // 詛咒
  'mana-drain': { shape: 'lance', trailFx: 'crack' },       // 魔力奪取

  /* ── 改成從天而降 ── */
  'arrow-rain': { delivery: 'drop' },          // 穿透箭雨
  'holy-judgment': { delivery: 'drop' },       // 聖光審判
  'blizzard-storm': { shape: 'lance', delivery: 'drop', volley: true }, // 暴風雪
  'divine-thunder': { shape: 'arrow', delivery: 'drop', landing: 'burst' }, // 天雷
  'ultimate-ray': { shape: 'arrow', delivery: 'drop', landing: 'pillar' },  // 究極光裂術

  /* ── 其他 ── */
  'inferno': { volley: true, landing: 'impact' },           // 炎爆
  'earth-shatter': { delivery: 'none', landing: 'nova' },   // 震裂術
  /*
   * 吸血鬼之吻的 `range` 是 1.5（貼身），照規則會判成武器揮擊。
   * 但它是魔法不是砍人 —— 改成遠程投射、不揮武器、途中地面裂開。
   * **不去改 `range`**：那是戰鬥規則，特效不得為了演出動它（§ 48.1）。
   */
  'vampire-kiss': { delivery: 'travel', weapon: 'none', trailFx: 'crack', cast: true },
};

/** 近戰的距離門檻。與 `Skill.range` 的語意一致：1.5 = 貼身 */
export const MELEE_FX_RANGE = 1.5;

/**
 * 施加 buff／debuff 那一下的顏色（§ 48.8.1）。
 * 只有兩色，不吃技能元素 —— icon 列已經用這兩色分好壞了。
 */
export function resolveAuraColor(kind: 'buff' | 'debuff'): number {
  return kind === 'buff' ? BUFF_AURA_COLOR : DEBUFF_AURA_COLOR;
}

/**
 * 普通攻擊的演出（§ 48.7.6）。
 *
 * 普攻**不是技能**：沒有起手（那是「我放了一招」的信號）、沒有徽記，
 * 命中走**最小型態**（`minimalImpact`）—— 一秒好幾下，用技能那個尺寸
 * 會把畫面塞滿，而且技能就不特別了。
 *
 * 顏色與三連射同一條規則（§ 42.4）：**武器元素刻印 → 附魔 buff → 白**。
 * 冰刻印的劍砍下去命中點是淺藍的，不是白的。
 */
export function resolveNormalAttackFxPlan(
  o: { ranged: boolean; bow: boolean },
  ctx: SkillFxContext = {},
): SkillFxPlan {
  return {
    cast: false,
    delivery: o.ranged ? 'travel' : 'melee',
    volley: false,
    landing: 'impact',
    color: getElementProjectileColor(ctx.weaponElement || ctx.enchantElement),
    /* 弓射箭，近戰沒有飛行段（`shape` 用不到） */
    shape: o.bow ? 'arrow' : 'circle',
    radiusTiles: 0,
    emblem: null,
    shield: null,
    hits: 1,
    weapon: o.bow ? 'shoot' : 'swing',
    accent: null,
    minimalImpact: true,
    chainStyle: null,
    trailFx: null,
  };
}

/**
 * 判定順序由上而下，第一個成立的就是答案（§ 48.7.3 那張表）。
 * 順序不可調換：落下名單必須排在近戰與 AoE 之前，
 * 否則震裂術（AoE）會被 `target: 'aoe'` 先接走，落下就不見了。
 */
export function resolveSkillFxPlan(skill: SkillFxInput, ctx: SkillFxContext = {}): SkillFxPlan {
  return applyOverride(derivePlan(skill, ctx), skill);
}

/**
 * 把逐技能的覆寫套上去，**統一在最後做**。
 *
 * 早期是散在各個 `return` 裡，結果落下與 AoE 那幾條提早回傳，
 * 覆寫根本沒被套到 —— 「設了沒反應」而且不會報錯。
 * 一個出口就不會再漏。
 */
function applyOverride(plan: SkillFxPlan, skill: SkillFxInput): SkillFxPlan {
  const ov = SKILL_FX_OVERRIDES[skill.id];
  if (!ov) return plan;

  const next: SkillFxPlan = { ...plan, ...ov };

  /*
   * 齊射與範圍爆是互斥的兩種讀法（§ 48.7.4）——
   * 只設 `volley: true` 而 landing 還留在 `burst` 的話，plan 自相矛盾：
   * 播放時齊射那條路先接走，`burst` 就成了永遠不會用到的殘留設定。
   * 這裡把它補成一致的，覆寫表才不用每次都寫兩個欄位。
   */
  if (next.volley) next.landing = 'impact';

  /* 半徑只有「炸一片」的兩種用得到 —— 跟著 landing 走，不用手動維護 */
  next.radiusTiles = next.landing === 'burst' || next.landing === 'nova'
    ? (skill.aoeRadius ?? 0)
    : 0;
  /* 連鎖沒指定樣式就依元素推導 */
  next.chainStyle = next.delivery === 'chain'
    ? (ov.chainStyle ?? resolveChainStyle(skill.element))
    : null;
  return next;
}

function derivePlan(skill: SkillFxInput, ctx: SkillFxContext): SkillFxPlan {
  const hits = Math.max(1, skill.hits ?? 1);
  /*
   * 顏色的元素來源（§ 42.4「元素的判定來源」）。
   *
   * **只有傷害走普攻公式的技能吃刻印與附魔** —— 目前就是三連射（`hits > 1`）：
   * 它的傷害本來就是普攻算的（§ 23.1.1），火矢附魔生效時整發視為火屬性
   * （`23-class-magic.md` § 23.4），所以三支箭會變成火色。
   *
   * **穿透箭雨不吃**：它同樣是弓技，但走魔法公式，§ 23.4 明文「不受火矢附魔影響」。
   * 顏色跟著傷害走，不跟著武器類型走。
   *
   * 優先序照 § 42.4：刻印 → 附魔 → 技能元素。
   */
  const element = hits > 1
    ? (ctx.weaponElement || ctx.enchantElement || skill.element)
    : skill.element;
  const color = getElementProjectileColor(element);
  /* 弓技射箭，其餘技能射彈丸 —— 與 § 42.4 的外型規則同一套 */
  const shape: ProjectileShape = skill.requiredWeaponType === 'bow' ? 'arrow' : 'circle';
  const radiusTiles = skill.aoeRadius ?? 0;
  const isAoe = skill.target === 'aoe';
  /* 齊射只對 AoE 有意義：單體本來就只有一發 */
  const volley = isAoe && VOLLEY_FX_SKILL_IDS.includes(skill.id);
  /* 弓技一律拉弓放箭 —— 不管它是多段（三連射）還是 AoE（穿透箭雨） */
  const weapon: SkillFxWeaponAction = skill.requiredWeaponType === 'bow' ? 'shoot' : 'none';
  const accent = resolveDebuffAccent(skill.applyDebuff?.tags);
  const base = {
    cast: true, volley: false, color, shape, radiusTiles: 0,
    emblem: null, shield: null, hits: 1, weapon, accent,
    minimalImpact: false, chainStyle: null, trailFx: null,
  };

  if (skill.type === 'buff') {
    /*
     * buff 走 § 48.8，但**起手照演** —— 施法就是施法，
     * 少了起手會變成「什麼都沒做，身上就多了一圈光」，讀不出是自己放的。
     * 唯一不演起手的是近戰技能：那一圈會蓋掉揮擊的前搖。
     */
    return {
      ...base,
      delivery: 'none',
      landing: 'aura',
      color: BUFF_AURA_COLOR,
      /* 同類的 buff 共用同一個符號（祝福武器／祝福魔法武器都是 weapon-bless） */
      emblem: resolveBuffEmblem(skill.buffCategory, skill.buffModifiers),
      /* 擋傷害那一類改演球形罩，取代藍環（§ 48.8.3） */
      shield: resolveBuffShield(skill.buffCategory),
    };
  }

  if (skill.type === 'heal') {
    return { ...base, delivery: 'none', landing: 'heal' };
  }

  /*
   * 多段的普攻型技能 —— 目前只有三連射（`23-class-magic.md` § 23.1.1）。
   *
   * 它**走物理普攻公式**，不是技能公式：吃武器基傷與 STR，換武器就會變強。
   * 規則上它就是「快速射三箭」，所以命中不給技能的排場 ——
   * 沒有爆點，就是三支箭連著出去，跟普攻長一樣。
   *
   * **起手照演**：它終究是玩家主動施放的技能（吃 MP、有冷卻），
   * 起手環是「我放了一招」與「我在普攻」的唯一區別。
   *
   * `landing: 'none'` 代表**沿用普攻的演出**：等普攻補上命中火花（§ 48.7.6），
   * 它會自動跟著有，不必回來改這裡。
   */
  if (hits > 1) {
    return { ...base, delivery: 'travel', landing: 'none', hits };
  }

  if (DROP_FX_SKILL_IDS.includes(skill.id)) {
    /* 落下＋齊射可以疊加：流星雨＝多顆隕石各自落在各自的目標上 */
    return {
      ...base,
      delivery: 'drop',
      volley,
      landing: isAoe && !volley ? 'burst' : 'impact',
      radiusTiles: isAoe && !volley ? radiusTiles : 0,
    };
  }

  /*
   * AoE 排在近戰之前：範圍技能不管 `range` 多短都不是一次武器揮擊。
   * 目前沒有 `range <= 1.5` 的 AoE，但這個順序讓之後加一個也不會突然變成揮刀。
   */
  if (skill.aoeCenter === 'self') {
    /* 自身中心從腳下擴出去，沒有東西可以齊射 */
    return { ...base, delivery: 'none', landing: 'nova', radiusTiles };
  }

  if (isAoe) {
    /* 連鎖排在齊射之前：兩者互斥，一個是從施法者各射一發、一個是打完再跳 */
    if (CHAIN_FX_SKILL_IDS.includes(skill.id)) {
      return {
        ...base,
        delivery: 'chain',
        landing: 'impact',
        chainStyle: resolveChainStyle(skill.element),
      };
    }
    return volley
      ? { ...base, delivery: 'travel', volley: true, landing: 'impact' }
      : { ...base, delivery: 'travel', landing: 'burst', radiusTiles };
  }

  if (MELEE_FX_SKILL_IDS.includes(skill.id) || (skill.range ?? 0) <= MELEE_FX_RANGE) {
    /* 近戰沿用 § 48.6 的武器揮擊，不另做動作；起手環會擋住揮擊的前搖，所以不演 */
    return { ...base, cast: false, delivery: 'melee', landing: 'impact', weapon: 'swing' };
  }

  return { ...base, delivery: 'travel', landing: 'impact' };
}
