import { create } from 'zustand';
import type { BagDragPayload } from '../models/bagLayout';

/**
 * 指標拖放（`47-mobile.md`）。
 *
 * 取代原本的 HTML5 drag-and-drop：`draggable` + `dragstart/drop` 這一套
 * **在觸控裝置上完全不會觸發**，手機玩家等於失去背包重排、快捷格綁定與丟棄。
 * Pointer Events 是滑鼠與觸控共用的同一組事件，改走它兩邊都活。
 *
 * 落點判定不靠事件冒泡，而是 `document.elementFromPoint()` ——
 * 拖曳期間指標被來源元素 capture 住（否則手指移出格子就收不到 move），
 * 目標元素根本收不到 pointerover。
 *
 * 目標元素以 DOM 屬性宣告自己：`data-drop-kind` + `data-drop-index`。
 * 這讓「誰可以被放」不必在 store 註冊，新增目標只要標屬性。
 */

export type DropKind =
  | 'bag-slot' | 'quick-slot' | 'map'
  /** 鑲材落在天賦格的某個槽位上 */
  | 'talent-slot'
  /** 天賦格落在某一列上＝插到那個順序（`51-auto-talent.md` § 51.3.1） */
  | 'talent-row'
  /** 未安裝的天賦格落在編輯區＝安裝到這個類型 */
  | 'talent-install';

export interface DropTarget {
  kind: DropKind;
  /** 地圖沒有索引，統一補 -1，呼叫端不必判 undefined */
  index: number;
  /**
   * 第二層索引（`data-drop-sub`）。天賦格要兩個座標：`index` ＝ 天賦格 id、
   * `sub` ＝ 第幾個條件槽（`null` ＝ 實作槽，`51-auto-talent.md` § 51.3）。
   * 其餘目標一律 null。
   */
  sub: number | null;
}

/**
 * 技能面板拖出來的技能（`35-inventory-constraints.md` § 35.7.3）。
 *
 * 技能是快捷格裡唯一不來自背包的內容，所以它沒有格子索引、沒有數量、也不能丟到地圖上。
 * 用 `kind` 與背包 payload 分流，而不是硬塞進 `BagDragPayload` 再留一堆空欄位。
 */
export interface SkillDragPayload {
  kind: 'skill';
  skillId: string;
  name: string;
}

/**
 * 從背包「天賦」分頁拖出來的鑲材（`51-auto-talent.md`）。
 *
 * 與背包 payload 分流的理由同技能：鑲材不進 `characterBag`、沒有格子索引、
 * 也不能丟到地圖上，硬塞進 `BagDragPayload` 只會多一堆空欄位。
 */
export interface TalentAffixDragPayload {
  kind: 'talent-affix';
  affixId: number;
  name: string;
}

/** 拖天賦格：從背包拖出來安裝，或把已安裝的拖到別的順序 */
export interface TalentSlotDragPayload {
  kind: 'talent-slot-item';
  slotId: number;
  name: string;
}

export type DragPayload =
  | BagDragPayload | SkillDragPayload | TalentAffixDragPayload | TalentSlotDragPayload;

export interface DragItem {
  /** 來源在背包版面的格子索引（背包內重排要用）。技能沒有格子，一律 -1 */
  fromIndex: number;
  /** 交給快捷格／地圖丟棄的描述（`35-inventory-constraints.md` § 35.5.3） */
  payload: DragPayload;
  /** 跟著指標跑的殘影上顯示的字 */
  label: string;
}

interface DragState {
  item: DragItem | null;
  pointer: { x: number; y: number } | null;
  over: DropTarget | null;
  begin: (item: DragItem, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  /** 結束拖曳並回傳落點（null＝沒有落在任何目標上），同時清空狀態 */
  drop: () => DropTarget | null;
  cancel: () => void;
}

/** 以視窗座標找出底下的放置目標 */
export function hitTestDropTarget(x: number, y: number): DropTarget | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  const el = document.elementFromPoint(x, y);
  const host = (el as HTMLElement | null)?.closest?.('[data-drop-kind]') as HTMLElement | null;
  if (!host) return null;
  const kind = host.dataset.dropKind as DropKind | undefined;
  const KINDS: DropKind[] = ['bag-slot', 'quick-slot', 'map', 'talent-slot', 'talent-row', 'talent-install'];
  if (!kind || !KINDS.includes(kind)) return null;
  const raw = host.dataset.dropIndex;
  const index = raw == null ? -1 : Number(raw);
  const rawSub = host.dataset.dropSub;
  // 沒標或標了非數字（實作槽用 `action`）一律當 null
  const sub = rawSub == null || !Number.isFinite(Number(rawSub)) ? null : Number(rawSub);
  return { kind, index: Number.isFinite(index) ? index : -1, sub };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.index === b.index && a.sub === b.sub;
}

export const useDragStore = create<DragState>((set, get) => ({
  item: null,
  pointer: null,
  over: null,

  begin: (item, x, y) => set({ item, pointer: { x, y }, over: hitTestDropTarget(x, y) }),

  move: (x, y) => {
    if (!get().item) return;
    const over = hitTestDropTarget(x, y);
    // 落點沒變就不寫入：拖曳每幀都在動，每次都換新物件會把所有目標元件重畫一遍
    set(prev => (sameTarget(prev.over, over)
      ? { pointer: { x, y } }
      : { pointer: { x, y }, over }));
  },

  drop: () => {
    const { item, over } = get();
    set({ item: null, pointer: null, over: null });
    return item ? over : null;
  },

  cancel: () => set({ item: null, pointer: null, over: null }),
}));

/** 目標元件用來判斷「現在是不是被拖到我頭上」。訂閱範圍收到布林，避免整條快捷格重畫 */
export function useIsDragOver(kind: DropKind, index: number, sub: number | null = null): boolean {
  return useDragStore(s =>
    s.over?.kind === kind && s.over.index === index && (kind !== 'talent-slot' || s.over.sub === sub));
}

/** 有沒有正在進行的拖曳（目標元件用來亮起可放置提示） */
export function useIsDragging(): boolean {
  return useDragStore(s => s.item != null);
}
