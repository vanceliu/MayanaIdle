/**
 * Buff 參數涵蓋藥水 buff（`51-auto-talent.md` § 51.4.5、§ 51.4.7）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, talentInitReady, SPEED_POTION_CONFIG } from '../../stores/gameStore';
import { makeBagItem } from '../../models/bagItem';
import { BUFF_POTION_CONFIG, BUFF_POTION_ITEM_IDS } from '../../models/buffPotion';
import { getItemById } from '../../models/items';
import { getParamFields, POTION_BUFF_OPTIONS } from '../../models/talentParams';
import { evaluateCombatScript, evaluatePersistentScript, type PersistentScriptContext } from '../scriptRunner';
import type { CombatRule, PersistentRule } from '../../models/scriptEngine';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const DRINK_CRIT = { type: 'use_consumable', itemId: BUFF_POTION_CONFIG.crit.itemId } as const;

function ctxAt(now: number, overrides: Partial<PersistentScriptContext> = {}): PersistentScriptContext {
  const s = useGameStore.getState();
  return {
    character: s.character!,
    skills: [],
    lastPotionUsedAt: 0,
    now,
    bagItems: s.bagItems,
    activeEffects: s.activeEffects,
    ...overrides,
  };
}

function rule(condition: PersistentRule['conditions'][number]): PersistentRule[] {
  return [{ id: 'r1', enabled: true, conditions: [condition], action: DRINK_CRIT }];
}

function effectOf(category: string): ActiveEffect {
  return useGameStore.getState().activeEffects.find(e => e.category === category)!;
}

describe('Buff 參數的藥水選項', () => {
  it('Buff 未激活、Buff 剩餘時間少於列藥水 buff；施放 Buff 不列', () => {
    for (const ruleId of ['buff_not_active', 'buff_remaining_below']) {
      const field = getParamFields(ruleId).find(f => f.key === 'skillId');
      expect(field?.kind === 'skill' && field.potionBuffs, ruleId).toBe(true);
    }
    const cast = getParamFields('buff_skill').find(f => f.key === 'skillId');
    expect(cast?.kind === 'skill' && cast.potionBuffs).toBeFalsy();
  });

  it('四種增益藥水與加速藥水各一項，名稱取道具名', () => {
    expect(POTION_BUFF_OPTIONS.map(o => o.value)).toEqual([
      ...Object.values(BUFF_POTION_CONFIG).map(c => c.category), 'speed',
    ]);
    for (const c of Object.values(BUFF_POTION_CONFIG)) {
      expect(POTION_BUFF_OPTIONS.find(o => o.value === c.category)?.label).toBe(getItemById(c.itemId)!.name);
    }
  });
});

describe('Buff 條件判定藥水 buff', () => {
  beforeEach(async () => {
    resetTestDb();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('Potion', 'elementalist', { STR: 0, AGI: 0, VIT: 2, SPI: 2, INT: 0, CHA: 0 });
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    await talentInitReady();
    useGameStore.setState({
      bagItems: [
        ...BUFF_POTION_ITEM_IDS.map(id => makeBagItem(id, 3)!),
        makeBagItem(SPEED_POTION_CONFIG.green.itemId, 3)!,
      ],
      activeEffects: [],
    });
  });

  it('Buff 未激活：沒喝成立，喝了不成立，過期又成立', () => {
    const cond = { type: 'buff_not_active', skillId: 'crit-potion' } as const;
    expect(evaluatePersistentScript(rule(cond), ctxAt(Date.now()))).toEqual(DRINK_CRIT);

    useGameStore.getState().useBuffPotion('crit');
    const buff = effectOf('crit-potion');
    expect(evaluatePersistentScript(rule(cond), ctxAt(buff.startTime + 1000))).toBeNull();
    expect(evaluatePersistentScript(rule(cond), ctxAt(buff.startTime + buff.duration))).toEqual(DRINK_CRIT);
  });

  it('Buff 未激活只看指定的那一種', () => {
    useGameStore.getState().useBuffPotion('focus');
    const buff = effectOf('focus-potion');
    const cond = { type: 'buff_not_active', skillId: 'crit-potion' } as const;
    expect(evaluatePersistentScript(rule(cond), ctxAt(buff.startTime + 1000))).toEqual(DRINK_CRIT);
  });

  it('Buff 剩餘時間少於：剩餘低於門檻才成立，沒喝不成立', () => {
    const cond = { type: 'buff_remaining_below', skillId: 'crit-potion', value: 10 } as const;
    expect(evaluatePersistentScript(rule(cond), ctxAt(Date.now()))).toBeNull();

    useGameStore.getState().useBuffPotion('crit');
    const buff = effectOf('crit-potion');
    const end = buff.startTime + buff.duration;
    expect(evaluatePersistentScript(rule(cond), ctxAt(end - 30_000))).toBeNull();
    expect(evaluatePersistentScript(rule(cond), ctxAt(end - 5_000))).toEqual(DRINK_CRIT);
  });

  it('加速藥水：Buff 剩餘時間少於看得到綠色藥水', () => {
    useGameStore.getState().useSpeedPotion('green');
    const buff = effectOf('speed');
    const cond = { type: 'buff_remaining_below', skillId: 'speed', value: 10 } as const;
    expect(evaluatePersistentScript(rule(cond), ctxAt(buff.startTime + buff.duration - 5_000))).toEqual(DRINK_CRIT);
  });

  it('戰鬥天賦的 Buff 未激活同一套判定', () => {
    useGameStore.getState().useBuffPotion('crit');
    const buff = effectOf('crit-potion');
    const rules: CombatRule[] = [
      { id: 'c1', enabled: true, conditions: [{ type: 'buff_not_active', skillId: 'crit-potion' }], action: { type: 'normal_attack' } },
    ];
    const s = useGameStore.getState();
    const ctx = {
      character: s.character!, monsters: [], skills: [] as Skill[], now: buff.startTime + 1000,
      playerPos: { x: 0, y: 0 }, primaryTargetId: null, weaponRange: 1.5, activeEffects: s.activeEffects,
    };
    expect(evaluateCombatScript(rules, ctx)).toBeNull();
    expect(evaluateCombatScript(rules, { ...ctx, now: buff.startTime + buff.duration })).toEqual({ type: 'normal_attack' });
  });
});

describe('Buff 剩餘時間少於：技能 buff', () => {
  it('依技能的 buff category 比對，同 category 的另一招也算', () => {
    const preciseShot: Skill = {
      id: 'precise-shot', name: '精準射擊', level: 1, element: 'none', type: 'buff', target: 'single',
      power: 0, mpCost: 0, cooldown: 0, lastUsedAt: 0, buffCategory: 'accuracy',
    };
    const hawkEye: ActiveEffect = {
      id: 'buff-hawk-eye-0', sourceSkillId: 'hawk-eye', sourceSkillName: '鷹眼', category: 'accuracy',
      type: 'buff', target: 'player', modifiers: [], startTime: 0, duration: 300_000, tags: [],
      name: '鷹眼', description: '',
    };
    const rules: PersistentRule[] = [{
      id: 'r1', enabled: true,
      conditions: [{ type: 'buff_remaining_below', skillId: 'precise-shot', value: 10 }],
      action: { type: 'buff_skill', skillId: 'precise-shot' },
    }];
    const ctx = {
      character: { hp: 100, mp: 100 } as PersistentScriptContext['character'], skills: [preciseShot], lastPotionUsedAt: 0,
      bagItems: [], activeEffects: [hawkEye],
    };
    expect(evaluatePersistentScript(rules, { ...ctx, now: 295_000 })?.type).toBe('buff_skill');
    expect(evaluatePersistentScript(rules, { ...ctx, now: 100_000 })).toBeNull();
  });
});
