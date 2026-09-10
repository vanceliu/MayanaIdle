import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useTradeStore, type TradeLine, type TradeSideView } from '../stores/tradeStore';
import { usePanelWindowStore } from '../stores/panelWindowStore';
import { getItemById } from '../models/items';

/**
 * 交易面板（`97-selfhosted-server.md` § 97.7 表）。判定全在 server，這裡只呈現鏡像與送出指令。
 *
 * **沒有面板按鈕**：交易由隊伍面板的玩家名單發起，
 * 收到邀請或交易成立時自動開窗（`TradeAutoOpen`）。
 */

/** 掛在版面上、不畫任何東西：只負責在有邀請或交易時把交易視窗打開 */
export function TradeAutoOpen() {
  const pending = useTradeStore(s => s.trade !== null || s.offers.length > 0);
  const openPanel = usePanelWindowStore(s => s.openPanel);
  useEffect(() => {
    if (pending) openPanel('trade');
  }, [pending, openPanel]);
  return null;
}

function itemName(itemId: number): string {
  return getItemById(itemId)?.name ?? `#${itemId}`;
}

function equipmentLabel(item: { name: string; enhancement?: number }): string {
  return item.enhancement ? `${item.name} +${item.enhancement}` : item.name;
}

function SideSummary({ side, title }: { side: TradeSideView; title: string }) {
  return (
    <div className={`trade-side${side.locked ? ' is-locked' : ''}`}>
      <div className="trade-side-title">
        {title}
        <span className="trade-side-state">{side.confirmed ? '已確認' : side.locked ? '已鎖定' : '編輯中'}</span>
      </div>
      <ul className="trade-list">
        {side.equipment.map(e => <li key={e.id} className="trade-item">{equipmentLabel(e)}</li>)}
        {side.items.map(l => <li key={l.itemId} className="trade-item">{itemName(l.itemId)} ×{l.amount}</li>)}
        {side.gold > 0 && <li className="trade-item trade-gold">{side.gold.toLocaleString()}G</li>}
        {side.equipment.length === 0 && side.items.length === 0 && side.gold === 0 && <li className="trade-item is-empty">（空）</li>}
      </ul>
    </div>
  );
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

  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [lines, setLines] = useState<Record<number, number>>({});
  const [goldInput, setGoldInput] = useState(0);

  // 交易結束或換一筆時清掉本機的編輯狀態
  useEffect(() => {
    setEquipmentIds([]);
    setLines({});
    setGoldInput(0);
  }, [trade?.id]);

  const editing = !!trade && !trade.me.locked;

  const apply = () => {
    const items: TradeLine[] = Object.entries(lines)
      .map(([id, amount]) => ({ itemId: Number(id), amount }))
      .filter(l => l.amount > 0);
    void setOffer({ equipmentIds, items, gold: Math.max(0, Math.floor(goldInput)) });
  };

  const toggleEquipment = (id: number) => {
    setEquipmentIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
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
              <SideSummary side={trade.me} title="我提供" />
              <SideSummary side={trade.other} title={`${trade.other.name} 提供`} />
            </div>

            {editing && (
              <section className="party-section trade-editor">
                <div className="party-section-title">放入</div>
                <div className="trade-editor-group">
                  <div className="trade-editor-label">裝備</div>
                  {inventory.filter(i => !i.isStarterGear).length === 0
                    ? <div className="party-empty">背包沒有可交易的裝備</div>
                    : (
                      <ul className="trade-pick-list">
                        {inventory.filter(i => !i.isStarterGear).map(i => (
                          <li key={i.id}>
                            <label className="trade-pick">
                              <input type="checkbox" checked={equipmentIds.includes(i.id!)} onChange={() => toggleEquipment(i.id!)} />
                              {equipmentLabel(i)}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="trade-editor-group">
                  <div className="trade-editor-label">道具</div>
                  {bagItems.length === 0
                    ? <div className="party-empty">背包沒有道具</div>
                    : (
                      <ul className="trade-pick-list">
                        {bagItems.map(b => (
                          <li key={b.itemId} className="trade-pick trade-pick-qty">
                            <span>{b.name}（{b.amount}）</span>
                            <input
                              type="number"
                              min={0}
                              max={b.amount}
                              value={lines[b.itemId] ?? 0}
                              aria-label={`${b.name} 數量`}
                              onChange={e => setLines(l => ({ ...l, [b.itemId]: Math.max(0, Math.min(b.amount, Math.floor(Number(e.target.value) || 0))) }))}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="trade-editor-group trade-editor-gold">
                  <label className="trade-pick trade-pick-qty">
                    <span>金幣（持有 {gold.toLocaleString()}G）</span>
                    <input
                      type="number"
                      min={0}
                      max={gold}
                      value={goldInput}
                      aria-label="金幣"
                      onChange={e => setGoldInput(Math.max(0, Math.min(gold, Math.floor(Number(e.target.value) || 0))))}
                    />
                  </label>
                </div>
                <button className="party-action-btn" onClick={apply}>更新放入的內容</button>
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
