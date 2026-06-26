import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import {
  CLASS_BASE_ATTRIBUTES,
  CLASS_NAMES_ZH,
  getAvailablePoints,
  type ClassName,
  type Attributes,
} from '../models/character';

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const ATTR_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];
const ATTR_NAMES: Record<keyof Attributes, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

export function CharacterCreate() {
  const createCharacter = useGameStore(s => s.createCharacter);
  const setPhase = useGameStore(s => s.setPhase);
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassName>('knight');
  const [bonus, setBonus] = useState<Attributes>({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 });

  const baseAttrs = CLASS_BASE_ATTRIBUTES[selectedClass];
  const maxPoints = getAvailablePoints(selectedClass);
  const usedPoints = Object.values(bonus).reduce((a, b) => a + b, 0);
  const remaining = maxPoints - usedPoints;

  function handleClassChange(cls: ClassName) {
    setSelectedClass(cls);
    setBonus({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 });
  }

  function addPoint(attr: keyof Attributes) {
    if (remaining <= 0) return;
    if (baseAttrs[attr] + bonus[attr] >= 18) return;
    setBonus({ ...bonus, [attr]: bonus[attr] + 1 });
  }

  function removePoint(attr: keyof Attributes) {
    if (bonus[attr] <= 0) return;
    setBonus({ ...bonus, [attr]: bonus[attr] - 1 });
  }

  function handleCreate() {
    if (!name.trim()) return;
    createCharacter(name.trim(), selectedClass, bonus);
  }

  return (
    <div className="create-screen">
      <h2>建立角色</h2>

      <div className="form-group">
        <label>角色名稱</label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="輸入名稱..." />
      </div>

      <div className="form-group">
        <label>職業選擇</label>
        <div className="class-buttons">
          {CLASSES.map(cls => (
            <button
              key={cls}
              className={cls === selectedClass ? 'active' : ''}
              onClick={() => handleClassChange(cls)}
            >
              {CLASS_NAMES_ZH[cls]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>屬性分配（剩餘 {remaining} 點）</label>
        <table className="attr-table">
          <thead>
            <tr><th>屬性</th><th>基礎</th><th>加點</th><th>合計</th><th></th></tr>
          </thead>
          <tbody>
            {ATTR_KEYS.map(attr => (
              <tr key={attr}>
                <td>{ATTR_NAMES[attr]}</td>
                <td>{baseAttrs[attr]}</td>
                <td>{bonus[attr]}</td>
                <td><strong>{baseAttrs[attr] + bonus[attr]}</strong></td>
                <td>
                  <button onClick={() => removePoint(attr)} disabled={bonus[attr] <= 0}>-</button>
                  <button onClick={() => addPoint(attr)} disabled={remaining <= 0 || baseAttrs[attr] + bonus[attr] >= 18}>+</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn-primary" onClick={handleCreate} disabled={!name.trim() || remaining > 0}>
        {remaining > 0 ? `還有 ${remaining} 點未分配` : '開始冒險'}
      </button>
      <button className="btn-secondary" onClick={() => setPhase('characterSelect')}>
        返回
      </button>
    </div>
  );
}
