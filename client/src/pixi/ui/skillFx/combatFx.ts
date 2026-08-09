/**
 * 戰鬥事件 → 演出計畫（`48-vfx.md` § 48.7.7）。
 *
 * `skillFxStyle.ts` 只認識 `Skill` 的欄位；這裡負責把**戰鬥當下的狀態**
 * （手上拿什麼、身上有什麼附魔、怪物是什麼元素）換算成它吃得下的輸入。
 *
 * **純函式，不碰 store、不碰 Pixi** —— 換算規則就可以直接跑 unit test，
 * 不必開瀏覽器看顏色對不對。
 */
import type { Affix } from '../../../models/affix';
import { getBrandElement } from '../../../models/affix';
import type { ActiveEffect } from '../../../models/effect';
import { getSkillTemplate } from '../../../models/skillTemplate';
import {
  isPawnWeaponType, weaponMuzzle, WEAPON_ART,
} from '../../entities/pawn/weaponGeometry';
import type { ProjectileShape } from '../projectileStyle';
import {
  resolveNormalAttackFxPlan, resolveSkillFxPlan,
  type SkillFxContext, type SkillFxInput, type SkillFxPlan,
} from './skillFxStyle';

/**
 * 命中點比腳下高多少 px。
 *
 * 傷害數字、命中爆點、投射物的終點都用這一個值 —— 各自寫死的話，
 * 數字會跳在爆點的上面或下面，讀起來像兩件事。
 * 火柱那類從地上竄起的演出靠 `groundLift` 抵銷回去（§ 48.7.3）。
 */
export const HIT_LIFT = 20;

/**
 * 附魔 buff 的分類尾綴。
 *
 * `24-buff-debuff.md` 的附魔類 buff（火矢附魔、淬毒…）分類一律以此結尾，
 * 不逐個列 id —— 新增一種附魔不必回來改這裡。
 */
const ENCHANT_CATEGORY_SUFFIX = '-enchant';

/** 生效中的附魔 buff 是什麼元素。淬毒那種沒有元素的回 undefined */
export function resolveEnchantElement(effects: readonly ActiveEffect[]): string | undefined {
  const buff = effects.find(e => e.type === 'buff' && e.category.endsWith(ENCHANT_CATEGORY_SUFFIX));
  if (!buff) return undefined;
  return getSkillTemplate(buff.sourceSkillId)?.element;
}

/**
 * 顏色的外在條件（§ 42.4）：**武器元素刻印 → 附魔 buff → 白**。
 *
 * 兩者都只影響顏色，不影響演出的形狀。
 */
export function resolveAttackFxContext(
  weaponAffixes: Affix[] | undefined,
  effects: readonly ActiveEffect[],
): SkillFxContext {
  return {
    weaponElement: getBrandElement(weaponAffixes),
    enchantElement: resolveEnchantElement(effects),
  };
}

/**
 * 玩家這一次攻擊要演什麼。
 *
 * `skill` 是 undefined 就是普攻 —— 普攻不是技能，它沒有起手也沒有徽記，
 * 命中走最小型態（§ 48.7.6）。
 */
export function resolvePlayerAttackFxPlan(o: {
  /* 吃 `SkillFxInput` 而不是 `Skill` —— 判定只用得到那幾個欄位，
   * 綁死整個 `Skill` 的話，技能表加一個必填欄位就會連累這裡 */
  skill?: SkillFxInput | null;
  /** 這一擊要不要飛過去（遠程物理或遠程魔法） */
  ranged: boolean;
  /** 手上拿的是不是弓 —— 決定普攻射箭還是揮擊 */
  bow: boolean;
  ctx: SkillFxContext;
}): SkillFxPlan {
  return o.skill
    ? resolveSkillFxPlan(o.skill, o.ctx)
    : resolveNormalAttackFxPlan({ ranged: o.ranged, bow: o.bow }, o.ctx);
}

/**
 * 怪物這一次攻擊要演什麼。
 *
 * 怪物沒有技能表也沒有武器剪影，所以不推導 —— 外型與顏色由 § 42.4 的
 * `getMonsterProjectileStyle()` 決定，這裡只把它包成 plan。
 * 命中同樣走最小型態：被怪打到一秒好幾下，用技能那個尺寸會塞滿畫面。
 */
export function resolveMonsterAttackFxPlan(o: {
  ranged: boolean;
  shape: ProjectileShape;
  color: number;
}): SkillFxPlan {
  return {
    cast: false,
    delivery: o.ranged ? 'travel' : 'melee',
    volley: false,
    landing: 'impact',
    color: o.color,
    shape: o.shape,
    radiusTiles: 0,
    emblem: null,
    shield: null,
    hits: 1,
    /* 怪物是圓球，沒有 § 48.6 的武器剪影可以演 */
    weapon: 'none',
    accent: null,
    minimalImpact: true,
    chainStyle: null,
    trailFx: null,
  };
}

/**
 * 投射物離開角色的位置，相對腳下（螢幕座標偏移）。
 *
 * **只有真的把武器畫出來的時候才問槍口。** 施法不演武器（§ 48.6.1），
 * 這時候去問「武器的槍口在哪」拿到的是一個根本沒發生的姿勢 ——
 * 彈丸會從一支看不見的法杖尖端跑出來。距離遠時那個偏移看不出來，
 * 貼身打就整個歪掉。沒有武器演出時一律從身體高度出去。
 */
export function resolveMuzzleOffset(o: {
  /** 這一招要不要起動武器演出（`SkillFxPlan.weapon`） */
  weaponAction: SkillFxPlan['weapon'];
  /** 射向哪個方向（`weaponAimFromDelta()` 的結果），`null` ＝ 算不出來 */
  aim: number | null;
  /** 實際會被畫出來的武器造型 */
  shownWeapon: string | undefined;
}): { x: number; y: number } {
  if (o.weaponAction !== 'shoot' || o.aim === null || !isPawnWeaponType(o.shownWeapon)) {
    return { x: 0, y: -HIT_LIFT };
  }
  return weaponMuzzle(WEAPON_ART[o.shownWeapon], o.aim);
}
