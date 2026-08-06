import { PANEL_BUTTON_LABELS, PANEL_ICONS, type PanelKey } from '../stores/panelWindowStore';

/**
 * 面板按鈕的內容（`47-mobile.md`）。
 *
 * 三個地方共用：`PanelDock` 的四顆泛用按鈕、`QuestTrackerButton`、`ScriptEditorButton`。
 * 獨立成一個模組而不是掛在 `PanelDock` 上 —— 那會讓 `PanelDock` 同時匯出元件與
 * 純函式，HMR 就不再對它做 fast refresh。可及屬性同理放在
 * `stores/panelWindowStore.ts`（純資料模組），見 `panelButtonA11y()`。
 */

/**
 * **圖示與文字兩者都畫出來，由 CSS 決定顯示哪一個** —— 桌機藏圖示、手機藏文字。
 * 用 CSS 而不是條件渲染，是因為斷點兩側的差異只是「看得到什麼」，
 * 讓 JS 也參一腳等於同一件事有兩個真相來源。
 */
export function PanelDockFace({ panelKey }: { panelKey: PanelKey }) {
  return (
    <>
      <span className="panel-dock-icon" aria-hidden="true">{PANEL_ICONS[panelKey]}</span>
      <span className="panel-dock-label">{PANEL_BUTTON_LABELS[panelKey]}</span>
    </>
  );
}
