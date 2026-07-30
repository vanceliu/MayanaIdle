import { describe, it, expect, afterEach, vi } from 'vitest';
import { evaluatePersistentScript, type PersistentScriptContext } from '../scriptRunner';
import type { PersistentRule, ScriptDebuffCondition } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { BagItem } from '../../stores/gameStore';
import type { PlayerDebuffType } from '../../models/playerDebuff';
import { createPlayerDebuffEffect } from '../playerDebuffSystem';

const NOW = 80_000;

function character(overrides: Partial<Character> = {}): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 200, maxMp: 200,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
    ...overrides,
  };
}

function sourceMonster(): MonsterInstance {
  return {
    templateId: 1, name: '毒蛇', level: 18, currentHp: 100, maxHp: 100,
    attackMin: 40, attackMax: 40, defense: 5, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function ctx(debuffs: PlayerDebuffType[], bagItems: BagItem[]): PersistentScriptContext {
  return {
    character: character(),
    skills: [],
    bagItems,
    lastPotionUsedAt: 0,
    now: NOW,
    activeEffects: debuffs.map(t => createPlayerDebuffEffect(t, sourceMonster(), NOW, new Set())),
  };
}

function cureRule(debuffType: ScriptDebuffCondition, cureItemName: string, enabled = true): PersistentRule {
  return {
    id: `cure-${debuffType}`,
    enabled,
    condition: { type: 'debuff_active', debuffType },
    action: { type: 'cure_item', cureItemName },
  };
}

const bag = (...names: string[]): BagItem[] =>
  names.map(name => ({ name, type: 'potion' as const, amount: 1 }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('常駐腳本 — debuff_active 條件', () => {
  it('身上有對應 debuff 時條件成立', () => {
    const action = evaluatePersistentScript(
      [cureRule('poison', '解毒藥水')],
      ctx(['poison'], bag('解毒藥水')),
    );
    expect(action).toEqual({ type: 'cure_item', cureItemName: '解毒藥水' });
  });

  it('身上沒有該 debuff 時不觸發', () => {
    const action = evaluatePersistentScript(
      [cureRule('poison', '解毒藥水')],
      ctx(['bleed'], bag('解毒藥水')),
    );
    expect(action).toBeNull();
  });

  it('debuff 過期後不觸發', () => {
    const base = ctx(['poison'], bag('解毒藥水'));
    const expired = { ...base, now: NOW + 11000 }; // 中毒 10s
    expect(evaluatePersistentScript([cureRule('poison', '解毒藥水')], expired)).toBeNull();
  });

  it('未指定 debuffType 的規則視為不成立', () => {
    const rule: PersistentRule = {
      id: 'broken', enabled: true,
      condition: { type: 'debuff_active' },
      action: { type: 'cure_item', cureItemName: '解毒藥水' },
    };
    expect(evaluatePersistentScript([rule], ctx(['poison'], bag('解毒藥水')))).toBeNull();
  });

  it('停用的規則不觸發', () => {
    const action = evaluatePersistentScript(
      [cureRule('poison', '解毒藥水', false)],
      ctx(['poison'], bag('解毒藥水')),
    );
    expect(action).toBeNull();
  });
});

describe('常駐腳本 — cure_item 動作可執行性', () => {
  it('背包沒有該道具時規則跳過，繼續往下判定', () => {
    const rules = [
      cureRule('poison', '解毒藥水'),
      cureRule('bleed', '止血繃帶'),
    ];
    const action = evaluatePersistentScript(rules, ctx(['poison', 'bleed'], bag('止血繃帶')));
    expect(action).toEqual({ type: 'cure_item', cureItemName: '止血繃帶' });
  });

  it('道具與 debuff 不對應時不可執行', () => {
    const rule: PersistentRule = {
      id: 'mismatch', enabled: true,
      condition: { type: 'debuff_active', debuffType: 'poison' },
      action: { type: 'cure_item', cureItemName: '止血繃帶' },
    };
    expect(evaluatePersistentScript([rule], ctx(['poison'], bag('止血繃帶')))).toBeNull();
  });

  it('「詛咒或虛弱」合併條件對兩者皆成立', () => {
    for (const t of ['curse', 'weaken'] as const) {
      const action = evaluatePersistentScript(
        [cureRule('curse_weaken', '淨化藥水')],
        ctx([t], bag('淨化藥水')),
      );
      expect(action, t).toEqual({ type: 'cure_item', cureItemName: '淨化藥水' });
    }
  });

  it('只有減速時「詛咒或虛弱」條件不成立', () => {
    expect(evaluatePersistentScript(
      [cureRule('curse_weaken', '淨化藥水')],
      ctx(['slow'], bag('淨化藥水')),
    )).toBeNull();
  });

  it('減速搭配淨化藥水不可執行（減速無解除道具）', () => {
    expect(evaluatePersistentScript(
      [cureRule('slow', '淨化藥水')],
      ctx(['slow'], bag('淨化藥水')),
    )).toBeNull();
  });

  it('減速搭配加速藥水可執行（§ 24.4.6 對沖）', () => {
    const rule: PersistentRule = {
      id: 'slow-haste', enabled: true,
      condition: { type: 'debuff_active', debuffType: 'slow' },
      action: { type: 'speed_potion', speedPotionType: 'green' },
    };
    expect(evaluatePersistentScript([rule], ctx(['slow'], bag('綠色藥水'))))
      .toEqual({ type: 'speed_potion', speedPotionType: 'green' });
  });

  it('暈眩中不可使用解除道具（§ 24.10.1）', () => {
    const action = evaluatePersistentScript(
      [cureRule('poison', '解毒藥水')],
      ctx(['poison', 'stun'], bag('解毒藥水')),
    );
    expect(action).toBeNull();
  });

  it('暈眩結束後恢復可用', () => {
    const base = ctx(['poison', 'stun'], bag('解毒藥水'));
    const afterStun = { ...base, now: NOW + 1600 }; // 暈眩 1.5s 已過、中毒 10s 仍在
    expect(evaluatePersistentScript([cureRule('poison', '解毒藥水')], afterStun))
      .toEqual({ type: 'cure_item', cureItemName: '解毒藥水' });
  });

  it('未指定道具名稱時不可執行', () => {
    const rule: PersistentRule = {
      id: 'no-item', enabled: true,
      condition: { type: 'debuff_active', debuffType: 'poison' },
      action: { type: 'cure_item' },
    };
    expect(evaluatePersistentScript([rule], ctx(['poison'], bag('解毒藥水')))).toBeNull();
  });
});

describe('常駐腳本 — 規則優先序', () => {
  it('依序取第一個條件成立且可執行的規則', () => {
    const rules = [
      cureRule('curse_weaken', '淨化藥水'),
      cureRule('poison', '解毒藥水'),
    ];
    // 只有中毒 → 第一條條件不成立，取第二條
    expect(evaluatePersistentScript(rules, ctx(['poison'], bag('淨化藥水', '解毒藥水'))))
      .toEqual({ type: 'cure_item', cureItemName: '解毒藥水' });

    // 兩者都有 → 取排在前面的淨化藥水
    expect(evaluatePersistentScript(rules, ctx(['poison', 'curse'], bag('淨化藥水', '解毒藥水'))))
      .toEqual({ type: 'cure_item', cureItemName: '淨化藥水' });
  });
});
