import { describe, it, expect } from 'vitest';
import { pickTargetBy, type TargetPickCandidate } from '../targeting';
import { isNonAttackAction } from '../../models/scriptEngine';

/** 目標選擇策略與走位（`51-auto-talent.md` § 51.4.9，階段 8） */

const P = { x: 0, y: 0 };

function c(
  id: string, x: number, hpPercent: number,
  over: Partial<TargetPickCandidate> = {},
): TargetPickCandidate {
  return {
    id, position: { x, y: 0 }, hpPercent,
    race: 'normal', element: 'fire', debuffTags: [],
    ...over,
  };
}

describe('目標選擇策略', () => {
  const pool = [c('a', 1, 80), c('b', 5, 20), c('c', 3, 50)];

  it('最低 HP% —— 補刀用', () => {
    expect(pickTargetBy('lowest_hp', pool, P)).toBe('b');
  });

  it('最高 HP%', () => {
    expect(pickTargetBy('highest_hp', pool, P)).toBe('a');
  });

  it('最遠', () => {
    expect(pickTargetBy('farthest', pool, P)).toBe('b');
  });

  it('指定種族／元素 —— 同類取最近的', () => {
    const mixed = [
      c('far', 9, 50, { race: 'undead' }),
      c('near', 2, 50, { race: 'undead' }),
      c('other', 1, 50, { race: 'demon' }),
    ];
    // 切目標的意圖是「換一隻打」，不是「跑最遠那隻」
    expect(pickTargetBy('by_kind', mixed, P, 'undead')).toBe('near');
    expect(pickTargetBy('by_kind', mixed, P, 'demon')).toBe('other');
    expect(pickTargetBy('by_kind', mixed, P, 'dragon')).toBeNull();
  });

  it('帶指定 debuff 的', () => {
    const pool2 = [c('clean', 1, 50), c('poisoned', 4, 50, { debuffTags: ['poison'] })];
    expect(pickTargetBy('by_debuff', pool2, P, 'poison')).toBe('poisoned');
  });

  it('沒有指定 debuff 的 —— 讓 DoT 鋪滿場，而不是重複疊同一隻', () => {
    const pool2 = [c('poisoned', 1, 50, { debuffTags: ['poison'] }), c('clean', 4, 50)];
    expect(pickTargetBy('by_lacking_debuff', pool2, P, 'poison')).toBe('clean');
  });

  it('候選為空時回 null，呼叫端維持原目標', () => {
    expect(pickTargetBy('lowest_hp', [], P)).toBeNull();
    expect(pickTargetBy('by_debuff', pool, P, 'stun')).toBeNull();
  });

  it('不做射程判定 —— 切遠處的目標必須切得成', () => {
    // 最遠那隻遠遠超出任何武器射程，照樣選得到
    const distant = [c('near', 1, 50), c('veryFar', 999, 50)];
    expect(pickTargetBy('farthest', distant, P)).toBe('veryFar');
  });
});

describe('非攻擊動作的分類', () => {
  it('切換目標與走位都消耗出手機會，與「不動作」同性質', () => {
    for (const t of [
      'wait', 'switch_target_lowest_hp', 'switch_target_by_kind',
      'lock_target', 'keep_distance', 'close_in', 'disengage',
    ] as const) {
      expect(isNonAttackAction(t), t).toBe(true);
    }
  });

  it('攻擊類不在其中', () => {
    for (const t of ['skill', 'normal_attack'] as const) {
      expect(isNonAttackAction(t), t).toBe(false);
    }
  });
});
