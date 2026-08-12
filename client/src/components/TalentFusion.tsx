import { useState } from 'react';
import { useTalentStore, unequippedAffixes, uninstalledSlots, canFuseAffixes } from '../stores/talentStore';
import {
  AFFIX_FUSE_SUCCESS_RATE,
  FUSE_INPUT_COUNT,
  TALENT_TYPE_LABELS,
  type TalentSlotTier,
  type TalentTier,
} from '../models/talent';
import { getTalentAffixDef } from '../db/seed/talentSeeds';
import { affixLabel, AffixIcon } from './TalentEditor';

/**
 * 天賦合成分頁（`51-auto-talent.md` § 51.5.2）。
 *
 * **不需要 NPC、不限地點** —— 不走印記師，印記管的是裝備詞綴，兩套系統不混。
 *
 * 版面是「材料槽 → 產物槽」的合成台，不是條列說明：
 * 玩家要看的是「我放了什麼、會變成什麼、機率多少」，那三件事該同時在畫面上。
 */
export function TalentFusion() {
  const slots = useTalentStore(s => s.slots);
  const affixes = useTalentStore(s => s.affixes);
  const fuseSlots = useTalentStore(s => s.fuseSlots);
  const fuseAffixes = useTalentStore(s => s.fuseAffixes);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const spare = uninstalledSlots(slots);
  const loose = unequippedAffixes(affixes);

  function toggle(id: number) {
    setResult(null);
    setPicked(p => p.includes(id)
      ? p.filter(x => x !== id)
      : p.length >= FUSE_INPUT_COUNT ? p : [...p, id]);
  }

  const pickedAffixes = picked.map(id => affixes.find(a => a.id === id)).filter(Boolean);
  /*
   * 產物與成功率**只在這組真的合得成時才算**（`canFuseAffixes`，與 store 同一支）。
   * 用第一份的 tier 推產物的話，T1＋T2 會秀出「T2、成功率 50%」，
   * 按下去卻被 store 擋掉 —— 畫面在騙人。
   */
  const ready = canFuseAffixes(pickedAffixes);
  const outputTier = ready
    ? (getTalentAffixDef(pickedAffixes[0]!.definitionId)!.tier + 1) as TalentTier
    : null;
  const rate = outputTier ? AFFIX_FUSE_SUCCESS_RATE[outputTier as Exclude<TalentTier, 1>] : null;

  /* 已經挑了一份時，配不起來的就選不到 —— 讓玩家按下去才知道不行是最差的回饋 */
  function pairable(id: number): boolean {
    if (picked.includes(id) || picked.length === 0) return true;
    if (picked.length >= FUSE_INPUT_COUNT) return false;
    return canFuseAffixes([affixes.find(a => a.id === picked[0]), affixes.find(a => a.id === id)]);
  }

  async function doFuse() {
    const r = await fuseAffixes(picked);
    setPicked([]);
    if (!r) return;
    setResult(r.success
      ? { ok: true, text: `成功　${affixLabel(r.produced!)}` }
      : { ok: false, text: '失敗　退回其中 1 份' });
  }

  return (
    <div className="talent-fusion">
      {/* === 天賦格：純換算，必定成功 === */}
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

      {/* === 鑲材：合成台 === */}
      <section className="fusion-section">
        {/* 規則不寫在檯面上：合成台要講的只有「會變成什麼、機率多少」。
            不合的組合本來就按不下去，寫成一行小字是每次都要重讀的雜訊 */}
        <h4 className="fusion-heading">鑲材</h4>

        <div className="fusion-bench">
          {Array.from({ length: FUSE_INPUT_COUNT }, (_, i) => {
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
            {ready && outputTier
              ? <>
                  <span className="fusion-chip is-out">T{outputTier}</span>
                  <span className="fusion-cell-name">隨機同類鑲材</span>
                </>
              : <span className="fusion-cell-hint">產物</span>}
          </div>
        </div>

        <div className="fusion-actions">
          <span className={`fusion-rate${rate != null ? '' : ' is-dim'}`}>
            {rate != null ? `成功率 ${rate}%` : '成功率 —'}
          </span>
          <button className="fusion-go is-primary" disabled={!ready} onClick={doFuse}>
            合成
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
