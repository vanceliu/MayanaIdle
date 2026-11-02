/** 懸賞「掉兩次取比較好」的裝備比較（`53-bounty-contract.md` § 53.6） */
import { describe, it, expect } from 'vitest';
import {
  defaultBountyCompareSettings, normalizeBountyCompareSettings, pickBetterBountyEquipment,
  type BountyCompareContext, type BountyCompareSettings,
} from '../bountyCompare';
import type { Affix } from '../affix';
import type { EquipmentInstance } from '../equipment';

const SUBJECT = { className: 'knight', selfAttributes: { STR: 16, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 } };

function item(affixes: Partial<Affix>[], overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: 'x', slot: 'body', type: 'armor', quality: 0, enhancement: 0, ownerId: 1, equipped: false,
    affixes: affixes.map(a => ({ type: 'attack_power', tier: 1, value: 3.1, ...a })) as Affix[],
    ...overrides,
  } as EquipmentInstance;
}

function ctx(settings: Partial<BountyCompareSettings> = {}): BountyCompareContext {
  return { settings: { ...defaultBountyCompareSettings(), ...settings }, subject: SUBJECT };
}

describe('§ 53.6.2 比較條件', () => {
  it('穿得起的優先', () => {
    const wearable = item([{ tier: 1 }]);
    const notWearable = item([{ tier: 6 }], { requiredClass: ['wizard'] });
    expect(pickBetterBountyEquipment(notWearable, wearable, ctx())).toBe(wearable);
  });

  it('偏好詞綴條數多者勝；清單為空時往下比', () => {
    const a = item([{ type: 'crit_rate', tier: 2 }]);
    const b = item([{ type: 'attack_power', tier: 3 }]);
    expect(pickBetterBountyEquipment(a, b, ctx({ affixTypes: ['crit_rate'] }))).toBe(a);
    expect(pickBetterBountyEquipment(a, b, ctx())).toBe(b);
  });

  it('最高階級相同時比該階級條數', () => {
    const a = item([{ tier: 6 }, { tier: 1 }]);
    const b = item([{ tier: 6 }, { tier: 6 }]);
    expect(pickBetterBountyEquipment(a, b, ctx())).toBe(b);
  });

  it('無 Tier 詞綴視為 T5', () => {
    const special = item([{ type: 'immune_poison', tier: 0, value: 100 }]);
    const t4 = item([{ tier: 4 }]);
    expect(pickBetterBountyEquipment(t4, special, ctx())).toBe(special);
  });

  it('關掉的條件跳過；依順序比較', () => {
    const highTier = item([{ tier: 6 }], { stability: 4 });
    const stable = item([{ tier: 2 }], { stability: 6 });
    const stabilityFirst = normalizeBountyCompareSettings({
      order: [{ key: 'stability', enabled: true }, { key: 'topTier', enabled: true }],
    });
    expect(pickBetterBountyEquipment(highTier, stable, ctx())).toBe(highTier);
    expect(pickBetterBountyEquipment(highTier, stable, ctx(stabilityFirst))).toBe(stable);
  });

  it('安定值相同比隨機額外防禦', () => {
    const a = item([{ tier: 2 }], { stability: 5, defenseBonus: 0 });
    const b = item([{ tier: 2 }], { stability: 5, defenseBonus: 2 });
    expect(pickBetterBountyEquipment(a, b, ctx({ order: [{ key: 'stability', enabled: true }] }))).toBe(b);
  });

  it('區間位置加總：同階數值高者勝', () => {
    const low = item([{ tier: 1, value: 3.1 }]);
    const high = item([{ tier: 1, value: 5 }]);
    expect(pickBetterBountyEquipment(low, high, ctx())).toBe(high);
  });

  it('全部相同留第一件', () => {
    const a = item([{ tier: 3, value: 9 }]);
    const b = item([{ tier: 3, value: 9 }]);
    expect(pickBetterBountyEquipment(a, b, ctx())).toBe(a);
  });
});

describe('設定正規化', () => {
  it('去掉不認得與重複的條件，缺的補在最後並啟用', () => {
    const s = normalizeBountyCompareSettings({
      affixTypes: ['crit_rate', 'crit_rate', 3],
      order: [{ key: 'tierSum', enabled: false }, { key: 'bogus' }, { key: 'tierSum' }],
    });
    expect(s.affixTypes).toEqual(['crit_rate']);
    expect(s.order[0]).toEqual({ key: 'tierSum', enabled: false });
    expect(s.order.map(o => o.key)).toEqual(['tierSum', 'wearable', 'preferred', 'topTier', 'stability', 'rangePos']);
  });
});
