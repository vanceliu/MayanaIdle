/**
 * 玩家交易（`97-selfhosted-server.md` § 97.7 表）。純記憶體的流程狀態；換手時即時寫 SQLite。
 *
 * 流程：提出 → 接受 → 雙方放入 → 雙方鎖定 → 雙方確認 → 換手。
 * 任一方改動放入的內容就把兩邊的鎖定與確認都清掉。
 */
import { randomBytes } from 'node:crypto';
import type { Session } from '../../client/src/stores/session';
import type { TradeOfferInput, TradeOfferView, TradeView, TradeSideView } from '../../client/src/stores/tradeStore';
import { canReceive, executeTrade, validateOffer } from '../../client/src/systems/trade';

export const TRADE_OFFER_TTL_MS = 60_000;

export class TradeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface TradeSide {
  session: Session;
  characterId: number;
  name: string;
  offer: TradeOfferInput;
  locked: boolean;
  confirmed: boolean;
}

export interface Trade {
  id: string;
  a: TradeSide;
  b: TradeSide;
  createdAt: number;
  done: boolean;
}

interface PendingOffer {
  id: string;
  from: Session;
  fromCharacterId: number;
  fromName: string;
  toCharacterId: number;
  expiresAt: number;
}

function newId(): string {
  return randomBytes(6).toString('hex');
}

function identity(session: Session): { characterId: number; name: string } {
  const ch = session.game.getState().character;
  if (!ch?.id) throw new TradeError('no_character', '尚未進入世界');
  return { characterId: ch.id, name: ch.name };
}

function emptyOffer(): TradeOfferInput {
  return { equipmentIds: [], items: [], gold: 0 };
}

export class TradeManager {
  private readonly offers = new Map<string, PendingOffer>();
  private readonly trades = new Map<string, Trade>();
  private readonly byCharacter = new Map<number, Trade>();

  tradeOf(characterId: number): Trade | null {
    return this.byCharacter.get(characterId) ?? null;
  }

  offersFor(characterId: number, now: number): TradeOfferView[] {
    this.pruneOffers(now);
    return [...this.offers.values()]
      .filter(o => o.toCharacterId === characterId)
      .map(o => ({ id: o.id, fromCharacterId: o.fromCharacterId, fromName: o.fromName, expiresAt: o.expiresAt }));
  }

  pruneOffers(now: number): void {
    for (const [id, o] of this.offers) if (o.expiresAt <= now) this.offers.delete(id);
  }

  offer(from: Session, to: Session, now: number): PendingOffer {
    const me = identity(from);
    const target = identity(to);
    if (me.characterId === target.characterId) throw new TradeError('self', '不能和自己交易');
    if (this.tradeOf(me.characterId)) throw new TradeError('busy', '你正在交易中');
    if (this.tradeOf(target.characterId)) throw new TradeError('target_busy', `${target.name} 正在交易中`);
    this.pruneOffers(now);
    for (const o of this.offers.values()) {
      if (o.fromCharacterId === me.characterId && o.toCharacterId === target.characterId) return o;
    }
    const offer: PendingOffer = { id: newId(), from, fromCharacterId: me.characterId, fromName: me.name, toCharacterId: target.characterId, expiresAt: now + TRADE_OFFER_TTL_MS };
    this.offers.set(offer.id, offer);
    return offer;
  }

  accept(offerId: string, acceptor: Session, now: number): Trade {
    const offer = this.offers.get(offerId);
    const me = identity(acceptor);
    if (!offer || offer.toCharacterId !== me.characterId || offer.expiresAt <= now) {
      this.offers.delete(offerId);
      throw new TradeError('offer_gone', '交易邀請已失效');
    }
    this.offers.delete(offerId);
    let fromIdentity: { characterId: number; name: string };
    try {
      fromIdentity = identity(offer.from);
    } catch {
      throw new TradeError('offer_gone', '對方已離線');
    }
    if (fromIdentity.characterId !== offer.fromCharacterId) throw new TradeError('offer_gone', '對方已離線');
    if (this.tradeOf(me.characterId) || this.tradeOf(offer.fromCharacterId)) throw new TradeError('busy', '有一方正在交易中');
    const trade: Trade = {
      id: newId(),
      a: { session: offer.from, characterId: offer.fromCharacterId, name: offer.fromName, offer: emptyOffer(), locked: false, confirmed: false },
      b: { session: acceptor, characterId: me.characterId, name: me.name, offer: emptyOffer(), locked: false, confirmed: false },
      createdAt: now,
      done: false,
    };
    this.trades.set(trade.id, trade);
    this.byCharacter.set(trade.a.characterId, trade);
    this.byCharacter.set(trade.b.characterId, trade);
    return trade;
  }

  decline(offerId: string, characterId: number): void {
    const offer = this.offers.get(offerId);
    if (offer && offer.toCharacterId === characterId) this.offers.delete(offerId);
  }

  private sideOf(trade: Trade, characterId: number): { mine: TradeSide; theirs: TradeSide } {
    if (trade.a.characterId === characterId) return { mine: trade.a, theirs: trade.b };
    if (trade.b.characterId === characterId) return { mine: trade.b, theirs: trade.a };
    throw new TradeError('not_in_trade', '你不在這筆交易中');
  }

  private requireTrade(characterId: number): Trade {
    const trade = this.tradeOf(characterId);
    if (!trade || trade.done) throw new TradeError('no_trade', '目前沒有交易');
    return trade;
  }

  setOffer(characterId: number, input: TradeOfferInput): Trade {
    const trade = this.requireTrade(characterId);
    const { mine } = this.sideOf(trade, characterId);
    const normalized: TradeOfferInput = {
      equipmentIds: (input.equipmentIds ?? []).map(Number),
      items: (input.items ?? []).map(l => ({ itemId: Number(l.itemId), amount: Number(l.amount) })),
      gold: Number(input.gold ?? 0),
    };
    const check = validateOffer(mine.session.game.getState(), normalized);
    if (!check.ok) throw new TradeError('invalid_offer', check.message ?? '放入的內容不合法');
    mine.offer = normalized;
    // 任何改動都要重新鎖定與確認
    trade.a.locked = trade.b.locked = false;
    trade.a.confirmed = trade.b.confirmed = false;
    return trade;
  }

  lock(characterId: number): Trade {
    const trade = this.requireTrade(characterId);
    const { mine } = this.sideOf(trade, characterId);
    const check = validateOffer(mine.session.game.getState(), mine.offer);
    if (!check.ok) throw new TradeError('invalid_offer', check.message ?? '放入的內容不合法');
    mine.locked = true;
    return trade;
  }

  /** 雙方都確認才換手；回傳是否已完成 */
  async confirm(characterId: number): Promise<{ trade: Trade; completed: boolean }> {
    const trade = this.requireTrade(characterId);
    const { mine, theirs } = this.sideOf(trade, characterId);
    if (!mine.locked || !theirs.locked) throw new TradeError('not_locked', '雙方都鎖定後才能確認');
    mine.confirmed = true;
    if (!theirs.confirmed) return { trade, completed: false };

    for (const [side, other] of [[trade.a, trade.b], [trade.b, trade.a]] as const) {
      const state = side.session.game.getState();
      const own = validateOffer(state, side.offer);
      if (!own.ok) throw this.abort(trade, 'invalid_offer', `${side.name}：${own.message}`);
      const otherState = other.session.game.getState();
      const incoming = otherState.inventory.filter(i => other.offer.equipmentIds.includes(i.id!));
      const fit = canReceive(state, side.offer, incoming, other.offer.items);
      if (!fit.ok) throw this.abort(trade, 'no_space', `${side.name}：${fit.message}`);
    }
    await executeTrade({ session: trade.a.session, offer: trade.a.offer }, { session: trade.b.session, offer: trade.b.offer });
    trade.done = true;
    this.remove(trade);
    return { trade, completed: true };
  }

  cancel(characterId: number): Trade | null {
    const trade = this.tradeOf(characterId);
    if (!trade) return null;
    this.remove(trade);
    return trade;
  }

  /** 離線或離開世界：正在進行的交易取消、送出的邀請作廢 */
  dropCharacter(characterId: number): Trade | null {
    for (const [id, o] of this.offers) if (o.fromCharacterId === characterId || o.toCharacterId === characterId) this.offers.delete(id);
    return this.cancel(characterId);
  }

  private abort(trade: Trade, code: string, message: string): TradeError {
    // 換手前的驗證失敗：解除確認讓雙方重來，不整筆取消
    trade.a.confirmed = trade.b.confirmed = false;
    trade.a.locked = trade.b.locked = false;
    return new TradeError(code, message);
  }

  private remove(trade: Trade): void {
    this.trades.delete(trade.id);
    this.byCharacter.delete(trade.a.characterId);
    this.byCharacter.delete(trade.b.characterId);
  }

  view(trade: Trade, characterId: number): TradeView {
    const { mine, theirs } = this.sideOf(trade, characterId);
    const stage = trade.done ? 'done' : (trade.a.locked && trade.b.locked ? 'locked' : 'editing');
    return { id: trade.id, me: sideView(mine), other: sideView(theirs), stage };
  }
}

function sideView(side: TradeSide): TradeSideView {
  const inventory = side.session.game.getState().inventory;
  return {
    characterId: side.characterId,
    name: side.name,
    equipment: inventory.filter(i => side.offer.equipmentIds.includes(i.id!)),
    items: side.offer.items,
    gold: side.offer.gold,
    locked: side.locked,
    confirmed: side.confirmed,
  };
}
