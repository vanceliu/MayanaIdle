/**
 * 交易雙方放入的內容，用背包的格子呈現（`97-selfhosted-server.md` § 97.7.4）。
 *
 * 跟背包共用格線、格子長相與 tooltip：交易裡看不到詞綴與數值的話，
 * 玩家等於閉著眼睛按確認 —— 一把劍值不值得換，看的就是那些數字。
 *
 * 固定 `TRADE_MAX_SLOTS` 格、空格照樣畫出來：一眼看得出對方還能再放幾樣，
 * 也不必捲動（上限就是一頁的量）。
 *
 * 自己那一側在編輯中還是放置目標與取出來源：從背包拖進來＝放入，
 * 拖回背包或點一下＝取出。
 */
import { useState } from 'react';
import { BagGrid, padToRows } from './BagGrid';
import { BagCellVisual, BagItemTooltipBody, type BagGridItem } from './BagCell';
import { BagTooltip, anchorOf, type AnchorRect } from './BagTooltip';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { usePressDrag } from '../hooks/usePressDrag';
import { useDragStore, useIsDragOver } from '../stores/dragStore';
import { getItemById } from '../models/items';
import { TRADE_MAX_SLOTS } from '../systems/trade';
import type { TradeSideView } from '../stores/tradeStore';
import type { EquipmentInstance } from '../models/equipment';

/** 交易格一列放 5 格，兩列剛好是上限 10 */
const TRADE_ROWS = TRADE_MAX_SLOTS / 5;

function equipmentCell(e: EquipmentInstance): BagGridItem {
  return {
    id: `eq-${e.id}`,
    type: 'equipment',
    name: e.enhancement ? `${e.name} +${e.enhancement}` : e.name,
    equipment: e,
  };
}

function itemCell(itemId: number, amount: number): BagGridItem {
  const def = getItemById(itemId);
  return {
    id: `item-${itemId}`,
    type: (def?.category as BagGridItem['type']) ?? 'material',
    name: def?.name ?? `#${itemId}`,
    itemId,
    count: amount,
  };
}

export function tradeCells(side: TradeSideView): BagGridItem[] {
  return [
    ...side.equipment.map(equipmentCell),
    ...side.items.map(l => itemCell(l.itemId, l.amount)),
  ];
}

export interface TradeGridProps {
  side: TradeSideView;
  title: string;
  /** 自己那一側且還在編輯中：可以把東西拿回來，也可以接受放入 */
  onTake?: (cell: BagGridItem) => void;
}

export function TradeGrid({ side, title, onTake }: TradeGridProps) {
  const templates = useEquipmentTemplates();
  const [tooltip, setTooltip] = useState<{ item: BagGridItem; anchor: AnchorRect } | null>(null);
  const drag = usePressDrag(() => setTooltip(null));
  const editable = !!onTake;
  const over = useIsDragOver('trade-offer', -1);
  const cells = tradeCells(side);

  return (
    <div
      className={`trade-side${side.locked ? ' is-locked' : ''}${editable && over ? ' is-drop-target' : ''}`}
      {...(editable ? { 'data-drop-kind': 'trade-offer', 'data-drop-index': -1 } : {})}
    >
      <div className="trade-side-title">
        <span>{title}</span>
        <span className="trade-side-state">
          {side.confirmed ? '已確認' : side.locked ? '已鎖定' : '編輯中'}
        </span>
      </div>

      <BagGrid>
        {padToRows(cells, TRADE_ROWS).map((item, i) => (
          <div
            key={item?.id ?? `empty-${i}`}
            className={`bag-cell${item ? '' : ' empty'}`}
            onPointerEnter={e => item && setTooltip({ item, anchor: anchorOf(e.currentTarget) })}
            onPointerLeave={() => setTooltip(null)}
            onPointerDown={e => item && editable && drag.onPointerDown(e)}
            onPointerMove={e => item && editable && drag.onPointerMove(e, () => ({
              fromIndex: -1,
              label: item.name,
              payload: item.equipment
                ? { kind: 'equipment', name: item.name, amount: 1, equipmentId: item.equipment.id }
                : { kind: 'bag', name: item.name, amount: item.count ?? 1, itemId: item.itemId },
            }))}
            onPointerUp={e => {
              if (!item || !editable) return;
              // 放開的位置不一定發過 move，落點要先對一次才問 dragStore（同 `BagPanel`）
              const dragging = useDragStore.getState().item != null;
              if (dragging) useDragStore.getState().move(e.clientX, e.clientY);
              const { wasClick } = drag.onPointerUp(e);
              if (dragging) {
                (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                if (useDragStore.getState().drop()?.kind === 'trade-source') onTake!(item);
                return;
              }
              if (wasClick) onTake!(item);
            }}
            onPointerCancel={drag.onPointerCancel}
          >
            {item && <BagCellVisual item={item} templates={templates} />}
          </div>
        ))}
      </BagGrid>

      <div className="trade-side-gold">{side.gold > 0 ? `${side.gold.toLocaleString()}G` : '不含金幣'}</div>

      {tooltip && (
        <BagTooltip anchor={tooltip.anchor}>
          {/* 交易只看數值，沒有「再點一次使用」那類操作提示 */}
          <BagItemTooltipBody item={tooltip.item} templates={templates} />
        </BagTooltip>
      )}
    </div>
  );
}
