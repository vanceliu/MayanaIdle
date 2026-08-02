import { ScriptEditorModal } from './ScriptEditorModal';
import { QuestTrackerButton } from './QuestTracker';
import { usePanelWindowStore, DOCK_PANEL_KEYS, PANEL_TITLES } from '../stores/panelWindowStore';

/**
 * 底部面板按鈕列（16-tech-frontend-architecture.md § 32.15）
 * 與快捷鍵列同排。任務 → stage 內浮動面板；四個面板 → 可拖曳浮動視窗；
 * 最右側為「自動腳本」modal 觸發鈕。
 */
export function PanelDock() {
  const open = usePanelWindowStore(s => s.open);
  const toggle = usePanelWindowStore(s => s.toggle);

  return (
    <div className="panel-dock">
      <QuestTrackerButton />
      {DOCK_PANEL_KEYS.map(key => (
        <button
          key={key}
          className={`panel-dock-btn ${open[key] ? 'active' : ''}`}
          aria-pressed={open[key]}
          onClick={() => toggle(key)}
        >
          {PANEL_TITLES[key]}
        </button>
      ))}
      <ScriptEditorModal />
    </div>
  );
}
