import type { MailItem } from '../../models/mailbox';

/**
 * 補償清單（`52-mailbox.md` § 52.2.4）。要補東西時在這裡加一筆。
 * `id` 是身分，用過的 `id` 不可再給另一筆補償。
 */

/**
 * 版本範圍（§ 52.2.4）：
 * - `this-version`（預設）：只在 `version` 那一版發
 * - `until`：發到 `untilVersion`（不含）之前為止
 * - `all-versions`：不限版本
 */
export type CompensationScope = 'this-version' | 'until' | 'all-versions';

export interface Compensation {
  /** 這筆補償是什麼，當作信件的 `sourceKey`（顯示與除錯用） */
  id: string;
  /** 要補的是哪一版的問題 */
  version: string;
  /** 預設 `this-version` */
  scope?: CompensationScope;
  /** `scope: 'until'` 用：跑到這一版（含）就不再補 */
  untilVersion?: string;
  /** 發布時間。**只發給這個時間之前建立的角色**（§ 52.2.2） */
  publishedAt: number;
  title: string;
  items: MailItem[];
}

/** 目前沒有待發的補償。起始配置改版不走這裡（§ 52.2.4.1） */
export const COMPENSATIONS: Compensation[] = [];

/** 版本比大小。逐段數字比，非字串比 */
export function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 這筆補償在現在這一版還算不算數 */
export function isCompensationActive(c: Compensation, currentVersion: string): boolean {
  switch (c.scope ?? 'this-version') {
    case 'all-versions':
      return true;
    case 'until':
      return c.untilVersion !== undefined
        && compareVersion(currentVersion, c.untilVersion) < 0;
    default:
      return c.version === currentVersion;
  }
}
