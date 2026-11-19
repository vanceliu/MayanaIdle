import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { connection } from '../net/connection';
import type { LegacyArchiveSummary } from '../models/legacyArchive';
import { LegacyArchivePage } from './LegacyArchivePage';
import { useOnlineStore } from '../net/online';
import { CLASS_NAMES_ZH, ATTRIBUTE_KEYS } from '../models/character';
import type { Attributes } from '../models/character';

const MAX_CHARACTERS = 4;

/**
 * 角色的六項屬性：建角配點 ＋ 星盤，**不含裝備與 buff**
 * （`20-attributes.md` § 20.10 —— 換裝不該讓角色卡上的數字跳動）。
 */
function SlotAttributes({ attributes }: { attributes: Attributes }) {
  return (
    <div className="slot-attributes">
      {ATTRIBUTE_KEYS.map(key => (
        <span key={key} className="slot-attribute">
          <span className="slot-attribute-key">{key}</span>
          <span className="slot-attribute-value">{attributes[key]}</span>
        </span>
      ))}
    </div>
  );
}

export function CharacterSelect() {
  const characterList = useGameStore(s => s.characterList);
  const selectCharacter = useGameStore(s => s.selectCharacter);
  const deleteCharacter = useGameStore(s => s.deleteCharacter);
  const setPhase = useGameStore(s => s.setPhase);
  const kickedReason = useOnlineStore(s => s.kickedReason);
  const entryNotice = useOnlineStore(s => s.entryNotice);
  const emptySlots = MAX_CHARACTERS - characterList.length;
  const clearKicked = () => useOnlineStore.setState({ kickedReason: null, entryNotice: null });

  // 遺產紀錄（`45-legacy-archive.md` § 45.3）：有紀錄才顯示入口
  const [legacy, setLegacy] = useState<LegacyArchiveSummary[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const refreshLegacy = useCallback(() => connection.requestLegacyList().then(setLegacy).catch(() => setLegacy([])), []);
  useEffect(() => { void refreshLegacy(); }, [refreshLegacy]);
  const loadArchive = useCallback((id: number) => connection.requestLegacyArchive(id), []);

  if (showLegacy) {
    return (
      <LegacyArchivePage
        archives={legacy}
        loadArchive={loadArchive}
        onDelete={async id => {
          const ok = await connection.deleteLegacyArchive(id).catch(() => false);
          if (ok) await refreshLegacy();
          return ok;
        }}
        onBack={() => setShowLegacy(false)}
      />
    );
  }

  return (
    <div className="character-select-screen">
      <h2>選擇角色</h2>
      {kickedReason && <div className="select-notice" role="alert">{kickedReason}</div>}
      {entryNotice && <div className="select-notice" role="alert">{entryNotice}</div>}
      <div className="character-slots">
        {characterList.map(char => (
          <div key={char.id} className="character-slot filled">
            <div className="slot-info" onClick={() => { clearKicked(); void selectCharacter(char.id); }}>
              <span className="slot-name">{char.name}</span>
              <span className="slot-class">{CLASS_NAMES_ZH[char.className]}</span>
              <span className="slot-level">Lv.{char.level}</span>
              <SlotAttributes attributes={char.attributes} />
            </div>
            <button
              className="btn-delete-char"
              onClick={() => {
                // 純本機刪除：名稱不唯一，沒有線上資源要回收（§ 37.4.3）
                if (window.confirm(`確定要刪除角色「${char.name}」嗎？此操作無法復原。`)) {
                  void deleteCharacter(char.id);
                }
              }}
            >
              刪除
            </button>
          </div>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="character-slot empty">
            <button className="btn-create-char" onClick={() => { clearKicked(); setPhase('create'); }}>
              建立新角色
            </button>
          </div>
        ))}
      </div>
      {legacy.length > 0 && (
        <div className="character-select-footer">
          <button className="btn-secondary" onClick={() => setShowLegacy(true)}>遺產（{legacy.length} 筆）</button>
        </div>
      )}
    </div>
  );
}
