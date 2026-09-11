import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useTradeStore, type TradeLine } from '../stores/tradeStore';
import { usePanelWindowStore } from '../stores/panelWindowStore';
import { TradeGrid } from './TradeGrid';
import { TradeSourceGrid, type TradePutInput } from './TradeSourceGrid';
import { TRADE_MAX_SLOTS } from '../systems/trade';
import type { BagGridItem } from './BagCell';

/**
 * 交易面板（`97-selfhosted-server.md` § 97.7.4）。判定全在 server，這裡只呈現鏡像與送出指令。
 *
 * **沒有面板按鈕**：交易由隊伍面板的玩家名單發起，
 * 收到邀請或交易成立時自動開窗（`TradeAutoOpen`）。
 */

/**
 * 掛在版面上、不畫任何東西：交易視窗的開關完全跟著交易本身。
 *
 * 交易視窗沒有面板按鈕，所以**沒有交易也沒有邀請時它不該留在畫面上** ——
 * 取消、對方取消、交易完成、邀請過期都會落到這裡關窗。
 * 結果與訊息留在系統紀錄與發起的那個面板上（§ 97.7.4）。
 */
export function TradeAutoOpen() {
  const pending = useTradeStore(s => s.trade !== null || s.offers.length > 0);
  const openPanel = usePanelWindowStore(s => s.openPanel);
  const closePanel = usePanelWindowStore(s => s.closePanel);
  useEffect(() => {
    if (pending) openPanel('trade');
    else closePanel('trade');
  }, [pending, openPanel, closePanel]);
  return null;
}

export function TradePanelContent() {
  const trade = useTradeStore(s => s.trade);
  const offers = useTradeStore(s => s.offers);
  const message = useTradeStore(s => s.message);
  const accept = useTradeStore(s => s.accept);
  const decline = useTradeStore(s => s.decline);
  const setOffer = useTradeStore(s => s.setOffer);
  const lock = useTradeStore(s => s.lock);
  const confirm = useTradeStore(s => s.confirm);
  const cancel = useTradeStore(s => s.cancel);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const gold = useGameStore(s => s.character?.gold ?? 0);

  const [goldInput, setGoldInput] = useState(0);

  // 換一筆交易時把本機的金幣拉桿歸零
  useEffect(() => setGoldInput(0), [trade?.id]);

  const editing = !!trade && !trade.me.locked;
  /** 已放入的內容一律以 server 推回來的鏡像為準，本機不另外留一份 */
  const placedEquipmentIds = trade?.me.equipment.map(e => e.id!) ?? [];
  const placedItems: Record<number, number> = {};
  for (const line of trade?.me.items ?? []) placedItems[line.itemId] = line.amount;
  const usedSlots = placedEquipmentIds.length + (trade?.me.items.length ?? 0);
  const slotsFull = usedSlots >= TRADE_MAX_SLOTS;

  /**
   * 每次放入／取出直接送出，沒有「更新放入的內容」這一步：
   * server 本來就會在任一側改動時解除雙方的鎖定與確認，批次送出只換來
   * 「按下去才知道剛才放的是哪一件」。
   */
  const send = (equipmentIds: number[], items: TradeLine[], nextGold = goldInput) => {
    void setOffer({ equipmentIds, items, gold: Math.max(0, Math.floor(nextGold)) });
  };

  const currentItems = (): TradeLine[] => (trade?.me.items ?? []).map(l => ({ ...l }));

  /** 輸入格什麼都打得進來（空字串、負號、超過持有量），一律夾回 0～持有量 */
  const clampGold = (raw: string): number => {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return 0;
    return Math.min(gold, Math.max(0, n));
  };

  const put = (input: TradePutInput) => {
    if (!trade) return;
    if (input.equipmentId != null) {
      send([...placedEquipmentIds, input.equipmentId], currentItems());
      return;
    }
    const items = currentItems();
    const line = items.find(l => l.itemId === input.itemId);
    if (line) line.amount += input.amount;
    else items.push({ itemId: input.itemId!, amount: input.amount });
    send(placedEquipmentIds, items);
  };

  /** 取出：整格拿回來（堆疊也是整格，要改數量就再放一次） */
  const take = (cell: BagGridItem) => {
    if (!trade) return;
    if (cell.equipment) {
      send(placedEquipmentIds.filter(id => id !== cell.equipment!.id), currentItems());
      return;
    }
    send(placedEquipmentIds, currentItems().filter(l => l.itemId !== cell.itemId));
  };

  return (
    <div className="trade-panel">
      <div className="panel-scroll">
        {offers.length > 0 && !trade && (
          <section className="party-section">
            <div className="party-section-title">交易邀請</div>
            <ul className="party-list">
              {offers.map(o => (
                <li key={o.id} className="party-row">
                  <span className="party-row-main">{o.fromName} 想和你交易</span>
                  <button className="party-action-btn" onClick={() => void accept(o.id)}>接受</button>
                  <button className="party-action-btn is-secondary" onClick={() => void decline(o.id)}>拒絕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!trade && offers.length === 0 && (
          <div className="party-empty">目前沒有交易。從隊伍面板的玩家名單發起交易。</div>
        )}

        {trade && (
          <>
            <div className="trade-sides">
              <TradeGrid side={trade.me} title="我提供" onTake={editing ? take : undefined} />
              <TradeGrid side={trade.other} title={`${trade.other.name} 提供`} />
            </div>

            {editing && (
              <section className="party-section trade-editor">
                <div className="trade-editor-slots">
                  已放 {usedSlots} / {TRADE_MAX_SLOTS} 格（金幣不佔格）
                </div>

                <TradeSourceGrid
                  inventory={inventory}
                  bagItems={bagItems}
                  placedEquipmentIds={placedEquipmentIds}
                  placedItems={placedItems}
                  full={slotsFull}
                  onPut={put}
                />

                <div className="trade-editor-gold">
                  <label className="trade-pick trade-pick-qty">
                    <span className="trade-pick-name">金幣（持有 {gold.toLocaleString()}G）</span>
                    {/*
                      金幣不佔格，所以留在拉桿。放開才送出：range 的 onChange 每一格都會發，
                      跟著送等於每拖一下就打斷雙方的鎖定。
                    */}
                    <input
                      type="range"
                      min={0}
                      max={gold}
                      value={goldInput}
                      aria-label="金幣"
                      onChange={e => setGoldInput(clampGold(e.target.value))}
                      onPointerUp={() => send(placedEquipmentIds, currentItems())}
                      onKeyUp={() => send(placedEquipmentIds, currentItems())}
                      onBlur={() => send(placedEquipmentIds, currentItems())}
                    />
                    {/* 拉桿對不準確切的數字（25,256 裡的 5,000），所以同一個值再給一個輸入格 */}
                    <input
                      type="number"
                      className="trade-gold-input"
                      min={0}
                      max={gold}
                      step={1}
                      value={goldInput}
                      aria-label="金幣數量"
                      onChange={e => setGoldInput(clampGold(e.target.value))}
                      onBlur={() => send(placedEquipmentIds, currentItems())}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        send(placedEquipmentIds, currentItems());
                      }}
                    />
                  </label>
                </div>
              </section>
            )}

            <div className="party-controls">
              {!trade.me.locked && <button className="party-action-btn" onClick={() => void lock()}>鎖定</button>}
              {trade.stage === 'locked' && !trade.me.confirmed && (
                <button className="party-action-btn" onClick={() => void confirm()}>確認交易</button>
              )}
              <button className="party-action-btn is-danger" onClick={() => void cancel()}>取消</button>
            </div>
          </>
        )}

        {message && <div className="party-message" role="status">{message}</div>}
      </div>
    </div>
  );
}
