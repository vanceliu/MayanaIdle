import { useGameStore } from '../stores/gameStore';
import { formatBuildLabel } from '../buildInfo';
import { isHandheldDevice } from '../hooks/useViewport';
import { buildFeedbackUrl, detectFeedbackPlatform } from '../systems/feedbackForm';

/** 設定視窗「回饋」頁（`34-ui-guidelines.md` § 34.6「回饋」） */
export function FeedbackSettings() {
  const character = useGameStore(s => s.character);
  const url = buildFeedbackUrl({
    version: formatBuildLabel(),
    platform: detectFeedbackPlatform(navigator.userAgent, isHandheldDevice()),
    character: character && { name: character.name, className: character.className, level: character.level },
  });

  return (
    <div className="settings-body">
      <div className="settings-row">
        <span className="settings-label">意見回饋</span>
        <div className="settings-control settings-control-wrap">
          <a className="btn-wiki" href={url} target="_blank" rel="noopener noreferrer">開啟回饋表單</a>
        </div>
        <p className="settings-hint">回報 Bug、建議或平衡意見。遊戲版本與角色資料會自動帶入。</p>
      </div>
    </div>
  );
}
