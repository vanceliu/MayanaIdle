import { useGameStore } from '../stores/gameStore';
import { CLASS_NAMES_ZH } from '../models/character';

const MAX_CHARACTERS = 4;

export function CharacterSelect() {
  const characterList = useGameStore(s => s.characterList);
  const selectCharacter = useGameStore(s => s.selectCharacter);
  const deleteCharacter = useGameStore(s => s.deleteCharacter);
  const setPhase = useGameStore(s => s.setPhase);

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
            </div>
            <button
              className="btn-delete-char"
              onClick={() => {
                if (window.confirm(`確定要刪除角色「${char.name}」嗎？此操作無法復原。`)) {
                  deleteCharacter(char.id);
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
    </div>
  );
}
