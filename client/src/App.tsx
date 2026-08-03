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
import { CombatLogWindow } from './components/CombatLogWindow';
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

export function GameToolbar() {
  const logout = useGameStore(s => s.logout);
  const character = useGameStore(s => s.character);
  const selectCharacter = useGameStore(s => s.selectCharacter);
  const uploadOwnStats = useGameStore(s => s.uploadOwnStats);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    if (!character?.id) return;

    // § 19.9：匯出檔含該角色的排行榜寫入密鑰，而檔案的加密金鑰就寫在前端原始碼裡，
    // 等同明文。外流＝對方能覆寫你的排行榜資料，所以這件事必須講在下載之前。
    const confirmed = window.confirm(
      '匯出檔含有這個角色的身分憑證，等同密碼。\n\n' +
      '取得檔案的人可以覆寫你在排行榜上的紀錄，請勿分享或上傳到雲端硬碟、聊天室等地方。\n\n' +
      '確定要匯出嗎？'
    );
    if (!confirmed) return;

    try {
      // 先把統計推一次，讓密鑰在伺服端綁定好再讓檔案出門（§ 37.4.3）。
      // **刻意不檢查結果**：密鑰已經寫進本機與匯出檔，兩台裝置拿到的是同一把，
      // 誰先上傳誰綁定、另一台照樣相符。拿連線當匯出的門檻只會讓玩家在
      // 最需要備份的時候備份不了。
      await uploadOwnStats({ force: true });

      const json = await exportCharacterData(character.id);
      downloadExport(json, character.name);
    } catch (e) {
      alert(`匯出失敗: ${(e as Error).message}`);
    }
  }, [character, uploadOwnStats]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !character?.id) return;

    // § 19.9：匯入是「還原完整身分」，名稱與 uuid 都會被檔案取代
    const confirmed = window.confirm(
      '匯入將覆蓋當前角色的所有資料，包含名稱與排行榜身分。\n\n' +
      '這一格原本的角色會從排行榜上停止更新。確定繼續？'
    );
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
      {/* 版本號貼在 Wiki 旁邊：回報問題時兩個資訊會一起被截到 */}
      <BuildLabel />
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

  return <GameLayout isInTown={isInTown} />;
}

/**
 * 遊戲主畫面框架（§ 32.3）。
 *
 * 三段式：頂部（地圖選擇 + 探索控制 + 面板按鈕 + 系統按鈕）／stage（純地圖或城鎮）／
 * 底部（戰鬥日誌 + 狀態面板 + 快捷格）。獨立成元件是為了讓版面測試不必經過 DB 開機流程。
 */
export function GameLayout({ isInTown }: { isInTown: boolean }) {
  return (
    <div className="app game-layout">
      {/*
       * 底層：遊戲畫面鋪滿整個視窗，所有 HUD 都疊在它上面。
       * 城鎮現在也是一張地圖（§ 13.2.1），所以兩邊都走 BattleView；
       * TownView 只剩「設施快捷列 + 設施面板」疊在地圖上。
       */}
      <div className="stage-area">
        <BattleView />
      </div>
      {isInTown && <TownView />}

      {/* 左上：角色狀態卡，buff 接在它下面 */}
      <div className="hud hud-topleft">
        <StatusPanel />
        <BuffBar />
      </div>

      {/* 右上：只放地圖選擇器（系統按鈕與版本標示都在右下角） */}
      <div className="hud hud-topright">
        <MapNavigation />
      </div>

      {/* 戰鬥日誌：可拖曳的視窗，預設停在左下角 */}
      <CombatLogWindow />

      {/* 底部中央：探索控制 + 快捷格。城鎮沒有探索控制，但保留位置讓快捷格不位移 */}
      <div className="hud hud-bottomcenter">
        <div className={`explore-bar-slot ${isInTown ? 'is-hidden' : ''}`}>
          <ExploreBar />
        </div>
        <QuickSlotBar />
      </div>

      {/* 右下：面板按鈕 + 系統按鈕（Wiki／匯出／匯入／登出） */}
      <div className="hud hud-bottomright">
        <PanelDock />
        <GameToolbar />
      </div>

      <PanelWindows />
      <AttributeUpModal />
      <DiscardConfirmModal />
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
