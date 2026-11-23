/** 怪物美術圖集與素材對應（`25-monster-system.md` § 25.2.2「同名怪物」「殘影系列」「載入」） */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MONSTER_JOBS } from '../../../../../scripts/comfy/monsterJobs.mjs';
import { webpSize } from '../../../../../scripts/comfy/webp.mjs';
import { MONSTER_SEEDS } from '../../../../db/seed/monsterSeeds';
import type { MonsterTemplate } from '../../../../models/monster';
import { MONSTER_ART_ALIASES, buildMonsterArtKeys, monsterArtKey, type MonsterArtIndex, type MonsterBatchManifest } from '../monsterArtAssets';

const DIR = join(__dirname, '../../../../assets/monsters');
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as MonsterArtIndex;

describe('圖集', () => {
  it('產圖清單每一項都有打包，id 與清單一致', () => {
    expect(Object.keys(index).sort()).toEqual(MONSTER_JOBS.map(job => job.key).sort());
    for (const job of MONSTER_JOBS) expect(index[job.key].id).toBe(job.id);
  });

  it('每張圖集都有三視圖 frame，且都在圖內', () => {
    for (const batch of new Set(Object.values(index).map(e => e.batch))) {
      const manifest = JSON.parse(readFileSync(join(DIR, `${batch}.json`), 'utf8')) as MonsterBatchManifest;
      const atlas = webpSize(readFileSync(join(DIR, `${batch}.webp`)));
      for (const [key, views] of Object.entries(manifest)) {
        expect(index[key].batch).toBe(batch);
        for (const frame of [views.front, views.side, views.back]) {
          expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.width);
          expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.height);
        }
      }
    }
  });
});

describe('monsterArtKey', () => {
  // 獨特魔物美術待定，無素材時畫球（`25-monster-system.md` § 25.13.1）
  it('所有非獨特魔物的怪物模板都有素材（同名與殘影共用）', () => {
    expect(MONSTER_SEEDS.filter(t => !t.isUnique && monsterArtKey(t.id ?? -1) === null).map(t => `${t.id} ${t.name}`)).toEqual([]);
  });

  it('殘影系列用原版素材', () => {
    for (const [afterimage, original] of Object.entries(MONSTER_ART_ALIASES)) {
      expect(monsterArtKey(Number(afterimage))).toBe(monsterArtKey(original));
    }
  });

  it('清單外的 id 用同名怪物的素材；清單有該 id 時用自己的；都沒有回傳 null', () => {
    const t = (id: number, name: string) => ({ id, name }) as MonsterTemplate;
    const keys = buildMonsterArtKeys([t(1, '甲'), t(2, '甲'), t(3, '乙'), t(4, '丙')], { a: { batch: 'b', id: 1 }, c: { batch: 'b', id: 3 } });
    expect([keys.get(1), keys.get(2), keys.get(3), keys.get(4)]).toEqual(['a', 'a', 'c', undefined]);
  });
});
