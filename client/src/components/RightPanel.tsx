import { useState } from 'react';
import { BagPanel } from './BagPanel';
import { SkillPanel } from './SkillPanel';

type RightTab = 'bag' | 'skill';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>('bag');

  return (
    <aside className="right-panel">
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab ${activeTab === 'bag' ? 'active' : ''}`}
          onClick={() => setActiveTab('bag')}
        >
          背包
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'skill' ? 'active' : ''}`}
          onClick={() => setActiveTab('skill')}
        >
          技能
        </button>
      </div>
      <div className="right-panel-content">
        {activeTab === 'bag' && <BagPanel />}
        {activeTab === 'skill' && <SkillPanel />}
      </div>
    </aside>
  );
}
