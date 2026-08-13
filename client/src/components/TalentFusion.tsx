import { useRef, useState } from 'react';
import {
  useTalentStore,
  unequippedAffixes,
  uninstalledSlots,
  canUpgradeAffixes,
  upgradeTargetTypes,
  upgradeCandidates,
  canExchangeAffixes,
  canDowngradeAffix,
} from '../stores/talentStore';
import {
  AFFIX_FUSE_SUCCESS_RATE,
  DOWNGRADE_INPUT_COUNT,
  EXCHANGE_INPUT_COUNT,
  FUSE_INPUT_COUNT,
  TALENT_TYPES,
  TALENT_TYPE_LABELS,
  type TalentAffixDef,
  type TalentAffixInstance,
  type TalentSlotTier,
  type TalentTier,
  type TalentType,
} from '../models/talent';
import { TALENT_AFFIX_DEFS, getTalentAffixDef } from '../db/seed/talentSeeds';
import { affixLabel, affixLabelOf, AffixIcon } from './TalentEditor';
import { boundParamLabel } from '../models/talentLabels';
import { BagTooltip, anchorOf, type AnchorRect } from './BagTooltip';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

/** 鑲材的三種換法（`51-auto-talent.md` § 51.5.2~51.5.3） */
type Mode = 'upgrade' | 'exchange' | 'downgrade';

const MODES: { key: Mode; label: string; inputs: number; sub: string }[] = [
  { key: 'upgrade', label: '升級', inputs: FUSE_INPUT_COUNT, sub: `同階級 ×${FUSE_INPUT_COUNT} → 指定類型的高一階・有失敗率` },
  { key: 'exchange', label: '定向兌換', inputs: EXCHANGE_INPUT_COUNT, sub: `同階級 ×${EXCHANGE_INPUT_COUNT} → 指定同階級・必定成功` },
  { key: 'downgrade', label: '降階', inputs: DOWNGRADE_INPUT_COUNT, sub: '高階 ×1 → 指定任一低階・必定成功' },
];

/** 天賦合成分頁（`51-auto-talent.md` § 51.5.2~51.5.3）。不需要 NPC、不限地點 */
export function TalentFusion() {
  const slots = useTalentStore(s => s.slots);
  const affixes = useTalentStore(s => s.affixes);
  const fuseSlots = useTalentStore(s => s.fuseSlots);
  const upgradeAffixes = useTalentStore(s => s.upgradeAffixes);
  const exchangeAffixes = useTalentStore(s => s.exchangeAffixes);
  const downgradeAffix = useTalentStore(s => s.downgradeAffix);

  const [mode, setMode] = useState<Mode>('upgrade');
  const [picked, setPicked] = useState<number[]>([]);
  const [targetDefId, setTargetDefId] = useState<number | null>(null);
  const [targetType, setTargetType] = useState<TalentType | null>(null);
  /** 「這一階會出什麼」的展開位置。null ＝ 收起 */
  const [peek, setPeek] = useState<AnchorRect | null>(null);
  const peekRef = useRef<HTMLButtonElement>(null);
  // 點到別處或按 Esc 就收起來
  useDismissOnOutside(peekRef, peek !== null, () => setPeek(null));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const spare = uninstalledSlots(slots);
  const loose = unequippedAffixes(affixes);
  const inputCount = MODES.find(m => m.key === mode)!.inputs;
  const pool = buildPool(loose);

  function switchMode(next: Mode) {
    setMode(next);
    setPicked([]);
    setTargetDefId(null);
    setTargetType(null);
    setResult(null);
    setPeek(null);
  }

  function toggle(id: number) {
    setResult(null);
    setTargetDefId(null);
    setPeek(null);
    setPicked(p => p.includes(id)
      ? p.filter(x => x !== id)
      : p.length >= inputCount ? p : [...p, id]);
  }

  /**
   * 同一種鑲材堆成一列（§ 51.10）：點一下拿一份，拿滿了再點退一份。
   * 「合成 ×2」在同一列上按兩次就湊齊，不必到清單各處去找另一份。
   */
  function toggleGroup(ids: number[]) {
    setResult(null);
    setTargetDefId(null);
    setPeek(null);
    setPicked(p => {
      const free = ids.find(id => !p.includes(id) && pairable(id));
      if (free !== undefined && p.length < inputCount) return [...p, free];
      const mine = ids.filter(id => p.includes(id));
      return mine.length > 0 ? p.filter(x => x !== mine[mine.length - 1]) : p;
    });
  }

  const pickedAffixes = picked.map(id => affixes.find(a => a.id === id)).filter(Boolean);

  /**
   * 玩家指定的產物候選（§ 51.5.3）。判斷一律走 store 的同一支，
   * UI 不自己複製規則 —— 複製過的規則遲早跟 store 分岔。
   */
  const targets = mode === 'upgrade' || pickedAffixes.length !== inputCount
    ? []
    : TALENT_AFFIX_DEFS.filter(d => mode === 'exchange'
      ? canExchangeAffixes(pickedAffixes, d.id)
      : canDowngradeAffix(pickedAffixes[0], d.id));

  /**
   * 升級的產物類型（§ 51.5.2）。**先選類型再挑材料**，
   * 所以材料還沒湊齊時三個都列出來；湊齊之後沒有候選的那些才禁用。
   */
  const usableTypes = mode === 'upgrade' && pickedAffixes.length === inputCount
    ? upgradeTargetTypes(pickedAffixes)
    : TALENT_TYPES;

  const ready = mode === 'upgrade'
    ? canUpgradeAffixes(pickedAffixes, targetType)
    : targetDefId !== null && targets.some(d => d.id === targetDefId);

  const outputTier = mode === 'upgrade'
    ? (pickedAffixes.length === inputCount
      ? (getTalentAffixDef(pickedAffixes[0]!.definitionId)!.tier + 1) as TalentTier
      : null)
    : (targetDefId !== null ? getTalentAffixDef(targetDefId)?.tier ?? null : null);

  /** 展開時列出的候選（§ 51.5.2）。判斷走 store 的同一支，UI 不自己算 */
  const peekList = mode === 'upgrade' && targetType && pickedAffixes.length === inputCount
    ? upgradeCandidates(
      getTalentAffixDef(pickedAffixes[0]!.definitionId)!.tier,
      getTalentAffixDef(pickedAffixes[0]!.definitionId)!.kind,
      targetType,
    )
    : [];

  const rate = mode === 'upgrade'
    ? (outputTier ? AFFIX_FUSE_SUCCESS_RATE[outputTier as Exclude<TalentTier, 1>] : null)
    : 100;

  /**
   * 已經挑了一份時，配不起來的一律不可選。
   * 降階只吃 1 份，沒有配對問題；升級與兌換都要同階級同種類。
   */
  function pairable(id: number): boolean {
    if (picked.includes(id) || picked.length === 0) return true;
    if (picked.length >= inputCount) return false;
    if (mode === 'downgrade') return false;

    // 升級與兌換的配對條件相同：同階級、同種類
    const first = affixes.find(a => a.id === picked[0]);
    const cand = affixes.find(a => a.id === id);
    return stackable(first, cand);
  }

  async function run() {
    let text: { ok: boolean; text: string } | null = null;

    if (mode === 'upgrade') {
      const r = await upgradeAffixes(picked, targetType!);
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
    setTargetType(null);
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

        {mode === 'upgrade' && (
          <div className="fusion-types">
            <span className="fusion-types-label">產物類型</span>
            {TALENT_TYPES.map(ty => (
              <button
                key={ty}
                className={`fusion-type${targetType === ty ? ' is-active' : ''}`}
                disabled={!usableTypes.includes(ty)}
                title={usableTypes.includes(ty) ? undefined : '這個類型在下一階沒有鑲材'}
                onClick={() => { setTargetType(ty); setResult(null); setPeek(null); }}
              >
                {TALENT_TYPE_LABELS[ty]}
              </button>
            ))}
          </div>
        )}

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
            {mode === 'upgrade'
              ? (targetType && outputTier
                ? <>
                    <span className="fusion-chip is-out">T{outputTier}</span>
                    <span className="fusion-cell-name">
                      {TALENT_TYPE_LABELS[targetType]}・隨機一個
                    </span>
                    {/* 產物是隨機的，玩家至少要看得到這一階的候選有哪些 */}
                    <button
                      ref={peekRef}
                      className="fusion-peek"
                      title="這一階會出什麼"
                      aria-label="這一階會出什麼"
                      onClick={e => setPeek(peek ? null : anchorOf(e.currentTarget))}
                    >
                      ?
                    </button>
                  </>
                : <span className="fusion-cell-hint">先選產物類型</span>)
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

        {peek && targetType && outputTier && (
          <BagTooltip anchor={peek}>
            <div className="bag-tooltip-content">
              <div className="tooltip-name">
                T{outputTier}・{TALENT_TYPE_LABELS[targetType]}（{peekList.length} 種）
              </div>
              {peekList.map(d => (
                <div key={d.id} className="tooltip-stat">{affixLabelOf(d)}</div>
              ))}
              <div className="tooltip-hint">成功時從這些之中隨機一個</div>
            </div>
          </BagTooltip>
        )}

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
          {pool.map(section => (
            <div key={section.key} className="fusion-pool-section">
              <div className="fusion-pool-title">
                {section.title}
                <span className="fusion-pool-title-count">{section.groups.length} 種</span>
              </div>
              <div className="fusion-pool-items">
                {section.groups.map(g => {
                  const pickedHere = g.ids.filter(id => picked.includes(id)).length;
                  const bound = boundParamLabel(g.boundParam);
                  return (
                    <button
                      key={g.key}
                      className={`fusion-pool-item${pickedHere > 0 ? ' is-picked' : ''}`}
                      disabled={pickedHere === 0 && !g.ids.some(id => pairable(id))}
                      onClick={() => toggleGroup(g.ids)}
                    >
                      <AffixIcon affix={g.sample} size={16} />
                      <span className="fusion-pool-name">
                        {affixLabelOf(g.def)}{bound ? `・${bound}` : ''}
                      </span>
                      {g.ids.length > 1 && (
                        <span className="fusion-pool-count">
                          ×{g.ids.length}{pickedHere > 0 ? `（選 ${pickedHere}）` : ''}
                        </span>
                      )}
                      <span className="fusion-pool-meta">
                        {g.def.appliesTo.map(t => TALENT_TYPE_LABELS[t]).join('／')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 適用類型的固定排序，讓同型的鑲材在清單上相鄰 */
const TYPE_ORDER: Record<string, number> = { combat: 0, persistent: 1, supply: 2 };

export interface PoolGroup {
  key: string;
  def: TalentAffixDef;
  boundParam: string | null;
  sample: TalentAffixInstance;
  ids: number[];
}

export interface PoolSection {
  key: string;
  title: string;
  groups: PoolGroup[];
}

/**
 * 合成清單的分區與排序（`51-auto-talent.md` § 51.10）。
 *
 * **一個分區 ＝ 同種類 ＋ 同階級**，也就是合成／兌換的必要條件（§ 51.5.2）。
 * 跨分區一定合不起來，同分區內只差「適用類型要有交集」。
 *
 * 分區內同一種鑲材（同定義、同綁定）疊成一列，`ids` 是它底下的實例。
 */
export function buildPool(loose: TalentAffixInstance[]): PoolSection[] {
  const groups = new Map<string, PoolGroup>();
  for (const a of loose) {
    const def = getTalentAffixDef(a.definitionId);
    if (!def) continue;
    const key = `${a.definitionId}:${a.boundParam ?? ''}`;
    const g = groups.get(key);
    if (g) g.ids.push(a.id!);
    else groups.set(key, { key, def, boundParam: a.boundParam ?? null, sample: a, ids: [a.id!] });
  }

  const sections = new Map<string, PoolSection>();
  for (const g of [...groups.values()].sort(compareGroup)) {
    const key = `${g.def.kind}:${g.def.tier}`;
    const title = `${g.def.kind === 'condition' ? '條件' : '實作'} T${g.def.tier}`;
    const s = sections.get(key);
    if (s) s.groups.push(g);
    else sections.set(key, { key, title, groups: [g] });
  }

  return [...sections.values()].sort((a, b) => {
    const [ka, ta] = a.key.split(':');
    const [kb, tb] = b.key.split(':');
    return ka === kb ? Number(ta) - Number(tb) : (ka === 'condition' ? -1 : 1);
  });
}

/** 分區內：先依適用類型，再依名稱與綁定，讓可以互相配對的排在一起 */
function compareGroup(a: PoolGroup, b: PoolGroup): number {
  const ta = a.def.appliesTo.map(t => TYPE_ORDER[t]).join(',');
  const tb = b.def.appliesTo.map(t => TYPE_ORDER[t]).join(',');
  if (ta !== tb) return ta < tb ? -1 : 1;
  const na = affixLabelOf(a.def);
  const nb = affixLabelOf(b.def);
  if (na !== nb) return na.localeCompare(nb, 'zh-Hant');
  return (a.boundParam ?? '').localeCompare(b.boundParam ?? '');
}

/** 兌換的材料能不能疊在一起：同階級、同種類。**類型不限**（§ 51.5.3） */
function stackable(
  a: TalentAffixInstance | undefined,
  b: TalentAffixInstance | undefined,
): boolean {
  const da = a && getTalentAffixDef(a.definitionId);
  const db = b && getTalentAffixDef(b.definitionId);
  if (!da || !db) return false;
  return da.tier === db.tier && da.kind === db.kind;
}
