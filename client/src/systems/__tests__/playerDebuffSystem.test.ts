import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import { PLAYER_DEBUFF_DEFS } from '../../models/playerDebuff';
import {
  rollMonsterDebuff,
  applyPlayerDebuff,
  applySpeedBuff,
  applyPlayerBuff,
  createPlayerDebuffEffect,
  getDebuffImmunityRate,
  getEquippedSpecialAffixes,
  hasActivePlayerDebuff,
  isPlayerStunned,
  STUN_RESIST_DURATION_MULTIPLIER,
} from '../playerDebuffSystem';

const NOW = 10_000;

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1,
    name: '毒蛇',
    level: 18,
    currentHp: 100,
    maxHp: 100,
    attackMin: 10,
    attackMax: 30,
    defense: 5,
    exp: 50,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
    ...overrides,
  };
}

function armor(affixTypes: string[]): EquipmentInstance {
  return {
    templateId: 100,
    name: '鐵甲',
    type: 'armor',
    slot: 'chest',
    isTwoHanded: false,
    smallMonsterDamage: 0,
    largeMonsterDamage: 0,
    defense: 10,
    quality: 0,
    enhancement: 0,
    affixes: affixTypes.map(t => ({ type: t as never, tier: 0, value: 0 })),
    ownerId: 1,
    equipped: true,
  } as EquipmentInstance;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rollMonsterDebuff — 觸發判定', () => {
  it('怪物無 debuff 能力時不觸發', () => {
    const result = rollMonsterDebuff(monster({ debuffs: undefined }), [], [], NOW);
    expect(result.triggered).toBe(false);
    expect(result.effect).toBeNull();
  });

  it('隨機值低於觸發率時命中', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 10% < 20%
    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 20 }] }), [], [], NOW,
    );
    expect(result.triggered).toBe(true);
    expect(result.type).toBe('poison');
    expect(result.effect?.category).toBe('dot-poison');
  });

  it('隨機值高於觸發率時不命中', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 50% >= 20%
    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 20 }] }), [], [], NOW,
    );
    expect(result.triggered).toBe(false);
  });

  it('多 debuff 依表格順序判定、命中即停（§ 25.9.2 規則 1、2）', () => {
    // 第一次 roll 失敗（0.5 >= 0.12），第二次成功（0.05 < 0.12）
    const rolls = [0.5, 0.05];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => rolls[i++]);

    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 12 }, { type: 'slow', chance: 12 }] }),
      [], [], NOW,
    );
    expect(result.type).toBe('slow');
    expect(i).toBe(2);
  });

  it('第一個 debuff 命中後不再判定後續 debuff', () => {
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => { calls++; return 0.01; });

    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 12 }, { type: 'slow', chance: 12 }] }),
      [], [], NOW,
    );
    expect(result.type).toBe('poison');
    expect(calls).toBe(1);
  });

  it('免疫詞綴使該 debuff 觸發率歸零並跳過（§ 7.10.4）', () => {
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => { calls++; return 0.01; });

    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 20 }, { type: 'slow', chance: 15 }] }),
      [armor(['immune_poison'])], [], NOW,
    );
    // 中毒被免疫（未消耗 roll），改由減速命中
    expect(result.type).toBe('slow');
    expect(calls).toBe(1);
  });

  it('不可刷新的 debuff 仍在存續期間時命中但不重複施加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const existing: ActiveEffect[] = [
      createPlayerDebuffEffect('poison', monster(), NOW - 1000, new Set()),
    ];
    const result = rollMonsterDebuff(
      monster({ debuffs: [{ type: 'poison', chance: 20 }] }), [], existing, NOW,
    );
    expect(result.triggered).toBe(true);
    expect(result.effect).toBeNull();
  });
});

describe('createPlayerDebuffEffect — 效果內容', () => {
  it('中毒 DoT 為怪物攻擊力（min/max 平均）的 5%，持續 10 秒', () => {
    const effect = createPlayerDebuffEffect('poison', monster({ attackMin: 10, attackMax: 30 }), NOW, new Set());
    expect(effect.dot?.damage).toBe(1); // floor(20 * 0.05)
    expect(effect.duration).toBe(10000);
    expect(effect.tags).toContain('poisoned');
  });

  it('流血 DoT 為 8%，持續 10 秒', () => {
    const effect = createPlayerDebuffEffect('bleed', monster({ attackMin: 100, attackMax: 100 }), NOW, new Set());
    expect(effect.dot?.damage).toBe(8);
    expect(effect.duration).toBe(10000);
    expect(effect.tags).toContain('bleeding');
  });

  it('DoT 傷害最低為 1', () => {
    const effect = createPlayerDebuffEffect('poison', monster({ attackMin: 1, attackMax: 1 }), NOW, new Set());
    expect(effect.dot?.damage).toBe(1);
  });

  it('詛咒為防禦 -20%、持續 8 秒', () => {
    const effect = createPlayerDebuffEffect('curse', monster(), NOW, new Set());
    expect(effect.modifiers).toEqual([{ stat: 'defense', value: -20, isPercent: true }]);
    expect(effect.duration).toBe(8000);
  });

  it('虛弱為攻擊 -20%、減速為攻速 -30%', () => {
    expect(createPlayerDebuffEffect('weaken', monster(), NOW, new Set()).modifiers)
      .toEqual([{ stat: 'attack', value: -20, isPercent: true }]);
    expect(createPlayerDebuffEffect('slow', monster(), NOW, new Set()).modifiers)
      .toEqual([{ stat: 'attack_speed', value: -30, isPercent: true }]);
  });

  it('暈眩持續 1.5 秒並帶 stun 標記', () => {
    const effect = createPlayerDebuffEffect('stun', monster(), NOW, new Set());
    expect(effect.stun).toBe(true);
    expect(effect.duration).toBe(1500);
  });

  it('暈眩抵抗使暈眩時間 -50%（不是免疫）', () => {
    const effect = createPlayerDebuffEffect('stun', monster(), NOW, new Set(['resist_stun']));
    expect(effect.duration).toBe(PLAYER_DEBUFF_DEFS.stun.duration * STUN_RESIST_DURATION_MULTIPLIER);
    expect(effect.stun).toBe(true);
  });
});

describe('免疫率與特殊詞綴收集', () => {
  it('裝備免疫詞綴時免疫率為 1，否則為 0', () => {
    expect(getDebuffImmunityRate('poison', new Set(['immune_poison']))).toBe(1);
    expect(getDebuffImmunityRate('poison', new Set())).toBe(0);
  });

  it('暈眩無免疫詞綴，免疫率恆為 0', () => {
    expect(getDebuffImmunityRate('stun', new Set(['resist_stun']))).toBe(0);
  });

  it('詛咒／虛弱／減速已無免疫詞綴，免疫率恆為 0（改由魔抗抵抗）', () => {
    for (const type of ['curse', 'weaken', 'slow'] as const) {
      expect(getDebuffImmunityRate(type, new Set(['immune_poison', 'immune_bleed', 'resist_stun']))).toBe(0);
    }
  });

  it('多件裝備的免疫效果不疊加（以 Set 收集）', () => {
    const specials = getEquippedSpecialAffixes([
      armor(['immune_poison']),
      armor(['immune_poison', 'immune_bleed']),
      null,
    ]);
    expect(specials.size).toBe(2);
    expect(specials.has('immune_poison')).toBe(true);
    expect(specials.has('immune_bleed')).toBe(true);
  });
});

describe('applyPlayerDebuff — 疊加規則（§ 24.4.3）', () => {
  it('可刷新的 debuff 以同 category 覆蓋', () => {
    const first = createPlayerDebuffEffect('curse', monster(), NOW, new Set());
    const second = createPlayerDebuffEffect('curse', monster(), NOW + 2000, new Set());
    const { effects } = applyPlayerDebuff([first], second, NOW + 2000);
    expect(effects).toHaveLength(1);
    expect(effects[0].startTime).toBe(NOW + 2000);
  });

  it('不同 category 的 debuff 可同時存在', () => {
    const poison = createPlayerDebuffEffect('poison', monster(), NOW, new Set());
    const curse = createPlayerDebuffEffect('curse', monster(), NOW, new Set());
    const { effects } = applyPlayerDebuff([poison], curse, NOW);
    expect(effects).toHaveLength(2);
  });
});

describe('減速與加速互相抵銷（§ 24.4.6）', () => {
  function speedBuff(start = NOW): ActiveEffect {
    return {
      id: 'buff-speed', sourceSkillId: 'speed-potion', sourceSkillName: '綠色藥水',
      category: 'speed', type: 'buff', target: 'player',
      modifiers: [{ stat: 'attack_speed', value: 33, isPercent: true }],
      startTime: start, duration: 180_000, tags: [], name: '綠色藥水', description: '',
    };
  }

  it('身上有加速時，減速改為消除加速且不生效', () => {
    const slow = createPlayerDebuffEffect('slow', monster(), NOW, new Set());
    const result = applyPlayerDebuff([speedBuff()], slow, NOW);
    expect(result.cancelledSpeedBuff).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it('沒有加速時，減速照常生效', () => {
    const slow = createPlayerDebuffEffect('slow', monster(), NOW, new Set());
    const result = applyPlayerDebuff([], slow, NOW);
    expect(result.cancelledSpeedBuff).toBe(false);
    expect(result.effects).toHaveLength(1);
  });

  it('加速已過期時不算抵銷，減速照常生效', () => {
    const expired = { ...speedBuff(NOW - 200_000) };
    const slow = createPlayerDebuffEffect('slow', monster(), NOW, new Set());
    const result = applyPlayerDebuff([expired], slow, NOW);
    expect(result.cancelledSpeedBuff).toBe(false);
    expect(result.effects.some(e => e.category === 'slow')).toBe(true);
  });

  it('身上有減速時，加速改為解除減速且不生效', () => {
    const slow = createPlayerDebuffEffect('slow', monster(), NOW, new Set());
    const result = applySpeedBuff([slow], speedBuff(), NOW);
    expect(result.cancelledSlow).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it('沒有減速時，加速照常生效並覆蓋舊的加速', () => {
    const result = applySpeedBuff([speedBuff(NOW - 1000)], speedBuff(NOW), NOW);
    expect(result.cancelledSlow).toBe(false);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].startTime).toBe(NOW);
  });

  it('applyPlayerBuff 只對加速類套用抵銷規則', () => {
    const slow = createPlayerDebuffEffect('slow', monster(), NOW, new Set());
    const defenceBuff: ActiveEffect = { ...speedBuff(), id: 'b2', category: 'defense-buff' };
    const result = applyPlayerBuff([slow], defenceBuff, NOW);
    expect(result.cancelledSlow).toBe(false);
    expect(result.effects).toHaveLength(2);
  });
});

describe('狀態查詢輔助', () => {
  it('hasActivePlayerDebuff 只認未過期的角色 debuff', () => {
    const effect = createPlayerDebuffEffect('poison', monster(), NOW, new Set());
    expect(hasActivePlayerDebuff([effect], 'dot-poison', NOW + 1000)).toBe(true);
    expect(hasActivePlayerDebuff([effect], 'dot-poison', NOW + 10000)).toBe(false);
  });

  it('isPlayerStunned 在暈眩期間為 true、過期後為 false', () => {
    const stun = createPlayerDebuffEffect('stun', monster(), NOW, new Set());
    expect(isPlayerStunned([stun], NOW + 1000)).toBe(true);
    expect(isPlayerStunned([stun], NOW + 1500)).toBe(false);
  });
});
