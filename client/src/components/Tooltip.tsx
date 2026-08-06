import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '../hooks/useViewport';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, children, position = 'top', delay = 200 }: TooltipProps) {
  const { isTouch } = useViewport();
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function show() {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.top - tooltipRect.height - gap;
        break;
      case 'bottom':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.bottom + gap;
        break;
      case 'left':
        x = triggerRect.left - tooltipRect.width - gap;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        x = triggerRect.right + gap;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    // Boundary flip
    if (y < 4) {
      y = triggerRect.bottom + gap;
    }
    if (x < 4) {
      x = 4;
    }
    if (x + tooltipRect.width > window.innerWidth - 4) {
      x = window.innerWidth - tooltipRect.width - 4;
    }
    if (y + tooltipRect.height > window.innerHeight - 4) {
      y = triggerRect.top - tooltipRect.height - gap;
    }

    setCoords({ x, y });
  }, [visible, position]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /*
   * 觸控裝置沒有 hover（`47-mobile.md`）。所有欄位說明、裝備詳情、技能數值都掛在 tooltip 上，
   * 不補這條路徑等於這些內容在手機上完全看不到。
   *
   * 開著的時候點畫面任一處就收掉 —— 觸控沒有「移開」這個動作，
   * 沒有這個關閉路徑，tooltip 會一直卡在畫面上擋住底下的東西。
   */
  useEffect(() => {
    if (!visible || !isTouch) return;
    function handleOutside(e: PointerEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      hide();
    }
    // capture 階段：底下的按鈕若在 bubble 前就 stopPropagation，收不到這一發
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [visible, isTouch]);

  function handleTouchToggle(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    // 一次點擊切換開關：同一顆再點一次收起來
    if (visible) hide();
    else setVisible(true);
  }

  return (
    <>
      <span
        ref={triggerRef}
        className="tooltip-trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onPointerUp={handleTouchToggle}
      >
        {children}
      </span>
      {visible && createPortal(
        <div
          ref={tooltipRef}
          className="tooltip-popup"
          style={{ left: coords.x, top: coords.y }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
