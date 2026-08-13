import { useState } from 'react';
import { useTalentStore, availableSlots } from '../stores/talentStore';
import { BagTooltip, anchorOf, type AnchorRect } from './BagTooltip';
import type { TalentSlotTier, TalentType } from '../models/talent';
import {
  buildTalentBagCells,
  buildTalentBagLayout,
  type TalentBagCell,
  type TalentBagOrder,
} from '../models/talentBag';
import { moveBagSlot } from '../models/bagLayout';
import { TALENT_SLOT_ICON, MATERIAL_TIER_COLORS } from '../models/iconMap';
import { GameIcon } from './GameIcon';
import { BagGrid, BAG_COLUMNS } from './BagGrid';
import { useDragStore, hitTestDropTarget } from '../stores/dragStore';
import { usePressDrag } from '../hooks/usePressDrag';
import { useGameStore } from '../stores/gameStore';

/**
 * 背包的「天賦」分頁（`35-inventory-constraints.md` § 35.21）。
 *
 * **只收未安裝的天賦格**：不佔格、不計重、不可存倉庫。
 * 條件與動作一律內建、不是物品，不在這裡（`51-auto-talent.md` § 51.5）。
 * 格子與一般分頁共用同一套（§ 35.21.3）。
 */

type Cell = TalentBagCell;

export function BagTalentTab({ rows, order, onReorder }: {
  rows: number;
  order: TalentBagOrder;
  onReorder: (next: TalentBagOrder) => void;
}) {
  const slots = useTalentStore(s => s.slots);
  const installSlot = useTalentStore(s => s.installSlot);
  const activeTemplateId = useGameStore(s => s.activeTemplateId);
  const endDrag = useDragStore(s => s.drop);
  const dragItem = useDragStore(s => s.item);
  const dragOver = useDragStore(s => s.over);
  const [tier, setTier] = useState<TalentSlotTier | 'all'>('all');
  const [tooltip, setTooltip] = useState<{ cell: Cell; anchor: AnchorRect } | null>(null);
  // 與一般分頁共用同一支：按下先記著，超過容忍距離才轉拖曳，觸控不拖
  const pressDrag = usePressDrag(() => setTooltip(null));
  /* 顯示這份天賦配置沒用到的，含別份配置佔著的（§ 51.3.2） */
  const spareSlots = availableSlots(slots, activeTemplateId);
  const cells = buildTalentBagCells(spareSlots).filter(c => tier === 'all' || c.tier === tier);

  // 手動擺過的照位置放，其餘依取得順序流進剩下的空格（與一般分頁同一套）
  const layout = buildTalentBagLayout(cells, order, rows * BAG_COLUMNS, BAG_COLUMNS);
  const cellCount = layout.filter(Boolean).length;

  function showTooltipFor(el: HTMLElement, cell: Cell) {
    // 落點與邊界翻轉都在 `BagTooltip` 裡算（§ 35.6.4），這裡只給錨點
    setTooltip({ cell, anchor: anchorOf(el) });
  }

  async function finishDrag(e: React.PointerEvent) {
    const { wasClick } = pressDrag.onPointerUp(e);
    if (wasClick) return;
    setTooltip(null);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const item = useDragStore.getState().item;
    const target = hitTestDropTarget(e.clientX, e.clientY);
    endDrag();
    if (!item || !target) return;

    // 分頁內自由擺放（§ 35.21.1）：與一般分頁同一套，目標有東西就互換
    if (target.kind === 'talent-cell') {
      onReorder(moveBagSlot(layout, order, item.fromIndex, target.index));
      return;
    }
    /* 天賦格 → 編輯區＝安裝。落在 `talent-row` 也算 */
    if (item.payload.kind === 'talent-slot-item'
      && (target.kind === 'talent-install' || target.kind === 'talent-row')) {
      const editor = document.querySelector<HTMLElement>('[data-talent-type]');
      const type = editor?.dataset.talentType as TalentType | undefined;
      if (type) await installSlot(item.payload.slotId, type, activeTemplateId);
    }
  }

  /** 詳情走 `.bag-tooltip`，與一般分頁同一組 class */
  function renderTooltipContent(cell: Cell) {
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">天賦格</div>
        <div className="tooltip-stat">階級: T{cell.tier}</div>
        <div className="tooltip-stat">條件槽 {cell.tier} ＋ 動作槽 1</div>
        <div className="tooltip-count">數量: {cell.count}</div>
        <div className="tooltip-hint">拖到天賦面板即可安裝</div>
      </div>
    );
  }

  return (
    <div className="bag-talent" data-testid="bag-talent-tab">
      <div className="bag-talent-filters">
        {/* § 35.21.1：依 tier 篩選 */}
        <select
          value={String(tier)}
          onChange={e => setTier(e.target.value === 'all' ? 'all' : Number(e.target.value) as TalentSlotTier)}
          aria-label="階級"
        >
          <option value="all">全部階級</option>
          {([1, 2, 3, 4] as const).map(t => (
            <option key={t} value={t}>T{t}</option>
          ))}
        </select>
        <span className="bag-talent-count">{cellCount} 項</span>
      </div>

      <div className="bag-grid-container">
        <BagGrid>
          {layout.map((entry, idx) => {
            /* 落點用 `elementFromPoint` 命中這兩個屬性，不靠事件冒泡（拖曳期間指標被 capture 住） */
            const dropProps = { 'data-drop-kind': 'talent-cell', 'data-drop-index': idx } as const;
            const over = dragOver?.kind === 'talent-cell' && dragOver.index === idx ? ' drag-over' : '';
            if (!entry) {
              return <div key={`empty-${idx}`} className={`bag-cell empty${over}`} {...dropProps} />;
            }
            const cell = entry.cell;

            return (
              <div
                key={entry.id}
                {...dropProps}
                className={`bag-cell is-talent-slot${over}${
                  dragItem?.payload.kind === 'talent-slot-item'
                    && dragItem.payload.slotId === spareSlots.find(s => s.tier === cell.tier)?.id
                    ? ' dragging' : ''
                }`}
                onMouseEnter={e => showTooltipFor(e.currentTarget, cell)}
                onMouseLeave={() => setTooltip(null)}
                onPointerDown={e => {
                  // 觸控沒有 hover，按下就把詳情叫出來（`47-mobile.md`）
                  if (e.pointerType === 'touch') showTooltipFor(e.currentTarget, cell);
                  pressDrag.onPointerDown(e);
                }}
                onPointerMove={e => pressDrag.onPointerMove(e, () => {
                  const slotId = spareSlots.find(s => s.tier === cell.tier)?.id;
                  if (slotId == null) return null;
                  return {
                    fromIndex: idx,
                    payload: { kind: 'talent-slot-item', slotId, name: '天賦格' },
                    label: '天賦格',
                  };
                })}
                onPointerUp={finishDrag}
                onPointerCancel={() => { pressDrag.onPointerCancel(); endDrag(); }}
                onLostPointerCapture={() => endDrag()}
              >
                {/* tier 走素材那套色階，與背包裡的素材同一種語言 */}
                <GameIcon name={TALENT_SLOT_ICON} size={24} color={MATERIAL_TIER_COLORS[cell.tier]} />
                <span className="bag-cell-name">天賦格</span>
                <span className="bag-cell-tier">T{cell.tier}</span>
                <span className="bag-cell-count">×{cell.count}</span>
              </div>
            );
          })}
        </BagGrid>
      </div>

      {tooltip && (
        <BagTooltip anchor={tooltip.anchor}>
          {renderTooltipContent(tooltip.cell)}
        </BagTooltip>
      )}
    </div>
  );
}
