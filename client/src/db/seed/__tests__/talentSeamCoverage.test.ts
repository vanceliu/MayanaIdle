import { describe, it, expect } from 'vitest';
import { TALENT_RULE_DEFS, PENDING_RULE_LABELS } from '../talentSeeds';
import { TALENT_PARAM_FIELDS } from '../../../models/talentParams';
import { TALENT_AFFIX_ICON_MAP } from '../../../models/iconMap';
import { ruleDescription } from '../../../wiki/talentRuleDescriptions';
import { ruleLabelOf } from '../../../models/talentLabels';
import {
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
} from '../../../models/scriptEngine';
import { VILLAGE_CONDITION_LABELS, VILLAGE_ACTION_LABELS } from '../../../models/villageScript';

/**
 * seed 與其他層的對接（`51-auto-talent.md` § 51.4.3.2）。
 *
 * 條件與動作的定義散在五個地方：seed、判定引擎、參數宣告、圖示、Wiki 說明。
 * 五處必須齊備，本測試逐一把關。
 */

/** 可用 ＝ 沒被 blocked，玩家真的選得到 */
const usable = TALENT_RULE_DEFS.filter(d => !d.blocked);

describe('條件與動作的 seed 與各層對接', () => {
  it('可用的項目都接上了判定引擎', () => {
    const orphans = usable.filter(d => d.ruleId in PENDING_RULE_LABELS).map(d => d.ruleId);
    expect(orphans).toEqual([]);
  });

  it('可用的項目都有顯示名稱', () => {
    const noLabel = usable.filter(d => ruleLabelOf(d) === d.ruleId).map(d => d.ruleId);
    expect(noLabel).toEqual([]);
  });

  it('可用的項目都有 Wiki 說明', () => {
    const noDesc = usable.filter(d => !ruleDescription(d)).map(d => d.ruleId);
    expect(noDesc).toEqual([]);
  });

  it('可用的項目都有圖示', () => {
    const noIcon = usable.filter(d => !(d.ruleId in TALENT_AFFIX_ICON_MAP)).map(d => d.ruleId);
    expect(noIcon).toEqual([]);
  });

  it('參數宣告與圖示表不會有 seed 裡不存在的 ruleId', () => {
    const ids = new Set(TALENT_RULE_DEFS.map(d => d.ruleId));
    expect(Object.keys(TALENT_PARAM_FIELDS).filter(k => !ids.has(k))).toEqual([]);
    expect(Object.keys(TALENT_AFFIX_ICON_MAP).filter(k => !ids.has(k))).toEqual([]);
  });

  it('blocked 的項目都寫明原因', () => {
    const noReason = TALENT_RULE_DEFS.filter(d => d.blocked && !d.blockedReason).map(d => d.ruleId);
    expect(noReason).toEqual([]);
  });

  /* `ruleId` 是唯一的鍵（§ 51.4.1）—— 能力階梯塌成完整版之後不該再有同名兩筆 */
  it('ruleId 不重複', () => {
    const seen = new Set<string>();
    const dupes = TALENT_RULE_DEFS.filter(d => !seen.add(d.ruleId)).map(d => d.ruleId);
    expect(dupes).toEqual([]);
  });

  /*
   * 標了某個類型，那個類型的判定引擎就必須有這條規則。
   * 少了的話選得上去、永遠不成立、也沒有任何提示 —— 功能測試完全抓不到。
   */
  it('標的每個適用類型，該類型的引擎都認得', () => {
    const known: Record<string, Set<string>> = {
      'combat:condition': new Set(Object.keys(COMBAT_CONDITION_LABELS)),
      'combat:action': new Set(Object.keys(COMBAT_ACTION_LABELS)),
      'persistent:condition': new Set(Object.keys(PERSISTENT_CONDITION_LABELS)),
      'persistent:action': new Set(Object.keys(PERSISTENT_ACTION_LABELS)),
      'supply:condition': new Set(Object.keys(VILLAGE_CONDITION_LABELS)),
      'supply:action': new Set(Object.keys(VILLAGE_ACTION_LABELS)),
    };
    const orphans: string[] = [];
    for (const d of usable) {
      for (const type of d.appliesTo) {
        if (!known[`${type}:${d.kind}`].has(d.ruleId)) orphans.push(`${d.ruleId}@${type}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});