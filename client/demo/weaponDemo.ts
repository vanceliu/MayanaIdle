/**
 * 武器剪影調校頁的橋接層。
 *
 * 繪製本體在 `client/src/pixi/entities/pawn/`（`weaponGeometry.ts` / `drawWeapon.ts`）——
 * 與 pawn 同一個原則：**demo 不自帶一份畫法**，兩邊各改各的必然分岔。
 *
 * 這裡只做三件事：
 * 1. 把姿勢（旋轉與位移）套成 canvas transform —— 遊戲端會改用 Pixi sprite
 *    的 rotation / position 表達同一組數字，所以這一層不進 src
 * 2. 提供滑桿要用的參數範圍表（只有調校頁需要）
 * 3. 材質色的中文標籤
 */
import type { PawnContext } from '../src/pixi/entities/pawn/drawPawn';
import { drawWeapon } from '../src/pixi/entities/pawn/drawWeapon';
import {
  PAWN_WEAPON_TYPES, WEAPON_ART, WEAPON_AIM_IDS,
  WEAPON_MATERIAL_COLOR, WEAPON_HANDLE_COLOR,
  WEAPON_FACING_AXIS, weaponColors, weaponGrip, weaponPose, weaponTotalT,
  weaponPlaybackMs, weaponAimFromDelta, pawnFacingForAim,
  type PawnWeaponType, type WeaponArt, type WeaponColors,
  type WeaponGeom, type WeaponPose, type WeaponAimId,
} from '../src/pixi/entities/pawn/weaponGeometry';

export {
  PAWN_WEAPON_TYPES, WEAPON_ART, WEAPON_AIM_IDS,
  WEAPON_MATERIAL_COLOR, WEAPON_HANDLE_COLOR,
  WEAPON_FACING_AXIS, weaponColors, weaponGrip, weaponPose, weaponTotalT,
  weaponPlaybackMs, weaponAimFromDelta, pawnFacingForAim, drawWeapon,
};
export type { PawnWeaponType, WeaponArt, WeaponColors, WeaponGeom, WeaponPose, WeaponAimId };

/** 八個揮擊方向的中文標籤（螢幕方向） */
export const AIM_LABELS: Record<WeaponAimId, string> = {
  down: '下', downRight: '右下', right: '右', upRight: '右上',
  up: '上', upLeft: '左上', left: '左', downLeft: '左下',
};

export const MATERIAL_LABELS: { id: keyof typeof WEAPON_MATERIAL_COLOR; label: string }[] = [
  { id: 'wood', label: '木' },
  { id: 'iron', label: '鐵' },
  { id: 'silver', label: '銀' },
  { id: 'mithril', label: '秘銀' },
  { id: 'dragon', label: '龍' },
  { id: 'orichalcum', label: '山銅' },
];

/** 這個方向的武器要畫在角色之下嗎（往上時目標格在更遠處，見 `WeaponFacingAxis.behind`） */
export function weaponBehindPawn(aimId: WeaponAimId): boolean {
  return WEAPON_FACING_AXIS[aimId].behind;
}

/**
 * 依姿勢把一把武器畫上去。
 *
 * 順序是 **translate → rotate**，沒有鏡射：
 * 位移（前伸／前推／後座）已經是螢幕座標，旋轉角也已經是螢幕角度，
 * 四個朝向全部靠旋轉到位。加鏡射的話單刃斧與弓會翻面，跟旋轉的結果對不起來。
 */
export function drawWeaponPose(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number,
  aimId: WeaponAimId,
  art: WeaponArt,
  colors: WeaponColors,
  pose: WeaponPose,
  hand: 0 | 1 = 0,
): void {
  if (!pose.visible || pose.alpha <= 0) return;

  const grip = weaponGrip(art.geom, aimId, hand);

  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.translate(gx + grip.x + pose.offX, gy + grip.y + pose.offY);
  ctx.rotate((pose.angle * Math.PI) / 180);
  drawWeapon(ctx as unknown as PawnContext, 0, 0, art.params, colors, art.geom, pose.pull, pose.lead);
  ctx.restore();
}

/**
 * 演出到 t（以 durationMs 為 1）時的樣子。雙持會自動把兩把都畫出來。
 * 揮到哪個方向由 `WEAPON_FACING_AXIS` 決定（八個螢幕方向）。
 */
export function drawWeaponAt(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number,
  aimId: WeaponAimId,
  art: WeaponArt,
  colors: WeaponColors,
  t: number,
): void {
  for (let hand = 0; hand < art.hands; hand++) {
    const h = hand as 0 | 1;
    drawWeaponPose(ctx, gx, gy, aimId, art, colors, weaponPose(art.motion, art.geom, t, h, aimId), h);
  }
}

/** 靜態展示用：停在**揮到底**的姿勢。武器一覽表用這個比較造型與揮擊落點 */
export function drawWeaponStill(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number,
  aimId: WeaponAimId,
  art: WeaponArt,
  colors: WeaponColors,
): void {
  for (let hand = 0; hand < art.hands; hand++) {
    const h = hand as 0 | 1;
    const t = art.motion.tStrike + (h === 1 ? art.motion.handDelay : 0);
    drawWeaponPose(ctx, gx, gy, aimId, art, colors, weaponPose(art.motion, art.geom, t, h, aimId), h);
  }
}

/* ═══════════════════════════════════════════════════════════
   滑桿範圍（只有調校頁用得到）
   ═══════════════════════════════════════════════════════════ */

export interface SliderMeta { label: string; min: number; max: number; step: number }

/** 形狀參數 —— key 對應各 `*Params` 的欄位名 */
export const SHAPE_PARAM_META: Record<string, SliderMeta> = {
  /* blade */
  bladeLen: { label: '刀身長', min: 4, max: 40, step: 0.5 },
  bladeW: { label: '刀身寬', min: 1, max: 12, step: 0.2 },
  tipLen: { label: '尖端長', min: 0, max: 20, step: 0.5 },
  guardW: { label: '護手寬', min: 0, max: 24, step: 0.5 },
  guardH: { label: '護手厚', min: 0, max: 6, step: 0.2 },
  gripLen: { label: '握把長', min: 1, max: 16, step: 0.5 },
  gripW: { label: '握把粗', min: 0.6, max: 6, step: 0.2 },
  pommelR: { label: '圓頭半徑', min: 0, max: 5, step: 0.1 },

  /* axe / mace / staff 共用的柄 */
  shaftLen: { label: '柄長', min: 6, max: 46, step: 0.5 },
  shaftW: { label: '柄粗', min: 1, max: 8, step: 0.2 },

  /* axe */
  headLen: { label: '斧刃高', min: 2, max: 24, step: 0.5 },
  headW: { label: '斧刃外伸', min: 2, max: 20, step: 0.5 },
  headDrop: { label: '斧刃下沉', min: -4, max: 12, step: 0.2 },
  double: { label: '雙刃', min: 0, max: 1, step: 1 },

  /* mace */
  headR: { label: '槌頭半徑', min: 1, max: 10, step: 0.2 },
  spikeLen: { label: '尖刺長', min: 0, max: 6, step: 0.1 },
  spikes: { label: '尖刺數', min: 3, max: 12, step: 1 },

  /* staff */
  gemR: { label: '寶珠半徑', min: 0, max: 8, step: 0.2 },
  collarW: { label: '頸環寬', min: 0, max: 10, step: 0.2 },

  /* bow */
  limbLen: { label: '弓臂長（單邊）', min: 5, max: 26, step: 0.5 },
  bendW: { label: '弓背鼓出', min: 0, max: 14, step: 0.2 },
  thickness: { label: '弓身粗', min: 0.6, max: 6, step: 0.2 },
  pullMax: { label: '滿弦拉距', min: 0, max: 14, step: 0.5 },
  riserLen: { label: '握把長（0＝不畫）', min: 0, max: 18, step: 0.5 },
  wrapH: { label: '綁帶厚', min: 0, max: 4, step: 0.1 },
  arrowLen: { label: '箭長（0＝不畫）', min: 0, max: 30, step: 0.5 },

  /* claw */
  backW: { label: '護甲寬', min: 2, max: 14, step: 0.2 },
  backH: { label: '護甲高', min: 2, max: 14, step: 0.2 },
  clawLen: { label: '爪長', min: 2, max: 18, step: 0.5 },
  clawW: { label: '爪根粗', min: 0.5, max: 5, step: 0.1 },
  clawSpread: { label: '爪攤開寬', min: 0, max: 14, step: 0.2 },
  clawCurve: { label: '爪彎曲', min: -6, max: 10, step: 0.2 },
  claws: { label: '爪數', min: 1, max: 5, step: 1 },
};

export const MOTION_PARAM_META: Record<string, SliderMeta> = {
  durationMs: { label: '全長 ms', min: 120, max: 900, step: 10 },
  arcFrom: { label: '弧線起點', min: -90, max: 90, step: 1 },
  arcTo: { label: '弧線終點', min: -90, max: 90, step: 1 },
  pre: { label: '起手回拉', min: 0, max: 0.5, step: 0.01 },
  over: { label: '收招餘勢', min: 0, max: 0.5, step: 0.01 },
  tilt: { label: '握持傾斜（杖／弓）', min: -40, max: 40, step: 1 },
  reach: { label: '揮到底再前壓', min: 0, max: 16, step: 0.5 },
  tWindup: { label: '舉到頂時點', min: 0.05, max: 0.6, step: 0.01 },
  tStrike: { label: '揮到底時點', min: 0.1, max: 0.9, step: 0.01 },
  tRecover: { label: '開始淡出', min: 0.2, max: 1, step: 0.01 },
  push: { label: '前推距離', min: -12, max: 16, step: 0.5 },
  swingMul: { label: '揮舞半徑倍率', min: 0, max: 1.5, step: 0.05 },
  handDelay: { label: '第二把延遲', min: 0, max: 0.6, step: 0.01 },
};

export const GEOM_PARAM_META: Record<string, SliderMeta> = {
  gripX: { label: '握點離中線', min: 0, max: 20, step: 0.5 },
  gripY: { label: '握點離地高', min: 0, max: 30, step: 0.5 },
  faceSide: { label: '正背面偏哪側', min: -1, max: 1, step: 1 },
  sideGripMul: { label: '側面握點收窄%', min: 0, max: 140, step: 2 },
  offhandSideMul: { label: '側面第二把%', min: -120, max: 120, step: 2 },
  offhandRaise: { label: '第二把抬高', min: -60, max: 80, step: 2 },
  swingH: { label: '揮舞半徑 左右', min: 0, max: 70, step: 1 },
  swingUp: { label: '揮舞半徑 往上（背面）', min: 0, max: 60, step: 1 },
  swingDown: { label: '揮舞半徑 往下（正面）', min: 0, max: 60, step: 1 },
  outline: { label: '描邊', min: 0, max: 40, step: 1 },
  scale: { label: '整體縮放%', min: 50, max: 200, step: 5 },
};
