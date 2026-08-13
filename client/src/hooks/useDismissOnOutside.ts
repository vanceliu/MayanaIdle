import { useEffect, useRef, type RefObject } from 'react';

/**
 * 點到範圍外或按 Esc 就關掉。
 *
 * `pointerdown` 走 capture 階段：底下的按鈕若在 bubble 前就 `stopPropagation`，
 * bubble 階段收不到這一發。
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  // close 放進 ref：呼叫端不必為了穩定 identity 包一層 useCallback
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      closeRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open]);
}
