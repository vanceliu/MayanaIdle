/**
 * server 公告橫幅（`97-selfhosted-server.md` § 97.8）。
 *
 * 貼在畫面上方正中，蓋得住地圖也沒關係 —— 關服倒數本來就該擋一下視線。
 * 同一則內容也會進系統紀錄（`net/mirror.ts`），切走視窗回來還查得到。
 */
import { useEffect, useState } from 'react';
import { useNoticeStore } from '../stores/noticeStore';

export function NoticeBanner() {
  const text = useNoticeStore(s => s.text);
  const until = useNoticeStore(s => s.until);
  const clear = useNoticeStore(s => s.clear);
  const [, force] = useState(0);

  useEffect(() => {
    if (!text) return;
    const left = until - Date.now();
    if (left <= 0) {
      clear();
      return;
    }
    const timer = setTimeout(() => { clear(); force(n => n + 1); }, left);
    return () => clearTimeout(timer);
  }, [text, until, clear]);

  if (!text) return null;

  return (
    <div className="notice-banner" role="status" aria-live="assertive">
      {text}
    </div>
  );
}
