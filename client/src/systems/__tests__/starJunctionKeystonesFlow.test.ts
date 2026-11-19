/**
 * 職業交界命星在實際遊戲流程中的效果（`56-star-chart.md` § 56.6）：攻擊間隔、吸血、藥水、聖域回血、技能傷害、背水。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getPlayerAttackInterval } from '../combat';
import { processPlayerAttack } from '../arpgEventHandler';
import { tickCombat } from '../combatLoop';
import { useGameStore, getEffectiveMaxHp } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { defaultSession } from '../../stores/session';
import type { MapData } from '../../models/mapControl';
import { getMaxHp } from '../maxHpMp';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { Character, ClassName } from '../../models/character';
import { CLASS_BASE_ATTRIBUTES } from '../../models/character';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';

const ks = (i: number, k: number) => `risk${i}-keystone${k}`;
const MAP = { id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 5, y: 5 }, autoSpawn: false, tiles: Array.from({ length: 12 }, () => Array(12).fill(0)) } as unknown as MapData;
const zero = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
function char(starChart: string[], overrides: Partial<Character> = {}, className: ClassName = 'thief'): Character {
  return {
    id: 1, name: 'T', className, level: 60, exp: 0, expToNext: 100, hp: 500, mp: 500,
    baseAttributes: { ...CLASS_BASE_ATTRIBUTES[className] }, bonusAttributes: { ...zero }, starChart,
    gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1, ...overrides,
  };
}
const target = () => ({
  templateId: 1, name: '木樁', level: 1, currentHp: 99999, maxHp: 99999, attackMin: 1, attackMax: 1, defense: 0, exp: 0,
  race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 100000,
}) as never;
const mapMonsters = [{ id: 'm1', position: { x: 6, y: 5 }, isBoss: false }] as never;

function attack(c: Character, skill?: Skill) {
  useGameStore.setState({ character: c, activeEffects: [], skills: skill ? [skill] : [], equippedGear: {}, combatLogs: [] });
  const action = skill ? { type: 'skill' as const, skillId: skill.id } : { type: 'normal_attack' as const };
  return processPlayerAttack(
    { type: 'player_attack', action, targetMonsterIds: ['m1'], ...(skill ? { skill } : {}) },
    { character: c, equippedGear: [], activeEffects: [], skills: skill ? [skill] : [], monsterInstances: new Map([['m1', target()]]), mapMonsters },
  );
}

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { vi.restoreAllMocks(); });

describe('交界命星：實際流程', () => {
  it('疾風：普攻間隔變短（攻速 +15%）', () => {
    expect(getPlayerAttackInterval([], [], char([ks(2, 0)]))).toBe(Math.floor(1200 / 1.15));
    expect(getPlayerAttackInterval([], [], char([]))).toBe(1200);
  });

  it('嗜血：普攻命中後依傷害 3% 回血', () => {
    const c = char([ks(4, 0)], { hp: 100 }, 'priest');
    const r = attack(c);
    const dealt = r.damages[0].damage;
    expect(useGameStore.getState().character!.hp).toBe(100 + Math.floor(dealt * 0.03));
  });

  it('嗜血：喝藥水回復量減半', () => {
    const drink = (starChart: string[]) => {
      useGameStore.setState({
        character: char(starChart, { hp: 1 }, 'priest'), activeEffects: [], equippedGear: {},
        bagItems: [{ itemId: 1, amount: 5 }] as never,
        lastPotionUsedAt: 0, lastPotionCooldown: 0, combatLogs: [],
      });
      useGameStore.getState().usePotion();
      return useGameStore.getState().character!.hp - 1;
    };
    const plain = drink([]);
    expect(plain).toBeGreaterThan(0);
    expect(drink([ks(4, 0)])).toBe(Math.floor(plain / 2));
  });

  it('嗜血：聖域的每秒回血不回', () => {
    const tickWith = (starChart: string[]) => {
      const c = char(starChart, { hp: 50 }, 'priest');
      const sanctuary: ActiveEffect = {
        id: 's', sourceSkillId: 'sanctuary', sourceSkillName: '聖域', category: 'sanctuary', type: 'buff', target: 'player',
        modifiers: [], startTime: Date.now() - 10, duration: 10000, tags: [], name: '聖域', description: '', hot: { amount: 20, interval: 1000 },
      };
      useGameStore.setState({ character: c, activeEffects: [sanctuary], skills: [], equippedGear: {} });
      useMapControlStore.setState({ currentMap: MAP, playerPosition: { x: 5, y: 5 } });
      defaultSession.loop.dotTickReady = true;
      tickCombat(1000);
      return useGameStore.getState().character!.hp;
    };
    expect(tickWith([])).toBeGreaterThan(50);
    expect(tickWith([ks(4, 0)])).toBe(50);
  });

  it('燃魔：施放技能的傷害 ×1.15', () => {
    const fireball = instantiateFromTemplate('fireball', 0)!;
    const plain = attack(char([], {}, 'elementalist'), fireball).damages[0].damage;
    const burned = attack(char([ks(3, 1)], {}, 'elementalist'), fireball).damages[0].damage;
    expect(burned).toBe(Math.max(1, Math.floor(plain * 1.15)));
  });

  it('背水：低血時普攻傷害提高', () => {
    const maxHp = getMaxHp(char([ks(0, 1)]), []);
    const full = attack(char([ks(0, 1)], { hp: maxHp })).damages[0].damage;
    const low = attack(char([ks(0, 1)], { hp: Math.floor(maxHp * 0.2) })).damages[0].damage;
    expect(low).toBeGreaterThan(full);
    expect(getEffectiveMaxHp(char([ks(0, 1)]), {}, [])).toBe(maxHp);
  });
});
