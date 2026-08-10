import '../components/WikiTable.css';

export function AttributesPage() {
  return (
    <div>
      <h2 className="wiki-page-title">屬性公式說明</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          基本屬性
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>屬性</th>
                <th>縮寫</th>
                <th>有效值計算</th>
                <th>效果</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>力量</td>
                <td>STR</td>
                <td className="cell-number">floor(STR / 2) × 2</td>
                <td>物理傷害加成：有效STR / 2</td>
              </tr>
              <tr>
                <td>敏捷</td>
                <td>AGI</td>
                <td className="cell-number">floor(AGI / 3) × 3</td>
                <td>命中加成：有效AGI / 3；迴避加成：有效AGI / 3</td>
              </tr>
              <tr>
                <td>體質</td>
                <td>VIT</td>
                <td className="cell-number">floor(VIT / 2) × 2</td>
                <td>升級時 HP 成長：random(VIT-6, VIT-3)</td>
              </tr>
              <tr>
                <td>精神</td>
                <td>SPI</td>
                <td className="cell-number">floor(SPI / 2) × 2</td>
                <td>升級時 MP 成長：random(SPI-6, SPI-3)</td>
              </tr>
              <tr>
                <td>智力</td>
                <td>INT</td>
                <td className="cell-number">floor(INT / 2) × 2</td>
                <td>技能傷害加成：skillPower × (有效INT / 2 × 5) / 100；冷卻縮減：有效INT / 2 × 1%</td>
              </tr>
              <tr>
                <td>魅力</td>
                <td>CHA</td>
                <td>—</td>
                <td>NPC 互動（未來擴展用）</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          職業初始屬性
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>職業</th>
                <th>STR</th>
                <th>AGI</th>
                <th>VIT</th>
                <th>SPI</th>
                <th>INT</th>
                <th>CHA</th>
                <th>可分配點數</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>騎士</td><td className="cell-number">14</td><td className="cell-number">14</td><td className="cell-number">16</td><td className="cell-number">10</td><td className="cell-number">10</td><td className="cell-number">12</td><td className="cell-number">4</td></tr>
              <tr><td>妖精</td><td className="cell-number">14</td><td className="cell-number">14</td><td className="cell-number">14</td><td className="cell-number">12</td><td className="cell-number">10</td><td className="cell-number">10</td><td className="cell-number">6</td></tr>
              <tr><td>盜賊</td><td className="cell-number">12</td><td className="cell-number">14</td><td className="cell-number">10</td><td className="cell-number">10</td><td className="cell-number">12</td><td className="cell-number">10</td><td className="cell-number">12</td></tr>
              <tr><td>元素師</td><td className="cell-number">8</td><td className="cell-number">8</td><td className="cell-number">10</td><td className="cell-number">14</td><td className="cell-number">14</td><td className="cell-number">12</td><td className="cell-number">14</td></tr>
              <tr><td>牧師</td><td className="cell-number">6</td><td className="cell-number">8</td><td className="cell-number">10</td><td className="cell-number">12</td><td className="cell-number">18</td><td className="cell-number">15</td><td className="cell-number">11</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 'var(--fs-sm)' }}>
          建角屬性上限：18 | 總配點上限：80 | Lv.51+ 每級 +1 自由屬性點，屬性上限提升至 35
        </p>
      </section>

      <section>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          材質種族克制
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>武器材質</th>
                <th>克制種族</th>
                <th>額外傷害</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>銀</td><td>不死、惡魔</td><td className="cell-number">1~4</td></tr>
              <tr><td>秘銀</td><td>不死</td><td className="cell-number">1~6</td></tr>
              <tr><td>奧利哈鋼</td><td>不死</td><td className="cell-number">1~10</td></tr>
              <tr><td>龍</td><td>龍</td><td className="cell-number">1~6</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
