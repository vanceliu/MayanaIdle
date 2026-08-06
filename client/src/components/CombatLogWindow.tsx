import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { CombatLogPanel } from './CombatLogPanel';
import { getElementScale } from '../stores/settingsStore';
import { useWindowLayerStore, useWindowZIndex } from '../stores/windowLayerStore';
import { useIsMobile } from '../hooks/useViewport';

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
 * 把**整個視窗**夾在畫面內，與背包／技能／裝備欄（`FloatingWindow` 的 clamp）同語意。
 *
 * 改版前這裡只保證「留 40px 在畫面上」，允許把視窗大半拖出畫面。但 `.game-layout`
 * 是 `overflow: hidden`，露在外面的部分是被**裁掉**而不是可以捲過去 ——
 * 等於玩家能把日誌內容拖到看不見，那不是「收到邊邊」而是弄丟它。
 *
 * 視窗比畫面還大時 `max` 會是負值，故先夾到 0：寧可下緣超出，也不能讓標題列
 * （唯一的拖曳把手）跑到畫面外。
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
 * 與 `clampLogPosition` 分開的理由：
 *  - 拖曳允許把視窗收到只剩 40px 露出（刻意的，想把它塞到邊邊）
 *  - 改變大小不是玩家在挪位置，長出去的部分應該自動收回來
 *
 * 沒拖曳過時視窗靠 CSS `bottom` 定位，長高自然往上長；但拖曳過之後改用 `top`
 * 定位（`.is-moved` 會把 `bottom` 收掉），長高就變成往下長而衝出畫面底部。
 */
export function resizeLogPosition(
  bottomAnchor: number,
  left: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): LogPosition {
  // 下緣不動算出新的上緣，收進畫面的規則與拖曳共用，不另寫一份
  return clampLogPosition({ left, top: bottomAnchor - size.height }, size, viewport);
}

/**
 * 戰鬥日誌視窗（§ 32.3）。
 *
 * 預設停在畫面左下角，可以拖著標題列移動，位置存在 localStorage。
 * `▲` 循環三段大小，放大時從日誌原位往上長、蓋在遊戲畫面上。
 */
export function CombatLogWindow() {
  /*
   * 手機改成貼在下方 HUD 帶上的抽屜（`47-mobile.md`）：
   * 全寬、不可拖曳。393px 寬的畫面沒有「把視窗挪到不擋路的地方」這種空間，
   * 拖曳只會讓玩家把日誌弄丟。`▲` 的三段高度照舊 ——
   * 放大時蓋住地圖是刻意的設計，不因為換成手機就改掉。
   */
  const isMobile = useIsMobile();
  const [logSize, setLogSize] = useState<0 | 1 | 2>(0);
  const [pos, setPos] = useState<LogPosition | null>(null);
  const [opacity, setOpacity] = useState(80);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 點到就提到最上層（§ 32.15）：日誌與城鎮設施視窗、浮動面板共用同一個堆疊順序
  const zIndex = useWindowZIndex('combat-log');
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPos(loadLogPosition());
    setOpacity(loadLogOpacity());
  }, []);

  /**
   * 讀回來的位置也要夾一次：在 1920 螢幕存的座標，換到 1280 開就整個在畫面外。
   * 必須等 `pos` 套進 DOM 後才量得到實際尺寸，故用 layout effect 而非併進上面那個。
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
    localStorage.setItem(OPACITY_KEY, String(value));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // 介面縮放時指標座標是視窗座標、left/top 是版面座標，統一換算到版面座標再算（§ 34.6）
    const scale = getElementScale(ref.current);
    dragOffset.current = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isMobile]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    const box = ref.current?.getBoundingClientRect();
    if (!offset || !box) return;
    const scale = getElementScale(ref.current);
    const next = clampLogPosition(
      { left: e.clientX / scale - offset.x, top: e.clientY / scale - offset.y },
      { width: box.width / scale, height: box.height / scale },
      { width: window.innerWidth / scale, height: window.innerHeight / scale },
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
    localStorage.removeItem(POSITION_KEY);
    setPos(null);
  }, []);

  return (
    <div
      ref={ref}
      className={`hud combat-log-window ${isMobile ? 'is-drawer' : pos ? 'is-moved' : ''}`}
      onPointerDown={() => focusWindow('combat-log')}
      style={{
        zIndex,
        /* 抽屜的位置由 CSS 決定：inline style 壓過 class，
           留著桌機拖曳存下來的座標會讓抽屜停在畫面中間 */
        ...(pos && !isMobile ? { left: pos.left, top: pos.top } : {}),
        ['--log-alpha' as string]: String(opacityToAlpha(opacity)),
      }}
    >
      <div
        className="combat-log-title"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={resetPosition}
        title={isMobile ? undefined : '拖曳移動；雙擊回到左下角'}
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
          onClick={handleResizeClick}
          title="調整 Log 大小"
        >
          {logSize === 0 ? '▲' : logSize === 1 ? '▲▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
