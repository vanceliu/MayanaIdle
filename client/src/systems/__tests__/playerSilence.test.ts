import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Character } from '../../models/character';
import type { MapData } from '../../models/mapControl';
import type { MonsterInstance } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';
import type { CombatRule, PersistentRule } from '../../models/scriptEngine';
import type { Skill } from '../../models/skill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { instantiateSkill } from '../../models/skill';
import { PLAYER_DEBUFF_DEFS } from '../../models/playerDebuff';
import { CURE_ITEMS, hasCurableDebuff } from '../../models/cureItem';
import { SCRIPT_DEBUFF_TYPES } from '../../models/scriptEngine';
import { gameNow } from '../../core/clock';
import * as rng from '../../core/rng';
import {
  applyPlayerDebuff,
  createPlayerDebuffEffect,
  isMagicResistibleDebuff,
  isPlayerSilenced,
  rollMonsterDebuff,
} from '../playerDebuffSystem';
import {
  evaluateCombatScript,
  evaluatePersistentScript,
  type CombatScriptContext,
  type PersistentScriptContext,
} from '../scriptRunner';
import { createArpgEngine, queueManualSkill, tickArpgEngine, type ArpgTickInput } from '../arpgEngine';

/** 沉默（`24-buff-debuff.md` § 24.4.1／§ 24.5.1a） */

const NOW = 50_000;

function caster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 69, name: '象牙巫師', level: 34, currentHp: 260, maxHp: 260,
    attackMin: 30, attackMax: 42, defense: 24, exp: 114,
    race: 'normal', size: 'small', element: 'ice', isBoss: false,
    attackType: 'magic', attackRange: 8, attackInterval: 1000,
    debuffs: [{ type: 'silence', chance: 10 }],
    ...overrides,
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    userId: 1, name: '元素師', className: 'elementalist', level: 30, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 500, maxMp: 500,
    baseAttributes: { STR: 8, AGI: 8, VIT: 10, SPI: 14, INT: 18, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'ivory-tower-1f', currentZone: 'ivory-tower', currentRegion: 'ivory-tower', currentFloor: 1,
    skills: [], quests: [], areaEnteredAt: NOW, createdAt: NOW,
    ...overrides,
  };
}

function silence(now: number = NOW) {
  return createPlayerDebuffEffect('silence', caster(), now, new Set());
}

function windBlade(): Skill {
  const skill = instantiateFromTemplate('wind-blade', 0);
  if (!skill) throw new Error('測試素材 wind-blade 不存在');
  return skill;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('沉默定義（§ 24.4.1）', () => {
  it('10 秒、不可刷新、tag silenced、category silence', () => {
    const def = PLAYER_DEBUFF_DEFS.silence;
    expect(def.duration).toBe(10_000);
    expect(def.refreshable).toBe(false);
    expect(def.tag).toBe('silenced');
    expect(def.category).toBe('silence');
  });

  it('建立的效果不帶 DoT、數值修正與暈眩', () => {
    const effect = silence();
    expect(effect.duration).toBe(10_000);
    expect(effect.tags).toEqual(['silenced']);
    expect(effect.dot).toBeUndefined();
    expect(effect.modifiers).toBeUndefined();
    expect(effect.stun).toBeUndefined();
  });

  it('存續期間判定為沉默，期滿後解除', () => {
    const effects = [silence()];
    expect(isPlayerSilenced(effects, NOW)).toBe(true);
    expect(isPlayerSilenced(effects, NOW + 9_999)).toBe(true);
    expect(isPlayerSilenced(effects, NOW + 10_000)).toBe(false);
  });
});

describe('沉默觸發（§ 24.4.2）', () => {
  it('觸發率命中即施加', () => {
    vi.spyOn(rng, 'random').mockReturnValue(0.05);
    const result = rollMonsterDebuff(caster(), [], [], NOW, 0);
    expect(result.type).toBe('silence');
    expect(result.effect?.category).toBe('silence');
  });

  it('受魔法抗性抵抗，被擋下仍消耗判定', () => {
    expect(isMagicResistibleDebuff('silence')).toBe(true);
    vi.spyOn(rng, 'random').mockReturnValueOnce(0.05).mockReturnValueOnce(0.2);
    const result = rollMonsterDebuff(caster(), [], [], NOW, 30);
    expect(result).toEqual({ effect: null, triggered: true, type: 'silence', resisted: true });
  });

  it('不可刷新：存續期間再次命中不重複施加', () => {
    vi.spyOn(rng, 'random').mockReturnValue(0.05);
    const result = rollMonsterDebuff(caster(), [], [silence()], NOW + 1_000, 0);
    expect(result.triggered).toBe(true);
    expect(result.effect).toBeNull();
  });

  it('排在虛弱之後判定：虛弱命中時不再判定沉默', () => {
    vi.spyOn(rng, 'random').mockReturnValue(0.05);
    const monster = caster({ debuffs: [{ type: 'weaken', chance: 12 }, { type: 'silence', chance: 10 }] });
    expect(rollMonsterDebuff(monster, [], [], NOW, 0).type).toBe('weaken');
  });

  it('施加不覆蓋既有沉默的計時', () => {
    const first = silence();
    const { effects } = applyPlayerDebuff([first], silence(NOW + 1_000), NOW + 1_000);
    expect(effects.filter(e => e.category === 'silence')[0]).toBe(first);
  });
});

describe('沉默的解除（§ 24.10.1）', () => {
  const purify = CURE_ITEMS.find(c => c.name === '淨化藥水')!;

  it('淨化藥水可解除沉默', () => {
    expect(purify.cures).toContain('silence');
    expect(hasCurableDebuff(purify, [silence()], NOW)).toBe(true);
  });

  it('常駐腳本「詛咒、虛弱或沉默」條件涵蓋沉默', () => {
    expect(SCRIPT_DEBUFF_TYPES.curse_weaken).toContain('silence');
  });
});

describe('沉默中戰鬥腳本不施放技能（§ 24.5.1a）', () => {
  function ctx(overrides: Partial<CombatScriptContext> = {}): CombatScriptContext {
    return {
      character: character(),
      monsters: [{ id: 'm1', instance: caster(), position: { x: 1, y: 0 } }],
      skills: [windBlade()],
      now: NOW,
      playerPos: { x: 0, y: 0 },
      primaryTargetId: null,
      weaponRange: 1.5,
      ...overrides,
    };
  }

  const rules: CombatRule[] = [
    { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'skill', skillId: 'wind-blade' } },
    { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
  ];

  it('未沉默時選技能', () => {
    expect(evaluateCombatScript(rules, ctx({ activeEffects: [] }))).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });

  it('沉默時跳過技能，落到普通攻擊', () => {
    expect(evaluateCombatScript(rules, ctx({ activeEffects: [silence()] }))).toEqual({ type: 'normal_attack' });
  });
});

describe('沉默中常駐腳本不施放技能（§ 24.5.1a）', () => {
  function ctx(activeEffects = [silence()]): PersistentScriptContext {
    return {
      character: character({ hp: 100 }),
      skills: [instantiateSkill('heal')!, instantiateSkill('protect-shield')!],
      bagItems: [],
      lastPotionUsedAt: 0,
      now: NOW,
      activeEffects,
    };
  }

  const healRule: PersistentRule = {
    id: 'heal', enabled: true, conditions: [{ type: 'always' }], action: { type: 'heal_skill', skillId: 'heal' },
  };
  const buffRule: PersistentRule = {
    id: 'buff', enabled: true, conditions: [{ type: 'always' }], action: { type: 'buff_skill', skillId: 'protect-shield' },
  };
  const refillRule: PersistentRule = {
    id: 'refill', enabled: true, conditions: [{ type: 'always' }], action: { type: 'refill_all_buffs', skillId: 'protect-shield' },
  };

  it('未沉默時可施放', () => {
    expect(evaluatePersistentScript([healRule], ctx([]))).toEqual(healRule.action);
  });

  it('治癒、增益、補齊增益皆不成立', () => {
    expect(evaluatePersistentScript([healRule], ctx())).toBeNull();
    expect(evaluatePersistentScript([buffRule], ctx())).toBeNull();
    expect(evaluatePersistentScript([refillRule], ctx())).toBeNull();
  });
});

describe('沉默中手動指定的技能不生效（§ 24.5.1a）', () => {
  const map: MapData = {
    id: 'test', name: 'Test', width: 10, height: 10,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
    spawnPoint: { x: 0, y: 0 },
  };

  function input(activeEffects: ArpgTickInput['activeEffects']): ArpgTickInput {
    const position = { x: 1, y: 0 };
    const mapMonster: MapMonster = {
      id: 'm1', position, targetPosition: { ...position }, speed: 0, path: [], pathIndex: 0,
      pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 0, y: 0 }, isBoss: false,
    };
    return {
      playerPos: { x: 0, y: 0 },
      character: character(),
      skills: [windBlade()],
      activeEffects,
      equippedGear: [],
      combatRules: [{ id: 'r1', enabled: true, conditions: [], action: { type: 'normal_attack' } }],
      mapMonsters: [mapMonster],
      monsterInstances: new Map([['m1', caster({ currentHp: 999999, maxHp: 999999, attackMin: 1, attackMax: 1, debuffs: [] })]]),
      map,
      deltaMs: 16,
    };
  }

  it('沉默時手動技能被丟棄，改走腳本的普通攻擊', () => {
    const engine = createArpgEngine();
    const tickInput = input([silence(gameNow())]);
    tickArpgEngine(engine, tickInput);
    queueManualSkill(engine, 'wind-blade');

    let action = null;
    for (let i = 0; i < 400 && !action; i++) {
      const attack = tickArpgEngine(engine, tickInput).find(e => e.type === 'player_attack');
      if (attack && attack.type === 'player_attack') action = attack.action;
    }
    expect(action).toEqual({ type: 'normal_attack' });
  });
});
