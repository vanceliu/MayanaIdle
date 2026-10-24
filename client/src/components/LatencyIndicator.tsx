import { useOnlineStore } from '../net/online';

/** 延遲分級門檻（`47-mobile.md` § 47.6）：低於 good 為綠、到 fair（含）為黃、超過為紅 */
export const LATENCY_GOOD_BELOW_MS = 100;
export const LATENCY_FAIR_UP_TO_MS = 300;

export type LatencyLevel = 'good' | 'fair' | 'poor';

export function latencyLevel(ms: number): LatencyLevel {
  if (ms < LATENCY_GOOD_BELOW_MS) return 'good';
  if (ms <= LATENCY_FAIR_UP_TO_MS) return 'fair';
  return 'poor';
}

/** 連線延遲（`47-mobile.md` § 47.6）：只在線上模式顯示，尚未量到時顯示 `-- ms` */
export function LatencyIndicator() {
  const enabled = useOnlineStore(s => s.enabled);
  const ms = useOnlineStore(s => s.latencyMs);
  if (!enabled) return null;

  const level = ms === null ? 'unknown' : latencyLevel(ms);
  const label = ms === null ? '連線延遲：尚未量測' : '連線延遲';
  return (
    <span className={`latency-indicator is-${level}`} title={label}>
      {ms === null ? '--' : ms} ms
    </span>
  );
}
