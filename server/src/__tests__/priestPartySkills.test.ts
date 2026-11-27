import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, type PlayerSession } from '../playerSession';
import { attachInstance, createMapInstance } from '../../../client/src/systems/mapInstance';
import { processPlayerAttack } from '../../../client/src/systems/arpgEventHandler';
import { drainSelfCastFx } from '../../../client/src/systems/selfCastFx';
import { teammateHpPercents } from '../../../client/src/systems/partySupport';
import { getEffectiveMaxHp } from '../../../client/src/stores/gameStore';
import { instantiateFromTemplate } from '../../../client/src/models/skillTemplate';
import type { Character, ClassName } from '../../../client/src/models/character';
import type { ActiveEffect } from '../../../client/src/models/effect';
import type { MapData } from '../../../client/src/models/mapControl';

/** 牧師全隊技能（`23-class-magic.md` § 23.6 全隊技能規則） */

const MAP = {
  id: 'm', name: 'm', width: 5, height: 5, spawnPoint: { x: 0, y: 0 }, tiles: [[0]],
} as unknown as MapData;

function character(id: number, className: ClassName, hp: number): Character {
  return {
    id, name: `P${id}`, className, level: 40, exp: 0, expToNext: 100,
    hp, mp: 500,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 18, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    quests: [], areaEnteredAt: 0, createdAt: 0, userId: id,
  };
}

const PRIEST_SKILLS = ['holy-shield', 'high-heal', 'group-heal', 'holy-domain'];

function readySkills(s: PlayerSession): void {
  s.game.setState({ skills: PRIEST_SKILLS.map(id => instantiateFromTemplate(id, -1_000_000)!) });
}

function maxHpOf(s: PlayerSession): number {
  const gs = s.game.getState();
  return getEffectiveMaxHp(gs.character!, gs.equippedGear, gs.activeEffects);
}

function hpOf(s: PlayerSession): number {
  return s.game.getState().character!.hp;
}

function lastLog(s: PlayerSession): string | undefined {
  return s.game.getState().combatLogs.at(-1)?.text;
}

describe('牧師全隊技能', () => {
  let repo: SqliteRepository;
  let priest: PlayerSession;
  let ally: PlayerSession;
  let deadAlly: PlayerSession;
  let outsider: PlayerSession;

  function member(id: number, className: ClassName, hp: number): PlayerSession {
    const s = createPlayerSession(repo, '127.0.0.1', () => {});
    s.game.setState({ character: character(id, className, hp), equippedGear: {}, activeEffects: [], combatLogs: [] });
    s.mapControl.setState({ currentMap: MAP, playerPosition: { x: 0, y: 0 } });
    return s;
  }

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;

    priest = member(1, 'priest', 1);
    readySkills(priest);
    ally = member(2, 'knight', 10);
    deadAlly = member(3, 'knight', 0);
    outsider = member(4, 'knight', 10);

    const party = createMapInstance('party|m|');
    for (const s of [priest, ally, deadAlly]) attachInstance(s, party);
  });

  it('群體治癒：同實例存活隊友回復與牧師相同的量；死亡隊友與其他實例不受影響', () => {
    expect(priest.game.getState().castSelfSkill('group-heal')).toBe(true);

    const priestHealed = hpOf(priest) - 1;
    expect(priestHealed).toBeGreaterThan(0);
    expect(hpOf(ally)).toBe(10 + priestHealed);
    expect(lastLog(ally)).toBe(`P1 的 群體治癒 回復 ${priestHealed} HP`);
    expect(hpOf(deadAlly)).toBe(0);
    expect(hpOf(outsider)).toBe(10);
    expect(drainSelfCastFx(priest.loop.selfCastFx)[0].partyHeals).toEqual([{ memberId: 2, healed: hpOf(ally) - 10 }]);
  });

  it('群體治癒：回復量夾在隊友的有效最大 HP 之內，滿血隊友不記錄', () => {
    ally.game.setState({ character: { ...ally.game.getState().character!, hp: maxHpOf(ally) - 3 } });
    priest.game.getState().castSelfSkill('group-heal');
    expect(hpOf(ally)).toBe(maxHpOf(ally));
    expect(lastLog(ally)).toBe('P1 的 群體治癒 回復 3 HP');

    const logsBefore = ally.game.getState().combatLogs.length;
    readySkills(priest);
    expect(priest.game.getState().castSelfSkill('group-heal')).toBe(true);
    expect(ally.game.getState().combatLogs.length).toBe(logsBefore);
  });

  it('戰鬥天賦路徑同樣補到隊友，並回傳隊友的回復量', () => {
    const skill = instantiateFromTemplate('group-heal')!;
    const result = processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: skill.id }, targetMonsterIds: [], skill },
      {
        session: priest, character: priest.game.getState().character!, equippedGear: [], activeEffects: [],
        skills: priest.game.getState().skills, monsterInstances: new Map(), mapMonsters: [],
      },
    );
    expect(result.partyHeals).toEqual([{ memberId: 2, healed: hpOf(ally) - 10 }]);
    expect(hpOf(ally)).toBeGreaterThan(10);
  });

  it('聖光護盾：隊友拿到與牧師相同吸收量的獨立護盾', () => {
    priest.game.getState().castSelfSkill('holy-shield');
    const own = priest.game.getState().activeEffects.find(e => e.category === 'holy-shield')!;
    const shared = ally.game.getState().activeEffects.find(e => e.category === 'holy-shield')!;
    expect(shared.shieldRemaining).toBe(own.shieldRemaining);
    expect(shared).not.toBe(own);
    expect(lastLog(ally)).toBe('P1 對你施放 聖光護盾');
    expect(deadAlly.game.getState().activeEffects).toEqual([]);
    expect(outsider.game.getState().activeEffects).toEqual([]);
  });

  it('神聖領域：覆蓋隊友身上同 category（sanctuary）的效果', () => {
    const oldSanctuary = {
      id: 'old', category: 'sanctuary', type: 'buff', target: 'player', name: '聖域',
      modifiers: [{ stat: 'damageReduction', value: 20, isPercent: true }], startTime: 0, duration: 10_000, tags: [],
    } as unknown as ActiveEffect;
    ally.game.setState({ activeEffects: [oldSanctuary] });

    priest.game.getState().castSelfSkill('holy-domain');

    const effects = ally.game.getState().activeEffects.filter(e => e.category === 'sanctuary');
    expect(effects).toHaveLength(1);
    expect(effects[0].sourceSkillId).toBe('holy-domain');
    expect(effects[0].immuneDebuff).toBe(true);
  });

  it('精神匯聚只對自己', () => {
    priest.game.getState().castSelfSkill('high-heal');
    expect(ally.game.getState().activeEffects).toEqual([]);
  });

  it('隊友 HP 百分比：不含自己與死亡隊友', () => {
    expect(teammateHpPercents(priest)).toEqual([(10 / maxHpOf(ally)) * 100]);
    expect(teammateHpPercents(outsider)).toEqual([]);
  });
});
