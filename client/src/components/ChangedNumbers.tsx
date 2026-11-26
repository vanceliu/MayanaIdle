/**
 * 顯示 `value`，其中被改動的數字以黃色標出（`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 * 比對規則見 `models/skillTooltipText.ts` 的 `changedNumberParts()`。
 */
import { changedNumberParts } from '../models/skillTooltipText';

export function ChangedNumbers({ base, value, references = [] }: { base: string; value: string; references?: readonly string[] }) {
  return (
    <>
      {changedNumberParts(base, value, references).map((p, i) => (p.changed ? <span key={i} className="stat-changed">{p.text}</span> : p.text))}
    </>
  );
}
