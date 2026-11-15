/**
 * 人形怪物 img2img 底圖匯出（`25-monster-system.md` § 25.2.2）。
 *
 * 每個有 base 的產圖項目畫一張底圖三視圖（`src/pixi/entities/monster/monsterBase.ts`），
 * 下載後放到 `assets-src/monster-bases/<key>.png`。
 */
import { MONSTER_JOBS } from '../scripts/comfy/monsterJobs.mjs';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { drawMonsterBase } from '../src/pixi/entities/monster/monsterBase';
import { PAWN_BASE_BACKGROUND, PAWN_BASE_SIZE } from '../src/pixi/entities/monster/pawnBase';
import type { PawnContext } from '../src/pixi/entities/pawn/drawPawn';

export interface PawnBaseEntry {
  key: string;
  name: string;
  canvas: HTMLCanvasElement;
}

export function renderPawnBases(): PawnBaseEntry[] {
  return MONSTER_JOBS.filter(job => job.base).map(job => {
    const canvas = document.createElement('canvas');
    canvas.width = PAWN_BASE_SIZE.width;
    canvas.height = PAWN_BASE_SIZE.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = PAWN_BASE_BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMonsterBase(ctx as unknown as PawnContext, job.base!);
    const name = MONSTER_SEEDS.find(m => m.id === job.id)?.name ?? job.key;
    return { key: job.key, name: `${job.id} ${name}`, canvas };
  });
}
