import { useMemo } from 'react';
import { getExpToNextLevel } from '../../systems/levelUp';
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
