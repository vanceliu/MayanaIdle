import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './stores/gameStore';
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
import { GameToolbar } from './components/GameToolbar';
import { BuildLabel } from './components/BuildLabel';
import { PanelWindows } from './components/PanelWindows';
import { DragGhost } from './components/DragGhost';
import { useWindowLayerStore, useWindowZIndex } from './stores/windowLayerStore';
import { useHudBandBottom } from './hooks/useHudBand';
import { getRegion } from './models/mapData';
import './App.css';

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
  // 地圖選擇器展開時會蓋到城鎮視窗，所以它也要能被提到最上層（§ 32.15）
  const mapNavZIndex = useWindowZIndex('map-nav');
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  // 底部常駐 HUD 的實際帶寬，供設施視窗讓位（§ 32.15.1）
  useHudBandBottom();

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

      {/*
        * 上方 HUD 帶。桌機是 `display: contents` —— 這個容器在版面上不存在，
        * 兩座島仍各自貼在左上／右上角，版面與過去完全相同（§ 32.3）。
        * 手機才變成真正的容器，把兩者疊成一條全寬的狀態列（`47-mobile.md`）。
        * 用 `display: contents` 而不是條件渲染，是為了不讓兩種版面各長一份 JSX。
        */}
      <div className="hud-topbar">
        {/* 左上：角色狀態卡，buff 接在它下面 */}
        <div className="hud hud-topleft">
          <StatusPanel />
          <BuffBar />
        </div>

        {/* 右上：只放地圖選擇器（系統按鈕與版本標示都在右下角） */}
        <div
          className="hud hud-topright"
          style={{ zIndex: mapNavZIndex }}
          onPointerDown={() => focusWindow('map-nav')}
        >
          <MapNavigation />
        </div>
      </div>

      {/* 戰鬥日誌：可拖曳的視窗，預設停在左下角 */}
      <CombatLogWindow />

      {/*
        * 下方 HUD 帶。同樣是桌機 `display: contents`、手機才成形（`47-mobile.md`）。
        * 手機上這條**不疊在地圖上**：快捷格與面板按鈕是唯一的觸控入口，
        * 半透明地蓋在會動的地圖上會看不清楚，改成把地圖讓出這段高度。
        */}
      <div className="hud-bottombar">
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
      </div>

      <PanelWindows />
      <AttributeUpModal />
      <DiscardConfirmModal />
      {/* 指標拖曳的殘影（`47-mobile.md`）。掛在最外層，任何面板拖出來的東西都畫得到 */}
      <DragGhost />
    </div>
  );
}

/**
 * 這兩個元件已搬到 `components/`；此處保留轉出，讓既有的匯入路徑不必全部改寫。
 */
export { GameToolbar, BuildLabel };

export default App;
