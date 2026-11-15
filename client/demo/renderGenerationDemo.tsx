/**
 * 設定「顯示」分頁的「畫面版本」（`34-ui-guidelines.md` § 34.6）：掛遊戲的 `SettingsModal`，關閉後可再開。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsModal } from '../src/components/SettingsModal';
import { useSettingsStore } from '../src/stores/settingsStore';

function App() {
  const [open, setOpen] = useState(true);
  const generation = useSettingsStore(s => s.renderGeneration);
  return (
    <div style={{ padding: 24 }}>
      <p>目前畫面版本：第{generation === 3 ? '三' : '二'}代</p>
      <button className="btn-primary" onClick={() => setOpen(true)}>開啟設定</button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
