import { useCallback, useEffect, useRef } from 'react';
import { getElementScale } from '../stores/settingsStore';
import { useIsMobile } from '../hooks/useViewport';
import { useWindowLayerStore, useWindowZIndex } from '../stores/windowLayerStore';
import {
  usePanelWindowStore,
  type PanelKey,
  type PanelPosition,
} from '../stores/panelWindowStore';

interface FloatingWindowProps {
  panelKey: PanelKey;
  title: string;
  width: number;
  /** 額外樣式修飾（例如任務面板的 .is-translucent） */
  className?: string;
  children: React.ReactNode;
}

/**
 * 通用可拖曳浮動視窗（16-tech-frontend-architecture.md § 32.15）
 *
 * - 無遮罩：不擋住底下的地圖與戰鬥（Idle 遊戲需持續看到進行狀況）
 * - 可多開：z 順序由 panelWindowStore.order 決定，點擊視窗任一處置頂
 * - 拖曳：僅標題列可拖，位置夾制在 viewport 內
 */
export function FloatingWindow({ panelKey, title, width, className = '', children }: FloatingWindowProps) {
  /*
   * 手機切「全螢幕 sheet」（`34-ui-guidelines.md` § 34.8）。
   *
   * 可拖曳、可多開、無遮罩的浮動視窗是**桌機**的做法：它預設玩家同時看得到
   * 地圖與好幾個面板。手機寬度連一個 420px 的面板都放不下，多開等於互相蓋住，
   * 拖曳更沒有意義（沒有空位可以拖過去）。
   */
  const isMobile = useIsMobile();
  const position = usePanelWindowStore(s => s.positions[panelKey]);
  // z 順序與戰鬥日誌／城鎮視窗／地圖選擇器共用同一個堆疊（§ 32.15）
  const zIndex = useWindowZIndex(`panel:${panelKey}`);
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  const setPosition = usePanelWindowStore(s => s.setPosition);
  const closePanel = usePanelWindowStore(s => s.closePanel);
  const focusPanel = usePanelWindowStore(s => s.focusPanel);

  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = useCallback((x: number, y: number): PanelPosition => {
    const el = winRef.current;
    const w = el?.offsetWidth || width;
    const h = el?.offsetHeight || 0;
    // 介面縮放時 left/top 是版面座標，視窗邊界要換算回同一個單位（§ 34.6）
    const scale = getElementScale(el);
    const maxX = Math.max(0, window.innerWidth / scale - w);
    const maxY = Math.max(0, window.innerHeight / scale - h);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, [width]);

  /** 指標的視窗座標 → 視窗自己的版面座標（未縮放時就是原值） */
  function toLayoutCoords(e: React.PointerEvent): { x: number; y: number } {
    const scale = getElementScale(winRef.current);
    return { x: e.clientX / scale, y: e.clientY / scale };
  }

  // 開啟時把預設位置夾回可視範圍（小螢幕時預設座標可能超出畫面）
  useEffect(() => {
    // sheet 模式的座標由 CSS 決定，夾制會把存下來的桌機位置改壞
    if (isMobile) return;
    const next = clamp(position.x, position.y);
    if (next.x !== position.x || next.y !== position.y) {
      setPosition(panelKey, next);
    }
    // 只在掛載時校正一次，之後由拖曳決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragStart(e: React.PointerEvent) {
    if (isMobile) return;
    if (e.button !== 0) return;
    // 點在關閉鈕上不啟動拖曳：標題列的 pointer capture 會把 pointerup 改派到標題列，
    // 使按鈕收不到完整的 down→up 而不觸發 click。
    if ((e.target as HTMLElement).closest?.('.floating-window-close')) return;
    focusPanel(panelKey);
    focusWindow(`panel:${panelKey}`);
    const pointer = toLayoutCoords(e);
    dragRef.current = { dx: pointer.x - position.x, dy: pointer.y - position.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function handleDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const pointer = toLayoutCoords(e);
    setPosition(panelKey, clamp(pointer.x - drag.dx, pointer.y - drag.dy));
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      ref={winRef}
      className={`floating-window ${isMobile ? 'is-sheet ' : ''}${className}`.trim()}
      data-testid={`floating-window-${panelKey}`}
      /* sheet 模式的尺寸與位置全部交給 CSS：inline style 的優先度壓過 class，
         留著 left/top/width 會讓面板停在桌機存下來的座標上 */
      style={isMobile ? { zIndex } : { left: position.x, top: position.y, width, zIndex }}
      onPointerDown={() => { focusPanel(panelKey); focusWindow(`panel:${panelKey}`); }}
    >
      <div
        className="floating-window-header"
        data-testid={`floating-window-header-${panelKey}`}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="floating-window-title">{title}</span>
        <button
          className="floating-window-close"
          aria-label={`關閉${title}`}
          onClick={() => closePanel(panelKey)}
        >
          ✕
        </button>
      </div>
      <div className="floating-window-body">{children}</div>
    </div>
  );
}
