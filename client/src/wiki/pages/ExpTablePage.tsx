import { useMemo } from 'react';
import { getExpToNextLevel } from '../../systems/levelUp';
import { RESTED_EXP_ACCRUAL_RATIO, RESTED_EXP_CAP_MS, RESTED_EXP_MULTIPLIER } from '../../systems/restedExp';
import '../components/WikiTable.css';

export function ExpTablePage() {
  const tableData = useMemo(() => {
    let cumulative = 0;
    const rows = [];
    for (let lv = 1; lv <= 100; lv++) {
      const expNeeded = getExpToNextLevel(lv);
      cumulative += expNeeded;
      rows.push({ level: lv, expNeeded, cumulative });
    }
    return rows;
  }, []);

  return (
    <div>
      <h2 className="wiki-page-title">升級經驗表</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        公式：<code style={{ color: 'var(--accent-info)', fontFamily: 'var(--font-mono)' }}>
          100 × 1.15^k
        </code>
        ，指數 k 分兩段推進 ——{' '}
        <code style={{ color: 'var(--accent-info)', fontFamily: 'var(--font-mono)' }}>
          Lv ≤ 65：k = 1.15625 × (Lv - 1)
        </code>
        ；
        <code style={{ color: 'var(--accent-info)', fontFamily: 'var(--font-mono)' }}>
          Lv ≥ 65：k = 74 + 0.73529 × (Lv - 65)
        </code>
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        回鍋加倍：離線每 1 分鐘累積 {60 * RESTED_EXP_ACCRUAL_RATIO} 秒擊殺經驗 ×{RESTED_EXP_MULTIPLIER}，存量上限 {RESTED_EXP_CAP_MS / 3_600_000} 小時。
      </p>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>等級</th>
              <th>所需經驗</th>
              <th>累計經驗</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map(row => (
              <tr key={row.level}>
                <td className="cell-number">{row.level}</td>
                <td className="cell-number">{row.expNeeded.toLocaleString()}</td>
                <td className="cell-number">{row.cumulative.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
