/**
 * 怪物模板查表（`25-monster-system.md`）。
 *
 * 模板隨程式碼發布（`97-selfhosted-server.md` § 97.4），開機就在記憶體裡：
 * client 與 server 讀的是同一份 seed，不必經過持久層。
 */
import type { MonsterTemplate } from './monster';
import { MONSTER_SEEDS } from '../db/seed/monsterSeeds';

const BY_AREA = new Map<string, MonsterTemplate[]>();
for (const template of MONSTER_SEEDS as MonsterTemplate[]) {
  const list = BY_AREA.get(template.area);
  if (list) list.push(template);
  else BY_AREA.set(template.area, [template]);
}

export function getMonsterTemplates(area: string): MonsterTemplate[] {
  return BY_AREA.get(area) ?? [];
}
