import { formatBuildLabel, formatBuildTime } from '../buildInfo';

/** 建置版本標示，回報問題時用來確認玩家跑的是哪一版 */
export function BuildLabel() {
  return (
    <div className="build-label" title={formatBuildTime()}>
      {formatBuildLabel()}
    </div>
  );
}
