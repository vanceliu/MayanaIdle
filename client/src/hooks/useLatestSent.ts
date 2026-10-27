import { useReducer, useRef } from 'react';

/**
 * 整份覆寫的遠端值（`97-selfhosted-server.md` § 97.2）：送出後、回覆前，`latest()` 是本機最後送出的值，
 * 沒有未回覆的送出時是鏡像。`resetKey` 改變時丟掉未回覆的紀錄。送出失敗由遠端 action 代理提示，這裡不再拋出。
 */
export function useLatestSent<T>(mirror: T, resetKey?: unknown): {
  latest: () => T;
  send: (value: T, request: (value: T) => unknown) => void;
} {
  const ref = useRef<{ key: unknown; count: number; value: T | undefined }>({ key: resetKey, count: 0, value: undefined });
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (ref.current.key !== resetKey) ref.current = { key: resetKey, count: 0, value: undefined };

  const latest = (): T => (ref.current.count > 0 ? ref.current.value as T : mirror);

  const send = (value: T, request: (value: T) => unknown) => {
    const pending = ref.current;
    pending.count++;
    pending.value = value;
    const settle = () => {
      pending.count--;
      rerender();
    };
    let result: unknown;
    try {
      result = request(value);
    } catch (e) {
      settle();
      throw e;
    }
    rerender();
    void Promise.resolve(result).catch(() => {}).finally(settle);
  };

  return { latest, send };
}
