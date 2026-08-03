import { useCallback, useEffect, useRef, useState } from 'react';
import { CombatLogPanel } from './CombatLogPanel';

const POSITION_KEY = 'mayana.combatLogPos';
const OPACITY_KEY = 'mayana.combatLogOpacity';

/** 滑桿 0~100 對應背景不透明度 0~0.95（留一點上限，全黑會像實心面板） */
export function opacityToAlpha(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return Number(((clamped / 100) * 0.95).toFixed(3));
}

export function loadLogOpacity(storage: Pick<Storage, 'getItem'> = localStorage): number {
  // 不可直接 Number(...)：沒存過時 getItem 回 null，Number(null) 是 0，
  // 會被當成「使用者把透明度調到 0」而不是「沒設定過」。
  const stored = storage.getItem(OPACITY_KEY);
  if (stored === null || stored.trim() === '') return 80;
  const raw = Number(stored);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 80;
}

export interface LogPosition {
  left: number;
  top: number;
}

/** 讀回上次拖到的位置；沒有或壞掉就回 null，由 CSS 的預設（左下角）接手。 */
export function loadLogPosition(storage: Pick<Storage, 'getItem'> = localStorage): LogPosition | null {
  try {
    const raw = storage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LogPosition>;
    if (typeof parsed?.left !== 'number' || typeof parsed?.top !== 'number') return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

/**
 * 把位置夾在視窗內，至少留 40px 在畫面上 —— 拖到螢幕外就再也抓不回來了。
 */
export function clampLogPosition(pos: LogPosition, size: { width: number; height: number }, viewport: { width: number; height: number }): LogPosition {
  const minVisible = 40;
  return {
    left: Math.min(Math.max(pos.left, minVisible - size.width), viewport.width - minVisible),
    top: Math.min(Math.max(pos.top, 0), viewport.height - minVisible),
  };
}

/**
 * 戰鬥日誌視窗（§ 32.3）。
 *
 * 預設停在畫面左下角，可以拖著標題列移動，位置存在 localStorage。
 * `▲` 循環三段大小，放大時從日誌原位往上長、蓋在遊戲畫面上。
 */
export function CombatLogWindow() {
  const [logSize, setLogSize] = useState<0 | 1 | 2>(0);
  const [pos, setPos] = useState<LogPosition | null>(null);
  const [opacity, setOpacity] = useState(80);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPos(loadLogPosition());
    setOpacity(loadLogOpacity());
  }, []);

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
    localStorage.setItem(OPACITY_KEY, String(value));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    dragOffset.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    const box = ref.current?.getBoundingClientRect();
    if (!offset || !box) return;
    const next = clampLogPosition(
      { left: e.clientX - offset.x, top: e.clientY - offset.y },
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPos(next);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current) return;
    dragOffset.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPos(current => {
      if (current) localStorage.setItem(POSITION_KEY, JSON.stringify(current));
      return current;
    });
  }, []);

  const resetPosition = useCallback(() => {
    localStorage.removeItem(POSITION_KEY);
    setPos(null);
  }, []);

  return (
    <div
      ref={ref}
      className={`hud combat-log-window ${pos ? 'is-moved' : ''}`}
      style={{
        ...(pos ? { left: pos.left, top: pos.top } : {}),
        ['--log-alpha' as string]: String(opacityToAlpha(opacity)),
      }}
    >
      <div
        className="combat-log-title"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={resetPosition}
        title="拖曳移動；雙擊回到左下角"
      >
        <span>戰鬥紀錄</span>

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
            aria-label="戰鬥紀錄視窗設定"
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
                  aria-label="戰鬥紀錄背景透明度"
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

      {/* 放大＝整個視窗長高（視窗釘在左下角，所以是往上長），不再另外疊一層 */}
      <div className={`bottom-log-wrap log-size-${logSize}`}>
        <CombatLogPanel className="bottom-log" emptyText="目前沒有戰鬥紀錄" />
        <button
          className="log-resize-btn"
          onClick={() => setLogSize(s => ((s + 1) % 3) as 0 | 1 | 2)}
          title="調整 Log 大小"
        >
          {logSize === 0 ? '▲' : logSize === 1 ? '▲▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
