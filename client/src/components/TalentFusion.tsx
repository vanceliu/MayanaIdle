import { useState } from 'react';
import {
  useTalentStore,
  unequippedAffixes,
  uninstalledSlots,
  canFuseAffixes,
  canExchangeAffixes,
  canDowngradeAffix,
} from '../stores/talentStore';
import {
  AFFIX_FUSE_SUCCESS_RATE,
  DOWNGRADE_INPUT_COUNT,
  EXCHANGE_INPUT_COUNT,
  FUSE_INPUT_COUNT,
  TALENT_TYPE_LABELS,
  type TalentAffixInstance,
  type TalentSlotTier,
  type TalentTier,
} from '../models/talent';
import { TALENT_AFFIX_DEFS, getTalentAffixDef } from '../db/seed/talentSeeds';
import { affixLabel, affixLabelOf, AffixIcon } from './TalentEditor';

/** 鑲材的三種換法（`51-auto-talent.md` § 51.5.2~51.5.3） */
type Mode = 'fuse' | 'exchange' | 'downgrade';

const MODES: { key: Mode; label: string; inputs: number; sub: string }[] = [
  { key: 'fuse', label: '合成', inputs: FUSE_INPUT_COUNT, sub: `同階級 ×${FUSE_INPUT_COUNT} → 隨機高一階・有失敗率` },
  { key: 'exchange', label: '定向兌換', inputs: EXCHANGE_INPUT_COUNT, sub: `同階級 ×${EXCHANGE_INPUT_COUNT} → 指定同階級・必定成功` },
  { key: 'downgrade', label: '降階', inputs: DOWNGRADE_INPUT_COUNT, sub: '高階 ×1 → 指定任一低階・必定成功' },
];

/** 天賦合成分頁（`51-auto-talent.md` § 51.5.2~51.5.3）。不需要 NPC、不限地點 */
export function TalentFusion() {
  const slots = useTalentStore(s => s.slots);
  const affixes = useTalentStore(s => s.affixes);
  const fuseSlots = useTalentStore(s => s.fuseSlots);
  const fuseAffixes = useTalentStore(s => s.fuseAffixes);
  const exchangeAffixes = useTalentStore(s => s.exchangeAffixes);
  const downgradeAffix = useTalentStore(s => s.downgradeAffix);

  const [mode, setMode] = useState<Mode>('fuse');
  const [picked, setPicked] = useState<number[]>([]);
  const [targetDefId, setTargetDefId] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const spare = uninstalledSlots(slots);
  const loose = unequippedAffixes(affixes);
  const inputCount = MODES.find(m => m.key === mode)!.inputs;

  function switchMode(next: Mode) {
    setMode(next);
    setPicked([]);
    setTargetDefId(null);
    setResult(null);
  }

  function toggle(id: number) {
    setResult(null);
    setTargetDefId(null);
    setPicked(p => p.includes(id)
      ? p.filter(x => x !== id)
      : p.length >= inputCount ? p : [...p, id]);
  }

  const pickedAffixes = picked.map(id => affixes.find(a => a.id === id)).filter(Boolean);

  /**
   * 玩家指定的產物候選（§ 51.5.3）。判斷一律走 store 的同一支，
   * UI 不自己複製規則 —— 複製過的規則遲早跟 store 分岔。
   */
  const targets = mode === 'fuse' || pickedAffixes.length !== inputCount
    ? []
    : TALENT_AFFIX_DEFS.filter(d => mode === 'exchange'
      ? canExchangeAffixes(pickedAffixes, d.id)
      : canDowngradeAffix(pickedAffixes[0], d.id));

  const ready = mode === 'fuse'
    ? canFuseAffixes(pickedAffixes)
    : targetDefId !== null && targets.some(d => d.id === targetDefId);

  const outputTier = mode === 'fuse'
    ? (canFuseAffixes(pickedAffixes)
      ? (getTalentAffixDef(pickedAffixes[0]!.definitionId)!.tier + 1) as TalentTier
      : null)
    : (targetDefId !== null ? getTalentAffixDef(targetDefId)?.tier ?? null : null);

  const rate = mode === 'fuse'
    ? (outputTier ? AFFIX_FUSE_SUCCESS_RATE[outputTier as Exclude<TalentTier, 1>] : null)
    : 100;

  /**
   * 已經挑了一份時，配不起來的一律不可選。
   * 降階只吃 1 份，沒有配對問題；合成與兌換都要同階級同種類同適用類型。
   */
  function pairable(id: number): boolean {
    if (picked.includes(id) || picked.length === 0) return true;
    if (picked.length >= inputCount) return false;
    if (mode === 'downgrade') return false;

    const first = affixes.find(a => a.id === picked[0]);
    const cand = affixes.find(a => a.id === id);
    return mode === 'fuse'
      ? canFuseAffixes([first, cand])
      : stackable(first, cand);
  }

  async function run() {
    let text: { ok: boolean; text: string } | null = null;

    if (mode === 'fuse') {
      const r = await fuseAffixes(picked);
      if (r) {
        text = r.success
          ? { ok: true, text: `成功：${affixLabel(r.produced!)}` }
          : { ok: false, text: '失敗：退回其中 1 份' };
      }
    } else {
      const produced = mode === 'exchange'
        ? await exchangeAffixes(picked, targetDefId!)
        : await downgradeAffix(picked[0], targetDefId!);
      if (produced) text = { ok: true, text: `取得：${affixLabel(produced)}` };
    }

    setPicked([]);
    setTargetDefId(null);
    if (text) setResult(text);
  }

  return (
    <div className="talent-fusion">
      {/* === 天賦格：純換算，必定成功。天賦格沒有兌換與降階 === */}
      <section className="fusion-section">
        <h4 className="fusion-heading">
          天賦格
          <span className="fusion-sub">低階 ×2 → 高階 ×1・必定成功</span>
        </h4>
        <div className="fusion-slot-grid">
          {([1, 2, 3] as TalentSlotTier[]).map(tier => {
            const count = spare.filter(s => s.tier === tier).length;
            const can = count >= FUSE_INPUT_COUNT;
            return (
              <div key={tier} className={`fusion-slot-card${can ? '' : ' is-short'}`}>
                <div className="fusion-slot-line">
                  <span className="fusion-chip">T{tier}</span>
                  <span className="fusion-count">×{count}</span>
                  <span className="fusion-arrow">→</span>
                  <span className="fusion-chip is-out">T{tier + 1}</span>
                </div>
                <button className="fusion-go" disabled={!can} onClick={() => fuseSlots(tier)}>
                  合成
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* === 鑲材：合成／兌換／降階共用同一張合成台 === */}
      <section className="fusion-section">

        <h4 className="fusion-heading">
          鑲材
          <span className="fusion-sub">{MODES.find(m => m.key === mode)!.sub}</span>
        </h4>

        <div className="fusion-modes">
          {MODES.map(m => (
            <button
              key={m.key}
              className={`fusion-mode${mode === m.key ? ' is-active' : ''}`}
              onClick={() => switchMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="fusion-bench">
          {Array.from({ length: inputCount }, (_, i) => {
            const a = pickedAffixes[i];
            return (
              <div
                key={i}
                className={`fusion-cell${a ? ' is-filled' : ''}`}
                onClick={() => a && toggle(a.id!)}
              >
                {a
                  ? <>
                      <AffixIcon affix={a} size={24} />
                      <span className="fusion-cell-name">{affixLabel(a)}</span>
                      <span className="fusion-chip">T{getTalentAffixDef(a.definitionId)?.tier}</span>
                    </>
                  : <span className="fusion-cell-hint">材料 {i + 1}</span>}
              </div>
            );
          })}

          <span className="fusion-arrow is-big">→</span>

          <div className={`fusion-cell is-output${ready ? ' is-ready' : ''}`}>
            {mode === 'fuse'
              ? (ready && outputTier
                ? <>
                    <span className="fusion-chip is-out">T{outputTier}</span>
                    <span className="fusion-cell-name">隨機同類鑲材</span>
                  </>
                : <span className="fusion-cell-hint">產物</span>)
              : (targets.length > 0
                ? <select
                    className="fusion-target"
                    value={targetDefId ?? ''}
                    onChange={e => setTargetDefId(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">選擇產物…</option>
                    {targets.map(d => (
                      <option key={d.id} value={d.id}>T{d.tier}・{affixLabelOf(d)}</option>
                    ))}
                  </select>
                : <span className="fusion-cell-hint">先湊齊材料</span>)}
          </div>
        </div>

        <div className="fusion-actions">
          <span className={`fusion-rate${rate != null ? '' : ' is-dim'}`}>
            {rate != null ? `成功率 ${rate}%` : '成功率 —'}
          </span>
          <button className="fusion-go is-primary" disabled={!ready} onClick={run}>
            {MODES.find(m => m.key === mode)!.label}
          </button>
        </div>
        {result && (
          <div className={`fusion-result${result.ok ? ' is-ok' : ' is-fail'}`}>{result.text}</div>
        )}

        <div className="fusion-pool">
          {loose.map(a => {
            const def = getTalentAffixDef(a.definitionId)!;
            return (
              <button
                key={a.id}
                className={`fusion-pool-item${picked.includes(a.id!) ? ' is-picked' : ''}`}
                disabled={!pairable(a.id!)}
                onClick={() => toggle(a.id!)}
              >
                <AffixIcon affix={a} size={16} />
                <span className="fusion-chip">T{def.tier}</span>
                <span className="fusion-pool-name">{affixLabel(a)}</span>
                <span className="fusion-pool-meta">
                  {def.kind === 'condition' ? '條件' : '實作'}
                  ・{def.appliesTo.map(t => TALENT_TYPE_LABELS[t]).join('／')}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** 兌換的材料能不能疊在一起：同階級、同種類、適用類型有交集（§ 51.5.3） */
function stackable(
  a: TalentAffixInstance | undefined,
  b: TalentAffixInstance | undefined,
): boolean {
  const da = a && getTalentAffixDef(a.definitionId);
  const db = b && getTalentAffixDef(b.definitionId);
  if (!da || !db) return false;
  return da.tier === db.tier
    && da.kind === db.kind
    && da.appliesTo.some(t => db.appliesTo.includes(t));
}
