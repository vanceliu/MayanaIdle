import { useState } from 'react';
import { CharacterStats } from './CharacterStats';
import { EquipmentPanel } from './EquipmentPanel';

type TabKey = 'equipment' | 'stats';

export function LeftPanelTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>('equipment');

  return (
    <div className="left-panel-tabs">
      <div className="tab-header">
        <button
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          詳細狀態
        </button>
        <button
          className={`tab-btn ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          裝備欄
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'stats' && <CharacterStats />}
        {activeTab === 'equipment' && <EquipmentPanel />}
      </div>
    </div>
  );
}
