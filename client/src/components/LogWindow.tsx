import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { getElementScale } from '../stores/settingsStore';
import { useWindowLayerStore, useWindowZIndex } from '../stores/windowLayerStore';
import { useIsMobile } from '../hooks/useViewport';

/**
 * 底部浮動視窗的共同殼（§ 32.3）：可拖曳的標題列、背景透明度、三段高度。
 *
 * 戰鬥紀錄與聊天合成一個視窗、以分頁切換（`LogDock`），這裡只管視窗行為。
 * 標題列可放自訂內容（分頁鈕）；`title` 仍是這個視窗的名字，供 `aria-label` 使用。
 */

/** 滑桿 0~100 對應背景不透明度 0~0.95（留一點上限，全黑會像實心面板） */
export function opacityToAlpha(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return Number(((clamped / 100) * 0.95).toFixed(3));
}

export interface LogPosition {
  left: number;
  top: number;
}

export function positionKey(storageKey: string): string {
  return `mayana.${storageKey}Pos`;
}

export function opacityKey(storageKey: string): string {
  return `mayana.${storageKey}Opacity`;
}

/** 讀回上次拖到的位置；沒有或壞掉就回 null，由 CSS 的預設位置接手。 */
export function loadWindowPosition(key: string, storage: Pick<Storage, 'getItem'> = localStorage): LogPosition | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LogPosition>;
    if (typeof parsed?.left !== 'number' || typeof parsed?.top !== 'number') return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

export function loadWindowOpacity(key: string, storage: Pick<Storage, 'getItem'> = localStorage): number {
  // 不可直接 Number(...)：沒存過時 getItem 回 null，Number(null) 是 0，
  // 會被當成「使用者把透明度調到 0」而不是「沒設定過」。
  const stored = storage.getItem(key);
  if (stored === null || stored.trim() === '') return 80;
  const raw = Number(stored);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 80;
}

/**
 * 把**整個視窗**夾在畫面內，與背包／技能／裝備欄（`FloatingWindow` 的 clamp）同語意。
 *
 * `.game-layout` 是 `overflow: hidden`，露在外面的部分是被**裁掉**而不是可以捲過去 ——
 * 允許拖出畫面等於讓玩家把視窗弄丟。
 */
export function clampLogPosition(pos: LogPosition, size: { width: number; height: number }, viewport: { width: number; height: number }): LogPosition {
  const maxLeft = Math.max(0, viewport.width - size.width);
  const maxTop = Math.max(0, viewport.height - size.height);
  return {
    left: Math.min(Math.max(0, pos.left), maxLeft),
    top: Math.min(Math.max(0, pos.top), maxTop),
  };
}

/**
 * 調整大小後的位置：讓**下緣停在原處**（等同往上長），再把整個視窗收進畫面。
 *
 * 沒拖曳過時視窗靠 CSS `bottom` 定位；拖曳過之後改用 `top` 定位
 * （`.is-moved` 會把 `bottom` 收掉）。
 */
export function resizeLogPosition(
  bottomAnchor: number,
  left: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): LogPosition {
  return clampLogPosition({ left, top: bottomAnchor - size.height }, size, viewport);
}

export interface LogWindowProps {
  /** localStorage 前綴與視窗堆疊的鍵 */
  storageKey: 'combatLog';
  /** 視窗名稱，用於 `aria-label`；標題列顯示的東西由 `titleContent` 決定 */
  title: string;
  /** 標題列左側的自訂內容（分頁鈕）；省略時顯示 `title` */
  titleContent?: React.ReactNode;
  /** 附加在 `.combat-log-window` 之後的樣式類別（決定預設位置與分區色） */
  className?: string;
  /** 手機是否改成貼齊下方 HUD 帶的抽屜 */
  drawerOnMobile?: boolean;
  /** 內容依當下的高度段（0~2）渲染 */
  children: (logSize: 0 | 1 | 2) => React.ReactNode;
}

export function LogWindow({ storageKey, title, titleContent, className = '', drawerOnMobile = false, children }: LogWindowProps) {
  const isMobile = useIsMobile();
  const drawer = drawerOnMobile && isMobile;
  const [logSize, setLogSize] = useState<0 | 1 | 2>(0);
  const [pos, setPos] = useState<LogPosition | null>(null);
  const [opacity, setOpacity] = useState(80);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 點到就提到最上層（§ 32.15）：與城鎮設施視窗、浮動面板共用同一個堆疊順序
  const zIndex = useWindowZIndex(storageKey);
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const posStorageKey = positionKey(storageKey);
  const opacityStorageKey = opacityKey(storageKey);

  useEffect(() => {
    setPos(loadWindowPosition(posStorageKey));
    setOpacity(loadWindowOpacity(opacityStorageKey));
  }, [posStorageKey, opacityStorageKey]);

  /**
   * 讀回來的位置也要夾一次：在 1920 螢幕存的座標，換到 1280 開就整個在畫面外。
   * 必須等 `pos` 套進 DOM 後才量得到實際尺寸，故用 layout effect。
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!pos || !el) return;
    const scale = getElementScale(el);
    const box = el.getBoundingClientRect();
    const next = clampLogPosition(
      pos,
      { width: box.width / scale, height: box.height / scale },
      { width: window.innerWidth / scale, height: window.innerHeight / scale },
    );
    if (next.left !== pos.left || next.top !== pos.top) setPos(next);
    // 只在首次套用讀回的位置時校正，之後由拖曳與大小變更決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);

  // 點視窗外面就收起選單，跟地圖選擇器同一套行為
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setOpacity(value);
    localStorage.setItem(opacityStorageKey, String(value));
  }, [opacityStorageKey]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (drawer) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // 介面縮放時指標座標是視窗座標、left/top 是版面座標，統一換算到版面座標再算（§ 34.6）
    const scale = getElementScale(ref.current);
    dragOffset.current = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [drawer]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    const box = ref.current?.getBoundingClientRect();
    if (!offset || !box) return;
    const scale = getElementScale(ref.current);
    setPos(clampLogPosition(
      { left: e.clientX / scale - offset.x, top: e.clientY / scale - offset.y },
      { width: box.width / scale, height: box.height / scale },
      { width: window.innerWidth / scale, height: window.innerHeight / scale },
    ));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current) return;
    dragOffset.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPos(current => {
      if (current) localStorage.setItem(posStorageKey, JSON.stringify(current));
      return current;
    });
  }, [posStorageKey]);

  /**
   * 改變大小時的「底邊錨點」。記下變更前的下緣，重新算 `top` 讓下緣不動，
   * 於是放大往上長、縮小往下收，兩種定位模式行為一致。
   */
  const bottomAnchor = useRef<number | null>(null);

  const handleResizeClick = useCallback(() => {
    const el = ref.current;
    if (el && pos) {
      const scale = getElementScale(el);
      bottomAnchor.current = pos.top + el.getBoundingClientRect().height / scale;
    }
    setLogSize(s => ((s + 1) % 3) as 0 | 1 | 2);
  }, [pos]);

  // 尺寸變更後才量得到新高度，故用 layout effect 在繪製前把位置修正回去
  useLayoutEffect(() => {
    const anchor = bottomAnchor.current;
    bottomAnchor.current = null;
    const el = ref.current;
    if (anchor == null || !el) return;

    const scale = getElementScale(el);
    const box = el.getBoundingClientRect();
    setPos(current => current && resizeLogPosition(
      anchor,
      current.left,
      { width: box.width / scale, height: box.height / scale },
      { width: window.innerWidth / scale, height: window.innerHeight / scale },
    ));
  }, [logSize]);

  const resetPosition = useCallback(() => {
    localStorage.removeItem(posStorageKey);
    setPos(null);
  }, [posStorageKey]);

  return (
    <div
      ref={ref}
      className={`hud combat-log-window ${className} ${drawer ? 'is-drawer' : pos ? 'is-moved' : ''}`}
      onPointerDown={() => focusWindow(storageKey)}
      style={{
        zIndex,
        /* 抽屜的位置由 CSS 決定：inline style 壓過 class，
           留著桌機拖曳存下來的座標會讓抽屜停在畫面中間 */
        ...(pos && !drawer ? { left: pos.left, top: pos.top } : {}),
        ['--log-alpha' as string]: String(opacityToAlpha(opacity)),
      }}
    >
      <div
        className="combat-log-title"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={resetPosition}
        title={drawer ? undefined : '拖曳移動；雙擊回到預設位置'}
      >
        {titleContent ?? <span>{title}</span>}

        {/*
         * 視窗設定選單。之後這個視窗要新增的選項（字級、過濾類型、行數上限…）
         * 一律加在 .log-menu 裡多一列，不要再往標題列上塞控制項。
         */}
        <div className="log-menu-wrap" ref={menuRef}>
          <button
            className={`log-menu-btn ${menuOpen ? 'open' : ''}`}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setMenuOpen(o => !o)}
            title="視窗設定"
            aria-label={`${title}視窗設定`}
            aria-expanded={menuOpen}
          >
            ⚙
          </button>

          {menuOpen && (
            <div className="log-menu" onPointerDown={e => e.stopPropagation()}>
              <label className="log-menu-row">
                <span>背景透明度</span>
                <input
                  className="log-opacity-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  onChange={handleOpacityChange}
                  aria-label={`${title}背景透明度`}
                />
                <span className="log-menu-value">{opacity}%</span>
              </label>

              <button className="log-menu-action" onClick={resetPosition}>
                回到預設位置
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 放大＝整個視窗長高（視窗釘在底部，所以是往上長），不再另外疊一層 */}
      <div className={`bottom-log-wrap log-size-${logSize}`}>
        {children(logSize)}
        <button
          className="log-resize-btn"
          onClick={handleResizeClick}
          title="調整 Log 大小"
        >
          {logSize === 0 ? '▲' : logSize === 1 ? '▲▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
