import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from './stores/gameStore';
import { exportCharacterData, downloadExport, importCharacterData } from './systems/characterTransfer';
import { seedDatabase } from './db/seed';
import { loadTemplateCache } from './systems/templateSync';
import { purgeOutdatedData } from './systems/dataVersionPurge';
import { CharacterCreate } from './components/CharacterCreate';
import { CharacterSelect } from './components/CharacterSelect';
import { LegacyArchiveView } from './components/LegacyArchiveView';
import { StatusPanel } from './components/StatusPanel';
import { DiscardConfirmModal } from './components/DiscardConfirmModal';
import { BuffBar } from './components/BuffBar';
import { AttributeUpModal } from './components/AttributeUpModal';
import { BattleView } from './components/BattleView';
import { ExploreBar } from './components/ExploreBar';
import { MapNavigation } from './components/MapNavigation';
import { TownView } from './components/TownView';
import { QuickSlotBar } from './components/QuickSlotBar';
import { PanelDock } from './components/PanelDock';
import { PanelWindows } from './components/PanelWindows';
import { getRegion } from './models/mapData';
import { formatBuildLabel, formatBuildTime } from './buildInfo';
import './App.css';

function GameToolbar() {
  const logout = useGameStore(s => s.logout);
  const character = useGameStore(s => s.character);
  const selectCharacter = useGameStore(s => s.selectCharacter);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    if (!character?.id) return;
    try {
      const json = await exportCharacterData(character.id);
      downloadExport(json, character.name);
    } catch (e) {
      alert(`匯出失敗: ${(e as Error).message}`);
    }
  }, [character]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !character?.id) return;

    const confirmed = window.confirm('匯入將覆蓋當前角色的所有資料，確定繼續？');
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    try {
      const json = await file.text();
      await importCharacterData(json, character.id);
      await selectCharacter(character.id);
      alert('匯入成功！');
    } catch (err) {
      alert(`匯入失敗: ${(err as Error).message}`);
    }
    e.target.value = '';
  }, [character, selectCharacter]);

  return (
    <div className="game-toolbar">
      <a className="btn-wiki" href="/MayanaIdle/wiki" target="_blank" rel="noopener noreferrer">
        Wiki
      </a>
      <button className="btn-transfer" onClick={handleExport} title="匯出角色">
        匯出
      </button>
      <button className="btn-transfer" onClick={() => fileInputRef.current?.click()} title="匯入角色">
        匯入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dat"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
      <button className="btn-logout" onClick={logout}>
        登出
      </button>
    </div>
  );
}

/**
 * 把開機失敗轉成玩家看得懂、且指得出下一步的訊息。
 *
 * 最常見的是 Dexie 的 `VersionError`：瀏覽器的 IndexedDB 已經升到較新的版本，
 * 卻載到只認得舊版本的程式碼（部署回滾，或快取到舊 bundle）。
 * 見 `docs/RELEASE.md` § 7.3。
 */
export function describeInitError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'VersionError') {
    return '此瀏覽器的存檔是由較新版本建立的，目前載入的是舊版程式。請重新整理頁面取得最新版本。';
  }
  if (name === 'QuotaExceededError') {
    return '瀏覽器儲存空間不足，無法載入存檔。請清出空間後重新整理。';
  }
  if (name === 'InvalidStateError' || name === 'SecurityError') {
    return '無法存取瀏覽器資料庫。若使用無痕模式或封鎖了網站資料，請改用一般視窗。';
  }
  return `載入失敗：${message}`;
}

function App() {
  const phase = useGameStore(s => s.phase);
  const setPhase = useGameStore(s => s.setPhase);
  const initUser = useGameStore(s => s.initUser);
  const loadCharacterList = useGameStore(s => s.loadCharacterList);
  const currentRegion = useGameStore(s => s.character?.currentRegion);
  const [initError, setInitError] = useState<string | null>(null);

  const region = currentRegion ? getRegion(currentRegion) : null;
  const isInTown = region?.type === 'town';

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function init() {
      await seedDatabase();
      await loadTemplateCache();
      // 必須在 loadCharacterList 之前：讓過期角色在選擇畫面出現之前就消失，
      // 而不是「點下去角色才不見」
      await purgeOutdatedData();
      await initUser();
      await loadCharacterList();
    }
    // 不可靜默失敗：開機流程掛掉會讓畫面停在標題頁或空白，玩家完全沒有線索
    init().catch((err: unknown) => {
      console.error('[App] 初始化失敗', err);
      setInitError(describeInitError(err));
    });
  }, []);

  if (initError) {
    return (
      <div className="app init-error-screen">
        <h2>無法啟動遊戲</h2>
        <p className="init-error-detail">{initError}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>重新整理</button>
        <BuildLabel />
      </div>
    );
  }

  if (phase === 'title') {
    return (
      <div className="app title-screen">
        <h1>瑪雅那 Idle</h1>
        <p>放置型 ARPG</p>
        <button className="btn-primary" onClick={() => setPhase('characterSelect')}>
          進入遊戲
        </button>
        <BuildLabel />
      </div>
    );
  }

  if (phase === 'characterSelect') {
    return (
      <div className="app">
        <CharacterSelect />
        <BuildLabel />
      </div>
    );
  }

  if (phase === 'create') {
    return (
      <div className="app">
        <CharacterCreate />
        <BuildLabel />
      </div>
    );
  }

  // § 45.3：遺產頁唯讀，只能返回角色選擇，不掛任何遊玩中的 UI
  if (phase === 'legacy') {
    return (
      <div className="app">
        <LegacyArchiveView />
        <BuildLabel />
      </div>
    );
  }

  return (
    <div className="app game-layout">
      <div className="top-hud">
        <StatusPanel />
        <div className="top-hud-nav">
          <MapNavigation />
          {/* 城鎮沒有探索控制，但仍保留這一排的位置，讓城鎮與野外的 UI 高度一致 */}
          <div className={`explore-bar-slot ${isInTown ? 'is-hidden' : ''}`}>
            <ExploreBar />
          </div>
        </div>
      </div>

      {/* 探索與城鎮共用的 stage 容器，BuffBar 固定浮在左上（§ 24.8.1） */}
      <div className="stage-area">
        <BuffBar />
        {isInTown ? <TownView /> : <BattleView />}
      </div>

      <div className="bottom-bar">
        <QuickSlotBar />
        <PanelDock />
      </div>

      <GameToolbar />
      <PanelWindows />
      <AttributeUpModal />
      <DiscardConfirmModal />
      <BuildLabel />
    </div>
  );
}

/** 建置版本標示，回報問題時用來確認玩家跑的是哪一版 */
function BuildLabel() {
  return (
    <div className="build-label" title={formatBuildTime()}>
      {formatBuildLabel()}
    </div>
  );
}

export default App;
