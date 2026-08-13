import { useEffect, useState } from 'react';

/**
 * DOM 一次性演出的共用狀態（`48-vfx.md` § 48.3.1）。
 *
 * 三件事都在這裡處理，呼叫端不要各自再寫一份：
 * 1. **token**：每次觸發遞增。演出節點**必須以它當 `key`**
 * 2. **收尾**：計時器比對 token，只清掉自己那一次
 * 3. **卸載**：面板關掉時一併清除
 */
export const FX_DURATION_MS = 1500;

let nextToken = 0;

export interface OneShotFx {
  token: number;
}

export function useOneShotFx<T>() {
  const [fx, setFx] = useState<(T & OneShotFx) | null>(null);

  useEffect(() => () => setFx(null), []);

  function play(next: T) {
    const token = ++nextToken;
    setFx({ ...next, token });
    window.setTimeout(() => {
      setFx(current => (current?.token === token ? null : current));
    }, FX_DURATION_MS);
  }

  return { fx, play };
}
