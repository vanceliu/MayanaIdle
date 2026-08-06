import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountSettings } from './AccountSettings';
import {
  useSettingsStore,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEP,
  SCALE_DEFAULT,
} from '../stores/settingsStore';
import { usePanelWindowStore } from '../stores/panelWindowStore';

/**
 * 系統設定（`34-ui-guidelines.md` § 34.6 / `47-mobile.md`）
 *
 * 兩個分頁：
 * - **顯示**：介面大小與文字大小分兩條滑桿 —— 想要「介面小、字大」是常見需求，
 *   合併成一條就做不到。拉動即時生效（CSS 變數），設定存 localStorage 跨角色共用。
 * - **帳號**：Wiki／匯出／匯入／登出。這些原本是右下角常駐的一整排，
 *   但一局裡大概按不到一次，收進來右下就只剩一顆 ⚙。
 */

type SettingsTab = 'display' | 'account';

interface SettingsModalProps {
  onClose: () => void;
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('display');
  const uiScale = useSettingsStore(s => s.uiScale);
  const fontScale = useSettingsStore(s => s.fontScale);
  const setUiScale = useSettingsStore(s => s.setUiScale);
  const setFontScale = useSettingsStore(s => s.setFontScale);
  const linkScales = useSettingsStore(s => s.linkScales);
  const setLinkScales = useSettingsStore(s => s.setLinkScales);
  const resetDisplaySettings = useSettingsStore(s => s.resetDisplaySettings);
  const resetPositions = usePanelWindowStore(s => s.resetPositions);

  const isDefault = uiScale === SCALE_DEFAULT && fontScale === SCALE_DEFAULT;

  // 掛到 body：按鈕本身在右下 HUD 島裡，而 HUD 是縮放層，
  // 留在原地會讓彈窗吃到兩次縮放，也會讓 position: fixed 的遮罩算錯範圍
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">系統設定</span>
          <button className="modal-close" aria-label="關閉設定" onClick={onClose}>✕</button>
        </div>

        {/* 頁籤樣式與城鎮面板共用 `.shop-tabs`（§ 34.1） */}
        <div className="shop-tabs settings-tabs">
          <button
            className={tab === 'display' ? 'active' : ''}
            aria-pressed={tab === 'display'}
            onClick={() => setTab('display')}
          >
            顯示
          </button>
          <button
            className={tab === 'account' ? 'active' : ''}
            aria-pressed={tab === 'account'}
            onClick={() => setTab('account')}
          >
            帳號
          </button>
        </div>

        {tab === 'account' && <AccountSettings onClose={onClose} />}

        {tab === 'display' && (
        <div className="settings-body">
          <div className="settings-row">
            <label htmlFor="setting-ui-scale">介面大小</label>
            <div className="settings-control">
              <input
                id="setting-ui-scale"
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={uiScale}
                onChange={e => setUiScale(Number(e.target.value))}
              />
              <span className="settings-value">{percent(uiScale)}</span>
            </div>
            <p className="settings-hint">
              狀態卡、快捷格、面板與城鎮視窗的整體大小。遊戲畫面不受影響
              {linkScales ? '；目前文字會一起變動。' : '，文字大小也不受影響。'}
            </p>
          </div>

          <label className="settings-link">
            <input
              type="checkbox"
              checked={linkScales}
              onChange={e => setLinkScales(e.target.checked)}
            />
            <span>介面與文字一起縮放</span>
          </label>

          <div className="settings-row">
            <label htmlFor="setting-font-scale">文字大小</label>
            <div className="settings-control">
              <input
                id="setting-font-scale"
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={fontScale}
                onChange={e => setFontScale(Number(e.target.value))}
              />
              <span className="settings-value">{percent(fontScale)}</span>
            </div>
            <p className="settings-hint">
              {linkScales ? '已與介面大小連動，拉任一條兩邊一起變。' : '只放大文字，介面尺寸不變。'}
            </p>
          </div>

          <div className="settings-row">
            <span className="settings-label">浮動視窗位置</span>
            <div className="settings-control">
              <button className="btn-secondary" onClick={resetPositions}>
                重設視窗位置
              </button>
            </div>
            <p className="settings-hint">
              視窗位置會自動記住；換到不同大小的瀏覽器視窗時按比例還原。
            </p>
          </div>

          <p className="settings-note">設定會立即生效並自動記住，同一台裝置的所有角色共用。</p>
        </div>
        )}

        <div className="settings-actions">
          {/* 「重設為 100%」只對顯示設定有意義，換頁時不該還留在畫面上 */}
          {tab === 'display' && (
            <button className="btn-secondary" onClick={resetDisplaySettings} disabled={isDefault}>
              重設為 100%
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
