/**
 * 探索列 Pressure 顯示（`pressure.html`）：ExploreBar 的版面樣本，Pressure 由 `calculatePressure` 計算。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculatePressure, getNextPressureKills } from '../src/systems/pressure';
import { formatPressureTitle } from '../src/components/ExploreBar';

type DemoPhase = 'explore' | 'combat' | 'manual';

function DemoExploreBar({ kills, rate, phase }: { kills: number; rate: number; phase: DemoPhase }) {
  const { pressure } = calculatePressure(kills, rate);
  const tip = formatPressureTitle(kills, getNextPressureKills(pressure, rate));
  const searchMode = phase === 'manual' ? 'manual' : 'auto';
  return (
    <div className="battle-top-bar">
      <div className="explore-bar">
        <div className="search-mode-toggle">
          <button className={searchMode === 'auto' ? 'active' : ''}>自動搜尋</button>
          <button className={searchMode === 'manual' ? 'active' : ''}>手動搜尋</button>
        </div>
        <span className="pressure-badge" title={tip}>P{pressure}</span>
        {phase === 'explore' && <span className="explore-indicator">探索中...</span>}
        {phase === 'combat' && <span className="explore-indicator combat-indicator">戰鬥中</span>}
        <span className="area-elapsed" title="待在這張地圖的時間">12:34</span>
      </div>
    </div>
  );
}

function readControls() {
  return {
    kills: Number((document.getElementById('kills') as HTMLInputElement).value),
    rate: Number((document.getElementById('rate') as HTMLSelectElement).value),
    phase: (document.getElementById('phase') as HTMLSelectElement).value as DemoPhase,
  };
}

function Demo() {
  const [state, setState] = useState(readControls);

  useEffect(() => {
    const update = () => setState(readControls());
    const ids = ['kills', 'rate', 'phase'];
    ids.forEach(id => document.getElementById(id)!.addEventListener('input', update));
    return () => ids.forEach(id => document.getElementById(id)!.removeEventListener('input', update));
  }, []);

  useEffect(() => {
    const { pressure } = calculatePressure(state.kills, state.rate);
    document.getElementById('kills-label')!.textContent = `${state.kills.toLocaleString()}（P${pressure}）`;
  }, [state]);

  return (
    <div className="demo-stage">
      <h2>桌機</h2>
      <div className="demo-desktop"><DemoExploreBar {...state} /></div>
      <h2>手機寬（393px）</h2>
      <div className="demo-mobile"><DemoExploreBar {...state} /></div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
