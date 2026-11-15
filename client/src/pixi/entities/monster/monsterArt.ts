/**
 * 怪物 AI 美術的朝向與版面（`25-monster-system.md` § 25.2.2）。
 *
 * 素材為正面／側面（朝右）／背面三視圖，sprite 錨點在腳底中央（同怪物球的底部）。
 */
import type { MonsterSize } from '../../../models/monster';
import type { PawnDirectionId } from '../pawn/geometry';
import { MONSTER_RADIUS } from '../MonsterEntity';
import { HEALTH_BAR_OFFSET_Y } from '../../ui/HealthBar';
import { TILE_H, TILE_W } from '../../utils/isometric';

export type MonsterView = 'front' | 'side' | 'back';

/** 顯示大小倍率（依體型）：三視圖最高一張＝怪物球直徑 × 倍率 */
export const MONSTER_ART_SIZE_RATIO: Readonly<Record<MonsterSize, number>> = { small: 1.3, large: 1.2 };

/** 外框寬（世界像素） */
export const MONSTER_ART_OUTLINE_PX = 1;

/** 腳下影子：寬＝顯示寬度 × 比例，濃度 */
export const MONSTER_ART_SHADOW = { widthRatio: 0.8, alpha: 0.3 } as const;

/** 血條與怪物圖頂的間距（px） */
const HEAD_GAP = 3;

/** 外框色依強化詞綴數（0～4 條）：0 條黑，1～4 條同 `34-ui-guidelines.md`「怪物強化詞綴顏色」 */
export const MONSTER_AFFIX_OUTLINE_COLORS = ['#141414', '#60A5FA', '#FACC15', '#FB923C', '#EF4444'] as const;

export function monsterArtOutlineColor(affixCount: number): string {
  return MONSTER_AFFIX_OUTLINE_COLORS[Math.max(0, Math.min(MONSTER_AFFIX_OUTLINE_COLORS.length - 1, affixCount))];
}

/**
 * 有怪物圖時頭頂物件（血條、詠唱條、懸停名稱）比球體時再上移的距離（px）：
 * 血條落在怪物圖頂（球直徑 × 倍率）上方 HEAD_GAP，各體型與圖頂的距離相同。
 */
export function monsterArtOverheadLift(size: MonsterSize): number {
  return 2 * MONSTER_RADIUS[size] * (MONSTER_ART_SIZE_RATIO[size] - 1) + 2 * MONSTER_RADIUS.small + HEAD_GAP + HEALTH_BAR_OFFSET_Y;
}

/** 朝向 → 視圖；朝左＝側面水平鏡像 */
export const MONSTER_VIEW_BY_DIRECTION: Record<PawnDirectionId, { view: MonsterView; mirrored: boolean }> = {
  front: { view: 'front', mirrored: false },
  right: { view: 'side', mirrored: false },
  back: { view: 'back', mirrored: false },
  left: { view: 'side', mirrored: true },
};

/** 顯示大小（世界像素）＝ 怪物球直徑 × sizeRatio */
export function monsterArtSize(size: MonsterSize, sizeRatio: number): number {
  return MONSTER_RADIUS[size] * 2 * sizeRatio;
}

/**
 * 一隻怪物三視圖共用的縮放，轉向時大小不跳動：
 * 先以三視圖中最高的一張對齊 displayHeight，最寬的一張若超過 maxWidth（預設一格 `TILE_W`）再整體縮到 maxWidth。
 */
export function monsterArtScale(views: readonly { width: number; height: number }[], displayHeight: number, maxWidth = TILE_W): number {
  const byHeight = displayHeight / Math.max(...views.map(v => v.height));
  return Math.min(byHeight, maxWidth / Math.max(...views.map(v => v.width)));
}

/** 腳下影子的橢圓半徑：水平＝當下朝向的顯示寬度 × widthRatio ÷ 2，垂直為水平的 TILE_H / TILE_W（等距 2:1） */
export function monsterShadowRadius(displayWidth: number, widthRatio: number): { rx: number; ry: number } {
  const rx = (displayWidth * widthRatio) / 2;
  return { rx, ry: rx * (TILE_H / TILE_W) };
}
