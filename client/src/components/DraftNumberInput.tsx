import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | undefined;
  /** 空白送 `undefined`；回傳的 Promise 結束前輸入格維持顯示送出的值 */
  onCommit: (value: number | undefined) => unknown;
};

/**
 * 送 server 的數字輸入格（`97-selfhosted-server.md` § 97.2）：打字只改本機草稿，
 * 離開焦點或按 Enter 才送出；與目前值相同、或不是數字時不送。
 */
export function DraftNumberInput({ value, onCommit, onBlur, onKeyDown, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim() === '' ? undefined : Number(draft);
    if ((next !== undefined && !Number.isFinite(next)) || next === value) {
      setDraft(null);
      return;
    }
    const sent = draft;
    void Promise.resolve(onCommit(next))
      .catch(() => {})
      .finally(() => setDraft(d => (d === sent ? null : d)));
  };

  return (
    <input
      {...rest}
      type="number"
      value={draft ?? value ?? ''}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        onKeyDown?.(e);
      }}
    />
  );
}
