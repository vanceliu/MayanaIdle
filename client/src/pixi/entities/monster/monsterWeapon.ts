/**
 * 怪物遠程攻擊的武器演出（`48-vfx.md` § 48.6.5）：`ranged` 怪拿弓或擲斧，`magic` 怪拿雙手杖。
 *
 * 形狀與貼圖沿用玩家武器（弓＝`bow`、擲斧＝`axe`、雙手杖＝`twoHandStaff`），只有擲斧換揮法；
 * 武器掛在怪物腳下往上 `lift`、整組縮放 `scale`。
 */
import type { WeaponMaterial } from '../../../models/equipment';
import type { ElementType, MonsterWeapon } from '../../../models/monster';
import { getElementProjectileColor } from '../../ui/projectileStyle';
import {
  WEAPON_ART,
  WEAPON_MATERIAL_COLOR,
  weaponMuzzle,
  weaponPlaybackMs,
  type PawnWeaponType,
  type WeaponAttack,
  type WeaponMotionCfg,
} from '../pawn/weaponGeometry';

/** 擲斧：舉到身後、往目標前揮，揮到底脫手（`throw` 揮到底後不畫） */
export const MONSTER_THROW_AXE_MOTION: WeaponMotionCfg = {
  motion: 'throw', durationMs: 440,
  arcFrom: 150, arcTo: -10, pre: 0.10, over: 0, tilt: 0, reach: 6, swingMul: 1,
  tWindup: 0.42, tStrike: 0.62, tRecover: 0.62,
  push: 0, handDelay: 0,
};

/** 武器掛點：握點座標整組乘 `scale`，再往上抬 `lift` px */
export const MONSTER_WEAPON_MOUNT = { lift: 0, scale: 1 };

const WEAPON_TYPE: Record<MonsterWeapon, PawnWeaponType> = { bow: 'bow', throwAxe: 'axe', twoHandStaff: 'twoHandStaff' };

/** 材質依怪物等級：39 以下鐵、40～49 銀、50～59 米索利、60 以上奧里哈魯根 */
export function monsterWeaponMaterial(level: number): WeaponMaterial {
  if (level >= 60) return 'orichalcum';
  if (level >= 50) return 'mithril';
  if (level >= 40) return 'silver';
  return 'iron';
}

/** 法杖寶珠色＝攻擊元素的投射物色（`#rrggbb`） */
export function monsterGemColor(element: ElementType | undefined): string {
  return `#${getElementProjectileColor(element).toString(16).padStart(6, '0')}`;
}

/** 飛斧的斧刃色（Pixi 數值色） */
export function monsterAxeColor(material: WeaponMaterial): number {
  return Number.parseInt(WEAPON_MATERIAL_COLOR[material].slice(1), 16);
}

function motionOf(weapon: MonsterWeapon): WeaponMotionCfg {
  return weapon === 'throwAxe' ? MONSTER_THROW_AXE_MOTION : WEAPON_ART[WEAPON_TYPE[weapon]].motion;
}

export function monsterWeaponAttack(
  weapon: MonsterWeapon,
  material: WeaponMaterial,
  aim: number,
  attackIntervalMs: number,
  gemColor?: string | null,
): WeaponAttack {
  return {
    type: WEAPON_TYPE[weapon],
    material,
    aim,
    attackIntervalMs,
    motion: weapon === 'throwAxe' ? MONSTER_THROW_AXE_MOTION : undefined,
    gemColor,
  };
}

/** 放箭／脫手的時點（ms），投射物從這一刻出發 */
export function monsterWeaponStrikeMs(weapon: MonsterWeapon, attackIntervalMs: number): number {
  const motion = motionOf(weapon);
  return weaponPlaybackMs(motion, attackIntervalMs) * motion.tStrike;
}

/** 投射物出發點，相對怪物腳下的螢幕偏移 */
export function monsterWeaponMuzzle(
  weapon: MonsterWeapon,
  aim: number,
  mount: { lift: number; scale: number } = MONSTER_WEAPON_MOUNT,
): { x: number; y: number } {
  const type = WEAPON_TYPE[weapon];
  const muzzle = weaponMuzzle({ ...WEAPON_ART[type], motion: motionOf(weapon) }, aim);
  return { x: muzzle.x * mount.scale, y: muzzle.y * mount.scale - mount.lift };
}
