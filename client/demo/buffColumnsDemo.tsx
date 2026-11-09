/**
 * BuffBar 兩欄（`buff-columns.html`）：回鍋加倍 → buff → debuff 直向填滿一欄再換欄，兩欄滿時最後一格為「+N」。
 * 每欄格數與 +N 用遊戲的 `useBuffColumns`；格高依 `.buff-icon` 盒模型換算（padding 3×2、框線 1×2、秒數上距 2）。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameIcon } from '../src/components/GameIcon';
import { getEffectIcon } from '../src/models/iconMap';
import { buffRowsPerColumn, splitBuffOverflow } from '../src/hooks/useBuffColumns';

const DESKTOP_ICON_SIZE = 36;
const DESKTOP_TIMER_FONT_SIZE = 13;

const BUFF_CATEGORIES = [
  'speed', 'accuracy', 'crit-buff', 'fire-enchant', 'defense-buff',
  'blood-mana', 'evasion', 'mana-shield', 'weapon-bless', 'holy-shield',
];
const DEBUFF_CATEGORIES = ['poisoned', 'bleeding', 'stun', 'slow', 'silence', 'defense-down'];
const TIMERS = ['14:23', '9:24', '4:24', '4:24', '9:24', '4:35', '2:10', '58s', '1:05', '30s'];

interface Slot {
  key: string;
  kind: 'rested' | 'buff' | 'debuff';
  icon: string;
  timer: string;
}

interface Layout {
  iconSize: number;
  timerFontSize: number;
  gap: number;
  /** BuffBar 上緣到往下排的界線 */
  available: number;
}

function slotHeight({ iconSize, timerFontSize }: Layout): number {
  return iconSize + 6 + 2 + 2 + timerFontSize;
}

function buildSlots(rested: boolean, buffCount: number, debuffCount: number): Slot[] {
  const slots: Slot[] = [];
  if (rested) slots.push({ key: 'rested', kind: 'rested', icon: 'items/hourglass', timer: '11:59:23' });
  for (let i = 0; i < buffCount; i++) {
    const category = BUFF_CATEGORIES[i % BUFF_CATEGORIES.length];
    slots.push({ key: `b${i}`, kind: 'buff', icon: getEffectIcon(category), timer: TIMERS[i % TIMERS.length] });
  }
  for (let i = 0; i < debuffCount; i++) {
    const category = DEBUFF_CATEGORIES[i % DEBUFF_CATEGORIES.length];
    slots.push({ key: `d${i}`, kind: 'debuff', icon: getEffectIcon(category), timer: TIMERS[(i + 3) % TIMERS.length] });
  }
  return slots;
}

function BuffColumns({ slots, layout }: { slots: Slot[]; layout: Layout }) {
  const perColumn = buffRowsPerColumn({ top: 0, bottom: layout.available, slotHeight: slotHeight(layout), gap: layout.gap });
  const { visible, overflow } = splitBuffOverflow(slots, perColumn);
  const boxWidth = layout.iconSize + 8;
  const timerStyle = { fontSize: layout.timerFontSize };

  return (
    <div
      className="demo-buff-grid"
      style={{ gridTemplateRows: `repeat(${perColumn}, auto)`, gap: layout.gap }}
    >
      {visible.map(slot => (
        <div
          key={slot.key}
          className={`buff-icon is-${slot.kind}`}
          style={slot.kind === 'rested' ? { minWidth: boxWidth } : { width: boxWidth }}
        >
          <GameIcon name={slot.icon} size={layout.iconSize} />
          <span className="buff-timer" style={timerStyle}>{slot.timer}</span>
        </div>
      ))}
      {overflow > 0 && <div className="buff-overflow">+{overflow}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <output>{value}</output>
    </label>
  );
}

const MOBILE_WIDTH = 390;
const MOBILE_STATUS_HEIGHT = 144;
const DESKTOP_STATUS_HEIGHT = 150;

function App() {
  const [rested, setRested] = useState(true);
  const [buffCount, setBuffCount] = useState(8);
  const [debuffCount, setDebuffCount] = useState(3);

  const [mobileIcon, setMobileIcon] = useState(28);
  const [mobileTimerFs, setMobileTimerFs] = useState(11);
  const [mobileGap, setMobileGap] = useState(4);
  const [mobileHeight, setMobileHeight] = useState(740);
  const [mobileLogTop, setMobileLogTop] = useState(607);

  const [desktopHeight, setDesktopHeight] = useState(860);
  const [desktopLogTop, setDesktopLogTop] = useState(640);

  const slots = buildSlots(rested, buffCount, debuffCount);
  const mobileBarTop = 6 + MOBILE_STATUS_HEIGHT + 6;
  const desktopBarTop = 6 + DESKTOP_STATUS_HEIGHT + 6;
  const params = {
    mobile: { iconSize: mobileIcon, timerFontSize: mobileTimerFs, gap: mobileGap },
    desktop: { iconSize: DESKTOP_ICON_SIZE, timerFontSize: DESKTOP_TIMER_FONT_SIZE, gap: 6 },
  };
  const [copied, setCopied] = useState(false);

  return (
    <>
      <div className="demo-controls">
        <h3>效果數量</h3>
        <label>
          <span>回鍋加倍</span>
          <input type="checkbox" checked={rested} onChange={e => setRested(e.target.checked)} />
        </label>
        <Slider label="buff 數" value={buffCount} min={0} max={10} onChange={setBuffCount} />
        <Slider label="debuff 數" value={debuffCount} min={0} max={6} onChange={setDebuffCount} />

        <h3>手機（≤767px）</h3>
        <Slider label="圖示邊長 px" value={mobileIcon} min={18} max={36} onChange={setMobileIcon} />
        <Slider label="秒數字級 px" value={mobileTimerFs} min={8} max={13} onChange={setMobileTimerFs} />
        <Slider label="格間距 px" value={mobileGap} min={0} max={8} onChange={setMobileGap} />
        <Slider label="畫面高度 px" value={mobileHeight} min={560} max={900} onChange={setMobileHeight} />
        <Slider label="戰鬥紀錄上緣 px" value={mobileLogTop} min={400} max={mobileHeight - 40} onChange={setMobileLogTop} />

        <h3>桌機（圖示 36px 不變）</h3>
        <Slider label="畫面高度 px" value={desktopHeight} min={600} max={1100} onChange={setDesktopHeight} />
        <Slider label="戰鬥紀錄上緣 px" value={desktopLogTop} min={300} max={desktopHeight - 40} onChange={setDesktopLogTop} />

        <div className="demo-export">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(() => setCopied(true));
            }}
          >
            匯出參數{copied ? '（已複製）' : ''}
          </button>
          <pre>{JSON.stringify(params)}</pre>
        </div>
      </div>

      <div className="demo-frames">
        <div className="demo-frame-wrap">
          <h2>手機 {MOBILE_WIDTH}×{mobileHeight}</h2>
          <div className="demo-frame" style={{ width: MOBILE_WIDTH, height: mobileHeight }}>
            <div className="demo-status" style={{ width: MOBILE_WIDTH / 2 - 11, height: MOBILE_STATUS_HEIGHT }}>狀態卡</div>
            <div className="demo-selector" style={{ width: MOBILE_WIDTH / 2 - 11 }}>目前: 百柱塔</div>
            <div className="demo-bar-pos" style={{ top: mobileBarTop }}>
              <BuffColumns slots={slots} layout={{ ...params.mobile, available: mobileLogTop - mobileBarTop }} />
            </div>
            <div className="demo-log" style={{ top: mobileLogTop }}>戰鬥紀錄</div>
          </div>
        </div>

        <div className="demo-frame-wrap">
          <h2>桌機 520×{desktopHeight}</h2>
          <div className="demo-frame" style={{ width: 520, height: desktopHeight }}>
            <div className="demo-status" style={{ width: 340, height: DESKTOP_STATUS_HEIGHT }}>狀態卡</div>
            <div className="demo-bar-pos" style={{ top: desktopBarTop }}>
              <BuffColumns slots={slots} layout={{ ...params.desktop, available: desktopLogTop - desktopBarTop }} />
            </div>
            <div className="demo-log" style={{ top: desktopLogTop, right: 'auto', width: 360 }}>戰鬥紀錄</div>
          </div>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
