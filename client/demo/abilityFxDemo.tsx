/**
 * 隨機技能演出（`ability-fx.html`）：追打的浮動數字、怒氣與平靜在狀態列的數值。
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Application } from 'pixi.js';
import { DamageNumberManager } from '../src/pixi/ui/DamageNumber';
import { GameIcon } from '../src/components/GameIcon';
import { Tooltip } from '../src/components/Tooltip';
import { getAbilityMeterValue, RAGE_DECAY_STAT, CALM_RATE_STAT } from '../src/models/abilityMeter';
import type { ActiveEffect } from '../src/models/effect';

const WIDTH = 360;
const HEIGHT = 180;

function DamageStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const damageRef = useRef<DamageNumberManager | null>(null);

  // 每次掛載各建一張畫布；StrictMode 會先卸載再掛載，初始化完成前不可 destroy
  useEffect(() => {
    const canvas = document.createElement('canvas');
    hostRef.current!.appendChild(canvas);
    const app = new Application();
    const damage = new DamageNumberManager();
    let alive = true;
    const ready = app.init({ canvas, width: WIDTH, height: HEIGHT, background: 0x0d0d20, antialias: true }).then(() => {
      if (!alive) return;
      app.stage.addChild(damage.container);
      app.ticker.add(t => damage.update(t.deltaMS));
      damageRef.current = damage;
    });
    return () => {
      alive = false;
      damageRef.current = null;
      void ready.then(() => app.destroy()).finally(() => canvas.remove());
    };
  }, []);

  function play() {
    const damage = damageRef.current;
    if (!damage) return;
    const base = [42, 38, 45, 40];
    base.forEach((v, i) => setTimeout(() => damage.spawn(WIDTH / 2, HEIGHT - 50, v, 'normal'), i * 450));
    setTimeout(() => damage.spawn(WIDTH / 2, HEIGHT - 50, 63, 'combo'), base.length * 450);
    setTimeout(() => damage.spawn(WIDTH / 2, HEIGHT - 50, 126, 'crit'), (base.length + 1) * 450);
  }

  return (
    <>
      <div className="demo-bar"><button onClick={play}>普攻 ×6（第 5 下追打、第 6 下爆擊對照）</button></div>
      <div ref={hostRef} />
    </>
  );
}

function MeterIcon({ effect, icon, now, desc }: { effect: ActiveEffect; icon: string; now: number; desc: string }) {
  const value = getAbilityMeterValue(effect, now) ?? 0;
  return (
    <Tooltip
      position="bottom"
      content={
        <div className="buff-tooltip-content">
          <div className="buff-tooltip-name">{effect.name} {value}</div>
          <div className="buff-tooltip-desc">{desc}</div>
          <div className="buff-tooltip-source">來源: 飾品隨機技能</div>
        </div>
      }
    >
      <div className="buff-icon is-buff">
        <GameIcon name={icon} size={28} />
        <span className="buff-timer">{value}</span>
      </div>
    </Tooltip>
  );
}

function MeterBar() {
  const [elapsed, setElapsed] = useState(0);
  const rage: ActiveEffect = {
    id: 'rage', sourceSkillId: 'rage', sourceSkillName: '怒氣', category: 'ability-rage', type: 'buff', target: 'player',
    modifiers: [{ stat: RAGE_DECAY_STAT, value: 10, isPercent: false }], startTime: 0, duration: 8000, tags: [], name: '怒氣', description: '',
  };
  const calm: ActiveEffect = {
    id: 'calm', sourceSkillId: 'calm', sourceSkillName: '平靜', category: 'ability-calm', type: 'buff', target: 'player',
    modifiers: [{ stat: CALM_RATE_STAT, value: 7, isPercent: false }], startTime: 0, duration: 3_600_000, tags: [], name: '平靜', description: '',
  };
  return (
    <>
      <div className="demo-bar">
        <label>經過 <input type="range" min={0} max={16000} step={500} value={elapsed} onChange={e => setElapsed(Number(e.target.value))} /></label>
        <span>{(elapsed / 1000).toFixed(1)} 秒</span>
      </div>
      <div className="buff-bar demo-buff-bar">
        {elapsed < rage.duration && (
          <MeterIcon effect={rage} icon="buffs/fire-shield" now={elapsed} desc="魔法抗性 +10、防禦 +5；每秒減少 10" />
        )}
        <MeterIcon effect={calm} icon="buffs/magic-swirl" now={elapsed} desc="每秒累積 7（上限 100）；被命中時消耗，冷卻中技能縮短同等 %" />
      </div>
      <p className="demo-note">範例：被打一下累積怒氣 80、每秒減少 10，8 秒後歸零圖示消失；平靜每秒 +7，約 15 秒滿 100。</p>
    </>
  );
}

function App() {
  return (
    <div className="demo-grid">
      <div className="demo-card"><h2>追打浮動數字</h2><DamageStage /></div>
      <div className="demo-card"><h2>狀態列：怒氣、平靜</h2><MeterBar /></div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
