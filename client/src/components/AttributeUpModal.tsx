import { useGameStore } from '../stores/gameStore';
import { getTotalAttributes, ATTRIBUTE_CAP } from '../models/character';
import type { Attributes } from '../models/character';

const ATTR_LABELS: Record<keyof Attributes, string> = {
  STR: '力量',
  AGI: '敏捷',
  VIT: '體質',
  SPI: '精神',
  INT: '智力',
  CHA: '魅力',
};

const ATTR_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];

export function AttributeUpModal() {
  const char = useGameStore(s => s.character);
  const spendPoint = useGameStore(s => s.spendAttributePoint);

  if (!char || char.unspentAttributePoints <= 0) return null;

  const total = getTotalAttributes(char);
  const allCapped = ATTR_KEYS.every(k => total[k] >= ATTRIBUTE_CAP);
  if (allCapped) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content attribute-up-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">屬性配點</span>
        </div>
        <div className="modal-body">
          <p className="attribute-up-hint">
            未分配點數: <strong>{char.unspentAttributePoints}</strong>
          </p>
          <div className="attribute-up-grid">
            {ATTR_KEYS.map(key => {
              const value = total[key];
              const capped = value >= ATTRIBUTE_CAP;
              return (
                <div key={key} className="attribute-up-row">
                  <span className="attribute-up-label">{ATTR_LABELS[key]}</span>
                  <span className="attribute-up-value">{value}</span>
                  <button
                    className="attribute-up-btn"
                    onClick={() => spendPoint(key)}
                    disabled={capped || char.unspentAttributePoints <= 0}
                  >
                    {capped ? 'MAX' : '+'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
