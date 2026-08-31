import type { EquipmentInstance } from '../models/equipment';
import {
  getEnhanceStability, getEnhanceRate, getJudgedLevel, isEnhanceable,
  scrollCategoryOf, PLUS_SCROLL_MAX_LEVELS,
} from '../systems/enhanceScroll';

/**
 * 強化機率視窗（`35-inventory-constraints.md` § 35.5.5）。
 * 背包「機率」按鈕指定裝備後開啟，只列這一次的判定格與成功率。
 *
 * 規則來源：`06-equipment.md` § 6.9（武器）／§ 6.10（防具）／§ 6.12（＋／－）。
 */

export function EnhanceRateWindow({ item, onClose }: { item: EquipmentInstance; onClose: () => void }) {
  const current = item.enhancement ?? 0;
  const stability = getEnhanceStability(item);
  const kind = scrollCategoryOf(item) === 'weapon' ? '武器' : '防具';
  const judged = getJudgedLevel(item);
  const rate = getEnhanceRate(item, judged);
  const safe = rate >= 1;
  const rateText = safe ? '必成' : `${Math.floor(rate * 100)}%`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content enh-rate-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">強化機率</span>
          <button className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <div className="enh-rate-body">
          <p className="enh-rate-target">
            {item.name} <span className="enh-rate-level">+{current}</span>
            <span className="enh-rate-stability">安定值 {stability}</span>
          </p>

          {!isEnhanceable(item) ? (
            <p className="enh-rate-none">不可強化</p>
          ) : (
            <table className="enh-rate-table">
              <tbody>
                <tr>
                  <th>{kind}卷</th>
                  <td className="enh-rate-judge">判 +{judged}</td>
                  <td className={safe ? 'enh-rate-safe' : 'enh-rate-risk'}>{rateText}</td>
                  <td>→ +{judged}</td>
                </tr>
                <tr>
                  <th>{kind}卷＋</th>
                  <td className="enh-rate-judge">判 +{judged}</td>
                  <td className={safe ? 'enh-rate-safe' : 'enh-rate-risk'}>{rateText}</td>
                  <td>→ +{current + 1}~{current + PLUS_SCROLL_MAX_LEVELS}</td>
                </tr>
                <tr>
                  <th>{kind}卷－</th>
                  <td className="enh-rate-judge">—</td>
                  <td className="enh-rate-safe">{current > 0 ? '必成' : '—'}</td>
                  <td>{current > 0 ? `→ +${current - 1}` : '已是 +0'}</td>
                </tr>
              </tbody>
            </table>
          )}

          {!safe && isEnhanceable(item) && <p className="enh-rate-warn">失敗即消失</p>}
        </div>
      </div>
    </div>
  );
}
