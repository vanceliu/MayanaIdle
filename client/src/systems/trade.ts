/**
 * 交易的驗證與換手（`97-selfhosted-server.md` § 97.7 表）。
 *
 * 純函式在 client／server 共用；`executeTrade` 只在 server 執行，
 * 先在記憶體對兩邊的 store 換手，再以單一持久層交易寫入。
 */
import type { EquipmentInstance } from '../models/equipment';
import type { BagItem } from '../models/bagItem';
import { addBagItem, consumeBagItem, getBagItemAmount } from '../models/bagItem';
import type { Session } from '../stores/session';
import { getBagMaxSlots, getBagUsedSlots, type GameState } from '../stores/gameStore';
import type { TradeLine, TradeOfferInput } from '../stores/tradeStore';

/**
 * 一側最多放幾樣（`97-selfhosted-server.md` § 97.7）。裝備與道具列合計，金幣不佔格。
 * 交易視窗是固定 10 格的格線，放得下多少就是看得到多少 —— 沒有捲動、沒有隱藏的東西。
 */
export const TRADE_MAX_SLOTS = 10;

export interface TradeValidation {
  ok: boolean;
  message?: string;
}

/** 這一邊放出的東西是不是自己有、而且可以交易的 */
export function validateOffer(state: GameState, input: TradeOfferInput): TradeValidation {
  if (!state.character) return { ok: false, message: '尚未進入世界' };
  if (!Number.isInteger(input.gold) || input.gold < 0) return { ok: false, message: '金幣數量不合法' };
  if (input.gold > state.character.gold) return { ok: false, message: '金幣不足' };
  if (input.equipmentIds.length + input.items.length > TRADE_MAX_SLOTS) {
    return { ok: false, message: `一次最多交易 ${TRADE_MAX_SLOTS} 樣（金幣不算）` };
  }
  const seen = new Set<number>();
  for (const id of input.equipmentIds) {
    if (seen.has(id)) return { ok: false, message: '同一件裝備重複放入' };
    seen.add(id);
    const item = state.inventory.find(i => i.id === id);
    if (!item) return { ok: false, message: '裝備不在背包中' };
    // 新手裝只能穿在身上或丟棄（`13-town.md` § 13.11）
    if (item.isStarterGear) return { ok: false, message: `${item.name} 是新手裝，不可交易` };
  }
  const seenItems = new Set<number>();
  for (const line of input.items) {
    if (seenItems.has(line.itemId)) return { ok: false, message: '同一種道具重複放入' };
    seenItems.add(line.itemId);
    if (!Number.isInteger(line.amount) || line.amount <= 0) return { ok: false, message: '道具數量不合法' };
    if (getBagItemAmount(state.bagItems, line.itemId) < line.amount) return { ok: false, message: '道具數量不足' };
  }
  return { ok: true };
}

/** 收下對方的東西之後背包放不放得下（`35-inventory-constraints.md` § 35.3） */
export function canReceive(
  state: GameState,
  outgoing: TradeOfferInput,
  incomingEquipment: EquipmentInstance[],
  incomingItems: TradeLine[],
): TradeValidation {
  const outgoingIds = new Set(outgoing.equipmentIds);
  const inventoryAfter = [...state.inventory.filter(i => !outgoingIds.has(i.id!)), ...incomingEquipment];
  let bagAfter: BagItem[] = state.bagItems;
  for (const line of outgoing.items) bagAfter = consumeBagItem(bagAfter, line.itemId, line.amount);
  for (const line of incomingItems) bagAfter = addBagItem(bagAfter, line.itemId, line.amount);
  if (getBagUsedSlots(bagAfter, inventoryAfter, state.equippedGear) > getBagMaxSlots(state.equippedGear)) {
    return { ok: false, message: '背包欄位不足' };
  }
  return { ok: true };
}

export interface TradeSideExec {
  session: Session;
  offer: TradeOfferInput;
}

/**
 * 換手：兩邊的 store 同步改，裝備的 `ownerId` 以單一交易寫入，背包與金幣走各自的存檔。
 * 呼叫前必須已通過 `validateOffer` 與 `canReceive`。
 */
export async function executeTrade(a: TradeSideExec, b: TradeSideExec): Promise<void> {
  const moveA = takeOut(a);
  const moveB = takeOut(b);
  putIn(a, moveB);
  putIn(b, moveA);
  const repo = a.session.repo;
  await repo.transaction(async () => {
    for (const item of moveA.equipment) await repo.updateEquipment(item.id!, { ownerId: item.ownerId });
    for (const item of moveB.equipment) await repo.updateEquipment(item.id!, { ownerId: item.ownerId });
  });
  a.session.game.getState().saveState();
  b.session.game.getState().saveState();
}

interface Moved {
  equipment: EquipmentInstance[];
  items: TradeLine[];
  gold: number;
}

function takeOut(side: TradeSideExec): Moved {
  const gs = side.session.game.getState();
  const ids = new Set(side.offer.equipmentIds);
  const equipment = gs.inventory.filter(i => ids.has(i.id!));
  let bag = gs.bagItems;
  for (const line of side.offer.items) bag = consumeBagItem(bag, line.itemId, line.amount);
  side.session.game.setState({
    inventory: gs.inventory.filter(i => !ids.has(i.id!)),
    bagItems: bag,
    character: { ...gs.character!, gold: gs.character!.gold - side.offer.gold },
  });
  return { equipment, items: side.offer.items, gold: side.offer.gold };
}

function putIn(side: TradeSideExec, moved: Moved): void {
  const gs = side.session.game.getState();
  const ownerId = gs.character!.id!;
  const received = moved.equipment.map(item => {
    item.ownerId = ownerId;
    return { ...item, ownerId, equipped: false, inStorage: false };
  });
  let bag = gs.bagItems;
  for (const line of moved.items) bag = addBagItem(bag, line.itemId, line.amount);
  side.session.game.setState({
    inventory: [...gs.inventory, ...received],
    bagItems: bag,
    character: { ...gs.character!, gold: gs.character!.gold + moved.gold },
  });
}
