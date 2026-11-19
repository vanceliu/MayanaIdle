import '../components/WikiTable.css';
import { COOLDOWN_REDUCTION_CAP, INT_SKILL_DAMAGE_PERCENT_PER_2 } from '../../systems/combat';
import { CLASS_HP_MP_FORMULA } from '../../systems/maxHpMp';
import { CLASS_NAMES_ZH, type ClassName } from '../../models/character';

const HP_MP_CLASS_ORDER: ClassName[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];

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
                <td>近戰傷害加成：有效STR / 2；負重：STR × 100（原始值）</td>
              </tr>
              <tr>
                <td>敏捷</td>
                <td>AGI</td>
                <td className="cell-number">floor(AGI / 3) × 3</td>
                <td>遠程（弓）傷害加成：有效AGI / 2；命中加成：有效AGI / 3；迴避加成：有效AGI / 3</td>
              </tr>
              <tr>
                <td>體質</td>
                <td>VIT</td>
                <td className="cell-number">floor(VIT / 2) × 2</td>
                <td>最大 HP（原始值，見下方公式）；回血：有效VIT / 2；負重：VIT × 100（原始值）</td>
              </tr>
              <tr>
                <td>精神</td>
                <td>SPI</td>
                <td className="cell-number">floor(SPI / 2) × 2</td>
                <td>最大 MP（原始值，見下方公式）；回魔：有效SPI / 2；魔法抗性：有效SPI / 2</td>
              </tr>
              <tr>
                <td>智力</td>
                <td>INT</td>
                <td className="cell-number">floor(INT / 2) × 2</td>
                <td>技能傷害與治癒加成：skillPower × (有效INT / 2 × {INT_SKILL_DAMAGE_PERCENT_PER_2 / 100})；冷卻縮減：有效INT / 2 × 1%（與詞綴、buff 合計上限 {COOLDOWN_REDUCTION_CAP}%）</td>
              </tr>
              <tr>
                <td>魅力</td>
                <td>CHA</td>
                <td>—</td>
                <td>目前沒有作用</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          最大 HP／MP
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
          最大 HP ＝（等級 × VIT × 職業 HP 比值 ＋ 職業 HP 加成 ＋ 裝備固定 HP）×（1 ＋ 星盤最大 HP%）<br />
          最大 MP ＝（等級 × SPI × 職業 MP 比值 ＋ 職業 MP 加成 ＋ 裝備固定 MP）×（1 ＋ 星盤最大 MP%）<br />
          VIT／SPI 取原始值，含建角配點、星盤與裝備，不含 buff；升級時 HP／MP 回滿。
        </p>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>職業</th><th>HP 比值</th><th>HP 加成</th><th>MP 比值</th><th>MP 加成</th></tr>
            </thead>
            <tbody>
              {HP_MP_CLASS_ORDER.map(c => {
                const f = CLASS_HP_MP_FORMULA[c];
                return (
                  <tr key={c}>
                    <td>{CLASS_NAMES_ZH[c]}</td>
                    <td className="cell-number">{f.hpRatio}</td>
                    <td className="cell-number">{f.hpBonus}</td>
                    <td className="cell-number">{f.mpRatio}</td>
                    <td className="cell-number">{f.mpBonus}</td>
                  </tr>
                );
              })}
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
          建角屬性上限：18 | 總配點上限：80 | 建角後屬性來自星盤、裝備與 buff，沒有上限
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
