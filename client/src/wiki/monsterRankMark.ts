import { monsterRank, type MonsterRank } from '../models/monster';
import { SLOT_DROP_RATE_BOSS, SLOT_DROP_RATE_UNIQUE } from '../models/talent';

/** 怪物表格「Boss／獨特」欄的標記（`43-wiki-system.md` § 4.3） */
export const MONSTER_RANK_MARK: Record<MonsterRank, string> = { normal: '', unique: '獨特', boss: '★' };

export const MONSTER_RANK_LABEL: Record<MonsterRank, string> = { normal: '一般怪物', unique: '獨特魔物', boss: 'Boss' };

/** 獨特魔物標記文字色（`34-ui-guidelines.md`「獨特魔物卡片」名稱色） */
export const UNIQUE_MARK_COLOR = '#c4b5fd';

/** 地圖頁對獨特魔物出現方式的唯一說明，不標個別出現方式與時間（`43-wiki-system.md` § 4.4） */
export const UNIQUE_SPAWN_NOTE = '獨特魔物可能有不同的出現時機';

/** 天賦格掉率（%）；一般怪不掉（`27-drop-table.md` § 27.9） */
export const TALENT_SLOT_DROP_RATE: Record<Exclude<MonsterRank, 'normal'>, number> = {
  boss: SLOT_DROP_RATE_BOSS,
  unique: SLOT_DROP_RATE_UNIQUE,
};

export function monsterRankMark(m: { isBoss: boolean; isUnique?: boolean }): string {
  return MONSTER_RANK_MARK[monsterRank(m)];
}
