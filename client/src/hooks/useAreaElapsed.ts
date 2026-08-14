import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';

/** 毫秒 → `5:07`，滿一小時進位為 `1:05:07` */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = (total % 60).toString().padStart(2, '0');
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * 待在目前這張地圖的時間，沒有角色時為 null。
 *
 * 基準是 `character.areaEnteredAt` —— 與生怪壓力（`26-spawn-pressure.md` § 26.4）
 * 同一個時鐘，所以畫面上的數字就是壓力累積的進度。選角進入遊戲會重設該欄位，
 * 因此這裡顯示的是本次上線後的停留時間。
 */
export function useAreaElapsed(): number | null {
  const areaEnteredAt = useGameStore(s => s.character?.areaEnteredAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (areaEnteredAt == null) return null;
  return Math.max(0, now - areaEnteredAt);
}
