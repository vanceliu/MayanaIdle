import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePanelWindowStore } from '../stores/panelWindowStore';
import { CombatScriptEditor } from './CombatScriptEditor';
import { PersistentScriptEditor } from './PersistentScriptEditor';

type ScriptTab = 'combat' | 'persistent';

/**
 * 自動腳本（16-tech-frontend-architecture.md § 32.16）
 *
 * 按鈕位於底部 `PanelDock` 最右側，與其他面板按鈕並列（額外帶規則數量 badge）；
 * 點擊後開啟可拖曳浮動視窗，與詳細狀態／裝備欄／背包／技能／任務共用同一套機制
 * （可拖曳、可多開、點擊置頂、無遮罩）。
 */
export function ScriptEditorButton() {
  const combatRules = useGameStore(s => s.combatRules);
  const persistentRules = useGameStore(s => s.persistentRules);
  const isOpen = usePanelWindowStore(s => s.open.script);
  const toggle = usePanelWindowStore(s => s.toggle);

  const totalRules = combatRules.length + persistentRules.length;

  return (
    <button
      className={`panel-dock-btn script-panel-trigger ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('script')}
    >
      <span>自動腳本</span>
      <span className="script-badge">{totalRules}</span>
    </button>
  );
}

/** 腳本內容（由 `PanelWindows` 包在 FloatingWindow 內渲染） */
export function ScriptEditorContent() {
  const [tab, setTab] = useState<ScriptTab>('persistent');

  return (
    <>
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
      {tab === 'combat' ? <CombatScriptEditor /> : <PersistentScriptEditor />}
    </>
  );
}
