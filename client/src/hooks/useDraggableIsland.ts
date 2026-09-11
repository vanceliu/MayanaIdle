/**
 * 可拖曳的 HUD 小島（`16-tech-frontend-architecture.md` § 32.3）。
 *
 * 與浮動視窗不同的是「**沒拖過就不是浮動的**」：位置為 null 時元素照原本的
 * 流排待在版面裡，第一次拖曳之後才切成固定座標。隊伍 HUD 需要這個性質 ——
 * 預設仍接在 buff 下面，buff 一長就被推下去的人才需要把它拖開。
 *
 * 位置存 localStorage、夾在畫面內，與戰鬥紀錄視窗共用同一組工具（`LogWindow`）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getElementScale } from '../stores/settingsStore';
import { onWindowPositionReset } from '../stores/windowPositionReset';
import { clampLogPosition, loadWindowPosition, positionKey, type LogPosition } from '../components/LogWindow';

export interface DraggableIsland {
  ref: React.RefObject<HTMLDivElement | null>;
  /** null＝沒拖過，維持原本的流排位置 */
  position: LogPosition | null;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
}

/** 量出目前的尺寸與視窗大小，一律換算成版面座標（介面縮放時兩者單位不同，§ 34.6） */
function metrics(el: HTMLElement) {
  const scale = getElementScale(el);
  const box = el.getBoundingClientRect();
  return {
    scale,
    size: { width: box.width / scale, height: box.height / scale },
    viewport: { width: window.innerWidth / scale, height: window.innerHeight / scale },
  };
}

export function useDraggableIsland(storageKey: string, disabled = false): DraggableIsland {
  const key = positionKey(storageKey);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<LogPosition | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => setPosition(loadWindowPosition(key)), [key]);

  // 「重設視窗位置」：清掉自己那一份，回到流排位置
  useEffect(() => onWindowPositionReset(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 清不掉就只影響下次開啟，畫面上已經回去了
    }
    setPosition(null);
  }), [key]);

  /**
   * 讀回來的位置要夾一次：在 1920 螢幕存的座標換到 1280 開會整個在畫面外，
   * 而 `.game-layout` 是 `overflow: hidden`，露出去的部分是被裁掉的。
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!position || !el) return;
    const { size, viewport } = metrics(el);
    const next = clampLogPosition(position, size, viewport);
    if (next.left !== position.left || next.top !== position.top) setPosition(next);
    // 只在首次套用讀回的位置時校正，之後由拖曳決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position !== null]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const { scale } = metrics(el);
    dragOffset.current = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    const el = ref.current;
    if (!offset || !el) return;
    const { scale, size, viewport } = metrics(el);
    setPosition(clampLogPosition(
      { left: e.clientX / scale - offset.x, top: e.clientY / scale - offset.y },
      size,
      viewport,
    ));
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current) return;
    dragOffset.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setPosition(current => {
      if (current) {
        try {
          localStorage.setItem(key, JSON.stringify(current));
        } catch {
          // 存不進去就只在本次 session 生效
        }
      }
      return current;
    });
  }, [key]);

  return {
    ref,
    position,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  };
}
