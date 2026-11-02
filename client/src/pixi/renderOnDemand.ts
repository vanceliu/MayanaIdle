import type { RenderGroup } from 'pixi.js';

/** 場景沒有變化時最長多久強制畫一次（ms），補上漏掉的變化（`34-ui-guidelines.md` § 34.9.1） */
export const MAX_IDLE_RENDER_MS = 1000;

/**
 * 自上次 render 之後場景有沒有變動：讀 Pixi 8 render group 的待更新佇列
 * （位移／透明度／顯示、圖形重畫、增減子物件都會進佇列，render 後清空）。
 */
export function isSceneDirty(group: RenderGroup): boolean {
  if (group.structureDidChange) return true;
  if (group.childrenRenderablesToUpdate.index > 0) return true;
  for (const depth in group.childrenToUpdate) {
    if (group.childrenToUpdate[depth].index > 0) return true;
  }
  return group.renderGroupChildren.some(isSceneDirty);
}

/** 這一幀要不要畫 */
export function shouldRender(opts: {
  dirty: boolean;
  requested: boolean;
  sinceLastRenderMs: number;
}): boolean {
  return opts.dirty || opts.requested || opts.sinceLastRenderMs >= MAX_IDLE_RENDER_MS;
}
