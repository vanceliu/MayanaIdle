/**
 * 星盤盤面（`56-star-chart.md`）：SVG 節點與連線、拖曳平移、滾輪縮放、節點 tooltip、篩選（§ 56.7）。
 * 只負責顯示與點擊；配點規則與扣款由呼叫端處理。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import {
  STAR_EDGES, STAR_FLAG_LABEL, STAR_NODES, STAR_NODE_BY_ID,
  isStarEffectActive, starNeighbors, starPathTo, starRefundSet, starStartNodeId,
  type StarEffect, type StarNode,
} from '../models/starChart';
import { CLASS_NAMES_ZH, type ClassName } from '../models/character';
import { STAR_KIND_LABEL, starFilterTerms, starNodeMatches } from '../models/starFilter';

const NODE_RADIUS: Record<StarNode['kind'], number> = {
  start: 16, point: 7, constellation: 12, keystone: 16,
};
const BOARD_HALF = 990;

/** 節點顏色依屬性效果：單一屬性為該色，兩種屬性左右各半，其餘白色（§ 56.6） */
const ATTR_COLOR_KEYS = ['str', 'agi', 'int', 'spi', 'vit'];
function nodeAttrs(n: StarNode): string[] {
  if (n.kind === 'keystone') return [];
  const attrs = n.effects.map(e => e.key.replace(/^attr:/, '').toLowerCase()).filter(k => ATTR_COLOR_KEYS.includes(k));
  return [...new Set(attrs)].slice(0, 2);
}
const mixId = ([a, b]: string[]) => `star-mix-${a}-${b}`;
function nodeFill(n: StarNode): string {
  const attrs = nodeAttrs(n);
  if (attrs.length === 2) return `url(#${mixId(attrs)})`;
  return `var(--star-${attrs[0] ?? 'other'})`;
}
const MIX_PAIRS = [...new Map(STAR_NODES.map(nodeAttrs).filter(a => a.length === 2).map(a => [mixId(a), a])).values()];

export const formatStarEffect = (e: Pick<StarEffect, 'value' | 'unit'>) => `${e.value > 0 ? '+' : ''}${e.value}${e.unit}`;
export const starEffectText = (e: StarEffect) => e.text ?? `${e.label} ${formatStarEffect(e)}`;

interface View { scale: number; tx: number; ty: number }
const INITIAL_VIEW: View = { scale: 1, tx: 0, ty: 0 };

/** 連線與節點各自 memo：平移／縮放只改外層 transform，hover 只重畫狀態有變的那幾個 */
const EdgeLine = memo(function EdgeLine({ a, b, state }: { a: StarNode; b: StarNode; state: string }) {
  return <line className={`star-edge ${state}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
});

interface NodeHandlers {
  onEnter: (id: string, pointerType: string) => void;
  onLeave: (id: string, pointerType: string) => void;
  onClick: (id: string) => void;
}

const NodeDot = memo(function NodeDot({ node, state, handlers }: { node: StarNode; state: string; handlers: NodeHandlers }) {
  return (
    <g
      data-id={node.id}
      className={`star-node kind-${node.kind} ${state}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerEnter={e => handlers.onEnter(node.id, e.pointerType)}
      onPointerLeave={e => handlers.onLeave(node.id, e.pointerType)}
      onClick={() => handlers.onClick(node.id)}
    >
      {node.kind === 'keystone' && <circle className="star-node-halo" r={NODE_RADIUS.keystone + 6} />}
      {state.includes('is-match') && <circle className="star-node-match" r={NODE_RADIUS[node.kind] + 7} />}
      <circle r={NODE_RADIUS[node.kind]} style={{ fill: nodeFill(node) }} />
      {(node.kind !== 'point' || node.showLabel) && (
        <text className="star-node-label" y={NODE_RADIUS[node.kind] + 16}>
          {node.kind === 'start' ? CLASS_NAMES_ZH[node.classId!] : node.name}
        </text>
      )}
    </g>
  );
});

export interface StarChartBoardProps {
  classId: ClassName;
  /** 目前顯示的配點（草稿） */
  allocated: ReadonlySet<string>;
  /** 已確認的配點；有給時草稿新增／取消的節點另外標示，退回已確認節點時顯示洗點費 */
  committed?: ReadonlySet<string>;
  /** 剩餘點數 */
  remaining: number;
  /** 洗點每點費用 */
  costPerPoint: number;
  /** 未開放：只能看，不能點 */
  locked?: boolean;
  /** 點未點的節點＝配點；點已點的節點＝取消 */
  onActivate: (nodeId: string, action: 'allocate' | 'refund') => void;
  /** tooltip 底部的附加內容（技能節點的技能預覽） */
  renderNodeDetail?: (node: StarNode, allocated: ReadonlySet<string>) => ReactNode;
}

export function StarChartBoard({ classId, allocated, committed, remaining, costPerPoint, locked = false, onActivate, renderNodeDetail }: StarChartBoardProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const matches = useMemo(() => {
    const terms = starFilterTerms(filter);
    return terms.length === 0 ? null : new Set(STAR_NODES.filter(n => starNodeMatches(n, terms)).map(n => n.id));
  }, [filter]);
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

  const start = starStartNodeId(classId);
  const focus = focusId ? STAR_NODE_BY_ID.get(focusId)! : null;
  const preview = useMemo(() => {
    if (!focusId || locked) return { path: [] as string[], removal: [] as string[] };
    if (allocated.has(focusId)) {
      return { path: [], removal: focusId === start ? [] : starRefundSet(focusId, allocated, classId) };
    }
    return { path: starPathTo(focusId, allocated) ?? [], removal: [] };
  }, [focusId, allocated, start, classId, locked]);
  const pathSet = new Set(preview.path);
  const removalSet = new Set(preview.removal);
  const reachable = useMemo(() => {
    const set = new Set<string>();
    for (const id of allocated) for (const nb of starNeighbors(id)) if (!allocated.has(nb)) set.add(nb);
    return set;
  }, [allocated]);

  function activate(id: string) {
    if (lastPointerType.current === 'touch' && focusId !== id) {
      setFocusId(id);
      return;
    }
    setFocusId(id);
    if (locked) return;
    if (allocated.has(id)) {
      if (id !== start) onActivate(id, 'refund');
      return;
    }
    onActivate(id, 'allocate');
  }
  const activateRef = useRef(activate);
  useEffect(() => { activateRef.current = activate; });

  const handlers = useMemo<NodeHandlers>(() => ({
    onEnter: (id, pointerType) => { if (pointerType === 'mouse' && !drag.current?.moved) setFocusId(id); },
    // 滑鼠離開節點即收起 tooltip；觸控沿用「點一下看內容」
    onLeave: (id, pointerType) => { if (pointerType === 'mouse') setFocusId(f => (f === id ? null : f)); },
    onClick: id => { if (!drag.current?.moved) activateRef.current(id); },
  }), []);

  function toBoard(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    const k = (BOARD_HALF * 2) / Math.min(rect.width, rect.height);
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
  /** 拖曳位移併到每一幀處理一次 */
  const pendingPan = useRef<{ tx: number; ty: number } | null>(null);
  const panFrame = useRef(0);
  const flushPan = useCallback(() => {
    panFrame.current = 0;
    const p = pendingPan.current;
    if (p) setView(v => ({ ...v, tx: p.tx, ty: p.ty }));
  }, []);
  useEffect(() => () => cancelAnimationFrame(panFrame.current), []);

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || e.buttons === 0) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    const a = toBoard(d.x, d.y);
    const b = toBoard(e.clientX, e.clientY);
    if (!d.moved) {
      svgRef.current!.setPointerCapture(e.pointerId);
      setFocusId(null);
    }
    d.moved = true;
    pendingPan.current = { tx: d.tx + b.x - a.x, ty: d.ty + b.y - a.y };
    if (!panFrame.current) panFrame.current = requestAnimationFrame(flushPan);
  }
  function onPointerUp() {
    setTimeout(() => { drag.current = null; }, 0);
  }
  const zoom = (f: number) => setView(v => ({ ...v, scale: Math.min(4, Math.max(0.5, v.scale * f)) }));

  function nodeState(n: StarNode): string {
    const base = allocationState(n);
    if (!matches) return base;
    return `${base} ${matches.has(n.id) ? 'is-match' : 'is-dimmed'}`;
  }
  function allocationState(n: StarNode): string {
    if (committed && committed.has(n.id) && !allocated.has(n.id)) return 'is-draft-removed';
    if (allocated.has(n.id)) {
      if (removalSet.has(n.id)) return 'is-removing';
      return committed && !committed.has(n.id) ? 'is-allocated is-draft-added' : 'is-allocated';
    }
    if (pathSet.has(n.id)) return 'is-path';
    if (reachable.has(n.id)) return 'is-reachable';
    return '';
  }
  function edgeState(a: string, b: string): string {
    if ((removalSet.has(a) || removalSet.has(b)) && allocated.has(a) && allocated.has(b)) return 'is-removing';
    if (allocated.has(a) && allocated.has(b)) return 'is-allocated';
    const onPath = (x: string) => pathSet.has(x) || allocated.has(x);
    if ((pathSet.has(a) || pathSet.has(b)) && onPath(a) && onPath(b)) return 'is-path';
    return '';
  }

  /** 節點在盤面內的像素位置；依所在象限往盤面內側展開 */
  function tooltipStyle(n: StarNode): CSSProperties {
    if (boardSize.width === 0) return { display: 'none' };
    const k = (BOARD_HALF * 2) / Math.min(boardSize.width, boardSize.height);
    const px = boardSize.width / 2 + (view.tx + view.scale * n.x) / k;
    const py = boardSize.height / 2 + (view.ty + view.scale * n.y) / k;
    const gap = (NODE_RADIUS[n.kind] * view.scale) / k + 8;
    const right = px > boardSize.width / 2;
    const below = py < boardSize.height / 2;
    return {
      left: px,
      top: py,
      transform: `translate(${right ? `calc(-100% - ${gap}px)` : `${gap}px`}, ${below ? `${gap}px` : `calc(-100% - ${gap}px)`})`,
    };
  }

  function focusStatus(n: StarNode): string {
    if (allocated.has(n.id)) {
      if (n.id === start) return '職業起點，不可退回';
      const paid = committed ? preview.removal.filter(id => committed.has(id)).length : preview.removal.length;
      const fee = paid > 0 ? `，其中 ${paid} 點需洗點費 ${(paid * costPerPoint).toLocaleString()} 金幣` : '';
      return `點一下取消 ${preview.removal.length} 點${fee}`;
    }
    if (locked) return '';
    const need = preview.path.length;
    if (need === 0) return '無法到達';
    return need <= remaining ? `需要 ${need} 點` : `需要 ${need} 點（點數不足）`;
  }

  return (
    <div className={`star-board${locked ? ' is-locked' : ''}${matches ? ' is-filtering' : ''}`}>
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
          {STAR_EDGES.map(([a, b]) => (
            <EdgeLine key={`${a}|${b}`} a={STAR_NODE_BY_ID.get(a)!} b={STAR_NODE_BY_ID.get(b)!} state={edgeState(a, b)} />
          ))}
          {STAR_NODES.map(n => (
            <NodeDot key={n.id} node={n} state={`${nodeState(n)}${n.id === start ? ' is-own-start' : ''}`} handlers={handlers} />
          ))}
        </g>
      </svg>
      {focus && (
        <div className="star-tooltip" style={tooltipStyle(focus)}>
          <div className="star-tooltip-title">{focus.name}<span className="star-kind">{STAR_KIND_LABEL[focus.kind]}</span></div>
          <ul className="star-sum-list">
            {focus.effects.map(e => (
              <li key={e.key} className={isStarEffectActive(e, focus, classId) ? '' : 'is-inert'}>
                {starEffectText(e)}{isStarEffectActive(e, focus, classId) ? '' : '（不生效）'}
              </li>
            ))}
            {focus.flags?.map(f => <li key={f}>{STAR_FLAG_LABEL[f]}</li>)}
          </ul>
          {focusStatus(focus) && <p className="star-status">{focusStatus(focus)}</p>}
          {renderNodeDetail?.(focus, allocated)}
        </div>
      )}
      <div className="star-filter">
        <input
          type="search"
          value={filter}
          placeholder="篩選：HP、體質、命星…"
          aria-label="篩選星點"
          onChange={e => setFilter(e.target.value)}
        />
        {matches && <span className="star-filter-count">{matches.size} 個</span>}
      </div>
      <div className="star-zoom">
        <button className="btn-secondary" aria-label="放大" onClick={() => zoom(1.25)}>＋</button>
        <button className="btn-secondary" aria-label="縮小" onClick={() => zoom(0.8)}>－</button>
        <button className="btn-secondary" onClick={() => setView(INITIAL_VIEW)}>重置視角</button>
      </div>
    </div>
  );
}
