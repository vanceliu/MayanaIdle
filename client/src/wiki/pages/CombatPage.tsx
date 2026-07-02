import '../components/WikiTable.css';

export function CombatPage() {
  return (
    <div>
      <h2 className="wiki-page-title">戰鬥計算</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          物理攻擊
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            基礎傷害 = 武器傷害(依怪物體型) + STR加成(有效STR/2) + 種族克制 + 元素克制<br />
            傷害 = 基礎傷害 × (1 + 攻擊力%/100)<br />
            傷害 = 傷害 × (1 + 元素攻擊%/100)　※ 武器有元素時<br />
            暴擊傷害 = 傷害 × (2.0 + 暴擊傷害%/100)　※ 暴擊時<br />
            最終傷害 = 傷害 × (100 - 怪物防禦) / 100　※ 防禦上限 65
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          技能攻擊（魔法）
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            INT加成 = skillPower × (有效INT / 2 × 10) / 100<br />
            基礎傷害 = skillPower + INT加成 + 元素克制<br />
            傷害 = 基礎傷害 × (1 + 技能元素%/100)　※ 技能有元素時<br />
            暴擊傷害 = 傷害 × (2.0 + 暴擊傷害%/100)　※ 暴擊時<br />
            最終傷害 = 傷害 × (100 - 怪物防禦) / 100　※ 防禦上限 65
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          命中率
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            命中率 = 80 + AGI加成(有效AGI/3) + 武器命中 + 等級差(玩家Lv - 怪物Lv) + 種族命中buff - 怪物迴避(5)<br />
            命中率上限：95%　下限：5%<br />
            武器命中 = 武器基礎命中 + floor(強化等級 / 2)
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          玩家防禦減傷
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            最終防禦 = floor(裝備防禦合計 × (1 + 防禦力%/100))<br />
            減傷率 = min(最終防禦, 75)%<br />
            實際傷害 = floor(怪物傷害 × (100 - 減傷率) / 100)<br />
            減傷上限：75%
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          迴避率
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            基礎迴避 = 盜賊 10% / 其他職業 5%<br />
            AGI迴避 = 有效AGI / 3<br />
            防禦溢出迴避 = (總防禦 - 75) / 5　※ 總防禦 &gt; 75 時<br />
            迴避率 = 基礎迴避 + AGI迴避 + 防禦溢出迴避<br />
            迴避率上限：35%
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          暴擊率
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            暴擊率 = 5% + 詞綴暴擊率<br />
            暴擊率上限：75%<br />
            暴擊倍率 = 2.0 + 詞綴暴擊傷害% / 100
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          格擋
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            格擋率 = 裝備基礎格擋 + 詞綴格擋<br />
            格擋率上限：50%<br />
            格擋時傷害減半
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          攻擊速度
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            基礎攻速間隔 = 1200ms<br />
            實際間隔 = floor(1200 / (1 + 攻速%/100))<br />
            最低間隔：300ms
          </p>
        </div>
      </section>

      <section>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          元素克制關係
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>攻擊屬性</th>
                <th>克制屬性</th>
                <th>額外傷害</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><span className="wiki-badge wiki-badge-fire">火</span></td><td><span className="wiki-badge wiki-badge-wind">風</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-wind">風</span></td><td><span className="wiki-badge wiki-badge-earth">地</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-earth">地</span></td><td><span className="wiki-badge wiki-badge-ice">冰</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-ice">冰</span></td><td><span className="wiki-badge wiki-badge-fire">火</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-light">光</span></td><td><span className="wiki-badge wiki-badge-dark">闇</span></td><td className="cell-number">+3</td></tr>
              <tr><td><span className="wiki-badge wiki-badge-dark">闇</span></td><td><span className="wiki-badge wiki-badge-light">光</span></td><td className="cell-number">+3</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
