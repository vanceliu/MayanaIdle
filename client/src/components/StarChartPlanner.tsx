/**
 * 星盤配點模擬（Wiki 星盤頁、`demo/star-chart.html`）：任選職業與等級試點，不存檔。
 */
import { useState } from 'react';
import {
  STAR_CHART_UNLOCK_LEVEL, STAR_CLASS_ORDER, exceedsKeystoneCap, KEYSTONE_CAP, starPathTo, starPoints, starRefundCostPerPoint, starRefundSet, starStartNodeId,
} from '../models/starChart';
import { CLASS_NAMES_ZH, type ClassName } from '../models/character';
import { LEVEL_CAP } from '../systems/levelUp';
import { StarChartBoard } from './StarChartBoard';
import { StarChartSummary } from './StarChartPanel';

export function StarChartPlanner({ initialLevel = 75 }: { initialLevel?: number }) {
  const [classId, setClassId] = useState<ClassName>('knight');
  const [level, setLevel] = useState(initialLevel);
  const [allocated, setAllocated] = useState<Set<string>>(() => new Set([starStartNodeId('knight')]));
  const [message, setMessage] = useState('');

  const points = starPoints(level);
  const remaining = points - allocated.size;
  const costPerPoint = starRefundCostPerPoint(level);

  function changeClass(c: ClassName) {
    setClassId(c);
    setAllocated(new Set([starStartNodeId(c)]));
    setMessage('');
  }

  function activate(id: string, action: 'allocate' | 'refund') {
    if (action === 'refund') {
      const removed = new Set(starRefundSet(id, allocated, classId));
      setAllocated(new Set([...allocated].filter(x => !removed.has(x))));
      setMessage(`取消 ${removed.size} 點（遊戲內洗點費 ${(removed.size * costPerPoint).toLocaleString()} 金幣）`);
      return;
    }
    const path = starPathTo(id, allocated);
    if (!path) return setMessage('無法到達');
    if (path.length > remaining) return setMessage(`需要 ${path.length} 點，剩餘 ${Math.max(0, remaining)} 點`);
    if (exceedsKeystoneCap(path, allocated)) return setMessage(`命星最多 ${KEYSTONE_CAP} 顆`);
    setAllocated(new Set([...allocated, ...path]));
    setMessage(path.length > 1 ? `沿路點了 ${path.length} 點` : '');
  }

  return (
    <div className="star-planner">
      <div className="star-planner-bar">
        <span className="star-planner-classes">
          {STAR_CLASS_ORDER.map(c => (
            <button key={c} className={c === classId ? 'btn-primary' : 'btn-secondary'} onClick={() => changeClass(c)}>
              {CLASS_NAMES_ZH[c]}
            </button>
          ))}
        </span>
        <label className="star-planner-level">
          角色等級 <strong>{level}</strong>
          <input type="range" min={STAR_CHART_UNLOCK_LEVEL} max={LEVEL_CAP} value={level} onChange={e => setLevel(Number(e.target.value))} />
        </label>
        <span>
          星點 <strong>{allocated.size}</strong> / {points}
          {remaining < 0 && <span className="star-warn">　超出 {-remaining} 點</span>}
        </span>
        <button className="btn-secondary" onClick={() => changeClass(classId)}>全部重置</button>
        {message && <span className="star-msg">{message}</span>}
      </div>
      <div className="star-panel-body">
        <StarChartBoard classId={classId} allocated={allocated} remaining={remaining} costPerPoint={costPerPoint} onActivate={activate} />
        <StarChartSummary classId={classId} allocated={allocated} />
      </div>
    </div>
  );
}
