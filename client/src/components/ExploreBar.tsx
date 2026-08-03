import { useGameStore } from '../stores/gameStore';

/**
 * 探索控制列（自動/手動搜尋、探索/戰鬥指示、死亡橫幅）
 * 位於頂部 HUD，與地圖選擇器同一列（16-tech-frontend-architecture.md § 32.3）。
 */
export function ExploreBar() {
  const phase = useGameStore(s => s.phase);
  const manualSearch = useGameStore(s => s.manualSearch);
  const cancelManualSearch = useGameStore(s => s.cancelManualSearch);
  const isManualSearching = useGameStore(s => s.isManualSearching);
  const searchMode = useGameStore(s => s.searchMode);
  const setSearchMode = useGameStore(s => s.setSearchMode);

  return (
    <div className="battle-top-bar">
      <div className="explore-bar">
        <div className="search-mode-toggle">
          <button className={searchMode === 'auto' ? 'active' : ''} onClick={() => setSearchMode('auto')}>自動搜尋</button>
          <button className={searchMode === 'manual' ? 'active' : ''} onClick={() => setSearchMode('manual')}>手動搜尋</button>
        </div>
        {searchMode === 'manual' && phase === 'explore' && !isManualSearching && (
          <button className="btn-search" onClick={manualSearch}>搜尋</button>
        )}
        {searchMode === 'manual' && phase === 'explore' && isManualSearching && (
          <button className="btn-search searching" onClick={cancelManualSearch}>取消搜尋</button>
        )}
        {searchMode === 'auto' && phase === 'explore' && (
          <span className="explore-indicator">探索中...</span>
        )}
        {phase === 'combat' && (
          <span className="explore-indicator combat-indicator">戰鬥中</span>
        )}
      </div>

      {phase === 'dead' && (
        <div className="death-banner">你倒下了 — 已傳送至最近城鎮</div>
      )}
    </div>
  );
}
