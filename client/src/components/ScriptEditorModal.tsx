import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { CombatScriptEditor } from './CombatScriptEditor';
import { PersistentScriptEditor } from './PersistentScriptEditor';

type ScriptTab = 'combat' | 'persistent';

export function ScriptEditorModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<ScriptTab>('persistent');
  const combatRules = useGameStore(s => s.combatRules);
  const persistentRules = useGameStore(s => s.persistentRules);

  const totalRules = combatRules.length + persistentRules.length;

  return (
    <>
      <button className="script-modal-trigger" onClick={() => setIsOpen(true)}>
        <span>自動腳本</span>
        <span className="script-badge">{totalRules}</span>
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-content script-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">自動腳本</span>
              <button className="modal-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>
            <div className="script-tabs">
              <button
                className={`script-tab ${tab === 'persistent' ? 'active' : ''}`}
                onClick={() => setTab('persistent')}
              >
                常駐腳本
              </button>
              <button
                className={`script-tab ${tab === 'combat' ? 'active' : ''}`}
                onClick={() => setTab('combat')}
              >
                戰鬥腳本
              </button>
            </div>
            <div className="modal-body">
              {tab === 'combat' && <CombatScriptEditor />}
              {tab === 'persistent' && <PersistentScriptEditor />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
