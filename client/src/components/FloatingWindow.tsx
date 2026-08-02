import { useCallback, useEffect, useRef } from 'react';
import {
  usePanelWindowStore,
  getPanelZIndex,
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
  const position = usePanelWindowStore(s => s.positions[panelKey]);
  const zIndex = usePanelWindowStore(s => getPanelZIndex(s.order, panelKey));
  const setPosition = usePanelWindowStore(s => s.setPosition);
  const closePanel = usePanelWindowStore(s => s.closePanel);
  const focusPanel = usePanelWindowStore(s => s.focusPanel);

  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = useCallback((x: number, y: number): PanelPosition => {
    const el = winRef.current;
    const w = el?.offsetWidth || width;
    const h = el?.offsetHeight || 0;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, [width]);

  // 開啟時把預設位置夾回可視範圍（小螢幕時預設座標可能超出畫面）
  useEffect(() => {
    const next = clamp(position.x, position.y);
    if (next.x !== position.x || next.y !== position.y) {
      setPosition(panelKey, next);
    }
    // 只在掛載時校正一次，之後由拖曳決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragStart(e: React.PointerEvent) {
    if (e.button !== 0) return;
    // 點在關閉鈕上不啟動拖曳：標題列的 pointer capture 會把 pointerup 改派到標題列，
    // 使按鈕收不到完整的 down→up 而不觸發 click。
    if ((e.target as HTMLElement).closest?.('.floating-window-close')) return;
    focusPanel(panelKey);
    dragRef.current = { dx: e.clientX - position.x, dy: e.clientY - position.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function handleDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition(panelKey, clamp(e.clientX - drag.dx, e.clientY - drag.dy));
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      ref={winRef}
      className={`floating-window ${className}`.trim()}
      data-testid={`floating-window-${panelKey}`}
      style={{ left: position.x, top: position.y, width, zIndex }}
      onPointerDown={() => focusPanel(panelKey)}
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
