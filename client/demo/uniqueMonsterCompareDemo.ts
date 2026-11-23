/**
 * 獨特魔物美術對照（`25-monster-system.md` § 25.2.2、§ 25.13）。
 *
 * 每列一隻獨特魔物：左＝原怪物（`baseRaw`）、右＝獨特魔物，各四方向（正面、右、背面、左），未裁腿版，外框同遊戲；
 * 兩邊都以大型的顯示大小縮放後放大 ZOOM 倍。無原怪物者只畫獨特魔物。
 */
import { MONSTER_JOBS, type MonsterJob } from '../scripts/comfy/monsterJobs.mjs';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { bakeOutlinedCanvas, outlinedArtLayout } from '../src/pixi/entities/monster/artOutline';
import { MONSTER_ART_OUTLINE_PX, MONSTER_ART_SIZE_RATIO, MONSTER_VIEW_BY_DIRECTION, monsterArtScale, monsterArtSize, type MonsterView } from '../src/pixi/entities/monster/monsterArt';
import type { PawnDirectionId } from '../src/pixi/entities/pawn/geometry';

const spriteUrls = import.meta.glob<string>('../assets-src/monsters/*-full.png', { eager: true, query: '?url', import: 'default' });
const URL_BY_NAME = new Map(Object.entries(spriteUrls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

export const UNIQUE_GROUP = '獨特魔物';
const ZOOM = 2;
const VIEWS: MonsterView[] = ['front', 'side', 'back'];
const DIRECTIONS: PawnDirectionId[] = ['front', 'right', 'back', 'left'];

const nameOf = (job: MonsterJob) => `${job.id} ${MONSTER_SEEDS.find(m => m.id === job.id)?.name ?? job.key}`;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** 一隻怪物的四方向，外框依顯示縮放烤好 */
async function renderViews(key: string): Promise<HTMLElement> {
  const box = document.createElement('div');
  box.className = 'cmp-views';
  const urls = VIEWS.map(view => URL_BY_NAME.get(`${key}-${view}-full`));
  if (urls.some(url => !url)) {
    box.textContent = `缺素材：${key}`;
    return box;
  }
  const images = Object.fromEntries(await Promise.all(VIEWS.map(async (view, i) => [view, await loadImage(urls[i]!)]))) as Record<MonsterView, HTMLImageElement>;
  const scale = monsterArtScale(VIEWS.map(v => images[v]), monsterArtSize('large', MONSTER_ART_SIZE_RATIO.large)) * ZOOM;
  for (const direction of DIRECTIONS) {
    const { view, mirrored } = MONSTER_VIEW_BY_DIRECTION[direction];
    const layout = outlinedArtLayout(images[view], scale, MONSTER_ART_OUTLINE_PX * ZOOM, 1);
    const canvas = bakeOutlinedCanvas(images[view], layout, () => document.createElement('canvas'));
    if (mirrored) canvas.style.transform = 'scaleX(-1)';
    box.append(canvas);
  }
  return box;
}

function column(title: string, views: HTMLElement): HTMLElement {
  const col = document.createElement('div');
  col.className = 'cmp-col';
  const label = document.createElement('div');
  label.className = 'cmp-label';
  label.textContent = title;
  col.append(label, views);
  return col;
}

export async function renderUniqueCompare(list: HTMLElement): Promise<void> {
  for (const job of MONSTER_JOBS.filter(item => item.group === UNIQUE_GROUP)) {
    const original = job.baseRaw ? MONSTER_JOBS.find(item => item.key === job.baseRaw) : undefined;
    const row = document.createElement('div');
    row.className = 'cmp-row';
    if (original) row.append(column(`原圖 ${nameOf(original)}`, await renderViews(original.key)));
    row.append(column(`獨特 ${nameOf(job)}${original ? '' : '（無原怪物）'}`, await renderViews(job.key)));
    list.append(row);
  }
}
