/**
 * 顯示 `value`，其中被改動的數字以黃色標出（`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 *
 * - 與 `base`、`references` 任一段比對不同的數字都標色
 * - 兩段文字結構相同：逐位比對，不同的數字標色
 * - 結構不同（整段改寫或新增）：該段裡沒有的數值才標色
 */
const NUMBER = /(\d+(?:\.\d+)?)/;

function changedAgainst(reference: string, parts: string[]): (part: string, i: number) => boolean {
  const a = reference.split(NUMBER);
  const sameShape = a.length === parts.length && a.every((part, i) => i % 2 === 1 || part === parts[i]);
  const numbers = new Set(a.filter((_, i) => i % 2 === 1));
  return (part, i) => (sameShape ? part !== a[i] : !numbers.has(part));
}

export function ChangedNumbers({ base, value, references = [] }: { base: string; value: string; references?: readonly string[] }) {
  const differing = [base, ...references].filter(r => r !== value);
  if (differing.length === 0) return <>{value}</>;
  const parts = value.split(NUMBER);
  const checks = differing.map(r => changedAgainst(r, parts));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 && checks.some(changed => changed(part, i))
        ? <span key={i} className="stat-changed">{part}</span>
        : part))}
    </>
  );
}
