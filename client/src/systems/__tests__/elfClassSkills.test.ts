/**
 * 妖精職業魔法 5～7 級（`23-class-magic.md` § 23.4）：束縛箭、後躍射擊、穿透箭雨。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { isMonsterImmobile } from '../arpgEngine';
import { moveMonstersSafe } from '../gameLoop';
import { planRetreat } from '../dash';
import { OccupationManager } from '../occupationManager';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import { CLASS_SKILLS } from '../../models/classSkills';
import { TileType, type MapData } from '../../models/mapControl';
import { resolveStatusMark } from '../../pixi/ui/skillFx/statusFx';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ActiveEffect } from '../../models/effect';
import type { MapMonster, MapMonsterState } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 70_000;
const G = TileType.Ground;
const W = TileType.Wall;

function elf(): Character {
  return {
    name: 'Elf', className: 'elf', level: 70, exp: 0, expToNext: 100,
    hp: 800, maxHp: 800, mp: 300, maxMp: 300,
    baseAttributes: { STR: 12, AGI: 25, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(isBoss = false): MonsterInstance {
  return {
    templateId: 5, name: '哥布林', level: 60, currentHp: 99999, maxHp: 99999,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

const skillOf = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });
const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function castBinding(target: MonsterInstance, activeEffects: ActiveEffect[] = []) {
  const skill = skillOf('binding-arrow');
  const character = elf();
  useGameStore.setState({ character, skills: [skill], activeEffects, equippedGear: {}, combatLogs: [] });
  processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId: 'binding-arrow' }, targetMonsterIds: ['m1'], skill },
    { character, equippedGear: [], activeEffects, skills: [skill], monsterInstances: new Map([['m1', target]]), mapMonsters },
  );
  return useGameStore.getState().activeEffects.filter(e => e.category === 'root' && e.targetMonsterId === 'm1');
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('妖精 5～7 級定義', () => {
  it('職業魔法共 7 級，穿透箭雨移到 7 級', () => {
    expect(CLASS_SKILLS.filter(s => s.className === 'elf').map(s => [s.classLevel, s.requiredLevel, s.id])).toEqual([
      [1, 10, 'precise-shot'], [2, 20, 'fire-arrow'], [3, 30, 'triple-shot'], [4, 40, 'hawk-eye'],
      [5, 50, 'binding-arrow'], [6, 60, 'leap-shot'], [7, 70, 'arrow-rain'],
    ]);
  });

  it('束縛箭：MP 20、冷卻 10s、射程 10、20 ＋ 物理、需弓、定身 5s', () => {
    expect(getSkillTemplate('binding-arrow')).toMatchObject({
      power: 20, physicalSnapshot: true, mpCost: 20, cooldown: 10000, range: 10, requiredWeaponType: 'bow',
      applyDebuff: { category: 'root', duration: 5000, root: true, tags: ['rooted'] },
    });
  });

  it('後躍射擊：MP 30、冷卻 12s、射程 8、40 ＋ 物理、需弓、後退 2 格', () => {
    expect(getSkillTemplate('leap-shot')).toMatchObject({
      power: 40, physicalSnapshot: true, mpCost: 30, cooldown: 12000, range: 8, requiredWeaponType: 'bow', retreat: 2,
    });
  });
});

describe('束縛箭定身', () => {
  it('命中後定身 5 秒', () => {
    const roots = castBinding(monster());
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ root: true, duration: 5000, tags: ['rooted'] });
    expect(roots[0].stun).toBeUndefined();
  });

  it('定身期間不可再上（不刷新時間）', () => {
    const first = castBinding(monster());
    const earlier = { ...first[0], startTime: NOW - 2000 };
    const again = castBinding(monster(), [earlier]);
    expect(again).toHaveLength(1);
    expect(again[0].startTime).toBe(NOW - 2000);
  });

  it('Boss 控場免疫期間不生效', () => {
    const boss = monster(true);
    boss.ccImmuneUntil = NOW + 5000;
    expect(castBinding(boss)).toHaveLength(0);
  });

  it('Boss 被定身後進入 10 秒控場免疫', () => {
    const boss = monster(true);
    castBinding(boss);
    expect(boss.ccImmuneUntil).toBe(NOW + 10000);
  });
});

describe('不受火矢附魔影響（§ 23.1.1 A 組）', () => {
  const fireEnchant = (): ActiveEffect => {
    const t = getSkillTemplate('fire-arrow')!;
    return {
      id: 'buff-fire-arrow', sourceSkillId: 'fire-arrow', sourceSkillName: t.name, category: t.buffCategory!,
      type: 'buff', target: 'player', modifiers: t.buffModifiers, startTime: NOW, duration: 300_000,
      tags: [], name: t.name, description: '',
    };
  };
  const bow = { id: 1, templateId: 9, name: '短弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
    smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true } as never;

  function damageOn(element: MonsterInstance['element'], effects: ActiveEffect[]): number {
    const skill = skillOf('binding-arrow');
    const character = elf();
    const target = { ...monster(), element };
    useGameStore.setState({ character, skills: [skill], activeEffects: effects, equippedGear: {}, combatLogs: [] });
    const r = processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'binding-arrow' }, targetMonsterIds: ['m1'], skill },
      { character, equippedGear: [bow], activeEffects: effects, skills: [skill], monsterInstances: new Map([['m1', target]]), mapMonsters },
    );
    return r.damages[0].damage;
  }

  it('附魔時不視為火屬性：打風屬性怪（火克風）與無屬性怪一樣痛', () => {
    expect(damageOn('wind', [fireEnchant()])).toBe(damageOn('none', [fireEnchant()]));
  });

  it('附魔的 +15 不算進來', () => {
    expect(damageOn('none', [fireEnchant()])).toBe(damageOn('none', []));
  });
});

describe('暈眩與定身的怪物不移動', () => {
  const map: MapData = {
    id: 't', name: 't', width: 10, height: 3, spawnPoint: { x: 0, y: 1 },
    tiles: Array.from({ length: 3 }, () => Array(10).fill(G)),
  };
  const mapMonster = (): MapMonster => ({
    id: 'm1', position: { x: 8, y: 1 }, targetPosition: { x: 0, y: 1 },
    speed: 2, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 0, y: 1 }, isBoss: false, attackRange: 1.5,
  });
  function step(immobile: boolean): MapMonster {
    let monsters = [mapMonster()];
    const store = {
      monsters, combatMonsterIds: ['m1'],
      setMonsters: (next: MapMonster[]) => { monsters = next; },
    } as unknown as MapMonsterState;
    moveMonstersSafe(1000, map, () => ({ x: 0, y: 1 }), store, new OccupationManager(), () => immobile);
    return monsters[0];
  }

  it('沒有控場時會往目標走', () => {
    expect(step(false).position.x).toBeLessThan(8);
  });

  it('控場中原地不動', () => {
    expect(step(true).position).toEqual({ x: 8, y: 1 });
  });

  it('暈眩或定身都算不能移動', () => {
    const effect = (flag: Partial<ActiveEffect>): ActiveEffect => ({
      id: 'e', sourceSkillId: 's', sourceSkillName: 's', category: 'c', type: 'debuff', target: 'monster',
      targetMonsterId: 'm1', startTime: NOW, duration: 5000, tags: [], name: 'n', description: '', ...flag,
    });
    expect(isMonsterImmobile([effect({ stun: true })], 'm1')).toBe(true);
    expect(isMonsterImmobile([effect({ root: true })], 'm1')).toBe(true);
    expect(isMonsterImmobile([effect({})], 'm1')).toBe(false);
    expect(isMonsterImmobile([effect({ root: true })], 'm2')).toBe(false);
  });
});

describe('planRetreat（後躍射擊的落點）', () => {
  const open: MapData = {
    id: 'o', name: 'o', width: 12, height: 3, spawnPoint: { x: 0, y: 1 },
    tiles: Array.from({ length: 3 }, () => Array(12).fill(G)),
  };

  it('往目標反方向退 2 格', () => {
    expect(planRetreat(open, { x: 5, y: 1 }, { x: 9, y: 1 }, 2)).toEqual({ x: 3, y: 1 });
  });

  it('2 格處被擋就改退 1 格', () => {
    const map: MapData = { ...open, tiles: Array.from({ length: 3 }, () => Array.from({ length: 12 }, (_, x) => (x === 3 ? W : G))) };
    expect(planRetreat(map, { x: 5, y: 1 }, { x: 9, y: 1 }, 2)).toEqual({ x: 4, y: 1 });
  });

  it('被佔用的格子不當落點', () => {
    expect(planRetreat(open, { x: 5, y: 1 }, { x: 9, y: 1 }, 2, new Set(['3,1']))).toEqual({ x: 4, y: 1 });
  });

  it('背後沒路就不移動', () => {
    expect(planRetreat(open, { x: 0, y: 1 }, { x: 4, y: 1 }, 2)).toBeNull();
  });
});

describe('定身的場上標記', () => {
  it('定身顯示藤蔓；同時暈眩時顯示暈眩', () => {
    expect(resolveStatusMark(['rooted'])).toBe('root');
    expect(resolveStatusMark(['rooted', 'stunned'])).toBe('stun');
    expect(resolveStatusMark([])).toBeNull();
  });
});
