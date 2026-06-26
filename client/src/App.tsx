import { useEffect, useRef } from 'react';
import { useGameStore } from './stores/gameStore';
import { seedDatabase } from './db/seed';
import { loadTemplateCache } from './systems/templateSync';
import { CharacterCreate } from './components/CharacterCreate';
import { CharacterSelect } from './components/CharacterSelect';
import { StatusPanel } from './components/StatusPanel';
import { BuffBar } from './components/BuffBar';
import { LeftPanelTabs } from './components/LeftPanelTabs';
import { ScriptEditorModal } from './components/ScriptEditorModal';
import { AttributeUpModal } from './components/AttributeUpModal';
import { BattleView } from './components/BattleView';
import { MapNavigation } from './components/MapNavigation';
import { TownView } from './components/TownView';
import { QuickSlotBar } from './components/QuickSlotBar';
import { RightPanel } from './components/RightPanel';
import { getRegion } from './models/mapData';
import './App.css';

function GameToolbar() {
  const logout = useGameStore(s => s.logout);

  return (
    <div className="game-toolbar">
      <a className="btn-wiki" href="/MayanaIdle/wiki" target="_blank" rel="noopener noreferrer">
        Wiki
      </a>
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
        <QuickSlotBar />
        <GameToolbar />
      </main>
      <RightPanel />
      <AttributeUpModal />
    </div>
  );
}

export default App;
