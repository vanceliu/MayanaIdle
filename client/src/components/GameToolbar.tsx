import { useState } from 'react';
import { SettingsModal } from './SettingsModal';

/**
 * 系統按鈕（`47-mobile.md`）。
 *
 * 只剩一顆 ⚙。Wiki／匯出／匯入／登出／版本號全部搬進設定視窗的「帳號」頁 ——
 * 它們一局裡大概按不到一次，與「開背包」這種每分鐘都在按的操作放在同一層，
 * 等於拿最貴的畫面位置去換最低頻的功能。
 *
 * 桌機與手機因此**共用同一個結構**：右下角就是「面板按鈕列 ＋ ⚙」，
 * 不必再為手機另做一套收合選單。
 */
export function GameToolbar() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="game-toolbar">
      <button
        className="panel-dock-btn btn-settings"
        onClick={() => setSettingsOpen(true)}
        aria-pressed={settingsOpen}
        title="系統設定"
        aria-label="系統設定"
      >
        ⚙
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
