import { describe, it, expect } from 'vitest';
import type { Character } from '../../models/character';
import {
  acceptQuest,
  updateErrandProgress,
  updateCollectProgress,
  rollQuestMaterialDrop,
  completeQuest,
  getAvailableQuests,
} from '../questSystem';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    userId: 1,
    name: 'TestChar',
    className: 'knight',
    level: 25,
    exp: 0,
    expToNext: 1000,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 1000,
    currentArea: 'green-valley',
    currentZone: 'newbie-neutral',
    currentRegion: 'green-valley',
    currentFloor: null,
    skills: [],
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('questSystem', () => {
  describe('getAvailableQuests', () => {
    it('returns level 1 quest when character is Lv10+', () => {
      const char = makeCharacter({ level: 10 });
      const available = getAvailableQuests(char);
      expect(available.some(q => q.id === 'knight-skill-1')).toBe(true);
    });

    it('does not return level 2 quest when character is below Lv20', () => {
      const char = makeCharacter({ level: 15 });
      const available = getAvailableQuests(char);
      expect(available.some(q => q.id === 'knight-skill-2')).toBe(false);
    });

    it('returns level 2 quest when character is Lv20+', () => {
      const char = makeCharacter({ level: 20 });
      const available = getAvailableQuests(char);
      expect(available.some(q => q.id === 'knight-skill-2')).toBe(true);
    });

    it('does not return quest already in character quests', () => {
      const char = makeCharacter({
        level: 20,
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'active',
          targetArea: 'green-valley',
          killCount: 5,
        }],
      });
      const available = getAvailableQuests(char);
      expect(available.some(q => q.id === 'knight-skill-1')).toBe(false);
    });

    it('only returns quests for character class', () => {
      const char = makeCharacter({ level: 30, className: 'thief' });
      const available = getAvailableQuests(char);
      expect(available.every(q => q.className === 'thief')).toBe(true);
    });
  });

  describe('acceptQuest', () => {
    it('adds errand quest with random area from pool', () => {
      const char = makeCharacter({ level: 10 });
      const updated = acceptQuest(char, 'knight-skill-1');
      const quest = updated.quests.find(q => q.id === 'knight-skill-1');
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('errand');
      expect(quest!.status).toBe('active');
      expect(quest!.killCount).toBe(0);
      expect(['green-valley', 'wind-woods']).toContain(quest!.targetArea);
    });

    it('adds collect quest with random monster', () => {
      const char = makeCharacter({ level: 20 });
      const updated = acceptQuest(char, 'knight-skill-2');
      const quest = updated.quests.find(q => q.id === 'knight-skill-2');
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('collect');
      expect(quest!.status).toBe('active');
      expect(quest!.materialCount).toBe(0);
      expect(quest!.targetMonster).toBeDefined();
    });

    it('does not accept quest if level too low', () => {
      const char = makeCharacter({ level: 5 });
      const updated = acceptQuest(char, 'knight-skill-1');
      expect(updated.quests.length).toBe(0);
    });

    it('does not accept quest for wrong class', () => {
      const char = makeCharacter({ level: 10, className: 'thief' });
      const updated = acceptQuest(char, 'knight-skill-1');
      expect(updated.quests.length).toBe(0);
    });

    it('does not accept already accepted quest', () => {
      const char = makeCharacter({ level: 10 });
      const first = acceptQuest(char, 'knight-skill-1');
      const second = acceptQuest(first, 'knight-skill-1');
      expect(second.quests.length).toBe(1);
    });
  });

  describe('updateErrandProgress', () => {
    it('increments killCount when in correct area', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'active',
          targetArea: 'green-valley',
          killCount: 5,
        }],
      });
      const updated = updateErrandProgress(char, 'green-valley', 3);
      expect(updated.quests[0].killCount).toBe(8);
    });

    it('does not increment when in wrong area', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'active',
          targetArea: 'green-valley',
          killCount: 5,
        }],
      });
      const updated = updateErrandProgress(char, 'wind-woods', 3);
      expect(updated.quests[0].killCount).toBe(5);
    });

    it('marks quest as completable when target reached', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'active',
          targetArea: 'green-valley',
          killCount: 18,
        }],
      });
      const updated = updateErrandProgress(char, 'green-valley', 3);
      expect(updated.quests[0].status).toBe('completable');
      expect(updated.quests[0].killCount).toBe(21);
    });
  });

  describe('updateCollectProgress', () => {
    it('increments materialCount', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-2',
          type: 'collect',
          className: 'knight',
          skillLevel: 2,
          requiredLevel: 20,
          status: 'active',
          targetArea: 'misty-swamp',
          targetMonster: '毒蛇',
          materialCount: 0,
        }],
      });
      const updated = updateCollectProgress(char, 1);
      expect(updated.quests[0].materialCount).toBe(1);
    });

    it('marks quest as completable when target reached', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-2',
          type: 'collect',
          className: 'knight',
          skillLevel: 2,
          requiredLevel: 20,
          status: 'active',
          targetArea: 'misty-swamp',
          targetMonster: '毒蛇',
          materialCount: 1,
        }],
      });
      const updated = updateCollectProgress(char, 1);
      expect(updated.quests[0].status).toBe('completable');
    });
  });

  describe('rollQuestMaterialDrop', () => {
    it('returns false if no active collect quest for the monster', () => {
      const char = makeCharacter({ quests: [] });
      expect(rollQuestMaterialDrop(char, '毒蛇')).toBe(false);
    });

    it('returns false if quest target monster does not match', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-2',
          type: 'collect',
          className: 'knight',
          skillLevel: 2,
          requiredLevel: 20,
          status: 'active',
          targetArea: 'misty-swamp',
          targetMonster: '毒蛇',
          materialCount: 0,
        }],
      });
      expect(rollQuestMaterialDrop(char, '野狼')).toBe(false);
    });

    it('has 10% chance to drop when monster matches', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-2',
          type: 'collect',
          className: 'knight',
          skillLevel: 2,
          requiredLevel: 20,
          status: 'active',
          targetArea: 'misty-swamp',
          targetMonster: '毒蛇',
          materialCount: 0,
        }],
      });

      let drops = 0;
      const iterations = 10000;
      for (let i = 0; i < iterations; i++) {
        if (rollQuestMaterialDrop(char, '毒蛇')) drops++;
      }
      const rate = drops / iterations;
      expect(rate).toBeGreaterThan(0.07);
      expect(rate).toBeLessThan(0.13);
    });
  });

  describe('completeQuest', () => {
    it('marks quest as completed and returns reward item', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'completable',
          targetArea: 'green-valley',
          killCount: 20,
        }],
      });
      const { character: updated, rewardItem } = completeQuest(char, 'knight-skill-1');
      expect(updated.quests[0].status).toBe('completed');
      expect(rewardItem).toBe('盾擊技能書');
    });

    it('returns null reward if quest not completable', () => {
      const char = makeCharacter({
        quests: [{
          id: 'knight-skill-1',
          type: 'errand',
          className: 'knight',
          skillLevel: 1,
          requiredLevel: 10,
          status: 'active',
          targetArea: 'green-valley',
          killCount: 5,
        }],
      });
      const { character: updated, rewardItem } = completeQuest(char, 'knight-skill-1');
      expect(rewardItem).toBeNull();
      expect(updated.quests[0].status).toBe('active');
    });
  });
});
