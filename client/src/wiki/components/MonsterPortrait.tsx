/**
 * Wiki 怪物詳細頁的正面圖（`25-monster-system.md` § 25.2.2「Wiki」）：
 * 載入怪物素材的正面視圖，依高度與螢幕密度烤上 1px 外框；沒有素材或載入失敗時不顯示。
 */
import { useEffect, useRef } from 'react';
import { bakeOutlinedCanvas, outlinedArtLayout } from '../../pixi/entities/monster/artOutline';
import { MONSTER_ART_OUTLINE_PX } from '../../pixi/entities/monster/monsterArt';
import { loadMonsterArt, monsterArtKey } from '../../pixi/entities/monster/monsterArtAssets';

/** 圖高（CSS px） */
export const MONSTER_PORTRAIT_HEIGHT = 112;

export function MonsterPortrait({ templateId }: { templateId: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const key = monsterArtKey(templateId);
    if (!key) return;
    let cancelled = false;
    loadMonsterArt(key).then(images => {
      if (cancelled || !ref.current) return;
      const density = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      const layout = outlinedArtLayout(images.front, MONSTER_PORTRAIT_HEIGHT / images.front.height, MONSTER_ART_OUTLINE_PX, density);
      const canvas = bakeOutlinedCanvas(images.front, layout, () => document.createElement('canvas'));
      canvas.style.width = `${layout.width / density}px`;
      canvas.style.height = `${layout.height / density}px`;
      ref.current.replaceChildren(canvas);
    }).catch(() => { /* 載入失敗不顯示 */ });
    return () => { cancelled = true; };
  }, [templateId]);
  return <span ref={ref} className="wiki-monster-portrait" data-testid="monster-portrait" />;
}
