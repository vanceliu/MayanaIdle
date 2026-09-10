/**
 * 場上單位的種類（`97-selfhosted-server.md` 第 4 階段硬性約束、`25-monster-system.md` § 25.10）。
 *
 * `pet`（非玩家友方）與 `summon`（非模板敵方）只預留型別位置，尚無實作。
 */
export type UnitKind = 'player' | 'ally' | 'monster' | 'pet' | 'summon';

/** 佔位表與目標選擇把單位分成兩側 */
export type UnitSide = 'friendly' | 'hostile';

export const UNIT_SIDE: Record<UnitKind, UnitSide> = {
  player: 'friendly',
  ally: 'friendly',
  pet: 'friendly',
  monster: 'hostile',
  summon: 'hostile',
};

/** 佔位表的佔用者種類：玩家（含隊友）與怪物；寵物與召喚物預留 */
export type OccupantType = Extract<UnitKind, 'player' | 'monster' | 'pet' | 'summon'>;

/** 佔位表裡玩家的 id：每位成員一個，隊友之間不可撞號 */
export function playerOccupantId(memberId: number): string {
  return `player:${memberId}`;
}
