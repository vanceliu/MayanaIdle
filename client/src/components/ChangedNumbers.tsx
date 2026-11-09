/**
 * 顯示 `value`，其中被改動的數字以黃色標出（`07-affix-ability.md` § 7S.7）。
 *
 * - 兩段文字結構相同：逐位比對，不同的數字標色
 * - 結構不同（整段改寫或新增）：`base` 裡沒有的數值才標色
 */
const NUMBER = /(\d+(?:\.\d+)?)/;

export function ChangedNumbers({ base, value }: { base: string; value: string }) {
  if (base === value) return <>{value}</>;
  const a = base.split(NUMBER);
  const b = value.split(NUMBER);
  const sameShape = a.length === b.length && a.every((part, i) => i % 2 === 1 || part === b[i]);
  const baseNumbers = new Set(a.filter((_, i) => i % 2 === 1));
  const changed = (part: string, i: number) => (sameShape ? part !== a[i] : !baseNumbers.has(part));
  return (
    <>
      {b.map((part, i) => (i % 2 === 1 && changed(part, i)
        ? <span key={i} className="stat-changed">{part}</span>
        : part))}
    </>
  );
}
