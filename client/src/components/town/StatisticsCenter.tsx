import { useState, useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { CLASS_NAMES_ZH } from '../../models/character';
import type { ClassName } from '../../models/character';
import {
  fetchSnapshot,
  readCachedSnapshot,
  buildBoard,
  LeaderboardError,
  LEADERBOARD_FIELDS,
  LEADERBOARD_LABELS,
  type LeaderboardField,
  type LeaderboardSnapshot,
} from '../../services/leaderboardService';

/** 九宮格每個榜單顯示的名次數 */
const CARD_LIMIT = 5;
/** 展開檢視顯示的名次數（等同伺服端 snapshot 的 top） */
const EXPANDED_LIMIT = 20;

export function StatisticsCenter() {
  const character = useGameStore(s => s.character);
  const statistics = useGameStore(s => s.statistics);
  const guildProgress = useGameStore(s => s.guildProgress);
  const uploadOwnStats = useGameStore(s => s.uploadOwnStats);

  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(() => readCachedSnapshot());
  const [loading, setLoading] = useState(false);
  const [expandedField, setExpandedField] = useState<LeaderboardField | null>(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'leaderboard' | 'my-stats'>('leaderboard');
  const syncingRef = useRef(false);

  const myUuid = character?.uuid ?? null;

  useEffect(() => {
    if (tab !== 'leaderboard') return;

    // 快取仍在 10 分鐘內 → 完全不打 API（§ 37.4.4）
    const cached = readCachedSnapshot();
    if (cached) {
      setSnapshot(cached);
      return;
    }
    void sync();
    // sync 只依賴 ref 與 store 快照，不需列入依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /** 上傳自己的統計（必要時補註冊），再抓一次 snapshot。整趟最多 1 次 GET。 */
  async function sync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setLoading(true);
    setMessage('');
    try {
      await uploadAndReport();
      const fresh = await fetchSnapshot({ force: true });
      setSnapshot(fresh);
    } catch (err) {
      if (!snapshot) setMessage(err instanceof LeaderboardError && err.code === 'network'
        ? '無法連線到排行榜伺服器'
        : '無法載入排行榜');
    } finally {
      setLoading(false);
      syncingRef.current = false;
    }
  }

  /** 上傳邏輯在 store（匯出時也要用同一份），這裡只負責把結果碼翻成提示文字 */
  async function uploadAndReport() {
    switch (await uploadOwnStats()) {
      case 'outdated_client':
        // 部署期間的版本落差，或瀏覽器快取到舊 bundle
        setMessage('遊戲已更新，請重新整理頁面以繼續上傳統計');
        break;
      case 'invalid_auth_token':
        // 該 uuid 已被別的密鑰綁定：多半是同一份匯出檔在兩台裝置各自產生過密鑰
        setMessage('此角色的排行榜紀錄由另一份存檔持有，統計無法上傳');
        break;
      case 'invalid_name':
        setMessage('角色名稱不符合現行規則，此角色無法登上排行榜');
        break;
      // 其餘（含上傳失敗）不擋排行榜瀏覽
    }
  }

  // 14 個榜單全部由同一份 snapshot 在本地切出，不再各打一支 API
  const boards = useMemo(
    () => (snapshot
      ? LEADERBOARD_FIELDS.map(field => ({ field, entries: buildBoard(snapshot, field, CARD_LIMIT) }))
      : []),
    [snapshot],
  );

  const expandedEntries = useMemo(
    () => (snapshot && expandedField ? buildBoard(snapshot, expandedField, EXPANDED_LIMIT) : []),
    [snapshot, expandedField],
  );

  const isMine = (characterId: string) => !!myUuid && myUuid === characterId;

  return (
    <div className="statistics-center">
      <div className="stats-tabs">
        <button
          className={`stats-tab ${tab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setTab('leaderboard')}
        >
          排行榜
        </button>
        <button
          className={`stats-tab ${tab === 'my-stats' ? 'active' : ''}`}
          onClick={() => setTab('my-stats')}
        >
          我的統計
        </button>
      </div>

      {/* 只有榜單內容會捲動，分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'leaderboard' && !expandedField && (
        <div className="stats-leaderboard">
          {loading ? (
            <div className="stats-loading">載入中...</div>
          ) : boards.length === 0 ? (
            <div className="stats-empty">暫無資料</div>
          ) : (
            <div className="stats-grid">
              {boards.map(board => (
                <div
                  key={board.field}
                  className="stats-card"
                  onClick={() => setExpandedField(board.field)}
                >
                  <div className="stats-card-title">{LEADERBOARD_LABELS[board.field]}</div>
                  <div className="stats-card-list">
                    {board.entries.length === 0 ? (
                      <div className="stats-card-empty">-</div>
                    ) : (
                      board.entries.map(entry => (
                        <div
                          key={entry.character_id}
                          className={`stats-card-row ${isMine(entry.character_id) ? 'my-row' : ''}`}
                        >
                          <span className="stats-card-rank">{entry.rank}</span>
                          <span className="stats-card-name">
                            {entry.display_name}
                            {board.field === 'character_level' && <span className="stats-class-tag">{CLASS_NAMES_ZH[entry.class_name as ClassName] ?? entry.class_name}</span>}
                          </span>
                          <span className="stats-card-value">{entry.value.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {message && <div className="stats-message">{message}</div>}
        </div>
      )}

      {tab === 'leaderboard' && expandedField && (
        <div className="stats-expanded">
          <div className="stats-expanded-header">
            <button className="stats-back-btn" onClick={() => setExpandedField(null)}>← 返回</button>
            <span className="stats-expanded-title">{LEADERBOARD_LABELS[expandedField]} 排行榜</span>
          </div>
          <div className="stats-table">
            <div className="stats-table-header">
              <span className="stats-col-rank">#</span>
              <span className="stats-col-name">角色名稱</span>
              <span className="stats-col-value">{LEADERBOARD_LABELS[expandedField]}</span>
            </div>
            {expandedEntries.length === 0 ? (
              <div className="stats-empty">暫無資料</div>
            ) : (
              expandedEntries.map(entry => (
                <div
                  key={entry.character_id}
                  className={`stats-table-row ${isMine(entry.character_id) ? 'my-row' : ''}`}
                >
                  <span className="stats-col-rank">{entry.rank}</span>
                  <span className="stats-col-name">
                    {entry.display_name}
                    {expandedField === 'character_level' && <span className="stats-class-tag">{CLASS_NAMES_ZH[entry.class_name as ClassName] ?? entry.class_name}</span>}
                  </span>
                  <span className="stats-col-value">{entry.value.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'my-stats' && statistics && (
        <div className="stats-my">
          <div className="stats-my-grid">
            {LEADERBOARD_FIELDS.map(f => {
              let value = 0;
              if (f === 'character_level') {
                value = character?.level ?? 0;
              } else if (f === 'contribution') {
                value = guildProgress.points;
              } else {
                value = (statistics[f as keyof typeof statistics] as number) ?? 0;
              }
              return (
                <div key={f} className="stats-my-item">
                  <span className="stats-my-label">{LEADERBOARD_LABELS[f]}</span>
                  <span className="stats-my-value">{value.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
