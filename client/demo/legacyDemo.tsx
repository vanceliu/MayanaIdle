/**
 * 遺產頁 demo（`legacy.html`）：角色選擇的入口與 `LegacyArchivePage`，資料為示範快照。
 */
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegacyArchivePage } from '../src/components/LegacyArchivePage';
import type { LegacyArchive } from '../src/models/legacyArchive';
import { loadTemplateCache } from '../src/systems/templateSync';

const NOW = Date.UTC(2026, 11, 1);
const ARCHIVES: LegacyArchive[] = [
  // 假設的下一季封存，示範多季時的分組
  {
    id: 5, type: 'character', label: '星落騎士', className: 'knight', level: 96, dataVersion: 20, season: 1, archivedAt: Date.UTC(2027, 5, 1),
    payload: JSON.stringify({ character: { name: '星落騎士', className: 'knight', level: 96, gold: 8_800_000 } }),
  },
  {
    id: 1, type: 'character', label: '星落騎士', className: 'knight', level: 78, dataVersion: 14, season: 0, archivedAt: NOW,
    payload: JSON.stringify({
      character: {
        name: '星落騎士', className: 'knight', level: 78, exp: 3_456_789, gold: 1_234_567, currentRegion: 'neutral-town', createdAt: Date.UTC(2026, 3, 2),
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 }, bonusAttributes: { STR: 4, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        skills: [{ name: '風刃' }, { name: '盾擊' }, { name: '裂傷斬' }, { name: '鋼鐵護盾' }],
      },
      equipment: [
        { templateId: 1019, enhancement: 7, quality: 12, equipped: true, affixes: [{ type: 'attack_power', tier: 6, value: 18 }, { type: 'crit_rate', tier: 5, value: 6 }] },
        { templateId: 1001, enhancement: 0 },
        { templateId: 1000, enhancement: 3, inStorage: true, storageType: 'personal' },
      ],
      bag: [{ itemTemplateId: 1, amount: 120 }],
      personalWarehouse: [{ itemId: 2, amount: 30 }],
      talentSlots: [{}, {}, {}],
      mail: [{ title: '版本補償' }],
      prefs: { statistics: { monstersKilled: 98_765, bossesKilled: 321, deathCount: 12, questsCompleted: 88, totalGoldEarned: 9_876_543 } },
      guild: { name: '星辰', role: 'member' },
      arena: [{ tier: 5, party: 0, wave: 18 }],
    }),
  },
  {
    id: 2, type: 'character', label: '月影', className: 'thief', level: 41, dataVersion: 14, season: 0, archivedAt: NOW,
    payload: JSON.stringify({ character: { name: '月影', className: 'thief', level: 41, gold: 5000 }, equipment: [], bag: [] }),
  },
  {
    id: 3, type: 'sharedWarehouse', label: '帳號倉庫', dataVersion: 14, season: 0, archivedAt: NOW,
    payload: JSON.stringify({ gold: 456_000, items: [{ itemId: 1, amount: 99 }], equipment: [{ templateId: 1001, enhancement: 5 }] }),
  },
  {
    id: 4, type: 'guild', label: '星辰', dataVersion: 14, season: 0, archivedAt: NOW,
    payload: JSON.stringify({
      guild: { name: '星辰', createdAt: Date.UTC(2026, 5, 1), gold: 120_000 },
      members: [{ name: '星落騎士', class_name: 'knight', level: 78 }, { name: '夜鶯', class_name: 'elf', level: 66 }],
      items: [{ item_id: 1, amount: 40 }], equipment: [],
    }),
  },
];

function App() {
  const [archives, setArchives] = useState(ARCHIVES);
  const [page, setPage] = useState<'select' | 'legacy'>('select');
  const loadArchive = useCallback(async (id: number) => ARCHIVES.find(a => a.id === id) ?? null, []);

  if (page === 'legacy') {
    return (
      <LegacyArchivePage
        archives={archives}
        loadArchive={loadArchive}
        onDelete={async id => { setArchives(list => list.filter(a => a.id !== id)); return true; }}
        onBack={() => setPage('select')}
      />
    );
  }
  return (
    <div className="character-select-screen">
      <h2>選擇角色</h2>
      <div className="character-slots">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="character-slot empty">
            <button className="btn-create-char">建立新角色</button>
          </div>
        ))}
      </div>
      {archives.length > 0 && (
        <div className="character-select-footer">
          <button className="btn-secondary" onClick={() => setPage('legacy')}>遺產（{archives.length} 筆）</button>
        </div>
      )}
    </div>
  );
}

// 遊戲啟動時同樣先載入隨 bundle 發布的裝備模板（`App.tsx`）
void loadTemplateCache().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
