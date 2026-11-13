/**
 * 統計中心「競技場」分頁（`55-arena.md` § 55.7）：段位 × 單人／組隊 × 職業。
 * 排序與筆數由 server 決定（`arena_ranking`）。
 */
import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { CLASS_NAMES_ZH, type ClassName } from '../../models/character';
import { ARENA_TIERS } from '../../models/arena';
import type { ArenaRankingRow } from '../../net/protocol';
import { connection } from '../../net/connection';
import { formatArenaTime } from '../ArenaHud';

const OPEN_TIERS = ARENA_TIERS.filter(t => t.open).map(t => t.tier);
const CLASSES = Object.keys(CLASS_NAMES_ZH) as ClassName[];

export function ArenaRanking() {
  const myName = useGameStore(s => s.character?.name);
  const [tier, setTier] = useState<number>(OPEN_TIERS[0]);
  const [party, setParty] = useState(false);
  const [className, setClassName] = useState<ClassName | ''>('');
  const [rows, setRows] = useState<ArenaRankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    connection.requestArenaRanking({ tier, party, className: className || undefined })
      .then(r => { if (alive) setRows(r); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : '載入失敗'); });
    return () => { alive = false; };
  }, [tier, party, className]);

  return (
    <div className="stats-expanded">
      <div className="arena-rank-filters">
        {OPEN_TIERS.map(t => (
          <button key={t} className={tier === t ? 'active' : ''} onClick={() => setTier(t)}>T{t}</button>
        ))}
        <span className="arena-rank-sep" />
        <button className={!party ? 'active' : ''} onClick={() => setParty(false)}>單人</button>
        <button className={party ? 'active' : ''} onClick={() => setParty(true)}>組隊</button>
        <span className="arena-rank-sep" />
        <select aria-label="職業" value={className} onChange={e => setClassName(e.target.value as ClassName | '')}>
          <option value="">職業綜合</option>
          {CLASSES.map(c => <option key={c} value={c}>{CLASS_NAMES_ZH[c]}</option>)}
        </select>
      </div>
      <div className="stats-table">
        <div className="stats-table-header">
          <span className="stats-col-rank">#</span>
          <span className="stats-col-name">角色名稱</span>
          <span className="stats-col-value">波次</span>
          <span className="stats-col-value">時間</span>
        </div>
        {error ? (
          <div className="stats-empty">{error}</div>
        ) : rows == null ? (
          <div className="stats-loading">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="stats-empty">暫無資料</div>
        ) : rows.map((r, i) => (
          <div key={`${r.name}-${i}`} className={`stats-table-row ${r.name === myName ? 'my-row' : ''}`}>
            <span className="stats-col-rank">{i + 1}</span>
            <span className="stats-col-name">
              {r.name}
              <span className="stats-class-tag">{CLASS_NAMES_ZH[r.className as ClassName] ?? r.className}</span>
            </span>
            <span className="stats-col-value">{r.wave}</span>
            <span className="stats-col-value">{formatArenaTime(r.timeMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
