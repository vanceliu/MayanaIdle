/** AI 地圖素材的尺寸規格（`38-map-control.md` § 38.9「素材來源」） */

/** 素材密度：素材像素 ÷ 世界像素，同 `PAWN_BAKE_SCALE`；繪製時縮放 1 / ASSET_SCALE */
export const ASSET_SCALE = 2;

/** 地板材質週期（格）：材質每 FLOOR_PERIOD × FLOOR_PERIOD 格重複 */
export const FLOOR_PERIOD = 4;

/** 每格邊長對應的材質像素數 */
export const FLOOR_TEXELS_PER_TILE = 32 * ASSET_SCALE;

/** AI 原圖尺寸 */
export const RAW_SIZE = 1024;
