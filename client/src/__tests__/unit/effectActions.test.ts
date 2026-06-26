import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import type { ActiveEffect } from '../../models/effect';

function createEffect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: `effect-${Date.now()}-${Math.random()}`,
    sourceSkillId: 'skill-1',
    sourceSkillName: '火矢附魔',
    category: 'fire-enchant',
    type: 'buff',
    target: 'player',
    modifiers: [{ stat: 'attack', value: 15, isPercent: false }],
    startTime: Date.now(),
    duration: 300000,
    tags: [],
    name: '火矢附魔',
    description: '火屬性傷害 +15',
    ...overrides,
  };
}

describe('gameStore effect actions', () => {
  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
  });

  describe('addEffect', () => {
    it('adds a new buff', () => {
      const effect = createEffect();
      useGameStore.getState().addEffect(effect);

      expect(useGameStore.getState().activeEffects).toHaveLength(1);
      expect(useGameStore.getState().activeEffects[0].id).toBe(effect.id);
    });

    it('same category buff overwrites previous (refresh)', () => {
      const first = createEffect({ id: 'first', category: 'fire-enchant' });
      const second = createEffect({ id: 'second', category: 'fire-enchant' });

      useGameStore.getState().addEffect(first);
      useGameStore.getState().addEffect(second);

      const effects = useGameStore.getState().activeEffects;
      expect(effects).toHaveLength(1);
      expect(effects[0].id).toBe('second');
    });

    it('different category buffs coexist', () => {
      const fire = createEffect({ id: 'fire', category: 'fire-enchant' });
      const accuracy = createEffect({ id: 'acc', category: 'accuracy', name: '精準射擊' });

      useGameStore.getState().addEffect(fire);
      useGameStore.getState().addEffect(accuracy);

      expect(useGameStore.getState().activeEffects).toHaveLength(2);
    });

    it('debuff cannot refresh while active', () => {
      const bleed1 = createEffect({
        id: 'bleed-1',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        category: 'bleeding',
      });
      const bleed2 = createEffect({
        id: 'bleed-2',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        category: 'bleeding',
      });

      useGameStore.getState().addEffect(bleed1);
      useGameStore.getState().addEffect(bleed2);

      const effects = useGameStore.getState().activeEffects;
      expect(effects).toHaveLength(1);
      expect(effects[0].id).toBe('bleed-1');
    });

    it('same debuff on different monsters can coexist', () => {
      const bleedM0 = createEffect({
        id: 'bleed-m0',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        category: 'bleeding',
      });
      const bleedM1 = createEffect({
        id: 'bleed-m1',
        type: 'debuff',
        target: 'monster',
        targetIdx: 1,
        category: 'bleeding',
      });

      useGameStore.getState().addEffect(bleedM0);
      useGameStore.getState().addEffect(bleedM1);

      expect(useGameStore.getState().activeEffects).toHaveLength(2);
    });
  });

  describe('removeEffect', () => {
    it('removes effect by id', () => {
      const effect = createEffect({ id: 'to-remove' });
      useGameStore.setState({ activeEffects: [effect] });

      useGameStore.getState().removeEffect('to-remove');

      expect(useGameStore.getState().activeEffects).toHaveLength(0);
    });

    it('does not affect other effects', () => {
      const e1 = createEffect({ id: 'keep', category: 'fire-enchant' });
      const e2 = createEffect({ id: 'remove', category: 'accuracy' });
      useGameStore.setState({ activeEffects: [e1, e2] });

      useGameStore.getState().removeEffect('remove');

      const effects = useGameStore.getState().activeEffects;
      expect(effects).toHaveLength(1);
      expect(effects[0].id).toBe('keep');
    });
  });

  describe('clearExpiredEffects', () => {
    it('removes expired effects', () => {
      const expired = createEffect({
        id: 'expired',
        startTime: Date.now() - 10000,
        duration: 5000,
      });
      const active = createEffect({
        id: 'active',
        startTime: Date.now(),
        duration: 300000,
      });
      useGameStore.setState({ activeEffects: [expired, active] });

      useGameStore.getState().clearExpiredEffects();

      const effects = useGameStore.getState().activeEffects;
      expect(effects).toHaveLength(1);
      expect(effects[0].id).toBe('active');
    });

    it('clears all if all expired', () => {
      const e1 = createEffect({ id: 'e1', startTime: Date.now() - 10000, duration: 1000 });
      const e2 = createEffect({ id: 'e2', startTime: Date.now() - 20000, duration: 5000 });
      useGameStore.setState({ activeEffects: [e1, e2] });

      useGameStore.getState().clearExpiredEffects();

      expect(useGameStore.getState().activeEffects).toHaveLength(0);
    });

    it('keeps all if none expired', () => {
      const e1 = createEffect({ id: 'e1', startTime: Date.now(), duration: 300000 });
      const e2 = createEffect({ id: 'e2', startTime: Date.now(), duration: 600000 });
      useGameStore.setState({ activeEffects: [e1, e2] });

      useGameStore.getState().clearExpiredEffects();

      expect(useGameStore.getState().activeEffects).toHaveLength(2);
    });
  });
});
