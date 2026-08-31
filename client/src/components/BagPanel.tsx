import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { buildBagLayout, moveBagSlot, sortBagLayout, type BagDragPayload, type BagSlotMap } from '../models/bagLayout';
import {
  buildTalentBagCells,
  sortTalentBag,
  loadTalentBagOrder,
  saveTalentBagOrder,
} from '../models/talentBag';
import { useTalentStore, availableSlots } from '../stores/talentStore';
import { BagTooltip, anchorOf, type AnchorRect } from './BagTooltip';
import { useDragStore, type DragItem, type DropTarget } from '../stores/dragStore';
import { useLongPress } from '../hooks/useLongPress';
import { toQuickSlotEntry, isSameQuickSlotEntry, quickSlotLabel, QUICK_SLOT_COUNT } from '../models/quickSlot';
import { POTION_CONFIG, SPEED_POTION_CONFIG, getPotionName, type PotionType, type SpeedPotionType, getPotionCount, getBagMaxSlots } from '../stores/gameStore';
import { SLOT_NAMES, SLOT_ORDER, type EquipmentInstance, type EquipSlot } from '../models/equipment';
import { GameIcon } from './GameIcon';
import { getEquipIcon, resolveItemIcon } from '../models/iconMap';
import { formatMaterialUsage, hasMaterialUsage } from '../systems/craftMaterialUsage';
import { EquipmentDetail } from './EquipmentInfo';
import { getItemById } from '../models/items';
import { isCureItem, getCureItem, hasCurableDebuff } from '../models/cureItem';
import { getTownScrollByItemId } from '../models/townScroll';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
import { roundWeight } from '../systems/weight';
import { isSigilItemId } from '../models/sigil';
import { BagTalentTab } from './BagTalentTab';
import { BagGrid, getShortName, rowsForSlots } from './BagGrid';
import { CLICK_SLOP } from '../hooks/usePressDrag';
import {
  getEnhanceScroll, canScrollTarget, applyEnhanceScroll, isEnhanceable,
  type EnhanceScroll,
} from '../systems/enhanceScroll';
import { EnhanceRateWindow } from './EnhanceRateWindow';
import { useOneShotFx } from './town/useOneShotFx';

interface BagGridItem {
  id: string;
  type: 'potion' | 'material' | 'scroll' | 'equipment' | 'spellbook';
  /** 顯示用名稱。背包物品一律由 `itemId` 反查，不從狀態帶舊名 */
  name: string;
  /** 背包物品的道具 id（裝備格沒有） */
  itemId?: number;
  count?: number;
  potionType?: PotionType;
  speedPotionType?: SpeedPotionType;
  cureItemId?: number;
  equipment?: EquipmentInstance;
  /**
   * 這件裝備正穿在哪個部位（§ 35.1）。
   * 有值＝「裝備中」：一樣佔背包格，第二次點擊是卸下而不是穿上，且不可丟棄。
   */
  equippedSlot?: EquipSlot;
}

/**
 * 指定目標模式。`scroll` 是「點卷軸 → 點裝備」的強化，`rate` 是機率查詢。
 * 兩者的選取與取消完全相同，只差最後對目標做什麼。
 */
type TargetingMode =
  | { kind: 'scroll'; scroll: EnhanceScroll; label: string }
  | { kind: 'rate' };

function scrollTargetLabel(scroll: EnhanceScroll): string {
  const category = scroll.category === 'weapon' ? '武器' : '防具';
  return scroll.variant === 'minus' ? `要降級的${category}` : `要強化的${category}`;
}

/**
 * 強化演出（`48-vfx.md` § 48.4）。背包格 `overflow: hidden` 會切掉光環與碎片，
 * 所以演出不畫在格子裡，而是照格子當下的位置疊一層 fixed 覆蓋層。
 * 失敗時裝備已從背包移除，覆蓋層自己畫一份 `ghost` 把碎裂演完。
 */
interface BagEnhanceFx {
  kind: 'safe' | 'success' | 'fail';
  rect: { left: number; top: number; width: number; height: number };
  label?: string;
  ghost?: EquipmentInstance;
}

const SHARD_INDEXES = [1, 2, 3, 4, 5, 6];

function getItemIconKey(name: string, type: string): string {
  if (type === 'scroll') return 'scroll';
  if (type === 'spellbook') return 'spellbook';
  if (name.includes('磨刀石')) return 'whetstone';
  if (name.includes('石')) return 'stone';
  return 'material';
}

function isTownScroll(itemId: number): boolean {
  return getTownScrollByItemId(itemId) != null;
}

/** 背包格對應的道具定義。一律以 id 反查 seed（§ 99.1），不用名稱 */
function itemDef(item: { itemId?: number }) {
  return item.itemId != null ? getItemById(item.itemId) : undefined;
}

function itemWeight(item: { itemId?: number }): number {
  return itemDef(item)?.weight ?? 0;
}

/** 堆疊總重。小數重量乘上數量會留浮點尾數並直接印在 tooltip 上，一律先收過 */
function totalItemWeight(item: { itemId?: number; count?: number }): number {
  return roundWeight(itemWeight(item) * (item.count ?? 1));
}

export function BagPanel() {
  /** § 35.20：印記抽屜的開合。不持久化，重開回到收合 */
  const [sigilOpen, setSigilOpen] = useState(false);
  /** § 35.21 背包分頁。不持久化：切分頁是當下的動作，不是設定 */
  const [bagTab, setBagTab] = useState<'normal' | 'talent'>('normal');
  const charId = useGameStore(s => s.character?.id ?? 0);
  /** 天賦分頁的順序。整理一次性落位、位置持久化（§ 35.21.1） */
  const [talentOrderState, setTalentOrder] = useState(
    () => ({ charId, order: loadTalentBagOrder(charId) }));
  // 換角色時重讀，不可沿用上一隻的順序
  const talentOrder = talentOrderState.charId === charId
    ? talentOrderState.order
    : loadTalentBagOrder(charId);
  const talentSlots = useTalentStore(s => s.slots);
  const activeTemplateId = useGameStore(s => s.activeTemplateId);

  /** 天賦分頁的整理。把當下的排序結果整批寫成位置 */
  function handleTalentSort() {
    const cells = buildTalentBagCells(availableSlots(talentSlots, activeTemplateId));
    const next = sortTalentBag(cells);
    setTalentOrder({ charId, order: next });
    saveTalentBagOrder(charId, next);
  }
  const [tooltip, setTooltip] = useState<{ item: BagGridItem; anchor: AnchorRect } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ item: BagGridItem; x: number; y: number } | null>(null);
  /**
   * 「移動」模式選中的格子（`47-mobile.md`）。
   *
   * 觸控裝置**不做拖曳** —— 長按已經被次要選單佔走，再把拖曳疊上去只會互相誤觸，
   * 而背包格擠在一起、手指又比游標粗，拖錯格的成本比多點一下高。
   * 改成選單裡選「移動」→ 點目標格，兩下完成，滑鼠玩家照樣可以用。
   */
  const [movingId, setMovingId] = useState<string | null>(null);
  /**
   * 指定目標模式：卷軸強化與機率查詢共用同一套（`35-inventory-constraints.md` § 35.5.5）。
   * 模式中所有點擊都被它接管，不會落到原本的使用／裝備／移動。
   */
  const [targeting, setTargeting] = useState<TargetingMode | null>(null);
  // 提示一律走 log：背包版面不因為點了什麼而位移，插一列提示會把整片格子往下推
  /** 機率視窗要看的裝備。由指定目標模式選出來 */
  const [rateTarget, setRateTarget] = useState<EquipmentInstance | null>(null);
  const { fx: enhanceFx, play: playEnhanceFx } = useOneShotFx<BagEnhanceFx>();

  // 拖曳狀態由 dragStore 統一持有：落點可能在背包外（快捷格／地圖），
  // 每個目標各自記一份 hover 狀態會對不起來
  const dragItem = useDragStore(s => s.item);
  const dragOver = useDragStore(s => s.over);
  /**
   * 背包一律點兩次才動作：第一次選取、第二次才使用／裝備。
   * 一格一格擠在一起，手滑就喝掉藥水或換掉整套裝備，代價比多點一下高。
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 這次按壓的起點：判斷放開時算不算「點擊」，以及是不是剛選起來的那一下 */
  const pressRef = useRef<{
    id: string;
    x: number;
    y: number;
    justSelected: boolean;
    /** 按住的是哪一格（長按開選單、拖曳起手都要知道） */
    item: BagGridItem;
    index: number;
    /** 觸控不走拖曳（見 `movingId`），起手判定要分流 */
    touch: boolean;
  } | null>(null);

  const character = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const equipItem = useGameStore(s => s.equipItem);
  const unequipItem = useGameStore(s => s.unequipItem);
  const usePotionByType = useGameStore(s => s.usePotionByType);
  const useTownScroll = useGameStore(s => s.useTownScroll);
  const useCureItem = useGameStore(s => s.useCureItem);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);
  const pushSystemLog = useGameStore(s => s.pushSystemLog);
  /** § 35.1.3：格子位置持久化在 store，拖曳與整理共用同一條寫入路徑 */
  const slotMap = useGameStore(s => s.bagSlotMap);
  const setSlotMap = useGameStore(s => s.setBagSlotMap);
  const quickSlots = useGameStore(s => s.quickSlots);
  const activeEffects = useGameStore(s => s.activeEffects);
  const templates = useEquipmentTemplates();

  const gridItems: BagGridItem[] = [];

  const redCount = getPotionCount(bagItems, 'red');
  const orangeCount = getPotionCount(bagItems, 'orange');
  const whiteCount = getPotionCount(bagItems, 'white');

  const basicPotionIds = new Set(Object.values(POTION_CONFIG).map(c => c.itemId));

  if (redCount > 0) {
    gridItems.push({ id: 'potion-red', type: 'potion', name: getPotionName('red'), itemId: POTION_CONFIG.red.itemId, count: redCount, potionType: 'red' });
  }
  if (orangeCount > 0) {
    gridItems.push({ id: 'potion-orange', type: 'potion', name: getPotionName('orange'), itemId: POTION_CONFIG.orange.itemId, count: orangeCount, potionType: 'orange' });
  }
  if (whiteCount > 0) {
    gridItems.push({ id: 'potion-white', type: 'potion', name: getPotionName('white'), itemId: POTION_CONFIG.white.itemId, count: whiteCount, potionType: 'white' });
  }

  for (const item of bagItems) {
    if (item.type === 'potion' && !basicPotionIds.has(item.itemId)) {
      const spt: SpeedPotionType | undefined =
        item.itemId === SPEED_POTION_CONFIG.green.itemId ? 'green'
        : item.itemId === SPEED_POTION_CONFIG['enhanced-green'].itemId ? 'enhanced-green'
        : undefined;
      gridItems.push({
        id: `bag-${item.itemId}`,
        type: 'potion',
        name: item.name,
        itemId: item.itemId,
        count: item.amount,
        speedPotionType: spt,
        cureItemId: isCureItem(item.itemId) ? item.itemId : undefined,
      });
    }
  }

  /*
   * § 35.20：印記收在底部抽屜，**完全不進 gridItems** ——
   * 格數、整理、拖曳位置都不該看到它。
   */
  const sigilItems: BagGridItem[] = [];

  for (const item of bagItems) {
    if (item.type === 'potion') continue;
    const cell: BagGridItem = { id: `bag-${item.itemId}`, type: item.type, name: item.name, itemId: item.itemId, count: item.amount };
    if (isSigilItemId(item.itemId)) sigilItems.push(cell);
    else gridItems.push(cell);
  }

  /*
   * § 35.1：穿上不等於離開背包 —— 裝備中的裝備照樣佔一格，只是多一個「裝備中」標記。
   * 格子 id 用裝備實例 id，穿脫時同一件東西的 id 不變。
   *
   * § 35.1.3：**裝備中與背包裝備排在同一個序列裡**，依實例 id（取得順序）排，
   * 不可分兩段推入。位置只由整理或拖曳改變。
   */
  const allEquipment: { item: EquipmentInstance; slot?: EquipSlot }[] = [];
  for (const slot of SLOT_ORDER) {
    const item = equippedGear[slot];
    if (item) allEquipment.push({ item, slot });
  }
  for (const item of inventory) {
    allEquipment.push({ item });
  }
  allEquipment.sort((a, b) => (a.item.id ?? Infinity) - (b.item.id ?? Infinity));

  for (const { item, slot } of allEquipment) {
    gridItems.push({ id: `equip-${item.id}`, type: 'equipment', name: item.name, equipment: item, equippedSlot: slot });
  }

  // Esc 退出指定目標。面板不吃鍵盤焦點，所以掛在 window 上
  useEffect(() => {
    if (!targeting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setTargeting(null);
      useGameStore.getState().pushSystemLog('已取消選擇目標');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targeting]);

  // 選取的東西離開背包（用掉、穿上、賣掉、丟棄）後把選取狀態收掉。
  // 兩個分頁的格子都可能被選取，所以一起看。
  // 每次 render 都是新陣列，這裡每次都會跑，但只有真的失效才寫入狀態。
  useEffect(() => {
    const alive = [...gridItems, ...sigilItems].some(i => i.id === selectedId);
    if (selectedId != null && !alive) {
      setSelectedId(null);
    }
  }, [gridItems, sigilItems, selectedId]);

  /*
   * § 35.17：剔除已不在版面上的位置（賣掉、存進倉庫、丟棄）。
   * 拖曳與整理寫入的 slotMap 本來就是乾淨的，這裡處理的是
   * 「擺好之後物品才消失」留下的殘留，避免存檔無限累積。
   */
  useEffect(() => {
    const alive = new Set(gridItems.map(i => i.id));
    const ids = Object.keys(slotMap);
    if (!ids.some(id => !alive.has(id))) return;
    const next: BagSlotMap = {};
    for (const id of ids) {
      if (alive.has(id)) next[id] = slotMap[id];
    }
    setSlotMap(next);
  }, [gridItems, slotMap, setSlotMap]);

  const usedSlots = gridItems.length;
  // § 35.1：背包格數 = 基礎 60 + 腰帶的 bonusBagSlots
  const maxSlots = getBagMaxSlots(equippedGear);

  // 手動位置優先，其餘依預設順序流入剩餘空格
  const layout = buildBagLayout(gridItems, slotMap, maxSlots);

  /** 把格子搬到目標索引（拖放與「移動」模式共用同一條路徑） */
  function moveTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setSlotMap(moveBagSlot(layout, slotMap, fromIndex, toIndex));
  }

  /** 這一格拖出去時要交給快捷格／地圖的描述（§ 35.5.3） */
  function dragPayloadOf(item: BagGridItem): BagDragPayload {
    return item.equipment
      ? { kind: 'equipment', name: item.name, amount: 1, equipmentId: item.equipment.id, equipped: item.equippedSlot != null }
      : { kind: 'bag', name: item.name, itemId: item.itemId, amount: item.count ?? 1 };
  }

  /**
   * 落點處理。三個目標的語意都不一樣，但**一律由拖曳來源決定**——
   * 快捷格綁定與丟棄都是全域 store action，來源這裡就做得完，
   * 不必讓每個目標各自去解析拖曳負載。
   */
  function applyDrop(target: DropTarget | null, item: DragItem) {
    if (!target) return;
    /*
     * 技能拖曳由 `SkillPanel` 自己落地（§ 35.7.3）。這裡只會收到背包自己發起的拖曳，
     * 但型別上 payload 是聯集，早退比在下面每一處補 `?.` 清楚。
     */
    if (item.payload.kind === 'skill') return;
    if (target.kind === 'bag-slot') {
      moveTo(item.fromIndex, target.index);
      return;
    }
    if (target.kind === 'quick-slot') {
      // 天賦的東西不能綁快捷格：不是道具，也沒有「使用」這個動作
      if (item.payload.kind === 'talent-affix' || item.payload.kind === 'talent-slot-item') return;
      const entry = toQuickSlotEntry(
        item.payload.kind,
        item.payload.itemId ?? -1,
        item.payload.equipmentId,
        item.payload.name,
      );
      if (entry) assignQuickSlot(target.index, entry);
      return;
    }
    // 天賦的東西不進地圖丟棄流程：不佔格、沒有丟棄的動機（§ 35.21.1）
    if (item.payload.kind === 'talent-affix' || item.payload.kind === 'talent-slot-item') return;
    // § 35.9：裝備中的東西不能丟，先脫下來才算數
    if (item.payload.equipped) return;
    // § 35.5.3：丟到地圖上＝丟棄，需二次確認（DiscardConfirmModal）
    useGameStore.getState().requestDiscard({
      kind: item.payload.kind,
      name: item.payload.name,
      itemId: item.payload.itemId,
      maxAmount: item.payload.kind === 'equipment' ? 1 : item.payload.amount,
      equipmentId: item.payload.equipmentId,
    });
  }

  /**
   * 整理（§ 35.8）：**一次性落位，非 toggle** ——
   * 把當下的排序結果整批寫成位置，不保留整理前的快照。
   * 整理過後每個項目都有明確格子，新獲得的物品因此不會再插隊到分類中間。
   */
  function handleSort() {
    setSlotMap(sortBagLayout(gridItems, maxSlots));
    setMovingId(null);
  }

  function showTooltipFor(el: HTMLElement, item: BagGridItem) {
    // 落點與邊界翻轉都在 `BagTooltip` 裡算（§ 35.6.4），這裡只給錨點
    setTooltip({ item, anchor: anchorOf(el) });
  }

  function handleMouseEnter(e: React.MouseEvent, item: BagGridItem) {
    showTooltipFor(e.currentTarget as HTMLElement, item);
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  function openContextMenu(item: BagGridItem, x: number, y: number) {
    setTooltip(null);
    setMovingId(null);
    setContextMenu({ item, x, y });
  }

  function handleContextMenu(e: React.MouseEvent, item: BagGridItem) {
    e.preventDefault();
    openContextMenu(item, e.clientX, e.clientY);
  }

  /**
   * 長按＝右鍵（`47-mobile.md`）。手機沒有右鍵，不接這條路徑等於「設快捷鍵」與「丟棄」
   * 在手機上不存在。
   *
   * hook 只能在元件頂層呼叫，不能在 `layout.map()` 裡每格開一個，
   * 所以「按住的是哪一格」從 `pressRef` 讀 —— 格子的 pointerdown 一定先跑。
   */
  const longPress = useLongPress(point => {
    const press = pressRef.current;
    if (!press) return;
    openContextMenu(press.item, point.clientX, point.clientY);
  });

  function handleAssignSlot(slotIdx: number) {
    if (!contextMenu) return;
    const item = contextMenu.item;
    const entry = toQuickSlotEntry(
      item.equipment ? 'equipment' : 'bag',
      item.itemId ?? -1,
      item.equipment?.id,
      item.name,
    );
    if (!entry) return;
    assignQuickSlot(slotIdx, entry);
    setContextMenu(null);
  }

  function handleDiscard() {
    if (!contextMenu) return;
    const item = contextMenu.item;
    // 選單本來就不顯示這顆按鈕；這裡是第二道保險，裝備中一律不可丟
    if (item.equippedSlot) return;
    if (item.equipment) {
      useGameStore.getState().discardInventoryItem(item.equipment.id!);
    } else if (item.itemId != null) {
      useGameStore.getState().discardBagItem(item.itemId);
    }
    setContextMenu(null);
  }

  /** 第二次點擊才執行的實際動作 */
  function activate(item: BagGridItem) {
    if (item.potionType) {
      usePotionByType(item.potionType);
    } else if (item.cureItemId != null) {
      useCureItem(item.cureItemId);
    } else if (item.speedPotionType) {
      useGameStore.getState().useSpeedPotion(item.speedPotionType);
    } else if (item.equippedSlot) {
      // § 35.9.2：裝備中的格子第二下是卸下（容量／腰帶溢出保護在 store 內）
      unequipItem(item.equippedSlot);
    } else if (item.equipment) {
      equipItem(item.equipment);
    } else if (item.type === 'scroll' && item.itemId != null && isTownScroll(item.itemId)) {
      useTownScroll(item.itemId);
    } else {
      // 強化卷軸不直接生效，第二下是「進入指定目標模式」（§ 35.5.5）
      enterScrollTargeting(item);
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
    // 移動模式要能點到空格，所以只有「連格子都沒點到」才取消
    if (!(e.target as HTMLElement).closest?.('.bag-cell')) {
      setMovingId(null);
      // 格子以外的地方（面板留白、標題列）點下去就退出指定目標
      cancelTargeting();
    }
    if (!(e.target as HTMLElement).closest?.('.bag-cell:not(.empty)')) {
      setSelectedId(null);
      // 觸控沒有 mouseleave，詳情要跟著取消選取一起收
      setTooltip(null);
    }
  }

  /**
   * 選取在 **pointerdown** 就完成 —— 拖曳本身就帶著「按下＝選到這格」的語意。
   *
   * 動作不可綁在 `click` 上：按下與放開落在不同元素時 click 會改派到共同祖先，
   * 快速點擊漂幾 px 落到格子間隙就中，症狀正是「點了沒反應」。
   */
  function handleCellPointerDown(e: React.PointerEvent, item: BagGridItem, index: number) {
    if (e.button !== 0) return;
    longPress.onPointerDown(e);
    const justSelected = selectedId !== item.id;
    if (justSelected) setSelectedId(item.id);
    /*
     * 觸控沒有 hover，物品詳情本來只掛在 hover tooltip 上（`47-mobile.md`）——
     * 手機玩家會完全看不到重量、詞綴、用途。改成「選取的同時把詳情叫出來」：
     * 第一次點＝選取＋看詳情，第二次點＝使用，正好是既有的兩段式流程。
     */
    if (e.pointerType === 'touch') showTooltipFor(e.currentTarget as HTMLElement, item);
    pressRef.current = {
      id: item.id,
      x: e.clientX,
      y: e.clientY,
      justSelected,
      item,
      index,
      touch: e.pointerType === 'touch',
    };
  }

  /**
   * 超過容忍距離就從「點擊」轉成拖曳。
   *
   * **必須 `setPointerCapture`**：手指／游標一離開這一格，後續的 move 與 up 就會
   * 派給別的元素，拖曳會在半路斷掉且永遠收不到落點。
   *
   * 觸控不走這條路：長按已經給了次要選單，再讓「按住滑動」變成拖曳，
   * 玩家想捲背包時每次都會抓起一格東西。觸控改用選單裡的「移動」。
   */
  function handleCellPointerMove(e: React.PointerEvent) {
    const press = pressRef.current;
    if (!press) return;
    longPress.onPointerMove(e);
    if (press.touch || useDragStore.getState().item) {
      if (useDragStore.getState().item) useDragStore.getState().move(e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= CLICK_SLOP) return;

    setTooltip(null);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    useDragStore.getState().begin(
      { fromIndex: press.index, payload: dragPayloadOf(press.item), label: press.item.name },
      e.clientX,
      e.clientY,
    );
  }

  /**
   * 執行動作綁 **pointerup**，不綁 click：
   * click 會被 dragstart 吃掉，也會在按下／放開跨元素時改派到共同祖先。
   * 真的拖起來時瀏覽器不發 pointerup（改發 dragend），所以拖曳不會誤觸使用／裝備。
   */
  function handleCellPointerUp(e: React.PointerEvent, item: BagGridItem) {
    const press = pressRef.current;
    pressRef.current = null;
    longPress.onPointerUp(e);

    // 拖曳中：這一下是「放開」，不是點擊。落點由 dragStore 判定
    const dragging = useDragStore.getState().item;
    if (dragging) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      useDragStore.getState().move(e.clientX, e.clientY);
      applyDrop(useDragStore.getState().drop(), dragging);
      return;
    }

    // 長按已經開了選單，這一下只是手指離開螢幕，不能再算一次動作
    if (longPress.didFire()) return;
    if (!press || press.id !== item.id) return;
    // 手一定會抖，給 8px 容忍；超過就當成拖曳的起手，不算點擊
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return;
    // 剛在這一下選起來的，放開不算「第二次點擊」
    if (press.justSelected) return;

    // 選的是「格子」不是「一次動作」：選起來就留著，之後每點一下都直接執行。
    // 連喝三瓶藥水＝點四下，而不是選一下用一下地來回切換。
    if (selectedId === item.id) activate(item);
  }

  function handleCellPointerCancel(e: React.PointerEvent) {
    pressRef.current = null;
    longPress.onPointerCancel(e);
    useDragStore.getState().cancel();
  }

  /**
   * 移動模式下點任何一格＝把來源搬過來（目標有東西就互換）。
   * 回傳 true 代表這一下已經被移動模式吃掉，呼叫端不要再當成一般點擊。
   */
  function consumeMoveTap(toIndex: number): boolean {
    if (movingId == null) return false;
    const fromIndex = layout.findIndex(i => i?.id === movingId);
    setMovingId(null);
    if (fromIndex < 0) return true;
    moveTo(fromIndex, toIndex);
    return true;
  }

  /** 這一格在目前的指定目標模式下能不能點。機率查詢與卷軸共用同一組標示 */
  function isTargetable(item: BagGridItem): boolean {
    if (!targeting || !item.equipment) return false;
    if (targeting.kind === 'rate') return isEnhanceable(item.equipment);
    return canScrollTarget(targeting.scroll, item.equipment);
  }

  /** 取消指定目標。點空白、點不能當目標的東西、Esc 都走這裡 */
  function cancelTargeting() {
    if (!targeting) return;
    setTargeting(null);
    pushSystemLog('已取消選擇目標');
  }

  /**
   * 第二次點擊卷軸＝進入指定目標模式（不是直接使用）。
   * 回傳 true 代表這一下已經被卷軸吃掉。
   */
  function enterScrollTargeting(item: BagGridItem): boolean {
    const scroll = getEnhanceScroll(item.itemId);
    if (!scroll) return false;
    const label = scrollTargetLabel(scroll);
    setTargeting({ kind: 'scroll', scroll, label });
    pushSystemLog(`${item.name}：請選擇${label}（Esc 或點空白處取消）`);
    return true;
  }

  /**
   * 指定目標模式下點任何一格。回傳 true 代表這一下已經被模式吃掉，
   * 呼叫端不要再當成一般點擊 —— 否則點到藥水會順手喝掉。
   */
  function consumeTargetTap(item?: BagGridItem, cell?: Element | null): boolean {
    if (!targeting) return false;
    const equipment = item?.equipment;
    // 空格與非裝備都是取消手勢（含「再點一次該卷軸」）
    if (!equipment) {
      cancelTargeting();
      return true;
    }
    if (targeting.kind === 'rate') {
      setTargeting(null);
      setRateTarget(equipment);
      return true;
    }
    const { scroll } = targeting;
    setTargeting(null);
    if (!canScrollTarget(scroll, equipment)) {
      pushSystemLog(`${equipment.name} 不是${targeting.label}`);
      return true;
    }
    const box = cell?.getBoundingClientRect();
    const outcome = applyEnhanceScroll(scroll, { item: equipment, slot: item.equippedSlot });
    if (!outcome) return true;
    pushSystemLog(outcome.message);
    // 演出不參與判定（§ 48.1）：結算已經寫完狀態，這裡只是照剛才的位置疊一層
    if (box) {
      playEnhanceFx({
        kind: outcome.fx,
        rect: { left: box.left, top: box.top, width: box.width, height: box.height },
        label: outcome.fx === 'fail' ? undefined : `+${outcome.nextLevel}`,
        ghost: outcome.ghost,
      });
    }
    return true;
  }

  function renderTooltipContent(item: BagGridItem) {
    if (item.potionType) {
      const config = POTION_CONFIG[item.potionType];
      const totalWeight = totalItemWeight(item);
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

    if (item.cureItemId != null) {
      const def = getCureItem(item.cureItemId);
      const totalWeight = totalItemWeight(item);
      const curable = def ? hasCurableDebuff(def, activeEffects) : false;
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">{item.name}</div>
          <div className="tooltip-stat">{def?.description ?? itemDef(item)?.description ?? ''}</div>
          <div className="tooltip-stat">重量: {totalWeight}</div>
          <div className="tooltip-count">數量: {item.count}</div>
          <div className="tooltip-hint">
            {!curable ? '沒有需要解除的狀態' : selectedId === item.id ? '再點一次使用' : '點擊選取'}
          </div>
        </div>
      );
    }

    if (item.speedPotionType) {
      const totalWeight = totalItemWeight(item);
      return (
        <div className="bag-tooltip-content">
          <div className="tooltip-name">{item.name}</div>
          <div className="tooltip-stat">{itemDef(item)?.description ?? ''}</div>
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
          {item.equippedSlot && (
            <div className="tooltip-equipped">裝備中（{SLOT_NAMES[item.equippedSlot]}）</div>
          )}
          <EquipmentDetail item={eq} templates={templates} />
          <div className="tooltip-hint">
            {selectedId === item.id
              ? (item.equippedSlot ? '再點一次卸下' : '再點一次裝備')
              : '點擊選取'}
          </div>
        </div>
      );
    }

    const craftUsage = item.itemId != null ? formatMaterialUsage(item.itemId) : '';
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">重量: {totalItemWeight(item)}</div>
        {item.count && <div className="tooltip-count">數量: {item.count}</div>}
        {/* 顏色只表達稀有度，用途另外講明，免得玩家把配方材料賣掉 */}
        {craftUsage && <div className="tooltip-craft-usage">⚒ 用途：{craftUsage}</div>}
        {item.type === 'scroll' && item.name.includes('回城卷軸') && (
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次傳送至城鎮' : '點擊選取'}
          </div>
        )}
        {getEnhanceScroll(item.itemId) && (
          <div className="tooltip-hint">
            {selectedId === item.id ? '再點一次選擇強化目標' : '點擊選取'}
          </div>
        )}
      </div>
    );
  }

  /**
   * 開合抽屜時把殘留的互動狀態收掉：選取、tooltip、右鍵選單、移動模式
   * 都是「當前那一格」的事，抽屜一蓋上去或收起來就指向看不到的格子了。
   */
  function toggleSigilDrawer() {
    setSigilOpen(open => !open);
    setSelectedId(null);
    setTooltip(null);
    setContextMenu(null);
    setMovingId(null);
    setTargeting(null);
  }

  /** 格子內容。一般分頁與印記分頁只差在互動，長相完全一樣 */
  function cellVisual(item: BagGridItem) {
    return (
      <>
        {item.type === 'equipment' ? (
          <GameIcon
            name={getEquipIcon(item.equipment?.type === 'armor' ? (item.equipment?.slot || 'chest') : (item.equipment?.type || 'sword'))}
            size={24}
            color={item.equipment ? getEquipmentInstanceTierColor(item.equipment, templates) : undefined}
          />
        ) : (
          (() => {
            // 顯示方式一律以 item 定義為準（icon / iconColor / iconType / iconTier）
            const { icon, color, glowClass } = resolveItemIcon(
              itemDef(item),
              getItemIconKey(item.name, item.type),
            );
            return <GameIcon name={icon} size={24} color={color} className={glowClass} />;
          })()
        )}
        <span className="bag-cell-name">{getShortName(item.name)}</span>
        {item.equippedSlot && (
          <span className="bag-cell-equipped" aria-label={`裝備中：${SLOT_NAMES[item.equippedSlot]}`}>
            裝備中
          </span>
        )}
        {item.count != null && item.count > 1 && (
          <span className="bag-cell-count">×{item.count}</span>
        )}
        {item.itemId != null && hasMaterialUsage(item.itemId) && (
          <span className="bag-cell-craft" title="有用途的素材" aria-label="有用途的素材">⚒</span>
        )}
      </>
    );
  }

  /*
   * § 35.21：背包分頁列。「一般」＝現有格子 ＋ 印記抽屜，「天賦」＝未安裝的天賦格與鑲材。
   * 印記**維持抽屜**掛在一般分頁底下，不獨立成第三個分頁 ——
   * 六種兩排就放得下，分頁列與抽屜兩套收納語言不必並存。
   */
  if (bagTab === 'talent') {
    return (
      <div className="bag-panel">
        {/* 列數與一般分頁對齊 */}
        <BagTabs tab={bagTab} onChange={setBagTab}>
          {/* 整理鈕與一般分頁同一顆、同一個位置、同一種行為 */}
          <button className="bag-sort-toggle" onClick={handleTalentSort}>整理</button>
        </BagTabs>
        <BagTalentTab
          rows={rowsForSlots(maxSlots)}
          order={talentOrder}
          onReorder={next => { setTalentOrder({ charId, order: next }); saveTalentBagOrder(charId, next); }}
        />
      </div>
    );
  }

  return (
    <div className="bag-panel" ref={panelRef} onPointerDown={handlePanelPointerDown}>
      <BagTabs tab={bagTab} onChange={setBagTab}>
        <button className="bag-sort-toggle" onClick={handleSort}>整理</button>
        <button
          className="bag-rate-toggle"
          onClick={() => setTargeting(t => (t?.kind === 'rate' ? null : { kind: 'rate' }))}
        >
          機率
        </button>
        <span className={`bag-slots-count${usedSlots >= maxSlots ? ' danger' : usedSlots >= maxSlots * 0.9 ? ' warning' : ''}`}>
          {usedSlots}/{maxSlots}
        </span>
      </BagTabs>
      <div className="bag-gold-row">
        <span className="bag-gold-label">金幣</span>
        <span className="bag-gold-value">{character?.gold ?? 0}</span>
      </div>
      {movingId && (
        <div className="bag-move-hint" role="status">
          選擇要移到的格子（點空白處取消）
        </div>
      )}
      <div className="bag-grid-container">
        <BagGrid>
          {layout.map((item, idx) => {
            /* 落點是靠 `elementFromPoint` 命中這兩個 data 屬性，不是靠事件冒泡 ——
               拖曳期間指標被來源格 capture 住，目標格收不到任何 pointer 事件（`47-mobile.md`） */
            const dropProps = { 'data-drop-kind': 'bag-slot', 'data-drop-index': idx } as const;
            const overClass = dragOver?.kind === 'bag-slot' && dragOver.index === idx ? ' drag-over' : '';
            if (!item) {
              return (
                <div
                  key={`empty-${idx}`}
                  className={`bag-cell empty${overClass}${movingId ? ' move-target' : ''}`}
                  {...dropProps}
                  onPointerDown={() => { if (!consumeTargetTap()) consumeMoveTap(idx); }}
                />
              );
            }
            return (
              <div
                key={item.id}
                className={`bag-cell ${item.type}${overClass}${
                  dragItem?.fromIndex === idx ? ' dragging' : ''
                }${item.equippedSlot ? ' is-equipped' : ''}${selectedId === item.id ? ' is-selected' : ''}${
                  movingId === item.id ? ' is-moving' : movingId ? ' move-target' : ''
                }${targeting ? (isTargetable(item) ? ' enh-target' : ' enh-target-off') : ''}`}
                {...dropProps}
                onMouseEnter={(e) => handleMouseEnter(e, item)}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onPointerDown={(e) => {
                  if (consumeTargetTap(item, e.currentTarget)) return;
                  if (!consumeMoveTap(idx)) handleCellPointerDown(e, item, idx);
                }}
                onPointerMove={handleCellPointerMove}
                onPointerUp={(e) => handleCellPointerUp(e, item)}
                onPointerCancel={handleCellPointerCancel}
                /* 保險絲：捕獲被系統收走（切到別的視窗、來電）時拖曳要結束，
                   否則殘影會一直黏在指標上。正常放開時 store 已清空，這裡是 no-op */
                onLostPointerCapture={handleCellPointerCancel}
              >
                {cellVisual(item)}
              </div>
            );
          })}
        </BagGrid>
      </div>

      {/*
        § 35.20：印記抽屜。由下往上展開，**覆蓋**在背包格上方而不是把格子往上推 ——
        推擠會讓格子區高度與捲動位置跟著跳。開合狀態不持久化。
      */}
      {enhanceFx && (
        <div
          key={`bag-enh-fx-${enhanceFx.token}`}
          className={`bag-enh-fx${enhanceFx.kind === 'fail' ? ' enh-shake enh-breaking' : ''}`}
          style={{
            left: enhanceFx.rect.left, top: enhanceFx.rect.top,
            width: enhanceFx.rect.width, height: enhanceFx.rect.height,
          }}
          data-testid={enhanceFx.kind === 'fail' ? 'enh-fx-ghost' : 'enh-fx-success'}
        >
          {enhanceFx.ghost && (
            <>
              <GameIcon
                name={getEquipIcon(enhanceFx.ghost.type === 'armor' ? (enhanceFx.ghost.slot || 'chest') : (enhanceFx.ghost.type || 'sword'))}
                size={24}
                color={getEquipmentInstanceTierColor(enhanceFx.ghost, templates)}
              />
              <span className="bag-cell-name">{getShortName(enhanceFx.ghost.name)}</span>
            </>
          )}
          <div className="enh-fx-layer">
            {enhanceFx.kind === 'success' && (
              <>
                <div className="enh-flash-gold" />
                <div className="enh-ring" />
                <div className="enh-ring delay" />
              </>
            )}
            {enhanceFx.kind === 'fail' && (
              <>
                <div className="enh-flash-red" />
                {SHARD_INDEXES.map(i => <div key={i} className={`enh-shard enh-shard--${i}`} />)}
              </>
            )}
            {enhanceFx.label && <div className="enh-float">{enhanceFx.label}</div>}
            <div className="enh-flash-soft" />
          </div>
        </div>
      )}

      {rateTarget && <EnhanceRateWindow item={rateTarget} onClose={() => setRateTarget(null)} />}

      <div className="bag-sigil-dock">
      {sigilOpen && (
        <div className="bag-sigil-drawer" role="group" aria-label="印記">
          {sigilItems.length === 0 ? (
            <div className="bag-sigil-empty">還沒有任何印記</div>
          ) : (
            <BagGrid>
              {/*
                § 35.20.3：印記格不做拖曳重排、不進 slotMap、不吃整理 ——
                種類固定且只有六種，位置管理沒有意義。點一下只選取（沒有可執行的動作），
                選起來是為了讓觸控裝置也看得到 tooltip（§ 35.5.4）。
              */}
              {sigilItems.map(item => (
                <div
                  key={item.id}
                  className={`bag-cell ${item.type}${selectedId === item.id ? ' is-selected' : ''}`}
                  onMouseEnter={(e) => handleMouseEnter(e, item)}
                  onMouseLeave={handleMouseLeave}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onPointerDown={() => setSelectedId(item.id)}
                >
                  {cellVisual(item)}
                </div>
              ))}
            </BagGrid>
          )}
        </div>
      )}

      <button
        className={`bag-sigil-toggle${sigilOpen ? ' active' : ''}`}
        aria-expanded={sigilOpen}
        onClick={toggleSigilDrawer}
      >
        印記 {sigilOpen ? '▾' : '▴'}
      </button>
      </div>

      {tooltip && (
        <BagTooltip anchor={tooltip.anchor}>
          {renderTooltipContent(tooltip.item)}
        </BagTooltip>
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
              contextMenu.item.itemId ?? -1,
              contextMenu.item.equipment?.id,
              contextMenu.item.name,
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
                        contextMenu.item.itemId ?? -1,
                        contextMenu.item.equipment?.id,
                        contextMenu.item.name,
                      ),
                    ) && <span className="context-menu-active">●</span>}
                  </button>
                ))}
                <div className="context-menu-divider" />
              </>
            )}
            {/* 觸控裝置沒有拖曳（`47-mobile.md`），重排背包只剩這條路；滑鼠玩家也可以用 */}
            <button
              className="context-menu-item"
              onClick={() => {
                setMovingId(contextMenu.item.id);
                setContextMenu(null);
              }}
            >
              移動到其他格
            </button>
            {/* § 35.9：裝備中的不給丟棄，得先卸下來 */}
            {!contextMenu.item.equippedSlot && (
              <>
                <div className="context-menu-divider" />
                <button className="context-menu-item context-menu-danger" onClick={handleDiscard}>
                  丟棄{contextMenu.item.count && contextMenu.item.count > 1 ? ' ×1' : ''}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 背包分頁列（§ 35.21）。`children` 是靠右的工具列（整理、格數） */
function BagTabs({ tab, onChange, children }: {
  tab: 'normal' | 'talent';
  onChange: (t: 'normal' | 'talent') => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="bag-tabs" role="tablist">
      {([['normal', '一般'], ['talent', '天賦']] as const).map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          className={`bag-tab${tab === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
      {children && <span className="bag-tabs-meta">{children}</span>}
    </div>
  );
}
