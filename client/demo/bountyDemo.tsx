/**
 * 懸賞契約（`bounty.html`，`53-bounty-contract.md`）：懸賞分頁、比較設定、追蹤視窗的版面樣本。
 * 契約為假資料（灰脊分部）；價格依 § 53.2 的級距即時計算。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AFFIX_DEFINITIONS, SPECIAL_AFFIX_DEFINITIONS } from '../src/models/affix';

type Kind = 'monster' | 'boss';

interface Contract {
  id: number;
  kind: Kind;
  area: string;
  monster: string;
  priceLevel: number;
  targetKills: number;
}

interface Signed extends Contract {
  kills: number;
  takeBetter: boolean;
}

const MAX_SIGNED = 3;
/** § 53.4 */
const REFRESH_HOURS = [0, 6, 12, 18];

function nextRefreshLabel(now: Date): string {
  const h = REFRESH_HOURS.find(x => x > now.getHours()) ?? 0;
  return `${String(h).padStart(2, '0')}:00`;
}

/** § 53.2 */
function bountyPrice(level: number): { base: number; addon: number } {
  if (level >= 60) return { base: 70_000, addon: 500_000 };
  if (level >= 50) return { base: 60_000, addon: 400_000 };
  if (level >= 40) return { base: 50_000, addon: 300_000 };
  return { base: 30_000, addon: 200_000 };
}

const MONSTER_POOL: Omit<Contract, 'id' | 'kind'>[] = [
  { area: '百柱塔 1-10F', monster: '百柱蜘蛛', priceLevel: 50, targetKills: 72 },
  { area: '龍谷地間 5F', monster: '大莫蜘蛛', priceLevel: 46, targetKills: 58 },
  { area: '龍之谷外圍', monster: '飛龍', priceLevel: 30, targetKills: 91 },
  { area: '百柱塔 61-70F', monster: '霜凍狼', priceLevel: 63, targetKills: 100 },
  { area: '遠古地監 2F', monster: '遠古囚犯', priceLevel: 45, targetKills: 64 },
  { area: '遠古戰場', monster: '戰場骷髏兵', priceLevel: 40, targetKills: 50 },
  { area: '百柱塔 31-40F', monster: '不死骷髏兵', priceLevel: 56, targetKills: 83 },
  { area: '龍谷地間 1F', monster: '高階骷髏鬥士', priceLevel: 40, targetKills: 77 },
];
const BOSS_POOL: Omit<Contract, 'id' | 'kind'>[] = [
  { area: '百柱塔 41-50F', monster: '龍王約特勒', priceLevel: 63, targetKills: 24 },
  { area: '龍谷地間 7F', monster: '安塔巨龍', priceLevel: 50, targetKills: 20 },
  { area: '百柱塔 1-10F', monster: '毒之皇女', priceLevel: 56, targetKills: 30 },
  { area: '遠古地監 9F', monster: '遠古騎士', priceLevel: 65, targetKills: 27 },
];

let nextId = 1;
let poolCursor = 0;
function drawContract(kind: Kind): Contract {
  const pool = kind === 'boss' ? BOSS_POOL : MONSTER_POOL;
  const picked = pool[poolCursor++ % pool.length];
  return { ...picked, id: nextId++, kind };
}
function drawBoard(): (Contract | null)[] {
  return [drawContract('monster'), drawContract('monster'), drawContract('monster'), drawContract('monster'), drawContract('boss')];
}

function sameTarget(a: Contract, b: Contract): boolean {
  return a.kind === b.kind && a.monster === b.monster && (a.kind === 'boss' || a.area === b.area);
}

/** § 53.6.2 */
const CRITERIA = [
  { key: 'wearable', name: '本角色穿得起的' },
  { key: 'preferred', name: '偏好詞綴條數' },
  { key: 'topTier', name: '最高詞綴階級' },
  { key: 'tierSum', name: '詞綴階級加總' },
  { key: 'stability', name: '安定值（再比隨機額外防禦）' },
  { key: 'rangePos', name: '詞綴區間位置加總' },
] as const;
type CriterionKey = typeof CRITERIA[number]['key'];

function KindTag({ kind }: { kind: Kind }) {
  return <span className={`bounty-kind-tag ${kind === 'boss' ? 'is-boss' : ''}`}>[{kind === 'boss' ? 'BOSS懸賞' : '懸賞'}]</span>;
}

function TargetLine({ c }: { c: Contract }) {
  return (
    <span className="shop-item-desc">
      {c.kind === 'boss'
        ? <>擊殺 <strong className="quest-highlight">{c.monster}</strong> <strong className="quest-highlight">{c.targetKills} 隻</strong></>
        : <>在 <strong className="quest-highlight">{c.area}</strong> 擊殺 <strong className="quest-highlight">{c.monster}</strong> <strong className="quest-highlight">{c.targetKills} 隻</strong></>}
    </span>
  );
}

function BoardCard({ c, gold, signed, onSign }: {
  c: Contract; gold: number; signed: Signed[]; onSign: (c: Contract, takeBetter: boolean) => void;
}) {
  const [takeBetter, setTakeBetter] = useState(false);
  const { base, addon } = bountyPrice(c.priceLevel);
  const total = base + (takeBetter ? addon : 0);
  const reason = gold < total ? '金幣不足'
    : signed.length >= MAX_SIGNED ? `已簽 ${MAX_SIGNED} 張`
    : signed.some(s => sameTarget(s, c)) ? '已有相同對象的契約'
    : null;
  return (
    <div className="shop-item">
      <div className="shop-item-info">
        <span className="shop-item-name"><KindTag kind={c.kind} /> {c.monster}</span>
        <TargetLine c={c} />
        <label className="bounty-addon">
          <input type="checkbox" checked={takeBetter} onChange={e => setTakeBetter(e.target.checked)} />
          掉兩次取比較好（+{addon.toLocaleString()}G）
        </label>
        <span className={`bounty-price ${gold < total ? 'lacking' : ''}`}>💰 {total.toLocaleString()} 金幣</span>
      </div>
      <div className="shop-item-actions">
        <div className="bounty-actions">
          <button disabled={reason != null} onClick={() => onSign(c, takeBetter)}>簽約</button>
          {reason && <span className="bounty-block-reason">{reason}</span>}
        </div>
      </div>
    </div>
  );
}

function SignedCard({ s, paused, onAbandon }: { s: Signed; paused: boolean; onAbandon: (id: number) => void }) {
  return (
    <div className="shop-item">
      <div className="shop-item-info">
        <span className="shop-item-name">
          <KindTag kind={s.kind} /> {s.monster}
          {s.takeBetter && <span className="bounty-addon-tag">掉兩次取較好</span>}
          {paused && <span className="bounty-paused-tag">組隊中暫停</span>}
        </span>
        <TargetLine c={s} />
        <span className="quest-progress">進度：<strong>{s.kills}/{s.targetKills}</strong></span>
      </div>
      <div className="shop-item-actions">
        <button className="btn-danger" onClick={() => onAbandon(s.id)}>放棄</button>
      </div>
    </div>
  );
}

function CompareSettings({ order, enabled, affixes, setOrder, setEnabled, setAffixes, onBack }: {
  order: CriterionKey[]; enabled: Record<CriterionKey, boolean>; affixes: Set<string>;
  setOrder: (o: CriterionKey[]) => void;
  setEnabled: (e: Record<CriterionKey, boolean>) => void;
  setAffixes: (a: Set<string>) => void;
  onBack: () => void;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const toggleAffix = (type: string) => {
    const next = new Set(affixes);
    if (next.has(type)) next.delete(type); else next.add(type);
    setAffixes(next);
  };
  const groups = [...new Set(AFFIX_DEFINITIONS.map(d => d.group))];
  return (
    <div className="panel-scroll bounty-settings">
      <button onClick={onBack} style={{ marginBottom: 8 }}>← 返回懸賞清單</button>
      <h4>比較條件</h4>
      <p className="bounty-hint">「掉兩次取比較好」掉到裝備時，依這個順序比較兩件，分出勝負就停。關掉的條件跳過。</p>
      <div className="bounty-criteria">
        {order.map((key, i) => {
          const name = CRITERIA.find(c => c.key === key)!.name;
          return (
            <div key={key} className={`bounty-criterion ${enabled[key] ? '' : 'is-off'}`}>
              <span className="bounty-criterion-rank">{i + 1}</span>
              <span className="bounty-criterion-name">{name}</span>
              <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">▲</button>
              <button disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="下移">▼</button>
              <label><input type="checkbox" checked={enabled[key]} onChange={e => setEnabled({ ...enabled, [key]: e.target.checked })} /> 啟用</label>
            </div>
          );
        })}
        <div className="bounty-criterion is-fixed">
          <span className="bounty-criterion-rank">—</span>
          <span className="bounty-criterion-name">全部相同：留第一件</span>
        </div>
      </div>
      <h4>偏好詞綴（已選 {affixes.size}）</h4>
      <p className="bounty-hint">命中條數多的那件勝出；沒有勾選時這條視為相同。</p>
      {groups.map(g => (
        <div key={g} className="bounty-affix-group">
          <div className="bounty-affix-group-title">{g}</div>
          <div className="bounty-affix-list">
            {AFFIX_DEFINITIONS.filter(d => d.group === g).map(d => (
              <label key={d.type}><input type="checkbox" checked={affixes.has(d.type)} onChange={() => toggleAffix(d.type)} />{d.name}</label>
            ))}
          </div>
        </div>
      ))}
      <div className="bounty-affix-group">
        <div className="bounty-affix-group-title">特殊詞綴</div>
        <div className="bounty-affix-list">
          {SPECIAL_AFFIX_DEFINITIONS.map(d => (
            <label key={d.type}><input type="checkbox" checked={affixes.has(d.type)} onChange={() => toggleAffix(d.type)} />{d.name}</label>
          ))}
        </div>
      </div>
    </div>
  );
}

function useSlider(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement;
  const [v, setV] = useState(el.type === 'checkbox' ? Number(el.checked) : Number(el.value));
  useEffect(() => {
    const on = () => setV(el.type === 'checkbox' ? Number(el.checked) : Number(el.value));
    el.addEventListener('input', on);
    el.addEventListener('change', on);
    return () => { el.removeEventListener('input', on); el.removeEventListener('change', on); };
  }, [el]);
  return v;
}

function App() {
  const sliderGold = useSlider('gold');
  const party = useSlider('party') === 1;
  const [spentGold, setSpentGold] = useState(0);
  const gold = Math.max(0, sliderGold - spentGold);
  useEffect(() => { setSpentGold(0); }, [sliderGold]);
  useEffect(() => {
    document.getElementById('gold-label')!.textContent = `${gold.toLocaleString()}G`;
  }, [gold]);

  const [board, setBoard] = useState<(Contract | null)[]>(drawBoard);
  const [signed, setSigned] = useState<Signed[]>([
    { ...drawContract('monster'), kills: 31, takeBetter: true },
  ]);
  const [tab, setTab] = useState<'adventurer' | 'class' | 'bounty'>('bounty');
  const [view, setView] = useState<'board' | 'settings'>('board');
  const [order, setOrder] = useState<CriterionKey[]>(CRITERIA.map(c => c.key));
  const [enabled, setEnabled] = useState<Record<CriterionKey, boolean>>(
    Object.fromEntries(CRITERIA.map(c => [c.key, true])) as Record<CriterionKey, boolean>,
  );
  const [affixes, setAffixes] = useState<Set<string>>(new Set(['attack_power', 'crit_rate']));

  const sign = (c: Contract, takeBetter: boolean) => {
    const { base, addon } = bountyPrice(c.priceLevel);
    setSpentGold(g => g + base + (takeBetter ? addon : 0));
    setSigned(s => [...s, { ...c, kills: 0, takeBetter }]);
    setBoard(b => b.map(x => (x?.id === c.id ? null : x)));
  };
  const abandon = (id: number) => setSigned(s => s.filter(x => x.id !== id));
  const refresh = () => setBoard(drawBoard());

  return (
    <div className="demo-grid">
      <section className="demo-card demo-guild">
        <h2>冒險者工會 — 懸賞</h2>
        <div className="guild-panel">
          <p className="shop-greeting">「有什麼任務想接嗎？」</p>
          <div className="storage-tabs">
            <button className={tab === 'adventurer' ? 'active' : ''} onClick={() => setTab('adventurer')}>冒險任務</button>
            <button className={tab === 'class' ? 'active' : ''} onClick={() => setTab('class')}>職業任務</button>
            <button className={tab === 'bounty' ? 'active' : ''} onClick={() => setTab('bounty')}>懸賞</button>
          </div>
          {tab !== 'bounty' && <p className="empty-text">（demo 只做懸賞分頁）</p>}
          {tab === 'bounty' && view === 'settings' && (
            <CompareSettings
              order={order} enabled={enabled} affixes={affixes}
              setOrder={setOrder} setEnabled={setEnabled} setAffixes={setAffixes}
              onBack={() => setView('board')}
            />
          )}
          {tab === 'bounty' && view === 'board' && (
            <>
              <div className="adventurer-guild-status">
                <span>金幣：{gold.toLocaleString()}G</span>
                <span>已簽：{signed.length}/{MAX_SIGNED}</span>
              </div>
              <div className="panel-scroll">
                {signed.length > 0 && (
                  <>
                    <h4>進行中的懸賞</h4>
                    <div className="shop-items">
                      {signed.map(s => <SignedCard key={s.id} s={s} paused={party} onAbandon={abandon} />)}
                    </div>
                  </>
                )}
                <div className="shop-tabs panel-sticky">
                  <span className="quest-town-label">灰脊分部</span>
                  <button onClick={() => setView('settings')}>比較設定</button>
                  <span className="bounty-next-refresh">下次更新 {nextRefreshLabel(new Date())}</span>
                  <button onClick={refresh} title="demo 用">模擬到達更新時刻</button>
                </div>
                <div className="shop-items">
                  {board.map((c, i) => c
                    ? <BoardCard key={c.id} c={c} gold={gold} signed={signed} onSign={sign} />
                    : <div key={`empty-${i}`} className="bounty-empty-slot">已簽約，下次更新補上</div>)}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="demo-card demo-tracker">
        <h2>任務追蹤 — 懸賞</h2>
        <div className="quest-tracker-content">
          {signed.length === 0 && <p className="empty-text">目前無進行中的任務</p>}
          {signed.map(s => (
            <div key={s.id} className="quest-tracker-item">
              <div className="tracker-title">
                <span className="tracker-source">[懸賞]</span>
                {s.monster}
                {s.takeBetter && <span className="bounty-addon-tag">掉兩次取較好</span>}
                {party && <span className="bounty-paused-tag">暫停</span>}
              </div>
              <div className="tracker-area">{s.kind === 'boss' ? 'BOSS' : s.area}</div>
              <div className="tracker-progress">擊殺 <strong>{s.kills}/{s.targetKills}</strong></div>
              <div className="tracker-actions">
                <button className="btn-danger tracker-cancel" onClick={() => abandon(s.id)}>放棄</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
