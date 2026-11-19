/**
 * 設定「回饋」頁籤（`34-ui-guidelines.md` § 34.6「回饋」）：掛遊戲的 `SettingsModal`，可切換世界形態與有無角色。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsModal } from '../src/components/SettingsModal';
import { useOnlineStore } from '../src/net/online';
import { useGameStore } from '../src/stores/gameStore';

const character = { id: 1, name: '測試角色', className: 'knight', level: 60 };

useOnlineStore.setState({ enabled: true, worldMode: 'open' });
useGameStore.setState({ character: character as never });

function App() {
  const [open, setOpen] = useState(true);
  const worldMode = useOnlineStore(s => s.worldMode);
  const hasCharacter = useGameStore(s => s.character !== null);
  return (
    <div style={{ padding: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn-secondary" onClick={() => useOnlineStore.setState({ worldMode: worldMode === 'open' ? 'solo' : 'open' })}>
        世界形態：{worldMode === 'open' ? '開放' : '單機'}
      </button>
      <button className="btn-secondary" onClick={() => useGameStore.setState({ character: (hasCharacter ? null : character) as never })}>
        角色：{hasCharacter ? '有' : '無'}
      </button>
      <button className="btn-primary" onClick={() => setOpen(true)}>開啟設定</button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
