import { useState, useRef, useMemo, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { buildBagLayout, moveBagSlot, encodeBagDrag, BAG_DRAG_MIME, type BagSlotMap } from '../models/bagLayout';
import { toQuickSlotEntry, isSameQuickSlotEntry, quickSlotLabel, QUICK_SLOT_COUNT } from '../models/quickSlot';
import { POTION_CONFIG, type PotionType, type SpeedPotionType, getPotionCount, getBagMaxSlots } from '../stores/gameStore';
import type { EquipmentInstance } from '../models/equipment';
import { GameIcon } from './GameIcon';
import { getEquipIcon, resolveItemIcon } from '../models/iconMap';
import { formatMaterialUsage, hasMaterialUsage } from '../systems/craftMaterialUsage';
import { EquipmentDetail } from './EquipmentInfo';
import { getItemWeight, getItemDescription, getItemDefinition } from '../models/items';
import { isCureItem, getCureItem, hasCurableDebuff } from '../models/cureItem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';

const BAG_COLUMNS = 5;

/** 按下到放開的位移在這個範圍內都算「點擊」，超過就是拖曳的起手（px） */
const CLICK_SLOP = 8;

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
  /**
   * 背包一律點兩次才動作：第一次選取、第二次才使用／裝備。
   * 一格一格擠在一起，手滑就喝掉藥水或換掉整套裝備，代價比多點一下高。
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 這次按壓的起點：判斷放開時算不算「點擊」，以及是不是剛選起來的那一下 */
  const pressRef = useRef<{ id: string; x: number; y: number; justSelected: boolean } | null>(null);

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

  // 選取的東西離開背包（用掉、穿上、賣掉、丟棄）後把選取狀態收掉。
  // gridItems 每次 render 都是新陣列，所以這裡每次都會跑，但只有真的失效才寫入狀態。
  useEffect(() => {
    if (selectedId != null && !gridItems.some(i => i.id === selectedId)) {
      setSelectedId(null);
    }
  }, [gridItems, selectedId]);

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

  /** 第二次點擊才執行的實際動作 */
  function activate(item: BagGridItem) {
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

  /**
   * 點在有東西的格子以外的任何地方（空格、標題列、金幣列、面板留白）就取消選取。
   * 事件從格子往上冒泡，所以這裡用 closest 判斷來源，不必在每個子元素上擋。
   *
   * **必須綁 pointerdown 而不是 click**：click 在「按下與放開落在不同元素」時會改派到
   * 共同祖先，快速點擊時游標漂幾 px 落到格子間隙就會變成 `.bag-grid` 的 click，
   * 選取會莫名其妙被清掉。pointerdown 的 target 就是實際按下的位置，不會被改派。
   */
  function handlePanelPointerDown(e: React.PointerEvent) {
    // 只認主鍵：右鍵是快捷鍵選單，不該順手把選取清掉
    if (e.button !== 0) return;
    if (!(e.target as HTMLElement).closest?.('.bag-cell:not(.empty)')) {
      setSelectedId(null);
    }
  }

  /**
   * 選取在 **pointerdown** 就完成 —— 拖曳本身就帶著「按下＝選到這格」的語意。
   *
   * 格子是 `draggable`，快速點擊只要游標動個幾 px 就會觸發 dragstart，
   * 瀏覽器**根本不會發 click**。動作若綁在 click 上就會整個被吃掉，
   * 症狀正是「點了沒反應」。
   */
  function handleCellPointerDown(e: React.PointerEvent, item: BagGridItem) {
    if (e.button !== 0) return;
    const justSelected = selectedId !== item.id;
    if (justSelected) setSelectedId(item.id);
    pressRef.current = { id: item.id, x: e.clientX, y: e.clientY, justSelected };
  }

  /**
   * 執行動作綁 **pointerup**，不綁 click：
   * click 會被 dragstart 吃掉，也會在按下／放開跨元素時改派到共同祖先。
   * 真的拖起來時瀏覽器不發 pointerup（改發 dragend），所以拖曳不會誤觸使用／裝備。
   */
  function handleCellPointerUp(e: React.PointerEvent, item: BagGridItem) {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.id !== item.id) return;
    // 手一定會抖，給 8px 容忍；超過就當成拖曳的起手，不算點擊
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return;
    // 剛在這一下選起來的，放開不算「第二次點擊」
    if (press.justSelected) return;

    // 選的是「格子」不是「一次動作」：選起來就留著，之後每點一下都直接執行。
    // 連喝三瓶藥水＝點四下，而不是選一下用一下地來回切換。
    if (selectedId === item.id) activate(item);
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
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次使用' : '點擊選取'} / 右鍵設為快捷鍵
          </div>
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
            {!curable ? '沒有需要解除的狀態' : selectedId === item.id ? '再點一次使用' : '點擊選取'}
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
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次使用' : '點擊選取'}
          </div>
        </div>
      );
    }

    if (item.equipment) {
      const eq = item.equipment;
      return (
        <div className="bag-tooltip-content">
          <EquipmentDetail item={eq} templates={templates} />
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次裝備' : '點擊選取'}
          </div>
        </div>
      );
    }

    const craftUsage = formatMaterialUsage(item.name);
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">重量: {getItemWeight(item.name) * (item.count ?? 1)}</div>
        {item.count && <div className="tooltip-count">數量: {item.count}</div>}
        {/* 顏色只表達稀有度，用途另外講明，免得玩家把配方材料賣掉 */}
        {craftUsage && <div className="tooltip-craft-usage">⚒ 用途：{craftUsage}</div>}
        {item.type === 'scroll' && item.name.includes('回城卷軸') && (
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次傳送至城鎮' : '點擊選取'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bag-panel" ref={panelRef} onPointerDown={handlePanelPointerDown}>
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
                className={`bag-cell ${item.type}${overClass}${dragIndex === idx ? ' dragging' : ''}${
                  selectedId === item.id ? ' is-selected' : ''
                }`}
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
                onPointerDown={(e) => handleCellPointerDown(e, item)}
                onPointerUp={(e) => handleCellPointerUp(e, item)}
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
                {hasMaterialUsage(item.name) && (
                  <span className="bag-cell-craft" title="有用途的素材" aria-label="有用途的素材">⚒</span>
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
