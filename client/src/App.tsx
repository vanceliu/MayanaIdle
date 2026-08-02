import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from './stores/gameStore';
import { exportCharacterData, downloadExport, importCharacterData } from './systems/characterTransfer';
import { seedDatabase } from './db/seed';
import { loadTemplateCache } from './systems/templateSync';
import { CharacterCreate } from './components/CharacterCreate';
import { CharacterSelect } from './components/CharacterSelect';
import { StatusPanel } from './components/StatusPanel';
import { DiscardConfirmModal } from './components/DiscardConfirmModal';
import { BuffBar } from './components/BuffBar';
import { LeftPanelTabs } from './components/LeftPanelTabs';
import { ScriptEditorModal } from './components/ScriptEditorModal';
import { AttributeUpModal } from './components/AttributeUpModal';
import { BattleView } from './components/BattleView';
import { MapNavigation } from './components/MapNavigation';
import { TownView } from './components/TownView';
import { QuickSlotBar } from './components/QuickSlotBar';
import { QuestTracker } from './components/QuestTracker';
import { RightPanel } from './components/RightPanel';
import { getRegion } from './models/mapData';
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

function App() {
  const phase = useGameStore(s => s.phase);
  const setPhase = useGameStore(s => s.setPhase);
  const initUser = useGameStore(s => s.initUser);
  const loadCharacterList = useGameStore(s => s.loadCharacterList);
  const currentRegion = useGameStore(s => s.character?.currentRegion);

  const region = currentRegion ? getRegion(currentRegion) : null;
  const isInTown = region?.type === 'town';

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function init() {
      await seedDatabase();
      await loadTemplateCache();
      await initUser();
      await loadCharacterList();
    }
    init();
  }, []);

  if (phase === 'title') {
    return (
      <div className="app title-screen">
        <h1>瑪雅那 Idle</h1>
        <p>放置型 ARPG</p>
        <button className="btn-primary" onClick={() => setPhase('characterSelect')}>
          進入遊戲
        </button>
      </div>
    );
  }

  if (phase === 'characterSelect') {
    return (
      <div className="app">
        <CharacterSelect />
      </div>
    );
  }

  if (phase === 'create') {
    return (
      <div className="app">
        <CharacterCreate />
      </div>
    );
  }

  return (
    <div className="app game-layout">
      <aside className="left-panel">
        <StatusPanel />
        <BuffBar />
        <LeftPanelTabs />
        <ScriptEditorModal />
      </aside>
      <main className="center-panel">
        <MapNavigation />
        <div className="center-content">
          {isInTown ? <TownView /> : <BattleView />}
        </div>
        <div className="quick-slot-row">
          <QuickSlotBar />
          <QuestTracker />
        </div>
        <GameToolbar />
      </main>
      <RightPanel />
      <AttributeUpModal />
      <DiscardConfirmModal />
    </div>
  );
}

export default App;
