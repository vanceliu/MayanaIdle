import type { ReactNode } from 'react';
import { useGameStore } from '../stores/gameStore';
import { Tooltip } from './Tooltip';
import { characterStatSheet, type StatTip } from '../systems/characterStatSheet';

function StatRow({ label, value, tip }: { label: string; value: ReactNode; tip: StatTip }) {
  return (
    <div className="stat-row">
      <Tooltip
        position="right"
        content={
          <div className="stat-tip">
            <div className="stat-tip-title">{label}</div>
            <div className="stat-tip-desc">{tip.desc}</div>
            {tip.formula && <div className="stat-tip-formula">{tip.formula}</div>}
            {tip.note && <div className="stat-tip-note">{tip.note}</div>}
          </div>
        }
      >
        <span className="stat-label">{label}</span>
      </Tooltip>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** 欄位與數值由 `characterStatSheet()` 產生，與管理介面角色查詢共用 */
export function CharacterStats() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  const bagItems = useGameStore(s => s.bagItems);

  if (!char) return null;

  return (
    <div className="char-stats-content">
      <div className="char-stats-grid">
        {characterStatSheet(char, equippedGear, activeEffects, bagItems).map(group => (
          <div key={group.title} className="stat-group">
            <div className="stat-group-title">{group.title}</div>
            {group.rows.map(row => (
              <StatRow
                key={row.label}
                label={row.label}
                tip={row.tip}
                value={row.warn ? (
                  <span className="stat-overweight">{row.value} ⚠</span>
                ) : (
                  <>{row.value}{row.overflow && <span className="stat-overflow">（{row.overflow}）</span>}</>
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
