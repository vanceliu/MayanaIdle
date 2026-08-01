import { ASSET_CREDITS, GAME_ICONS_ATTRIBUTION } from '../data/assetCredits';
import '../components/WikiTable.css';

const sectionHeading = {
  color: 'var(--accent-gold)',
  fontFamily: 'var(--font-display)',
  marginBottom: 12,
};

/**
 * WikiTable.css 的 td 預設 nowrap，長內容需個別放行換行，否則表格會被撐出畫面。
 * 一般文字只放行換行（避免把 Sbed 拆成 S/bed）；網址與路徑才允許任意位置斷行。
 */
const wrapText = { whiteSpace: 'normal' as const };
const wrapUrl = {
  whiteSpace: 'normal' as const,
  overflowWrap: 'anywhere' as const,
  // 不給最小寬度的話，作者欄（LPC 有十餘位）會把網址與路徑擠到逐字斷行
  minWidth: 200,
};

export function CreditsPage() {
  return (
    <div>
      <h2 className="wiki-page-title">素材來源</h2>

      <p style={{ marginBottom: 24, lineHeight: 1.7 }}>
        本遊戲使用的第三方素材與其作者、授權條款及來源網址如下。
      </p>

      <section style={{ marginBottom: 32 }}>
        <h3 style={sectionHeading}>素材清單</h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>用途</th>
                <th>素材</th>
                <th>作者</th>
                <th>授權</th>
                <th>來源</th>
                <th>版庫路徑</th>
              </tr>
            </thead>
            <tbody>
              {ASSET_CREDITS.map(credit => (
                <tr key={`${credit.name}-${credit.usage}`}>
                  <td style={wrapText}>{credit.usage}</td>
                  <td>{credit.name}</td>
                  <td style={wrapText}>{credit.authors}</td>
                  <td>
                    <a
                      className="wiki-link"
                      href={credit.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {credit.license}
                    </a>
                  </td>
                  <td style={wrapUrl}>
                    <a
                      className="wiki-link"
                      href={credit.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {credit.sourceUrl}
                    </a>
                  </td>
                  <td style={wrapUrl}>
                    <code>{credit.path}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={sectionHeading}>授權標注</h3>
        <p style={{ marginBottom: 12, lineHeight: 1.7 }}>
          CC BY 3.0 要求標注原作者。以下為 game-icons.net 指定的標注文字：
        </p>
        <blockquote
          style={{
            margin: 0,
            padding: '12px 16px',
            borderLeft: '2px solid var(--accent-gold)',
            background: 'rgba(0, 0, 0, 0.2)',
            fontFamily: 'monospace',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {GAME_ICONS_ATTRIBUTION}
        </blockquote>
      </section>
    </div>
  );
}
