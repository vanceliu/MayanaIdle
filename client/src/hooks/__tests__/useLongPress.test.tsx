import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useLongPress, LONG_PRESS_MS } from '../useLongPress';

/**
 * @vitest-environment jsdom
 */

/** `didFire` 讀的是 ref，不會觸發重繪，所以測試直接抓 handlers 物件而不是看 DOM */
let handlers: ReturnType<typeof useLongPress> | null = null;

function Probe({ onTrigger, enabled = true }: {
  onTrigger: (p: { clientX: number; clientY: number }) => void;
  enabled?: boolean;
}) {
  const lp = useLongPress(onTrigger, enabled);
  handlers = lp;
  return (
    <button
      data-testid="target"
      onPointerDown={lp.onPointerDown}
      onPointerMove={lp.onPointerMove}
      onPointerUp={lp.onPointerUp}
      onPointerCancel={lp.onPointerCancel}
      onContextMenu={lp.onContextMenu}
    />
  );
}

const target = () => document.querySelector('[data-testid="target"]')!;
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useLongPress（§ 34.8）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('按住滿時間就觸發，帶著按下點的座標', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 30, clientY: 40 });
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).toHaveBeenCalledWith({ clientX: 30, clientY: 40 });
  });

  it('時間不到就放開＝不觸發', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    await advance(LONG_PRESS_MS - 50);
    fireEvent.pointerUp(target(), { clientX: 10, clientY: 10 });
    await advance(200);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  /** 手指在捲動時也是「按著」，不擋掉的話捲一次背包就跳出一個選單 */
  it('位移超過容忍值＝捲動，不觸發', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(target(), { clientX: 10, clientY: 60 });
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('小幅抖動仍算長按', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(target(), { clientX: 13, clientY: 12 });
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('pointercancel（系統手勢接管）取消長按', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(target());
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('右鍵走同一個 handler（桌機路徑不可退化）', () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.contextMenu(target(), { clientX: 7, clientY: 8 });

    expect(onTrigger).toHaveBeenCalledWith({ clientX: 7, clientY: 8 });
  });

  it('右鍵按下（button 2）不會起算長按計時', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 2, clientX: 10, clientY: 10 });
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('enabled=false 時完全不作用', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} enabled={false} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    await advance(LONG_PRESS_MS + 10);
    fireEvent.contextMenu(target());

    expect(onTrigger).not.toHaveBeenCalled();
  });

  /** 沒有這個旗標，長按開完選單、手指放開又會把底下的物品用掉一次 */
  it('didFire 在觸發後為真，下一次按下歸零', async () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    await advance(LONG_PRESS_MS + 10);
    expect(handlers!.didFire()).toBe(true);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    expect(handlers!.didFire()).toBe(false);
  });

  it('卸載後計時器不會再觸發', async () => {
    const onTrigger = vi.fn();
    const { unmount } = render(<Probe onTrigger={onTrigger} />);

    fireEvent.pointerDown(target(), { button: 0, clientX: 10, clientY: 10 });
    unmount();
    await advance(LONG_PRESS_MS + 10);

    expect(onTrigger).not.toHaveBeenCalled();
  });
});
