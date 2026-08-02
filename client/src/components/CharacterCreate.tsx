import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import {
  CLASS_BASE_ATTRIBUTES,
  CLASS_NAMES_ZH,
  getAvailablePoints,
  type ClassName,
  type Attributes,
} from '../models/character';
import {
  CHARACTER_NAME_ERROR_MESSAGES,
  CHARACTER_NAME_MAX_LENGTH,
  generateCharacterUuid,
  validateCharacterName,
} from '../models/characterIdentity';
import { checkNameAvailable, registerCharacter, LeaderboardError } from '../services/leaderboardService';

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const ATTR_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];
const ATTR_NAMES: Record<keyof Attributes, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

/** 名稱預檢的 debounce 間隔 */
const NAME_CHECK_DEBOUNCE_MS = 500;

type NameStatus =
  | { kind: 'idle' }
  | { kind: 'invalid'; message: string }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'check_failed' };

export function CharacterCreate() {
  const createCharacter = useGameStore(s => s.createCharacter);
  const setPhase = useGameStore(s => s.setPhase);
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassName>('knight');
  const [bonus, setBonus] = useState<Attributes>({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 });
  const [nameStatus, setNameStatus] = useState<NameStatus>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const requestSeqRef = useRef(0);

  const baseAttrs = CLASS_BASE_ATTRIBUTES[selectedClass];
  const maxPoints = getAvailablePoints(selectedClass);
  const usedPoints = Object.values(bonus).reduce((a, b) => a + b, 0);
  const remaining = maxPoints - usedPoints;
  const trimmedName = name.trim();
  const localNameError = trimmedName ? validateCharacterName(trimmedName) : null;

  // 名稱可用性預檢（UX 用）。真正的唯一性由建立時的註冊 API 保證。
  useEffect(() => {
    if (!trimmedName) {
      setNameStatus({ kind: 'idle' });
      return;
    }
    const invalid = validateCharacterName(trimmedName);
    if (invalid) {
      setNameStatus({ kind: 'invalid', message: CHARACTER_NAME_ERROR_MESSAGES[invalid] });
      return;
    }

    setNameStatus({ kind: 'checking' });
    const seq = ++requestSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const result = await checkNameAvailable(trimmedName);
        if (seq !== requestSeqRef.current) return; // 已有更新的輸入，丟棄過期結果
        setNameStatus(result.available ? { kind: 'available' } : { kind: 'taken' });
      } catch {
        if (seq !== requestSeqRef.current) return;
        setNameStatus({ kind: 'check_failed' });
      }
    }, NAME_CHECK_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmedName]);

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
   * § 19.4：名稱必須全球唯一，**註冊成功才建立角色**。
   * 註冊失敗（重複／離線／驗證失敗）一律阻擋，不可退回只建本機角色，
   * 否則本機會存在一個永遠上不了排行榜的角色。
   */
  async function handleCreate() {
    if (!trimmedName || localNameError || submitting) return;

    setSubmitting(true);
    setSubmitError('');
    const uuid = generateCharacterUuid();
    try {
      await registerCharacter({
        character_id: uuid,
        character_name: trimmedName,
        class_name: selectedClass,
        character_level: 1,
      });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof LeaderboardError) {
        if (err.code === 'name_taken') {
          setNameStatus({ kind: 'taken' });
          setSubmitError('這個名稱已經被使用，請換一個');
          return;
        }
        if (err.code === 'invalid_name') {
          setSubmitError(CHARACTER_NAME_ERROR_MESSAGES.invalid_char);
          return;
        }
        if (err.code === 'network') {
          setSubmitError('無法連線到伺服器，角色名稱需連線驗證，請稍後再試');
          return;
        }
        if (err.code === 'turnstile') {
          setSubmitError('人機驗證失敗，請重新整理後再試');
          return;
        }
      }
      setSubmitError('建立失敗，請稍後再試');
      return;
    }

    await createCharacter(trimmedName, selectedClass, bonus, uuid);
    setSubmitting(false);
  }

  function renderNameHint() {
    switch (nameStatus.kind) {
      case 'invalid':
        return <span className="name-hint error">{nameStatus.message}</span>;
      case 'checking':
        return <span className="name-hint">檢查名稱中...</span>;
      case 'available':
        return <span className="name-hint ok">此名稱可以使用</span>;
      case 'taken':
        return <span className="name-hint error">此名稱已被使用</span>;
      case 'check_failed':
        return <span className="name-hint error">無法連線檢查名稱，建立時會再確認一次</span>;
      default:
        return <span className="name-hint">中文、英文或數字，2~{CHARACTER_NAME_MAX_LENGTH} 個字</span>;
    }
  }

  const canSubmit = !!trimmedName && !localNameError && remaining === 0 && nameStatus.kind !== 'taken' && !submitting;

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
