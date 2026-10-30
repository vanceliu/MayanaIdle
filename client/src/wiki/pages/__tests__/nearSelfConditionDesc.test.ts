import { describe, it, expect } from 'vitest';
import { COMBAT_CONDITION_DESC, PERSISTENT_CONDITION_DESC } from '../../talentRuleDescriptions';
import { COMBAT_CONDITION_HINTS } from '../../../models/scriptEngine';

/** `03-combat.md` § 3.12：「自身周圍怪物數 ≥」數量填 1 即「最近的怪在指定格數內」 */
describe('自身周圍怪物數 ≥ 說明', () => {
  it('編輯器提示寫出數量填 1 的用法', () => {
    expect(COMBAT_CONDITION_HINTS.monsters_near_self_gte).toContain('數量填 1＝最近的怪在指定格數內');
  });

  it('戰鬥與常駐 Wiki 說明相同', () => {
    expect(PERSISTENT_CONDITION_DESC.monsters_near_self_gte).toBe(COMBAT_CONDITION_DESC.monsters_near_self_gte);
    expect(COMBAT_CONDITION_DESC.monsters_near_self_gte).toContain('數量填 1');
  });
});
