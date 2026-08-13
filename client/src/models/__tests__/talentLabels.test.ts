import { describe, it, expect } from 'vitest';
import { ruleLabel, ruleLabelOf } from '../talentLabels';
import { TALENT_RULE_DEFS, getTalentRuleDef } from '../../db/seed/talentSeeds';

const defOf = (ruleId: string) => getTalentRuleDef(ruleId)!;

/*
 * 標籤一律取自既有常數，編輯器與 Wiki 共用同一份（§ 43.4.12）——
 * 面板改名 Wiki 會跟著動，不會出現「Wiki 寫的選項在面板上找不到」。
 */
describe('條件與動作的顯示名稱', () => {
  it('從判定引擎的標籤常數取名', () => {
    expect(ruleLabelOf(defOf('hp_below'))).toBe('HP 低於');
    expect(ruleLabel('normal_attack')).toBe('普通攻擊');
  });

  it('查不到定義時回傳 ruleId 本身，不拋錯', () => {
    expect(ruleLabel('nonsense-rule')).toBe('nonsense-rule');
  });

  /* 沒接上引擎的在標籤表裡查不到，改由 `PENDING_RULE_LABELS` 補（§ 51.4.3.2） */
  it('未開放的項目仍有名字可顯示', () => {
    expect(ruleLabelOf(defOf('target_casting'))).toBe('目標正在詠唱');
    expect(ruleLabelOf(defOf('can_kill_target'))).toBe('本招可擊殺目標');
  });

  /*
   * 能力階梯塌成完整版之後一個 `ruleId` 只有一個名字（§ 51.4.1）。
   * 同名兩筆會讓選單出現兩個「施放攻擊技能」，玩家看不出差別。
   */
  it('沒有兩筆定義叫同一個名字', () => {
    const names = TALENT_RULE_DEFS.map(ruleLabelOf);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每一筆都有名字，沒有漏掉標籤退回 ruleId 的', () => {
    const nameless = TALENT_RULE_DEFS
      .filter(d => ruleLabelOf(d) === d.ruleId)
      .map(d => d.ruleId);
    expect(nameless).toEqual([]);
  });
});
