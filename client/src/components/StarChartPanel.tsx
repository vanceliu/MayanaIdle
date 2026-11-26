/**
 * 星盤面板（`56-star-chart.md` § 56.7）：點數列、盤面、加成合計。
 * 配點與取消先在草稿裡進行，按「確認」才送出；草稿退掉已確認的節點時先跳視窗確認洗點費。
 * 角色資料與動作由呼叫端傳入（遊戲接 store，demo 接本機狀態）。
 */
import { useMemo, useState } from 'react';
import {
  STAR_CHART_UNLOCK_LEVEL,
  exceedsKeystoneCap, KEYSTONE_CAP, normalizeStarAllocation, starPathTo, starPoints, starRefundCostPerPoint, starRefundSet, starStartNodeId, unspentStarPoints,
} from '../models/starChart';
import { formatStarEffect, starSkillRowParts, summarizeStarChart, type StarSummaryRow as SummaryRow } from '../models/starDisplay';
import type { Character, ClassName } from '../models/character';
import { StarChartBoard, type StarChartBoardProps } from './StarChartBoard';
import { useGameStore } from '../stores/gameStore';
import { getEffectiveGearArray } from '../systems/gear';
import { calculateHealAmount, previewSkillPhysicalDamage } from '../systems/combat';
import { StarNodeSkillPreview } from './StarNodeSkillPreview';

/** 技能列：等級顯示羅馬數字，其餘照原值；隨等級變動的數字標黃（§ 56.5） */
function SkillRowText({ r }: { r: SummaryRow }) {
  const { label, value, bracket } = starSkillRowParts(r);
  return bracket
    ? <>{label}(<span className="stat-changed">{value}</span>)</>
    : <>{label} <span className="stat-changed">{value}</span></>;
}

function SummaryList({ title, rows, skill = false }: { title: string; rows: SummaryRow[]; skill?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h4 className="star-sum-title">{title}</h4>
      <ul className="star-sum-list">
        {rows.map(r => (
          <li key={r.key} className={r.effective ? '' : 'is-inert'}>
            {skill ? <SkillRowText r={r} /> : `${r.label} ${formatStarEffect(r)}`}
            {r.effective ? '' : '（不生效）'}
          </li>
        ))}
      </ul>
    </>
  );
}

export function StarChartSummary({ classId, allocated }: { classId: ClassName; allocated: ReadonlySet<string> }) {
  const summary = useMemo(() => summarizeStarChart(allocated, classId), [allocated, classId]);
  return (
    <section className="star-summary">
      <h3 className="star-summary-title">加成合計</h3>
      <SummaryList title="屬性" rows={summary.attrs} />
      <SummaryList title="數值" rows={summary.stats} />
      <SummaryList title="技能" rows={summary.skills} skill />
      {summary.keystones.length > 0 && (
        <>
          <h4 className="star-sum-title">命星</h4>
          <ul className="star-sum-list">
            {summary.keystones.map(k => <li key={k.name}>{k.name}{k.flags.length > 0 ? `：${k.flags.join('；')}` : ''}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

export interface StarChartPanelProps {
  character: Pick<Character, 'className' | 'level' | 'starChart'>;
  /** 送出整份配點；成功回 true（線上模式經 RPC 回 Promise） */
  onApply: (nodeIds: string[]) => boolean | Promise<boolean>;
  renderNodeDetail?: StarChartBoardProps['renderNodeDetail'];
}

export function StarChartPanel({ character, onApply, renderNodeDetail }: StarChartPanelProps) {
  const { className: classId, level } = character;
  const committedList = useMemo(
    () => normalizeStarAllocation(character.starChart ?? [], classId, level),
    [character.starChart, classId, level],
  );
  const committed = useMemo(() => new Set(committedList), [committedList]);
  /** 草稿以「基於哪一份已確認配點」為鍵；已確認配點換了（送出成功、server 推送）草稿自動作廢 */
  const [draftState, setDraftState] = useState<{ base: readonly string[]; ids: Set<string> } | null>(null);
  const draft = draftState && draftState.base === committedList ? draftState.ids : null;
  const allocated = draft ?? committed;
  const setDraft = (ids: Set<string>) => setDraftState({ base: committedList, ids });

  const locked = level < STAR_CHART_UNLOCK_LEVEL;
  const points = starPoints(level);
  const remaining = points - allocated.size;
  const costPerPoint = starRefundCostPerPoint(level);
  const added = [...allocated].filter(id => !committed.has(id)).length;
  const removed = committedList.filter(id => !allocated.has(id)).length;
  const dirty = added > 0 || removed > 0;
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  function activate(nodeId: string, action: 'allocate' | 'refund') {
    setMessage('');
    if (action === 'refund') {
      const drop = new Set(starRefundSet(nodeId, allocated, classId));
      setDraft(new Set([...allocated].filter(id => !drop.has(id))));
      return;
    }
    const path = starPathTo(nodeId, allocated);
    if (!path) return setMessage('無法到達');
    if (path.length > remaining) return setMessage(`需要 ${path.length} 點，剩餘 ${Math.max(0, remaining)} 點`);
    if (exceedsKeystoneCap(path, allocated)) return setMessage(`命星最多 ${KEYSTONE_CAP} 顆`);
    setDraft(new Set([...allocated, ...path]));
  }

  async function submit() {
    setConfirming(false);
    const ok = await Promise.resolve(onApply([...allocated])).catch(() => false);
    if (ok) setDraftState(null);
    setMessage(ok ? (removed > 0 ? `已套用，洗點花費 ${(removed * costPerPoint).toLocaleString()} 金幣` : '已套用') : '套用失敗（金幣不足或配點不合法）');
  }

  return (
    <div className="star-panel">
      <div className="star-panel-bar">
        {locked ? (
          <span className="star-locked-note">Lv{STAR_CHART_UNLOCK_LEVEL} 開放星盤</span>
        ) : (
          <>
            <span>星點 <strong>{allocated.size}</strong> / {points}</span>
            {dirty
              ? <span className="star-draft-note">未確認：新增 {added} 點{removed > 0 ? `，退回 ${removed} 點（洗點 ${(removed * costPerPoint).toLocaleString()} 金幣）` : ''}</span>
              : <span className="star-panel-dim">洗點每點 {costPerPoint.toLocaleString()} 金幣</span>}
            <span className="star-panel-actions">
              <button
                className="btn-secondary"
                disabled={allocated.size <= 1}
                onClick={() => setDraft(new Set([starStartNodeId(classId)]))}
              >
                全部重置
              </button>
              <button className="btn-secondary" disabled={!dirty} onClick={() => setDraftState(null)}>還原</button>
              <button className="btn-primary" disabled={!dirty} onClick={() => (removed > 0 ? setConfirming(true) : void submit())}>確認</button>
            </span>
          </>
        )}
        {message && <span className="star-msg">{message}</span>}
      </div>
      <div className="star-panel-body">
        <StarChartBoard
          classId={classId}
          allocated={allocated}
          committed={committed}
          remaining={remaining}
          costPerPoint={costPerPoint}
          locked={locked}
          onActivate={activate}
          renderNodeDetail={renderNodeDetail}
        />
        <StarChartSummary classId={classId} allocated={allocated} />
      </div>
      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div className="modal-content star-confirm" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">確認洗點</span></div>
            <p>
              退回 <strong>{removed}</strong> 點{added > 0 ? `、新增 ${added} 點` : ''}，
              花費 <strong>{(removed * costPerPoint).toLocaleString()}</strong> 金幣。
            </p>
            <div className="star-confirm-actions">
              <button className="btn-secondary" onClick={() => setConfirming(false)}>取消</button>
              <button className="btn-danger" onClick={() => void submit()}>確認</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 遊戲內的星盤視窗內容：接角色資料與 `applyStarChart` */
export function StarChartWindowContent() {
  const character = useGameStore(s => s.character);
  const applyStarChart = useGameStore(s => s.applyStarChart);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  if (!character) return null;
  const gear = getEffectiveGearArray(character, activeEffects, equippedGear);
  return (
    <StarChartPanel
      character={character}
      onApply={applyStarChart}
      renderNodeDetail={(node, allocated) => (
        <StarNodeSkillPreview
          node={node}
          classId={character.className}
          allocated={allocated}
          healOf={power => calculateHealAmount(character, power, gear, activeEffects)}
          physicalOf={(scale, normal) => previewSkillPhysicalDamage(character, gear, activeEffects, scale, normal)}
        />
      )}
    />
  );
}

/** 底部面板列星盤按鈕右上角的未點點數（§ 56.7） */
export function StarPointsBadge() {
  const unspent = useGameStore(s => (s.character ? unspentStarPoints(s.character) : 0));
  return unspent > 0 ? <span className="quest-count-badge">{unspent}</span> : null;
}
