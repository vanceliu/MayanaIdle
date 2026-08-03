import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import {
  CLASS_BASE_ATTRIBUTES,
  CLASS_NAMES_ZH,
  getAvailablePoints,
  type ClassName,
  type Attributes,
} from '../models/character';
import {
  CHARACTER_NAME_ALLOWED_SYMBOLS,
  CHARACTER_NAME_ERROR_MESSAGES,
  CHARACTER_NAME_MAX_LENGTH,
  validateCharacterName,
} from '../models/characterIdentity';

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const ATTR_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];
const ATTR_NAMES: Record<keyof Attributes, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

type NameStatus =
  | { kind: 'idle' }
  | { kind: 'invalid'; message: string };

export function CharacterCreate() {
  const createCharacter = useGameStore(s => s.createCharacter);
  const setPhase = useGameStore(s => s.setPhase);
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassName>('knight');
  const [bonus, setBonus] = useState<Attributes>({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const baseAttrs = CLASS_BASE_ATTRIBUTES[selectedClass];
  const maxPoints = getAvailablePoints(selectedClass);
  const usedPoints = Object.values(bonus).reduce((a, b) => a + b, 0);
  const remaining = maxPoints - usedPoints;
  const trimmedName = name.trim();
  const localNameError = trimmedName ? validateCharacterName(trimmedName) : null;
  // 名稱不要求唯一（§ 19.4），沒有東西要跟伺服器問 —— 只剩本機格式驗證
  const nameStatus: NameStatus = localNameError
    ? { kind: 'invalid', message: CHARACTER_NAME_ERROR_MESSAGES[localNameError] }
    : { kind: 'idle' };

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

  /**
   * 建立角色是**純本機行為**（§ 19.4）：名稱不要求唯一，也沒有要註冊的東西，
   * 因此離線也建得起來。uuid 與寫入密鑰都在 store 內產生。
   */
  async function handleCreate() {
    if (!trimmedName || localNameError || submitting) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      await createCharacter(trimmedName, selectedClass, bonus);
    } catch {
      setSubmitError('建立失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  function renderNameHint() {
    switch (nameStatus.kind) {
      case 'invalid':
        return <span className="name-hint error">{nameStatus.message}</span>;
      default:
        return (
          <span className="name-hint">
            中文、英文、數字，2~{CHARACTER_NAME_MAX_LENGTH} 個字；
            可使用符號 {CHARACTER_NAME_ALLOWED_SYMBOLS}，不可有空白
          </span>
        );
    }
  }

  const canSubmit = !!trimmedName && !localNameError && remaining === 0 && !submitting;

  return (
    <div className="create-screen">
      <h2>建立角色</h2>

      <div className="form-group">
        <label>角色名稱</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={CHARACTER_NAME_MAX_LENGTH}
          placeholder="輸入名稱..."
          disabled={submitting}
        />
        {renderNameHint()}
      </div>

      <div className="form-group">
        <label>職業選擇</label>
        <div className="class-buttons">
          {CLASSES.map(cls => (
            <button
              key={cls}
              className={cls === selectedClass ? 'active' : ''}
              onClick={() => handleClassChange(cls)}
              disabled={submitting}
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
                  <button onClick={() => removePoint(attr)} disabled={bonus[attr] <= 0 || submitting}>-</button>
                  <button onClick={() => addPoint(attr)} disabled={remaining <= 0 || baseAttrs[attr] + bonus[attr] >= 18 || submitting}>+</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {submitError && <div className="create-error">{submitError}</div>}

      <button className="btn-primary" onClick={handleCreate} disabled={!canSubmit}>
        {submitting ? '驗證名稱中...' : remaining > 0 ? `還有 ${remaining} 點未分配` : '開始冒險'}
      </button>
      <button className="btn-secondary" onClick={() => setPhase('characterSelect')} disabled={submitting}>
        返回
      </button>
    </div>
  );
}
