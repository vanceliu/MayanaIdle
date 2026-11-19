/**
 * 星盤未點點數徽章 demo（`star-badge.html`）：調整等級與已點數，看底部面板列的徽章。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelDock } from '../src/components/PanelDock';
import { useGameStore } from '../src/stores/gameStore';
import { STAR_CHART_UNLOCK_LEVEL, STAR_NODES, starPoints } from '../src/models/starChart';
import type { Character } from '../src/models/character';

function setCharacter(level: number, spent: number) {
  const starChart = STAR_NODES.slice(0, spent).map(n => n.id);
  useGameStore.setState({ character: { className: 'elf', level, starChart, quests: [] } as unknown as Character });
}

const START = { level: 33, spent: 1 };
setCharacter(START.level, START.spent);

function Demo() {
  const [level, setLevel] = useState(START.level);
  const [spent, setSpent] = useState(START.spent);
  const points = starPoints(level);
  const used = Math.min(spent, points);
  const update = (nextLevel: number, nextSpent: number) => {
    setLevel(nextLevel);
    setSpent(nextSpent);
    setCharacter(nextLevel, Math.min(nextSpent, starPoints(nextLevel)));
  };

  return (
    <>
      <div className="demo-controls">
        <label>等級 <input type="range" min={1} max={120} value={level} onChange={e => update(Number(e.target.value), spent)} /> Lv{level}</label>
        <label>
          已點 <input type="range" min={0} max={Math.max(points, 1)} value={used} disabled={level < STAR_CHART_UNLOCK_LEVEL} onChange={e => update(level, Number(e.target.value))} />
          {used} / {points}
        </label>
      </div>
      <div className="demo-dock"><PanelDock /></div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
