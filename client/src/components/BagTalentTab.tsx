import { useState } from 'react';
import { useTalentStore, availableAffixes, availableSlots } from '../stores/talentStore';
import { TALENT_TYPES, TALENT_TYPE_LABELS, type TalentType } from '../models/talent';
import { getTalentAffixDef } from '../db/seed/talentSeeds';
import {
  buildTalentBagCells,
  applyTalentBagOrder,
  type TalentBagCell,
  type TalentBagOrder,
} from '../models/talentBag';
import { getTalentAffixIcon, TALENT_SLOT_ICON, MATERIAL_TIER_COLORS } from '../models/iconMap';
import { GameIcon } from './GameIcon';
import { BagGrid, getShortName, padToRows } from './BagGrid';
import { affixLabel } from './TalentEditor';
import { useDragStore, hitTestDropTarget } from '../stores/dragStore';
import { useGameStore } from '../stores/gameStore';

/**
 * 背包的「天賦」分頁（`35-inventory-constraints.md` § 35.21）。
 * 收未安裝的天賦格與未鑲入的鑲材：不佔格、不計重、不可存倉庫。
 * 格子與一般分頁共用同一套（§ 35.21.3）。
 */

/** 詳情框寬度，與 `BagPanel` 同值；靠右的格子依此往左收 */
const TOOLTIP_WIDTH = 220;

type Cell = TalentBagCell;

export function BagTalentTab({ rows, order }: { rows: number; order: TalentBagOrder }) {
  const slots = useTalentStore(s => s.slots);
  const affixes = useTalentStore(s => s.affixes);
  const equipAffix = useTalentStore(s => s.equipAffix);
  const installSlot = useTalentStore(s => s.installSlot);
  const activeTemplateId = useGameStore(s => s.activeTemplateId);
  const beginDrag = useDragStore(s => s.begin);
  const moveDrag = useDragStore(s => s.move);
  const endDrag = useDragStore(s => s.drop);
  const [kind, setKind] = useState<'all' | 'condition' | 'action'>('all');
  const [type, setType] = useState<TalentType | 'all'>('all');
  const [tooltip, setTooltip] = useState<{ cell: Cell; x: number; y: number } | null>(null);
  /* 顯示這份天賦配置沒用到的，含別份配置佔著的（§ 51.3.2） */
  const spareSlots = availableSlots(slots, activeTemplateId);
  const loose = availableAffixes(affixes, slots, activeTemplateId).filter(a => {
    const def = getTalentAffixDef(a.definitionId);
    if (!def) return false;
    if (kind !== 'all' && def.kind !== kind) return false;
    if (type !== 'all' && !def.appliesTo.includes(type)) return false;
    return true;
  });

  // 整理寫下的位置優先，沒有位置的排在後面維持取得順序（`models/talentBag.ts`）
  const cells = applyTalentBagOrder(buildTalentBagCells(spareSlots, loose), order);

  /** 拖鑲材到天賦格（§ 51.10）。走 `dragStore` 指標拖放，不用 HTML5 drag */
  function showTooltipFor(el: HTMLElement, cell: Cell) {
    const rect = el.getBoundingClientRect();
    let x = rect.left;
    if (x + TOOLTIP_WIDTH > window.innerWidth) x = rect.right - TOOLTIP_WIDTH;
    if (x < 0) x = 4;
    setTooltip({ cell, x, y: rect.bottom + 8 });
  }

  function startDrag(e: React.PointerEvent, affixId: number, label: string) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag({ fromIndex: -1, payload: { kind: 'talent-affix', affixId, name: label }, label },
      e.clientX, e.clientY);
  }

  function startSlotDrag(e: React.PointerEvent, slotId: number) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag({ fromIndex: -1, payload: { kind: 'talent-slot-item', slotId, name: '天賦格' }, label: '天賦格' },
      e.clientX, e.clientY);
  }

  async function finishDrag(e: React.PointerEvent) {
    setTooltip(null);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const item = useDragStore.getState().item;
    const target = hitTestDropTarget(e.clientX, e.clientY);
    endDrag();
    if (!item || !target) return;

    // 鑲材 → 天賦格的槽位
    if (item.payload.kind === 'talent-affix' && target.kind === 'talent-slot') {
      await equipAffix(item.payload.affixId, target.index, target.sub);
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
    if (cell.kind === 'slot') {
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">天賦格</div>
          <div className="tooltip-stat">階級: T{cell.tier}</div>
          <div className="tooltip-stat">條件槽 {cell.tier} ＋ 實作槽 1</div>
          <div className="tooltip-count">數量: {cell.count}</div>
          <div className="tooltip-hint">拖到天賦面板即可安裝</div>
        </div>
      );
    }
    const a = affixes.find(x => x.id === cell.id);
    const def = a && getTalentAffixDef(a.definitionId);
    if (!a || !def) return null;
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{affixLabel(a)}</div>
        <div className="tooltip-stat">階級: T{def.tier}</div>
        <div className="tooltip-stat">種類: {def.kind === 'condition' ? '條件' : '實作'}</div>
        <div className="tooltip-stat">
          適用: {def.appliesTo.map(t => TALENT_TYPE_LABELS[t]).join('／')}
        </div>
        <div className="tooltip-hint">拖到天賦格即可鑲入</div>
      </div>
    );
  }

  return (
    <div className="bag-talent" data-testid="bag-talent-tab">
      <div className="bag-talent-filters">
        {/* § 35.21.1：依類型／種類／tier／是否已鑲入篩選 */}
        <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="種類">
          <option value="all">全部種類</option>
          <option value="condition">條件</option>
          <option value="action">實作</option>
        </select>
        <select value={type} onChange={e => setType(e.target.value as typeof type)} aria-label="類型">
          <option value="all">全部類型</option>
          {TALENT_TYPES.map(t => (
            <option key={t} value={t}>{TALENT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <span className="bag-talent-count">{cells.length} 項</span>
      </div>

      <div className="bag-grid-container">
        <BagGrid>
          {padToRows(cells, rows).map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} className="bag-cell empty" />;

            if (cell.kind === 'slot') {
              return (
                <div
                  key={`slot-${cell.tier}`}
                  className="bag-cell is-talent-slot"
                  onMouseEnter={e => showTooltipFor(e.currentTarget, cell)}
                  onMouseLeave={() => setTooltip(null)}
                  onPointerDown={e => {
                    // 觸控沒有 hover，按下就把詳情叫出來（`47-mobile.md`）
                    if (e.pointerType === 'touch') showTooltipFor(e.currentTarget, cell);
                    startSlotDrag(e, spareSlots.find(s => s.tier === cell.tier)!.id!);
                  }}
                  onPointerMove={e => moveDrag(e.clientX, e.clientY)}
                  onPointerUp={finishDrag}
                  onPointerCancel={() => endDrag()}
                  onLostPointerCapture={() => endDrag()}
                >
                  {/* tier 走素材那套色階，與背包裡的素材同一種語言 */}
                  <GameIcon name={TALENT_SLOT_ICON} size={24} color={MATERIAL_TIER_COLORS[cell.tier]} />
                  <span className="bag-cell-name">天賦格</span>
                  <span className="bag-cell-tier">T{cell.tier}</span>
                  <span className="bag-cell-count">×{cell.count}</span>
                </div>
              );
            }

            const a = affixes.find(x => x.id === cell.id)!;
            const def = getTalentAffixDef(a.definitionId)!;
            const label = affixLabel(a);
            return (
              <div
                key={`affix-${a.id}`}
                className={`bag-cell is-talent-affix is-${def.kind}`}
                onMouseEnter={e => showTooltipFor(e.currentTarget, cell)}
                onMouseLeave={() => setTooltip(null)}
                onPointerDown={e => {
                  if (e.pointerType === 'touch') showTooltipFor(e.currentTarget, cell);
                  startDrag(e, a.id!, label);
                }}
                onPointerMove={e => moveDrag(e.clientX, e.clientY)}
                onPointerUp={finishDrag}
                onPointerCancel={() => endDrag()}
                onLostPointerCapture={() => endDrag()}
              >
                <GameIcon
                  name={getTalentAffixIcon(def.ruleId, def.kind)}
                  size={24}
                  color={MATERIAL_TIER_COLORS[def.tier]}
                />
                {/* 名稱走 `getShortName`，完整名稱在 tooltip —— 與一般分頁同一套 */}
                <span className="bag-cell-name">{getShortName(label)}</span>
                <span className="bag-cell-tier">T{def.tier}</span>
              </div>
            );
          })}
        </BagGrid>
      </div>

      {tooltip && (
        <div className="bag-tooltip below" style={{ left: tooltip.x, top: tooltip.y }}>
          {renderTooltipContent(tooltip.cell)}
        </div>
      )}
    </div>
  );
}
