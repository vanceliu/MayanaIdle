import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { CLASS_NAMES_ZH, ATTRIBUTE_KEYS } from '../models/character';
import type { Attributes } from '../models/character';
import { listArchives } from '../systems/legacyArchive';

const MAX_CHARACTERS = 4;

/**
 * 角色的六項屬性：建角配點 + Lv.51+ 升級配點，**不含裝備與 buff**
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
  const userId = useGameStore(s => s.userId);
  const [hasLegacy, setHasLegacy] = useState(false);

  // 遺產入口只在有封存紀錄時出現（§ 45.3）
  useEffect(() => {
    if (!userId) return;
    listArchives(userId).then(rows => setHasLegacy(rows.length > 0));
  }, [userId]);

  const emptySlots = MAX_CHARACTERS - characterList.length;

  return (
    <div className="character-select-screen">
      <h2>選擇角色</h2>
      <div className="character-slots">
        {characterList.map(char => (
          <div key={char.id} className="character-slot filled">
            <div className="slot-info" onClick={() => selectCharacter(char.id)}>
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
            <button className="btn-create-char" onClick={() => setPhase('create')}>
              建立新角色
            </button>
          </div>
        ))}
      </div>

      {hasLegacy && (
        <button className="btn-secondary btn-legacy" onClick={() => setPhase('legacy')}>
          📜 遺產
        </button>
      )}
    </div>
  );
}
