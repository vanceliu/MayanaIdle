import { ScriptEditorButton } from './ScriptEditorPanel';
import { QuestTrackerButton } from './QuestTracker';
import { MailboxButton } from './MailboxPanel';
import { usePanelWindowStore, DOCK_PANEL_KEYS, panelButtonA11y } from '../stores/panelWindowStore';
import { PanelDockFace } from './PanelDockFace';
import { useIsMobile } from '../hooks/useViewport';

/**
 * 底部面板按鈕列（16-tech-frontend-architecture.md § 32.15）
 * 與快捷鍵列同排。六個面板一律開成可拖曳浮動視窗；
 * 任務／信箱／自動天賦帶指示，因此按鈕由各自的組件渲染。
 */
export function PanelDock() {
  const open = usePanelWindowStore(s => s.open);
  const toggle = usePanelWindowStore(s => s.toggle);
  // 手機的 sheet 是滿版的，一次只留一個面板開著（`47-mobile.md`）
  const isMobile = useIsMobile();

  return (
    <div className="panel-dock">
      {DOCK_PANEL_KEYS.map(key => (
        <button
          key={key}
          className={`panel-dock-btn ${open[key] ? 'active' : ''}`}
          aria-pressed={open[key]}
          onClick={() => toggle(key, isMobile)}
          {...panelButtonA11y(key)}
        >
          <PanelDockFace panelKey={key} />
        </button>
      ))}
      <QuestTrackerButton />
      <MailboxButton />
      <ScriptEditorButton />
    </div>
  );
}
