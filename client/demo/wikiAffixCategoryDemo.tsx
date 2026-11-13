/**
 * Wiki 詞綴頁依分類改版（`wiki-affix-category.html`）。資料照 `07-affix.md` § 7.3／§ 7.6 與 `07-affix-tier7.md` 寫死。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AFFIXES, CATS, CAT_SHORT, GROUPS, OWN, SHARED, TABLES, fmt, poolOf, type Cat, type Code,
} from './affixCategoryData';

const SPECIAL = [
  { name: '毒免疫', desc: '免疫中毒（100%）', lv: 31 },
  { name: '流血免疫', desc: '免疫流血（100%）', lv: 31 },
  { name: '暈眩抵抗', desc: '暈眩時間 -50%', lv: 41 },
];

type T7Row = { name: string; desc: string; range: string };
const T7_WEAPON: T7Row[] = [
  { name: '命中回血', desc: '每下命中回復 X HP', range: '10~15' },
  { name: '命中回魔', desc: '每下命中回復 X MP', range: '10~15' },
  { name: '擊殺回血', desc: '擊殺回復 X HP', range: '30~50' },
  { name: '爆擊傷害', desc: '爆擊傷害 +X%', range: '25~50%' },
  { name: '爆擊率', desc: '爆擊率 +X%', range: '20~25%' },
  { name: '攻擊速度', desc: '攻擊速度 +X%', range: '20~25%' },
];
const T7_ACC: T7Row[] = [
  { name: '受擊魔抗', desc: '受擊 10% 機率魔法抗性 +X%，持續 5 秒', range: '5~20%' },
  { name: '受擊全屬性', desc: '受擊 10% 機率六大屬性各 +X，持續 5 秒', range: '2~4' },
  { name: '魔法抗性', desc: '魔法抗性 +X%', range: '5~15%' },
  { name: '全屬性', desc: '六大屬性各 +X', range: '1~2' },
  { name: '全免疫', desc: '免疫中毒、流血、暈眩', range: '—' },
];
const t7 = {
  struckDef: { name: '受擊防禦', desc: '受擊 10% 機率防禦 +X，持續 5 秒', range: '10~15' },
  struckVit: { name: '受擊體質', desc: '受擊 10% 機率體質 +X，持續 5 秒', range: '2~4' },
  struckSpi: { name: '受擊精神', desc: '受擊 10% 機率精神 +X，持續 5 秒', range: '2~4' },
  extraDef: { name: '額外防禦', desc: '防禦 +X（固定值）', range: '3~10' },
  eva: { name: '迴避', desc: '迴避值 +X', range: '700~1000' },
  drop: { name: '掉寶率', desc: '掉寶率 +X%', range: '50~100%' },
};
const T7_POOL: Record<Cat, { mode: 'random' | 'fixed'; rows: T7Row[] }> = {
  weapon: { mode: 'random', rows: T7_WEAPON },
  A: { mode: 'random', rows: [t7.struckDef, t7.struckVit, t7.extraDef] },
  B: { mode: 'random', rows: [t7.eva, t7.struckSpi, t7.drop] },
  C: { mode: 'random', rows: T7_WEAPON.slice(3) },
  D: { mode: 'random', rows: [t7.eva, t7.extraDef, t7.drop] },
  E: { mode: 'fixed', rows: [
    { name: '天龍腰帶', desc: '受擊 10% 機率力量 +X，持續 5 秒', range: '2~4' },
    { name: '星辰腰帶', desc: '受擊 10% 機率智力 +X，持續 5 秒', range: '2~4' },
    { name: '幻影腰帶', desc: '受擊 10% 機率敏捷 +X，持續 5 秒', range: '2~4' },
  ] },
  F: { mode: 'fixed', rows: [
    { name: '不朽壁壘', desc: '受擊 10% 機率格擋率 +X%，持續 5 秒', range: '固定 10%' },
    { name: '創世之書', desc: '受擊 10% 機率魔法攻擊 +X，持續 5 秒', range: '5~10' },
    { name: '終焉臂甲', desc: '受擊 10% 機率迴避率 +X%，持續 5 秒', range: '固定 10%' },
  ] },
  G: { mode: 'random', rows: T7_ACC },
  H: { mode: 'random', rows: T7_ACC },
};

function rangeText(code: Code): string {
  if (code === '+1') return '固定 +1 · 無 Tier';
  const t = TABLES[code];
  const u = t.percent ? '%' : '';
  return `${fmt(t.tiers[0][0], t.percent)}${u} ~ ${fmt(t.tiers[6][1], t.percent)}${u}`;
}
function maxText(code: Code): string {
  if (code === '+1') return '+1';
  const t = TABLES[code];
  return `${fmt(t.tiers[6][1], t.percent)}${t.percent ? '%' : ''}`;
}

function TierChips({ code }: { code: Code }) {
  if (code === '+1') return <span className="cat-dim">無 Tier，固定 +1</span>;
  const t = TABLES[code];
  return (
    <div className="cat-tiers">
      {t.tiers.map(([lo, hi], i) => (
        <span key={i} className={`affix-tag tier-${i + 1}`}>
          T{i + 1} {fmt(lo, t.percent)}~{fmt(hi, t.percent)}{t.percent ? '%' : ''}
        </span>
      ))}
    </div>
  );
}

function CategoryView({ cat }: { cat: Cat }) {
  const meta = CATS.find(c => c.key === cat)!;
  const pool = poolOf(cat);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allOpen = Object.keys(pool).every(k => open.has(k));
  const toggle = (k: string) => setOpen(s => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const ownCount = Object.keys(OWN[cat]).length;
  const t7Pool = T7_POOL[cat];

  return (
    <>
      <div className="cat-head">
        <h4>{CAT_SHORT[cat]}{cat === 'F' && '（盾牌、魔導書、臂甲）'}</h4>
        <div className="cat-facts">
          <span>一般詞綴 <strong>{Object.keys(pool).length}</strong> 種
            {cat !== 'weapon' && <>（專屬 {ownCount}・共用 {SHARED.length}）</>}</span>
          <span>免疫詞綴 <strong>{meta.special ? '會出現' : '不會出現'}</strong></span>
          <span>T7 獨有詞綴 <strong>{t7Pool.mode === 'fixed' ? '依裝備指定' : `${t7Pool.rows.length} 選 1`}</strong></span>
          <span>隨機技能 <strong>{meta.ability ? 'T3 以上可帶' : '不會帶'}</strong></span>
        </div>
      </div>
      <div className="cat-toolbar">
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(Object.keys(pool)))}>
          {allOpen ? '收合各階數值' : '展開各階數值'}
        </button>
      </div>

      {GROUPS.map(g => {
        const rows = AFFIXES.filter(a => a.group === g && pool[a.key]);
        if (rows.length === 0) return null;
        return (
          <div key={g}>
            <h4 className="demo-h4">{g}</h4>
            <div className="wiki-table-wrap">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>詞綴</th>
                    <th>效果</th>
                    <th style={{ width: '24%' }}>數值區間（T1~T7）</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap(a => {
                    const code = pool[a.key];
                    const isOpen = open.has(a.key);
                    const out = [
                      <tr key={a.key} className={`cat-row${isOpen ? ' open' : ''}`} onClick={() => toggle(a.key)}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {a.name}
                          {cat !== 'weapon' && SHARED.includes(a.key) && <span className="cat-shared">共用</span>}
                        </td>
                        <td>{a.desc}</td>
                        <td className="cell-number"><span className="wiki-range">{rangeText(code)}</span></td>
                      </tr>,
                    ];
                    if (isOpen) {
                      out.push(
                        <tr key={`${a.key}-tiers`}>
                          <td colSpan={3}><TierChips code={code} /></td>
                        </tr>,
                      );
                    }
                    return out;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {meta.special && (
        <>
          <h4 className="demo-h4">免疫詞綴</h4>
          <div className="wiki-table-wrap">
            <table className="wiki-table">
              <thead><tr><th style={{ width: '22%' }}>詞綴</th><th>效果</th><th style={{ width: '24%' }}>出現條件</th></tr></thead>
              <tbody>
                {SPECIAL.map(s => (
                  <tr key={s.name}>
                    <td><span className="affix-tag special">{s.name}</span></td>
                    <td>{s.desc}</td>
                    <td>固定效果 · Lv.{s.lv}+ 掉落</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4 className="demo-h4">T7 獨有詞綴{t7Pool.mode === 'fixed' ? '（依裝備指定）' : '（均等抽 1 條）'}</h4>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>{t7Pool.mode === 'fixed' ? '裝備' : '名稱'}</th>
              <th>效果</th>
              <th style={{ width: '24%' }}>數值</th>
            </tr>
          </thead>
          <tbody>
            {t7Pool.rows.map(r => (
              <tr key={r.name}>
                <td><span className="affix-tag tier-7">{r.name}</span></td>
                <td>{r.desc}</td>
                <td className="cell-number">{r.range.includes('~') ? <span className="wiki-range">{r.range}</span> : r.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta.ability && (
        <p className="demo-p">
          隨機技能：T3 以上的{cat === 'weapon' ? '武器' : '項鍊、戒指'}可另帶 1 條，清單見下方〈隨機技能〉的
          {cat === 'weapon' ? '武器' : '飾品'}池。
        </p>
      )}
    </>
  );
}

function MatrixView({ onPick }: { onPick: (c: Cat) => void }) {
  return (
    <>
      <div className="wiki-table-wrap">
        <table className="wiki-table cat-matrix">
          <thead>
            <tr>
              <th>詞綴</th>
              {CATS.map(c => (
                <th key={c.key} className="clickable" onClick={() => onPick(c.key)} title={c.parts}>
                  {CAT_SHORT[c.key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AFFIXES.map(a => (
              <tr key={a.key}>
                <td>{a.name}</td>
                {CATS.map(c => {
                  const code = poolOf(c.key)[a.key];
                  return (
                    <td key={c.key} className="cell-number" title={code ? rangeText(code) : ''}>
                      {code ? <span className="wiki-range">{maxText(code)}</span> : <span className="cat-dim">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td>免疫詞綴</td>
              {CATS.map(c => <td key={c.key}>{c.special ? <span className="affix-tag special">✓</span> : <span className="cat-dim">—</span>}</td>)}
            </tr>
            <tr>
              <td><strong>種類數</strong></td>
              {CATS.map(c => <td key={c.key}><strong>{Object.keys(poolOf(c.key)).length}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="demo-p">格內為 T7 上限；滑過看完整區間。點欄位標題看該分類的詳細內容。</p>
    </>
  );
}

function TierTables() {
  const usedBy = (code: Code) => {
    const names = new Set<string>();
    for (const c of CATS) {
      for (const [k, v] of Object.entries(poolOf(c.key))) if (v === code) names.add(AFFIXES.find(a => a.key === k)!.name);
    }
    return [...names].join('、');
  };
  const codes = Object.keys(TABLES) as Exclude<Code, '+1'>[];
  return (
    <>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <th key={n}><span className={`affix-tag tier-${n}`}>T{n}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {codes.map(code => {
              const t = TABLES[code];
              return (
                <tr key={code} title={usedBy(code)}>
                  {t.tiers.map(([lo, hi], i) => (
                    <td key={i} className="cell-number">
                      <span className={`affix-tag tier-${i + 1}`}>{fmt(lo, t.percent)}~{fmt(hi, t.percent)}{t.percent ? '%' : ''}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="demo-p">
        T1~T5 由精鍊印記升階；T6 為怪物掉落；T7 為 Boss 限定掉落。滑過一列看使用它的詞綴。<br />
        同一種詞綴在不同分類可能用不同的表（例：爆擊率在手套每階 2.0%、在項鍊與戒指每階 1.0%），以〈詞綴一覽〉各分類為準。
      </p>
    </>
  );
}

function App() {
  const [view, setView] = useState<Cat | 'matrix'>('weapon');
  return (
    <div>
      <h2 className="wiki-page-title">詞綴</h2>
      <h3 className="demo-h3">詞綴一覽</h3>
      <div className="cat-chips" role="tablist" aria-label="詞綴分類">
        {CATS.map(c => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={view === c.key}
            className={`cat-chip${view === c.key ? ' active' : ''}`}
            onClick={() => setView(c.key)}
          >
            {CAT_SHORT[c.key]}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={view === 'matrix'}
          className={`cat-chip${view === 'matrix' ? ' active' : ''}`}
          onClick={() => setView('matrix')}
        >
          總覽
        </button>
      </div>
      {view === 'matrix' ? <MatrixView onPick={setView} /> : <CategoryView key={view} cat={view} />}

      <h3 className="demo-h3">階級數值</h3>
      <TierTables />

    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
