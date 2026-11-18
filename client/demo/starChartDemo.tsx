/**
 * 星盤第一版（`star-chart.html`，`56-star-chart.md`）：配點／退點、洗點費用、加成合計。
 * 盤面與數值取自 `starChartData.ts`，全部暫定。
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CLASS_NAME, CLASS_ORDER, LEVEL_CAP, SKILL_LEVEL_CAP, STAR_CHART_UNLOCK_LEVEL, starPoints,
  buildStarChart, refundCostPerPoint,
} from './starChartData';
import type { ClassId, StarNode, StatEffect } from './starChartData';

const CHART = buildStarChart();
const NODE_BY_ID = new Map(CHART.nodes.map(n => [n.id, n]));
const ADJ = new Map<string, string[]>(CHART.nodes.map(n => [n.id, []]));
for (const [a, b] of CHART.edges) {
  ADJ.get(a)!.push(b);
  ADJ.get(b)!.push(a);
}

const KIND_LABEL: Record<StarNode['kind'], string> = {
  start: '起點', point: '星點', constellation: '星座', keystone: '命星',
};
const NODE_RADIUS: Record<StarNode['kind'], number> = {
  start: 16, point: 7, constellation: 12, keystone: 16,
};
const BOARD_HALF = 940;

const startOf = (c: ClassId) => `${c}-start`;

/** 節點顏色依屬性效果：單一屬性為該色，兩種屬性左右各半，其餘白色 */
const ATTR_COLOR_KEYS = ['str', 'agi', 'int', 'spi', 'vit'];
function nodeAttrs(n: StarNode): string[] {
  const attrs = n.effects.map(e => e.key.replace(/^attr:/, '')).filter(k => ATTR_COLOR_KEYS.includes(k));
  return [...new Set(attrs)].slice(0, 2);
}
const mixId = ([a, b]: string[]) => `star-mix-${a}-${b}`;
function nodeFill(n: StarNode): string {
  const attrs = nodeAttrs(n);
  if (attrs.length === 2) return `url(#${mixId(attrs)})`;
  return `var(--star-${attrs[0] ?? 'other'})`;
}
const MIX_PAIRS = [...new Map(CHART.nodes.map(nodeAttrs).filter(a => a.length === 2).map(a => [mixId(a), a])).values()];
const fmt = (e: Pick<StatEffect, 'value' | 'unit'>) => `${e.value > 0 ? '+' : ''}${e.value}${e.unit}`;

/** 從已點集合出發到 target 的最短路徑（不含已點節點）；不可達回 null */
function pathTo(target: string, allocated: Set<string>): string[] | null {
  if (allocated.has(target)) return [];
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const id of allocated) {
    prev.set(id, null);
    queue.push(id);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) break;
    for (const nb of ADJ.get(cur)!) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      queue.push(nb);
    }
  }
  if (!prev.has(target)) return null;
  const path: string[] = [];
  for (let cur: string | null = target; cur !== null && !allocated.has(cur); cur = prev.get(cur) ?? null) {
    path.unshift(cur);
  }
  return path;
}

/** 退掉 target 後，連同與起點斷開的節點一起移除的清單 */
function refundSet(target: string, allocated: Set<string>, start: string): string[] {
  const kept = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of ADJ.get(cur)!) {
      if (nb === target || kept.has(nb) || !allocated.has(nb)) continue;
      kept.add(nb);
      queue.push(nb);
    }
  }
  return [...allocated].filter(id => !kept.has(id));
}

/** 他職業的職業魔法節點對本職業不生效 */
function isEffective(effect: StatEffect, node: StarNode, classId: ClassId): boolean {
  if (effect.key.startsWith('skill:')) return node.classId === classId;
  return true;
}

interface SummaryRow { key: string; label: string; value: number; unit: StatEffect['unit']; effective: boolean }

function summarize(allocated: Set<string>, classId: ClassId) {
  const rows = new Map<string, SummaryRow>();
  const rules: { name: string; rules: string[] }[] = [];
  for (const id of allocated) {
    const node = NODE_BY_ID.get(id)!;
    if (node.rules) rules.push({ name: node.name, rules: node.rules });
    for (const e of node.effects) {
      const effective = isEffective(e, node, classId);
      const key = `${e.key}|${effective}`;
      const row = rows.get(key);
      if (row) row.value += e.value;
      else rows.set(key, { key, label: e.label, value: e.value, unit: e.unit, effective });
    }
  }
  const all = [...rows.values()];
  return {
    attrs: all.filter(r => r.key.startsWith('attr:')),
    stats: all.filter(r => !/^(attr|skill|magic):/.test(r.key)),
    skills: all.filter(r => /^(skill|magic):/.test(r.key)),
    rules,
  };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** 隨技能等級變動的數字標黃（`56-star-chart.md` § 56.5） */
function highlightNumbers(text: string) {
  return text.split(/([×+−-]?\d+(?:\.\d+)?%?)/).map((part, i) =>
    i % 2 === 1 ? <span key={i} className="star-changed">{part}</span> : part);
}

/** 技能等級列顯示羅馬數字，其餘照原值 */
function describeRow(r: SummaryRow): string {
  const skill = /^(?:skill|magic):(.+):level\|/.exec(r.key);
  if (!skill) return `${r.label} ${fmt(r)}`;
  const name = skill[1];
  const level = Math.min(1 + r.value, SKILL_LEVEL_CAP);
  return `${name}(${ROMAN[level - 1]})`;
}

function SummaryList({ title, rows }: { title: string; rows: SummaryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h3 className="star-sum-title">{title}</h3>
      <ul className="star-sum-list">
        {rows.map(r => (
          <li key={r.key} className={r.effective ? '' : 'is-inert'}>
            {/^(skill|magic):/.test(r.key) ? highlightNumbers(describeRow(r)) : describeRow(r)}{r.effective ? '' : '（不生效）'}
          </li>
        ))}
      </ul>
    </>
  );
}

interface View { scale: number; tx: number; ty: number }
const INITIAL_VIEW: View = { scale: 1, tx: 0, ty: 0 };

function App() {
  const [classId, setClassId] = useState<ClassId>('knight');
  const [level, setLevel] = useState(75);
  const [allocated, setAllocated] = useState<Set<string>>(() => new Set([startOf('knight')]));
  const [refundGold, setRefundGold] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>(INITIAL_VIEW);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const lastPointerType = useRef('mouse');
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      setBoardSize({ width: rect.width, height: rect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const start = startOf(classId);
  const used = allocated.size;
  const points = starPoints(level);
  const remaining = points - used;
  const costPerPoint = refundCostPerPoint(level);

  const focus = focusId ? NODE_BY_ID.get(focusId)! : null;
  const preview = useMemo(() => {
    if (!focusId) return { path: [] as string[], removal: [] as string[] };
    if (allocated.has(focusId)) {
      return { path: [], removal: focusId === start ? [] : [focusId, ...refundSet(focusId, allocated, start).filter(id => id !== focusId)] };
    }
    return { path: pathTo(focusId, allocated) ?? [], removal: [] };
  }, [focusId, allocated, start]);
  const pathSet = new Set(preview.path);
  const removalSet = new Set(preview.removal);
  const reachable = useMemo(() => {
    const set = new Set<string>();
    for (const id of allocated) for (const nb of ADJ.get(id)!) if (!allocated.has(nb)) set.add(nb);
    return set;
  }, [allocated]);

  const summary = useMemo(() => summarize(allocated, classId), [allocated, classId]);

  function changeClass(c: ClassId) {
    setClassId(c);
    setAllocated(new Set([startOf(c)]));
    setRefundGold(0);
    setFocusId(null);
    setMessage('');
  }

  function resetAll() {
    const count = allocated.size - 1;
    if (count === 0) return;
    setRefundGold(g => g + count * costPerPoint);
    setAllocated(new Set([start]));
    setMessage(`全部重置：退回 ${count} 點，花費 ${(count * costPerPoint).toLocaleString()} 金幣`);
  }

  function activate(id: string) {
    if (lastPointerType.current === 'touch' && focusId !== id) {
      setFocusId(id);
      return;
    }
    setFocusId(id);
    if (allocated.has(id)) {
      if (id === start) return setMessage('職業起點不可退回');
      const removed = [id, ...refundSet(id, allocated, start).filter(x => x !== id)];
      const next = new Set(allocated);
      removed.forEach(x => next.delete(x));
      setAllocated(next);
      setRefundGold(g => g + removed.length * costPerPoint);
      setMessage(`退回 ${removed.length} 點，花費 ${(removed.length * costPerPoint).toLocaleString()} 金幣`);
      return;
    }
    const path = pathTo(id, allocated);
    if (!path) return setMessage('無法到達');
    if (path.length > remaining) return setMessage(`需要 ${path.length} 點，剩餘 ${Math.max(0, remaining)} 點`);
    setAllocated(new Set([...allocated, ...path]));
    setMessage(path.length > 1 ? `沿路點了 ${path.length} 點` : '');
  }

  function toBoard(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const k = (BOARD_HALF * 2) / size;
    return { x: (clientX - rect.left - rect.width / 2) * k, y: (clientY - rect.top - rect.height / 2) * k };
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    const p = toBoard(e.clientX, e.clientY);
    setView(v => {
      const scale = Math.min(4, Math.max(0.5, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const r = scale / v.scale;
      return { scale, tx: p.x - (p.x - v.tx) * r, ty: p.y - (p.y - v.ty) * r };
    });
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    lastPointerType.current = e.pointerType;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || e.buttons === 0) return;
    const a = toBoard(d.x, d.y);
    const b = toBoard(e.clientX, e.clientY);
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    if (!d.moved) svgRef.current!.setPointerCapture(e.pointerId);
    d.moved = true;
    setView(v => ({ ...v, tx: d.tx + b.x - a.x, ty: d.ty + b.y - a.y }));
  }
  function onPointerUp() {
    setTimeout(() => { drag.current = null; }, 0);
  }
  const zoom = (f: number) => setView(v => ({ ...v, scale: Math.min(4, Math.max(0.5, v.scale * f)) }));

  function nodeState(n: StarNode): string {
    if (allocated.has(n.id)) return removalSet.has(n.id) ? 'is-removing' : 'is-allocated';
    if (pathSet.has(n.id)) return 'is-path';
    if (reachable.has(n.id)) return 'is-reachable';
    return '';
  }
  function edgeState(a: string, b: string): string {
    if (removalSet.has(a) || removalSet.has(b)) {
      if (allocated.has(a) && allocated.has(b)) return 'is-removing';
    }
    if (allocated.has(a) && allocated.has(b)) return 'is-allocated';
    const onPath = (x: string) => pathSet.has(x) || allocated.has(x);
    if ((pathSet.has(a) || pathSet.has(b)) && onPath(a) && onPath(b)) return 'is-path';
    return '';
  }

  /** 節點在 .star-board 內的像素位置；依所在象限往盤面內側展開 */
  function tooltipStyle(n: StarNode): CSSProperties {
    const rect = boardSize;
    if (rect.width === 0) return { display: 'none' };
    const k = (BOARD_HALF * 2) / Math.min(rect.width, rect.height);
    const px = rect.width / 2 + (view.tx + view.scale * n.x) / k;
    const py = rect.height / 2 + (view.ty + view.scale * n.y) / k;
    const gap = (NODE_RADIUS[n.kind] * view.scale) / k + 8;
    const right = px > rect.width / 2;
    const below = py < rect.height / 2;
    return {
      left: px,
      top: py,
      transform: `translate(${right ? `calc(-100% - ${gap}px)` : `${gap}px`}, ${below ? `${gap}px` : `calc(-100% - ${gap}px)`})`,
    };
  }

  function focusStatus(n: StarNode): string {
    if (allocated.has(n.id)) {
      if (n.id === start) return '職業起點（Lv1 固定點）';
      return `已點。退回會移除 ${preview.removal.length} 點，花費 ${(preview.removal.length * costPerPoint).toLocaleString()} 金幣`;
    }
    const need = preview.path.length;
    if (need === 0) return '無法到達';
    return need <= remaining ? `需要 ${need} 點` : `需要 ${need} 點（點數不足）`;
  }

  return (
    <div className="star-layout">
      <div className="star-board">
        <svg
          ref={svgRef}
          viewBox={`${-BOARD_HALF} ${-BOARD_HALF} ${BOARD_HALF * 2} ${BOARD_HALF * 2}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setFocusId(f => (lastPointerType.current === 'mouse' ? null : f))}
        >
          <defs>
            {MIX_PAIRS.map(pair => (
              <linearGradient key={mixId(pair)} id={mixId(pair)}>
                <stop offset="50%" style={{ stopColor: `var(--star-${pair[0]})` }} />
                <stop offset="50%" style={{ stopColor: `var(--star-${pair[1]})` }} />
              </linearGradient>
            ))}
          </defs>
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {CHART.edges.map(([a, b]) => {
              const na = NODE_BY_ID.get(a)!;
              const nb = NODE_BY_ID.get(b)!;
              return <line key={`${a}|${b}`} className={`star-edge ${edgeState(a, b)}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} />;
            })}
            {CHART.nodes.map(n => (
              <g
                key={n.id}
                data-id={n.id}
                className={`star-node kind-${n.kind} ${nodeState(n)} ${n.id === start ? 'is-own-start' : ''}`}
                transform={`translate(${n.x} ${n.y})`}
                onPointerEnter={e => { if (e.pointerType === 'mouse') setFocusId(n.id); }}
                onClick={() => { if (!drag.current?.moved) activate(n.id); }}
              >
                {n.kind === 'keystone' && <circle className="star-node-halo" r={NODE_RADIUS.keystone + 6} />}
                <circle r={NODE_RADIUS[n.kind]} style={{ fill: nodeFill(n) }} />
                {(n.kind !== 'point' || n.showLabel) && (
                  <text className="star-node-label" y={NODE_RADIUS[n.kind] + 16}>
                    {n.kind === 'start' ? CLASS_NAME[n.classId!] : n.name}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
        {focus && (
          <div className="star-tooltip" style={tooltipStyle(focus)}>
            <h2>{focus.name}<span className="star-kind">{KIND_LABEL[focus.kind]}</span></h2>
            <ul className="star-sum-list">
              {focus.effects.map(e => (
                <li key={e.key} className={isEffective(e, focus, classId) ? '' : 'is-inert'}>
                  {e.label} {fmt(e)}{isEffective(e, focus, classId) ? '' : '（不生效）'}
                </li>
              ))}
              {focus.rules?.map(r => <li key={r}>{r}</li>)}
            </ul>
            <p className="star-status">{focusStatus(focus)}</p>
          </div>
        )}
        <div className="star-zoom">
          <button className="btn-secondary" onClick={() => zoom(1.25)}>＋</button>
          <button className="btn-secondary" onClick={() => zoom(0.8)}>－</button>
          <button className="btn-secondary" onClick={() => setView(INITIAL_VIEW)}>重置視角</button>
        </div>
      </div>

      <aside className="star-side">
        <section className="demo-card">
          <div className="star-class-tabs">
            {CLASS_ORDER.map(c => (
              <button key={c} className={c === classId ? 'btn-primary' : 'btn-secondary'} onClick={() => changeClass(c)}>
                {CLASS_NAME[c]}
              </button>
            ))}
          </div>
          <label className="star-level">
            角色等級 <strong>{level}</strong>
            <input type="range" min={STAR_CHART_UNLOCK_LEVEL} max={LEVEL_CAP} value={level} onChange={e => setLevel(Number(e.target.value))} />
          </label>
          <p className="star-points">
            星點 <strong>{used}</strong> / {points}
            {remaining < 0 && <span className="star-warn">　超出 {-remaining} 點</span>}
          </p>
          <p className="star-points">
            洗點費用：每點 {costPerPoint.toLocaleString()} 金幣　累計 {refundGold.toLocaleString()}
          </p>
          <button className="btn-danger" onClick={resetAll}>全部重置</button>
          {message && <p className="star-msg">{message}</p>}
        </section>

        <section className="demo-card">
          <h2>加成合計</h2>
          <SummaryList title="屬性" rows={summary.attrs} />
          <SummaryList title="數值" rows={summary.stats} />
          <SummaryList title="技能" rows={summary.skills} />
          {summary.rules.length > 0 && (
            <>
              <h3 className="star-sum-title">命星</h3>
              <ul className="star-sum-list">
                {summary.rules.map(k => <li key={k.name}>{k.name}：{k.rules.join('；')}</li>)}
              </ul>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
