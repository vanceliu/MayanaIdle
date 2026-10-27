/**
 * 公會倉庫的存取（`docs/design/11-guild.md` § 11.8）。
 * 判定與倉庫狀態在 `GuildManager.withWarehouse`（排隊、寫入成功才改記憶體）；這裡算出要搬什麼並改玩家身上。
 */
import type { Session } from '../../client/src/stores/session';
import type { EquipmentInstance } from '../../client/src/models/equipment';
import { addBagItem, consumeBagItem, getBagItemAmount, isPositiveCount } from '../../client/src/models/bagItem';
import { isSigilItemId } from '../../client/src/models/sigil';
import { getBagMaxSlots, getBagUsedSlots } from '../../client/src/stores/gameStore';
import {
  GUILD_WAREHOUSE_CAPACITY, GUILD_WAREHOUSE_FULL_MESSAGE, GUILD_WAREHOUSE_TAKEN_MESSAGE,
} from '../../client/src/models/guild';
import { GuildError, type GuildManager } from './guild';
import { guildOwnerId } from './db/guildStorage';

/** 單次存取的上限：倉庫總共也只有 200 格 */
const MAX_LINES = GUILD_WAREHOUSE_CAPACITY;

interface Move {
  equipmentIds: number[];
  materials: { itemId: number; amount: number }[];
}

/** client 送來的內容一律重新檢查（`97-selfhosted-server.md` § 97.2 參數驗證） */
function parseMove(raw: unknown): Move {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ids = Array.isArray(value.equipmentIds) ? value.equipmentIds : [];
  const lines = Array.isArray(value.materials) ? value.materials : [];
  if (ids.length > MAX_LINES || lines.length > MAX_LINES) throw new GuildError('bad_move', '一次存取的項目太多');
  const equipmentIds = [...new Set(ids.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0))];
  const merged = new Map<number, number>();
  for (const line of lines) {
    const { itemId, amount } = (line ?? {}) as { itemId?: unknown; amount?: unknown };
    if (!Number.isSafeInteger(itemId) || (itemId as number) <= 0 || !isPositiveCount(amount) || !Number.isSafeInteger(amount)) continue;
    merged.set(itemId as number, (merged.get(itemId as number) ?? 0) + (amount as number));
  }
  return { equipmentIds, materials: [...merged].map(([itemId, amount]) => ({ itemId, amount })) };
}

function parseGold(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) <= 0) throw new GuildError('bad_amount', '金額不正確');
  return raw as number;
}

export interface DepositResult {
  equipment: number;
  materials: number;
  /** 有東西因為倉庫滿了沒存進去 */
  full: boolean;
}

/** 存入：放得下的依序存入，放不下的留在背包（§ 11.8） */
export function depositToGuild(guilds: GuildManager, session: Session, rawMove: unknown): Promise<DepositResult> {
  const move = parseMove(rawMove);
  const characterId = session.game.getState().character!.id!;
  return guilds.withWarehouse(characterId, guild => {
    const gs = session.game.getState();
    const stored = guild.warehouse;
    let used = guilds.warehouseUsed(guild);
    let full = false;

    const equipment: EquipmentInstance[] = [];
    for (const id of move.equipmentIds) {
      const item = gs.inventory.find(i => i.id === id);
      // 新手裝不收（§ 11.8）；裝備中的不在 `inventory`
      if (!item || item.isStarterGear) continue;
      if (used >= GUILD_WAREHOUSE_CAPACITY) { full = true; continue; }
      used++;
      equipment.push({ ...item, equipped: false, inStorage: true, storageType: 'guild', ownerId: guildOwnerId(guild.id) });
    }

    const totals = new Map<number, number>();
    const taken = new Map<number, number>();
    for (const { itemId, amount } of move.materials) {
      const actual = Math.min(amount, getBagItemAmount(gs.bagItems, itemId));
      if (actual <= 0) continue;
      const before = totals.get(itemId) ?? stored.items.get(itemId) ?? 0;
      if (before === 0) {
        if (used >= GUILD_WAREHOUSE_CAPACITY) { full = true; continue; }
        used++;
      }
      totals.set(itemId, before + actual);
      taken.set(itemId, (taken.get(itemId) ?? 0) + actual);
    }

    return {
      write: { equipment, items: [...totals].map(([itemId, amount]) => ({ itemId, amount })), gold: stored.gold },
      result: { equipment: equipment.length, materials: taken.size, full },
      apply: () => {
        const now = session.game.getState();
        const movedIds = new Set(equipment.map(e => e.id));
        let bag = now.bagItems;
        for (const [itemId, amount] of taken) bag = consumeBagItem(bag, itemId, amount);
        session.game.setState({ inventory: now.inventory.filter(i => !movedIds.has(i.id)), bagItems: bag });
      },
    };
  });
}

/** 取出：要的東西必須都還在，且背包放得下，否則整筆不成立 */
export function withdrawFromGuild(guilds: GuildManager, session: Session, rawMove: unknown): Promise<void> {
  const move = parseMove(rawMove);
  const characterId = session.game.getState().character!.id!;
  return guilds.withWarehouse(characterId, guild => {
    const gs = session.game.getState();
    const stored = guild.warehouse;

    const equipment: EquipmentInstance[] = [];
    for (const id of move.equipmentIds) {
      const item = stored.equipment.get(id);
      if (!item) throw new GuildError('taken', GUILD_WAREHOUSE_TAKEN_MESSAGE);
      equipment.push({ ...item, inStorage: false, storageType: undefined, ownerId: characterId });
    }
    const items: { itemId: number; amount: number }[] = [];
    for (const { itemId, amount } of move.materials) {
      const have = stored.items.get(itemId) ?? 0;
      if (have < amount) throw new GuildError('taken', GUILD_WAREHOUSE_TAKEN_MESSAGE);
      items.push({ itemId, amount: have - amount });
    }

    // § 35.3：背包放不下不可取出；印記不佔格，背包已有的同種道具不佔新格
    const free = getBagMaxSlots(gs.equippedGear) - getBagUsedSlots(gs.bagItems, gs.inventory, gs.equippedGear);
    const newKinds = move.materials.filter(m => !isSigilItemId(m.itemId) && getBagItemAmount(gs.bagItems, m.itemId) === 0).length;
    if (equipment.length + newKinds > free) throw new GuildError('bag_full', '背包空間不足');

    return {
      write: { equipment, items, gold: stored.gold },
      result: undefined,
      apply: () => {
        const now = session.game.getState();
        let bag = now.bagItems;
        for (const { itemId, amount } of move.materials) bag = addBagItem(bag, itemId, amount);
        session.game.setState({ inventory: [...now.inventory, ...equipment], bagItems: bag });
      },
    };
  });
}

export function depositGoldToGuild(guilds: GuildManager, session: Session, rawAmount: unknown): Promise<number> {
  const amount = parseGold(rawAmount);
  const characterId = session.game.getState().character!.id!;
  return guilds.withWarehouse(characterId, guild => {
    const actual = Math.min(amount, session.game.getState().character!.gold);
    return {
      write: { equipment: [], items: [], gold: guild.warehouse.gold + actual },
      result: actual,
      apply: () => {
        const ch = session.game.getState().character!;
        session.game.setState({ character: { ...ch, gold: ch.gold - actual } });
      },
    };
  });
}

export function withdrawGoldFromGuild(guilds: GuildManager, session: Session, rawAmount: unknown): Promise<number> {
  const amount = parseGold(rawAmount);
  const characterId = session.game.getState().character!.id!;
  return guilds.withWarehouse(characterId, guild => {
    if (guild.warehouse.gold < amount) throw new GuildError('gold', '公會倉庫金幣不足');
    return {
      write: { equipment: [], items: [], gold: guild.warehouse.gold - amount },
      result: amount,
      apply: () => {
        const ch = session.game.getState().character!;
        session.game.setState({ character: { ...ch, gold: ch.gold + amount } });
      },
    };
  });
}

export { GUILD_WAREHOUSE_FULL_MESSAGE };
