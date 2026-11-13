/**
 * 印記師配合詞綴分類（`sigil-affix-category.html`）。詞綴池與階級表讀 `affixCategoryData.ts`；
 * 印記名稱、顏色、說明讀正式 model。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AFFIXES, CAT_SHORT, TABLES, fmt, poolOf, type Cat, type Code } from './affixCategoryData';
import { SIGIL_PANEL_ORDER, getSigilDefinition, type SigilType } from '../src/models/sigil';
import { sigilDisplay } from '../src/components/town/sigilDisplay';

type Tier = [number, number];
/** `07-affix.md` § 7.3.3 舊階級表 */
const LEGACY_TABLES: Record<string, { tiers: Tier[]; percent: boolean }> = {
  通用: { tiers: [[3.1, 5], [5.1, 8], [8.1, 11], [11.1, 13], [13.1, 15], [15.1, 18], [18.1, 20]], percent: true },
  防禦力: { tiers: [[0.1, 0.5], [0.6, 1.0], [1.1, 1.5], [1.6, 2.0], [2.1, 2.5], [2.6, 3.5], [3.6, 5.0]], percent: true },
};

interface DemoAffix { key: string; tier?: number; value: number; attr?: string; legacyTable?: string }
interface DemoItem {
  id: number; name: string; cat: Cat; where: string; equipped: boolean;
  quality: number; sockets: number; affixes: DemoAffix[]; inert?: string;
}

const ITEMS: DemoItem[] = [
  { id: 1, name: '疾風手套 +3', cat: 'C', where: '手套', equipped: true, quality: 12, sockets: 4, affixes: [
    { key: 'def', tier: 4, value: 1.8, legacyTable: '防禦力' },
    { key: 'critRate', tier: 3, value: 5.2 },
    { key: 'hp', tier: 5, value: 66 },
    { key: 'onHitHp', tier: 2, value: 1.9, legacyTable: '受擊' },
  ] },
  { id: 2, name: '星辰項鍊', cat: 'G', where: '項鍊', equipped: true, quality: 5, sockets: 4, affixes: [
    { key: 'mres', tier: 6, value: 16.4 },
    { key: 'critRate', tier: 2, value: 1.5 },
    { key: 'cdr', tier: 4, value: 3.4 },
  ] },
  { id: 3, name: '寒冰胸甲 +5', cat: 'A', where: '胸甲', equipped: true, quality: 20, sockets: 4, affixes: [
    { key: 'def', tier: 7, value: 6.5 },
    { key: 'onHitMp', tier: 3, value: 2.9 },
    { key: 'attr', value: 1, attr: '力量' },
    { key: 'drop', tier: 4, value: 10.2 },
  ] },
  { id: 4, name: '古木法杖', cat: 'weapon', where: '背包', equipped: false, quality: 0, sockets: 4, affixes: [
    { key: 'atk', tier: 5, value: 13.8 },
    { key: 'critRate', tier: 4, value: 12.0, legacyTable: '通用' },
    { key: 'skillEle', tier: 3, value: 9.0, legacyTable: '通用' },
    { key: 'cdr', tier: 1, value: 4.0, legacyTable: '通用' },
  ] },
  { id: 5, name: '新手長劍', cat: 'weapon', where: '背包', equipped: false, quality: 0, sockets: 0, affixes: [], inert: '新手裝' },
];

const SIGIL_COUNTS: Record<SigilType, number> = { temper: 24, enhance: 3, sting: 5, recarve: 4, chaos: 2, polish: 9, add: 1, seal: 1 };
/** 刺針／混沌／新增的 Tier 範圍（`46-sigil.md` § 46.3）；T6 的小機率在註記裡說明 */
const ROLL_TIER_MAX = 5;

const affixName = (key: string) => AFFIXES.find(a => a.key === key)!.name;
const affixDesc = (key: string) => AFFIXES.find(a => a.key === key)!.desc;

function tableOf(cat: Cat, a: DemoAffix): { tiers: Tier[]; percent: boolean } | null {
  if (a.legacyTable) return a.legacyTable === '受擊' ? TABLES.受擊 : LEGACY_TABLES[a.legacyTable];
  const code = poolOf(cat)[a.key];
  return code && code !== '+1' ? TABLES[code] : null;
}
const isLegacy = (cat: Cat, a: DemoAffix) => !poolOf(cat)[a.key];

function valueText(a: DemoAffix, table: { percent: boolean } | null): string {
  if (a.attr) return `${a.attr} +1`;
  return table?.percent ? `+${a.value.toFixed(1)}%` : `+${a.value}`;
}

function rangeText(code: Code, from: number, to: number): string {
  if (code === '+1') return '+1';
  const t = TABLES[code];
  const u = t.percent ? '%' : '';
  return `${fmt(t.tiers[from - 1][0], t.percent)}~${fmt(t.tiers[to - 1][1], t.percent)}${u}`;
}

function App() {
  const [itemId, setItemId] = useState(1);
  const [affixIndex, setAffixIndex] = useState<number | null>(null);
  const [sigil, setSigil] = useState<SigilType>('temper');
  const [msg, setMsg] = useState<string | null>(null);

  const item = ITEMS.find(i => i.id === itemId)!;
  const def = getSigilDefinition(sigil);
  const display = sigilDisplay(sigil);
  const pool = poolOf(item.cat);
  const catName = CAT_SHORT[item.cat];
  const owned = new Set(item.affixes.map(a => a.key));
  const emptySockets = item.sockets - item.affixes.length;

  function check(i: number): string | null {
    const a = item.affixes[i];
    const legacy = isLegacy(item.cat, a);
    if (sigil === 'temper' || sigil === 'enhance' || sigil === 'recarve') {
      if (legacy) return `已不在${catName}的詞綴池，只能用刺針或混沌換掉`;
      if (a.tier == null) return '額外屬性沒有 Tier';
    }
    if (sigil === 'temper' && a.tier! >= 5) return '已達 T5，改用突破印記';
    if (sigil === 'enhance' && a.tier! < 5) return '突破印記只受理 T5／T6，未到 T5 用精鍊印記';
    if (sigil === 'enhance' && a.tier! >= 7) return '已是最高階 T7';
    return null;
  }

  function blockReason(): string | null {
    if (item.inert) return `${item.inert}不可使用印記`;
    if (SIGIL_COUNTS[sigil] <= 0) return `背包裡沒有${display.name}`;
    if (sigil === 'add' && emptySockets <= 0) return '沒有空洞';
    if (def.target === 'affix') {
      if (affixIndex == null) return '請先選一條詞綴';
      return check(affixIndex);
    }
    return null;
  }

  function renderRangeBar(a: DemoAffix) {
    const table = tableOf(item.cat, a);
    if (!table || a.tier == null) return null;
    const [lo, hi] = table.tiers[a.tier - 1];
    const pct = Math.round(Math.min(1, Math.max(0, (a.value - lo) / (hi - lo))) * 1000) / 10;
    return (
      <span className={`sigil-range-bar tier-${a.tier}`}>
        <span className="sigil-range-bound">{fmt(lo, table.percent)}</span>
        <span className="sigil-range-track"><span className="sigil-range-fill" style={{ width: `${pct}%` }} /></span>
        <span className="sigil-range-bound">{fmt(hi, table.percent)}</span>
      </span>
    );
  }

  function renderPool() {
    if (item.inert) return null;
    const keys = Object.keys(pool);
    let title: string;
    let rows: { key: string; range: string; owned?: boolean }[];
    let note: string | null = null;
    if (sigil === 'sting' && affixIndex != null && item.affixes[affixIndex].tier != null) {
      const tier = item.affixes[affixIndex].tier!;
      title = `刺針可換成（T${tier}，Tier 不變）`;
      rows = keys.filter(k => !owned.has(k)).map(k => ({ key: k, range: rangeText(pool[k], tier, tier) }));
      note = '額外屬性沒有 Tier，換到時固定 +1。';
    } else if (sigil === 'sting') {
      title = '刺針可換成';
      rows = keys.filter(k => !owned.has(k)).map(k => ({ key: k, range: rangeText(pool[k], 1, ROLL_TIER_MAX) }));
      note = '選一條詞綴後顯示該 Tier 的區間。';
    } else if (sigil === 'add') {
      title = '新增可抽到';
      rows = keys.filter(k => !owned.has(k)).map(k => ({ key: k, range: rangeText(pool[k], 1, ROLL_TIER_MAX) }));
      note = `區間為 T1~T${ROLL_TIER_MAX}；每條另有約 1.27% 為 T6（角色 Lv.31+）。`;
    } else if (sigil === 'chaos') {
      title = '混沌重抽範圍';
      rows = keys.map(k => ({ key: k, range: rangeText(pool[k], 1, ROLL_TIER_MAX) }));
      note = `區間為 T1~T${ROLL_TIER_MAX}；每條另有約 1.27% 為 T6（角色 Lv.31+）；同一件不重複。`;
    } else {
      title = '可抽到的詞綴';
      rows = keys.map(k => ({ key: k, range: rangeText(pool[k], 1, 7), owned: owned.has(k) }));
    }
    return (
      <details key={`${sigil}-${itemId}`} className="sigil-pool" open={sigil === 'sting' || sigil === 'add' || sigil === 'chaos'}>
        <summary>{title} · <strong>{catName}</strong> {rows.length} 種</summary>
        <div className="sigil-pool-list">
          {rows.map(r => (
            <div key={r.key} style={{ display: 'contents' }}>
              <span className={r.owned ? 'is-owned' : undefined} title={affixDesc(r.key)}>
                {affixName(r.key)}{r.owned ? '（已有）' : ''}
              </span>
              <span className="sigil-pool-range">{r.range}</span>
            </div>
          ))}
          {note && <span className="sigil-pool-note">{note}</span>}
        </div>
      </details>
    );
  }

  const blocked = blockReason();
  const equipped = ITEMS.filter(i => i.equipped);
  const bag = ITEMS.filter(i => !i.equipped);

  const picker = (label: string, rows: DemoItem[]) => (
    <>
      <div className="sigil-picker-group">── {label} ({rows.length}) ──</div>
      {rows.map(i => (
        <button
          key={i.id}
          type="button"
          className={`sigil-picker-row${i.id === itemId ? ' is-selected' : ''}${i.inert ? ' is-inert' : ''}`}
          onClick={() => { setItemId(i.id); setAffixIndex(null); setMsg(null); }}
        >
          <span className="sigil-picker-name">{i.name}</span>
          <span className="sigil-picker-tag">{i.inert ?? i.where}</span>
        </button>
      ))}
    </>
  );

  return (
    <div className="shop-panel sigil-panel">
      <div className="sigil-head">
        <p className="sigil-greeting">「詞綴不合意？印記能重新刻過。」</p>
        <span className="sigil-gold">金幣 128,400G</span>
      </div>
      <div className="sigil-body">
        <div className="sigil-col">
          <p className="sigil-section-title">裝備</p>
          <div className="sigil-picker">
            {picker('裝備中', equipped)}
            {picker('背包', bag)}
          </div>
        </div>
        <div className="sigil-col">
          <div className="sigil-summary">
            <div className="sigil-summary-main">
              {item.name}
              <span className="sigil-summary-slot">{item.equipped ? `裝備中 · ${item.where}` : '背包'}</span>
            </div>
            <div className="sigil-summary-sub">
              <span>品質 {item.quality}% / 20%</span>
              <span>精鍊上限 T5</span>
              <span>詞綴 {item.affixes.length} / {item.sockets} 洞</span>
              {!item.inert && <span>詞綴池 {catName} {Object.keys(pool).length} 種</span>}
            </div>
          </div>

          <p className="sigil-section-title">選擇詞綴</p>
          <div className={`sigil-affixes${def.target === 'item' ? ' is-item-target' : ''}`}>
            {item.inert && <p className="empty-text">新手裝沒有詞綴</p>}
            {item.affixes.map((a, i) => {
              const reason = check(i);
              const legacy = isLegacy(item.cat, a);
              const table = tableOf(item.cat, a);
              const title = [affixDesc(a.key), reason ?? (legacy ? `已不在${catName}的詞綴池` : null)]
                .filter(Boolean).join('\n');
              return (
                <button
                  key={i}
                  type="button"
                  className={`sigil-affix-row${affixIndex === i ? ' is-selected' : ''}${reason ? ' is-disabled' : ''}`}
                  aria-disabled={reason != null}
                  title={title}
                  onClick={() => { if (!reason) { setAffixIndex(i); setMsg(null); } }}
                >
                  <span className={a.tier ? `affix-tag tier-${a.tier}` : 'affix-tag'}>
                    {affixName(a.key)}{a.tier ? ` T${a.tier}` : ''}
                  </span>
                  {legacy && <span className="sigil-affix-legacy">舊</span>}
                  <span className="sigil-affix-value">{valueText(a, table)}</span>
                  {renderRangeBar(a)}
                </button>
              );
            })}
            {Array.from({ length: Math.max(0, emptySockets) }, (_, i) => (
              <div key={`empty-${i}`} className="sigil-affix-row sigil-socket-empty" aria-disabled="true" title="可用新增印記補一條">
                <span className="affix-tag">空洞</span>
              </div>
            ))}
          </div>

          <p className="sigil-section-title">選擇印記</p>
          <div className="sigil-choices">
            {SIGIL_PANEL_ORDER.map(t => {
              const info = sigilDisplay(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={`sigil-choice${t === sigil ? ' is-selected' : ''}${SIGIL_COUNTS[t] <= 0 ? ' is-empty' : ''}`}
                  style={info.color ? ({ '--sigil-color': info.color } as React.CSSProperties) : undefined}
                  onClick={() => { setSigil(t); setMsg(null); }}
                >
                  <span className="sigil-choice-dot" />
                  {t === 'enhance' || t === 'seal' ? '⚠ ' : ''}{info.name}
                  <span className="sigil-choice-count">×{SIGIL_COUNTS[t]}</span>
                </button>
              );
            })}
          </div>
          <p className="sigil-desc">{def.description}</p>
          <p className="sigil-cost">消耗：{display.name} ×1</p>
          {renderPool()}
        </div>
      </div>
      <div className="sigil-footer">
        <span className={`sigil-footer-msg${blocked ? ' is-error' : ''}`}>{blocked ?? msg ?? ''}</span>
        <button className="sigil-apply" disabled={blocked != null} onClick={() => setMsg('（demo 不執行）')}>
          使用{display.name}
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
