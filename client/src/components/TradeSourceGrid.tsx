/**
 * 交易的來源格：自己背包裡還能放進交易的東西（`97-selfhosted-server.md` § 97.7.4）。
 *
 * 與背包同一份格線、格子與 tooltip —— 名稱相同的武器只有數值分得出來，
 * 所以要在**放進去之前**就看得到詞綴與強化，而不是放進去才知道拿錯。
 *
 * 放入方式兩條，兩條都必須存在：
 * - 拖曳到「我提供」的格子（滑鼠）
 * - 點格子（觸控沒有拖曳，`usePressDrag` 刻意排除，否則捲動就會抓起東西）
 */
import { useState } from 'react';
import { BagGrid, padToRows, rowsForSlots } from './BagGrid';
import { BagCellVisual, BagItemTooltipBody, type BagGridItem } from './BagCell';
import { BagTooltip, anchorOf, type AnchorRect } from './BagTooltip';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { usePressDrag } from '../hooks/usePressDrag';
import { useDragStore, useIsDragOver } from '../stores/dragStore';
import { getItemById } from '../models/items';
import type { EquipmentInstance } from '../models/equipment';
import type { BagItem } from '../models/bagItem';

/** 來源格至少畫這麼多列，內容再多就往下長 */
const MIN_SOURCE_ROWS = 3;

export interface TradePutInput {
  equipmentId?: number;
  itemId?: number;
  amount: number;
}

export interface TradeSourceGridProps {
  inventory: EquipmentInstance[];
  bagItems: BagItem[];
  /** 已經放進交易的裝備 id */
  placedEquipmentIds: number[];
  /** 已經放進交易的道具數量（itemId → 數量） */
  placedItems: Record<number, number>;
  /** 交易格已滿：還能調整已放入的數量，但不能再放新的一樣 */
  full: boolean;
  onPut: (input: TradePutInput) => void;
}

/** 來源格的內容：可交易的裝備 ＋ 還有剩的道具 */
export function sourceCells(props: Pick<TradeSourceGridProps,
  'inventory' | 'bagItems' | 'placedEquipmentIds' | 'placedItems'>): BagGridItem[] {
  const placed = new Set(props.placedEquipmentIds);
  const equipment = props.inventory
    // 新手裝不可交易（`13-town.md` § 13.11），已放入的不再出現在來源
    .filter(e => !e.isStarterGear && !placed.has(e.id!))
    .map<BagGridItem>(e => ({
      id: `eq-${e.id}`,
      type: 'equipment',
      name: e.enhancement ? `${e.name} +${e.enhancement}` : e.name,
      equipment: e,
    }));

  const items = props.bagItems
    .map(b => ({ b, left: b.amount - (props.placedItems[b.itemId] ?? 0) }))
    .filter(({ left }) => left > 0)
    .map<BagGridItem>(({ b, left }) => {
      const def = getItemById(b.itemId);
      return {
        id: `item-${b.itemId}`,
        type: (def?.category as BagGridItem['type']) ?? 'material',
        name: def?.name ?? b.name,
        itemId: b.itemId,
        count: left,
      };
    });

  return [...equipment, ...items];
}

function putOf(cell: BagGridItem, amount: number): TradePutInput {
  return cell.equipment
    ? { equipmentId: cell.equipment.id!, amount: 1 }
    : { itemId: cell.itemId!, amount };
}

export function TradeSourceGrid(props: TradeSourceGridProps) {
  const templates = useEquipmentTemplates();
  const [tooltip, setTooltip] = useState<{ item: BagGridItem; anchor: AnchorRect } | null>(null);
  /** 堆疊道具要先決定數量才放得進去 */
  const [picking, setPicking] = useState<{ cell: BagGridItem; amount: number } | null>(null);
  const drag = usePressDrag(() => setTooltip(null));
  const over = useIsDragOver('trade-source', -1);

  const cells = sourceCells(props);

  /**
   * 放滿之後還能不能放這一格：
   * 已經放進去的那一種道具是**加在原本那一格上**，不會多佔格數，所以照樣能加量。
   * 裝備每件都要一格，滿了就是滿了。
   */
  const canPut = (cell: BagGridItem) =>
    !props.full || (cell.itemId != null && (props.placedItems[cell.itemId] ?? 0) > 0);

  /** 放入一格：堆疊且不只一個時先問數量，其餘直接放 */
  const put = (cell: BagGridItem) => {
    if (!canPut(cell)) return;
    const count = cell.count ?? 1;
    if (!cell.equipment && count > 1) {
      setPicking({ cell, amount: 1 });
      return;
    }
    props.onPut(putOf(cell, count));
  };

  return (
    <div
      className={`trade-source${over ? ' is-drop-target' : ''}`}
      data-drop-kind="trade-source"
      data-drop-index={-1}
    >
      <div className="trade-source-title">
        <span>背包</span>
        {/* 觸控沒有拖曳，所以點擊一定要能放入 —— 提示兩條路都講 */}
        <span className="trade-source-hint">拖到上方或點一下放入</span>
      </div>

      <BagGrid>
        {padToRows(cells, Math.max(MIN_SOURCE_ROWS, rowsForSlots(cells.length))).map((item, i) => (
          <div
            key={item?.id ?? `empty-${i}`}
            className={`bag-cell${item ? '' : ' empty'}${item && !canPut(item) ? ' is-disabled' : ''}`}
            onPointerEnter={e => item && setTooltip({ item, anchor: anchorOf(e.currentTarget) })}
            onPointerLeave={() => setTooltip(null)}
            onPointerDown={e => item && canPut(item) && drag.onPointerDown(e)}
            onPointerMove={e => item && canPut(item) && drag.onPointerMove(e, () => ({
              fromIndex: -1,
              label: item.name,
              payload: item.equipment
                ? { kind: 'equipment', name: item.name, amount: 1, equipmentId: item.equipment.id }
                : { kind: 'bag', name: item.name, amount: item.count ?? 1, itemId: item.itemId },
            }))}
            onPointerUp={e => {
              if (!item || !canPut(item)) return;
              // 放開的位置不一定發過 move，落點要先對一次才問 dragStore（同 `BagPanel`）
              const dragging = useDragStore.getState().item != null;
              if (dragging) useDragStore.getState().move(e.clientX, e.clientY);
              const { wasClick } = drag.onPointerUp(e);
              if (dragging) {
                (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                if (useDragStore.getState().drop()?.kind === 'trade-offer') put(item);
                return;
              }
              if (wasClick) put(item);
            }}
            onPointerCancel={drag.onPointerCancel}
          >
            {item && <BagCellVisual item={item} templates={templates} />}
          </div>
        ))}
      </BagGrid>

      {picking && (
        <div className="trade-qty" role="group" aria-label={`${picking.cell.name} 放入數量`}>
          <span className="trade-qty-name">{picking.cell.name}</span>
          <input
            type="range"
            min={1}
            max={picking.cell.count ?? 1}
            value={picking.amount}
            aria-label={`${picking.cell.name} 數量`}
            onChange={e => setPicking(p => (p ? { ...p, amount: Number(e.target.value) } : p))}
          />
          <span className="trade-qty-value">{picking.amount}</span>
          <button
            className="party-action-btn is-secondary"
            onClick={() => setPicking(p => (p ? { ...p, amount: p.cell.count ?? 1 } : p))}
          >全部</button>
          <button
            className="party-action-btn"
            onClick={() => {
              props.onPut(putOf(picking.cell, picking.amount));
              setPicking(null);
            }}
          >放入</button>
          <button className="party-action-btn is-secondary" onClick={() => setPicking(null)}>取消</button>
        </div>
      )}

      {tooltip && (
        <BagTooltip anchor={tooltip.anchor}>
          <BagItemTooltipBody item={tooltip.item} templates={templates} />
        </BagTooltip>
      )}
    </div>
  );
}
