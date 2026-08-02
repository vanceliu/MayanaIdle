import { useState, useRef, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { buildBagLayout, moveBagSlot, encodeBagDrag, BAG_DRAG_MIME, type BagSlotMap } from '../models/bagLayout';
import { toQuickSlotEntry, isSameQuickSlotEntry, quickSlotLabel, QUICK_SLOT_COUNT } from '../models/quickSlot';
import { POTION_CONFIG, type PotionType, type SpeedPotionType, getPotionCount, getBagMaxSlots } from '../stores/gameStore';
import type { EquipmentInstance } from '../models/equipment';
import { GameIcon } from './GameIcon';
import { getEquipIcon, resolveItemIcon } from '../models/iconMap';
import { EquipmentDetail } from './EquipmentInfo';
import { getItemWeight, getItemDescription, getItemDefinition } from '../models/items';
import { isCureItem, getCureItem, hasCurableDebuff } from '../models/cureItem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';

const BAG_COLUMNS = 5;

interface BagGridItem {
  id: string;
  type: 'potion' | 'material' | 'scroll' | 'equipment' | 'spellbook';
  name: string;
  count?: number;
  potionType?: PotionType;
  speedPotionType?: SpeedPotionType;
  cureItemName?: string;
  equipment?: EquipmentInstance;
}

function getShortName(name: string): string {
  const floorMatch = name.match(/^(.+?)\s*(\d+F)/);
  if (floorMatch) return `${floorMatch[1]}${floorMatch[2]}`;
  if (name.length <= 4) return name;
  return name.slice(0, 4);
}

function getItemIconKey(name: string, type: string): string {
  if (type === 'scroll') return 'scroll';
  if (type === 'spellbook') return 'spellbook';
  if (name.includes('磨刀石')) return 'whetstone';
  if (name.includes('石')) return 'stone';
  return 'material';
}

const TYPE_SORT_ORDER: Record<string, number> = {
  potion: 0,
  scroll: 1,
  material: 2,
  equipment: 3,
};

export function BagPanel() {
  const [sorted, setSorted] = useState(false);
  /** § 35.1.3：手動拖放的位置。只存在於當下 session，不持久化 */
  const [slotMap, setSlotMap] = useState<BagSlotMap>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ item: BagGridItem; x: number; y: number; above: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ item: BagGridItem; x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const character = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const equipItem = useGameStore(s => s.equipItem);
  const usePotionByType = useGameStore(s => s.usePotionByType);
  const useTownScroll = useGameStore(s => s.useTownScroll);
  const useCureItem = useGameStore(s => s.useCureItem);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);
  const quickSlots = useGameStore(s => s.quickSlots);
  const activeEffects = useGameStore(s => s.activeEffects);
  const templates = useEquipmentTemplates();

  const gridItems: BagGridItem[] = [];

  const redCount = getPotionCount(bagItems, 'red');
  const orangeCount = getPotionCount(bagItems, 'orange');
  const whiteCount = getPotionCount(bagItems, 'white');

  if (redCount > 0) {
    gridItems.push({ id: 'potion-red', type: 'potion', name: '紅色藥水', count: redCount, potionType: 'red' });
  }
  if (orangeCount > 0) {
    gridItems.push({ id: 'potion-orange', type: 'potion', name: '橙色藥水', count: orangeCount, potionType: 'orange' });
  }
  if (whiteCount > 0) {
    gridItems.push({ id: 'potion-white', type: 'potion', name: '白色藥水', count: whiteCount, potionType: 'white' });
  }

  for (const item of bagItems) {
    if (item.type === 'potion' && !['紅色藥水', '橙色藥水', '白色藥水'].includes(item.name)) {
      const spt: SpeedPotionType | undefined = item.name === '綠色藥水' ? 'green' : item.name === '強化綠色藥水' ? 'enhanced-green' : undefined;
      const cure = isCureItem(item.name) ? item.name : undefined;
      gridItems.push({
        id: `bag-${item.name}`,
        type: 'potion',
        name: item.name,
        count: item.amount,
        speedPotionType: spt,
        cureItemName: cure,
      });
    }
  }

  for (const item of bagItems) {
    if (item.type === 'potion') continue;
    gridItems.push({ id: `bag-${item.name}`, type: item.type, name: item.name, count: item.amount });
  }

  for (const item of inventory) {
    gridItems.push({ id: `equip-${item.id}`, type: 'equipment', name: item.name, equipment: item });
  }

  const usedSlots = gridItems.length;
  // § 35.1：背包格數 = 基礎 50 + 腰帶的 bonusBagSlots
  const maxSlots = getBagMaxSlots(equippedGear);

  const displayItems = useMemo(() => {
    if (!sorted) return gridItems;
    return [...gridItems].sort((a, b) => {
      const orderA = TYPE_SORT_ORDER[a.type] ?? 99;
      const orderB = TYPE_SORT_ORDER[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [gridItems, sorted]);

  // 手動位置優先，其餘依預設順序流入剩餘空格
  const layout = buildBagLayout(displayItems, slotMap, maxSlots);

  function handleDrop(toIndex: number) {
    if (dragIndex == null) return;
    setSlotMap(prev => moveBagSlot(layout, prev, dragIndex, toIndex));
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleSortToggle() {
    // 「整理」同時清掉手動擺放，回到排序後的預設排列
    setSorted(!sorted);
    setSlotMap({});
  }

  function handleMouseEnter(e: React.MouseEvent, item: BagGridItem) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipWidth = 220;
    let x = rect.left;
    if (x + tooltipWidth > window.innerWidth) {
      x = rect.right - tooltipWidth;
    }
    if (x < 0) x = 4;

    const y = rect.bottom + 8;
    setTooltip({ item, x, y, above: false });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  function handleContextMenu(e: React.MouseEvent, item: BagGridItem) {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  }

  function handleAssignSlot(slotIdx: number) {
    if (!contextMenu) return;
    const item = contextMenu.item;
    const entry = toQuickSlotEntry(
      item.equipment ? 'equipment' : 'bag',
      item.name,
      item.equipment?.id,
    );
    if (!entry) return;
    assignQuickSlot(slotIdx, entry);
    setContextMenu(null);
  }

  function handleDiscard() {
    if (!contextMenu) return;
    const item = contextMenu.item;
    if (item.equipment) {
      useGameStore.getState().discardInventoryItem(item.equipment.id!);
    } else {
      useGameStore.getState().discardBagItem(item.name);
    }
    setContextMenu(null);
  }

  function handleClick(item: BagGridItem) {
    if (item.potionType) {
      usePotionByType(item.potionType);
    } else if (item.cureItemName) {
      useCureItem(item.cureItemName);
    } else if (item.speedPotionType) {
      useGameStore.getState().useSpeedPotion(item.speedPotionType);
    } else if (item.equipment) {
      equipItem(item.equipment);
    } else if (item.type === 'scroll' && item.name.includes('回城卷軸')) {
      useTownScroll(item.name);
    }
  }

  function renderTooltipContent(item: BagGridItem) {
    if (item.potionType) {
      const config = POTION_CONFIG[item.potionType];
      const unitWeight = getItemWeight(item.name);
      const totalWeight = unitWeight * (item.count ?? 1);
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">{item.name}</div>
          <div className="tooltip-stat">回復 {config.healMin}~{config.healMax} HP</div>
          <div className="tooltip-stat">冷卻 {config.cooldown}ms</div>
          <div className="tooltip-stat">重量: {totalWeight}</div>
          <div className="tooltip-count">數量: {item.count}</div>
          <div className="tooltip-hint">點擊使用 / 右鍵設為快捷鍵</div>
        </div>
      );
    }

    if (item.cureItemName) {
      const def = getCureItem(item.cureItemName);
      const unitWeight = getItemWeight(item.name);
      const totalWeight = unitWeight * (item.count ?? 1);
      const curable = def ? hasCurableDebuff(def, activeEffects) : false;
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">{item.name}</div>
          <div className="tooltip-stat">{def?.description ?? getItemDescription(item.name)}</div>
          <div className="tooltip-stat">重量: {totalWeight}</div>
          <div className="tooltip-count">數量: {item.count}</div>
          <div className="tooltip-hint">
            {curable ? '點擊使用' : '沒有需要解除的狀態'}
          </div>
        </div>
      );
    }

    if (item.speedPotionType) {
      const unitWeight = getItemWeight(item.name);
      const totalWeight = unitWeight * (item.count ?? 1);
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">{item.name}</div>
          <div className="tooltip-stat">{getItemDescription(item.name)}</div>
          <div className="tooltip-stat">重量: {totalWeight}</div>
          <div className="tooltip-count">數量: {item.count}</div>
          <div className="tooltip-hint">點擊使用</div>
        </div>
      );
    }

    if (item.equipment) {
      const eq = item.equipment;
      return (
        <div className="bag-tooltip-content">
          <EquipmentDetail item={eq} templates={templates} />
          <div className="tooltip-hint">點擊裝備</div>
        </div>
      );
    }

    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">重量: {getItemWeight(item.name) * (item.count ?? 1)}</div>
        {item.count && <div className="tooltip-count">數量: {item.count}</div>}
        {item.type === 'scroll' && item.name.includes('回城卷軸') && (
          <div className="tooltip-hint">點擊使用傳送至城鎮</div>
        )}
      </div>
    );
  }

  return (
    <div className="bag-panel" ref={panelRef}>
      <div className="bag-panel-header">
        <span className="bag-panel-title">背包</span>
        <span className="bag-panel-meta">
          <button
            className={`bag-sort-toggle ${sorted ? 'active' : ''}`}
            onClick={handleSortToggle}
          >
            整理
          </button>
          <span className={`bag-slots-count${usedSlots >= maxSlots ? ' danger' : usedSlots >= maxSlots * 0.9 ? ' warning' : ''}`}>
            {usedSlots}/{maxSlots}
          </span>
        </span>
      </div>
      <div className="bag-gold-row">
        <span className="bag-gold-label">金幣</span>
        <span className="bag-gold-value">{character?.gold ?? 0}</span>
      </div>
      <div className="bag-grid-container">
        <div className="bag-grid" style={{ gridTemplateColumns: `repeat(${BAG_COLUMNS}, 1fr)` }}>
          {layout.map((item, idx) => {
            const dropProps = {
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverIndex(idx); },
              onDragLeave: () => setDragOverIndex(prev => (prev === idx ? null : prev)),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(idx); },
            };
            const overClass = dragOverIndex === idx ? ' drag-over' : '';
            if (!item) {
              return <div key={`empty-${idx}`} className={`bag-cell empty${overClass}`} {...dropProps} />;
            }
            return (
              <div
                key={item.id}
                className={`bag-cell ${item.type}${overClass}${dragIndex === idx ? ' dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(idx);
                  setTooltip(null);
                  // § 35.5.3：帶著描述出去，讓地圖可以判定為「丟棄」
                  e.dataTransfer.setData(BAG_DRAG_MIME, encodeBagDrag(
                    item.equipment
                      ? { kind: 'equipment', name: item.name, amount: 1, equipmentId: item.equipment.id }
                      : { kind: 'bag', name: item.name, amount: item.count ?? 1 },
                  ));
                  // 必須是 copyMove：快捷鍵綁定是 copy（物品留在背包）、丟到地圖是 move。
                  // 若只給 'move'，快捷鍵的 dropEffect='copy' 會不相容，瀏覽器會直接取消放置。
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                {...dropProps}
                onMouseEnter={(e) => handleMouseEnter(e, item)}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onClick={() => handleClick(item)}
              >
                {item.type === 'equipment' ? (
                  <GameIcon
                    name={getEquipIcon(item.equipment?.type === 'armor' ? (item.equipment?.slot || 'chest') : (item.equipment?.type || 'sword'))}
                    size={24}
                    color={item.equipment ? getEquipmentInstanceTierColor(item.equipment, templates) : undefined}
                  />
                ) : (
                  (() => {
                    // 顯示方式一律以 item 定義為準（icon / iconColor / iconType / iconTier）
                    const { icon, color } = resolveItemIcon(
                      getItemDefinition(item.name),
                      getItemIconKey(item.name, item.type),
                    );
                    return <GameIcon name={icon} size={24} color={color} />;
                  })()
                )}
                <span className="bag-cell-name">{getShortName(item.name)}</span>
                {item.count != null && item.count > 1 && (
                  <span className="bag-cell-count">×{item.count}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {tooltip && (
        <div
          className={`bag-tooltip ${tooltip.above ? 'above' : 'below'}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {renderTooltipContent(tooltip.item)}
        </div>
      )}

      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} />
          <div
            className="bag-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {toQuickSlotEntry(
              contextMenu.item.equipment ? 'equipment' : 'bag',
              contextMenu.item.name,
              contextMenu.item.equipment?.id,
            ) && (
              <>
                <div className="context-menu-title">設為快捷鍵</div>
                {Array.from({ length: QUICK_SLOT_COUNT }, (_, idx) => idx).map(idx => (
                  <button
                    key={idx}
                    className="context-menu-item"
                    onClick={() => handleAssignSlot(idx)}
                  >
                    快捷鍵 {quickSlotLabel(idx)}
                    {isSameQuickSlotEntry(
                      quickSlots[idx],
                      toQuickSlotEntry(
                        contextMenu.item.equipment ? 'equipment' : 'bag',
                        contextMenu.item.name,
                        contextMenu.item.equipment?.id,
                      ),
                    ) && <span className="context-menu-active">●</span>}
                  </button>
                ))}
                <div className="context-menu-divider" />
              </>
            )}
            <button className="context-menu-item context-menu-danger" onClick={handleDiscard}>
              丟棄{contextMenu.item.count && contextMenu.item.count > 1 ? ' ×1' : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
