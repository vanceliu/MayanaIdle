import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, type PlayerSession } from '../playerSession';
import { processPlayerAttack } from '../../../client/src/systems/arpgEventHandler';
import { instantiateFromTemplate } from '../../../client/src/models/skillTemplate';
import type { Character } from '../../../client/src/models/character';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import type { MonsterInstance } from '../../../client/src/models/monster';
import type { MapMonster } from '../../../client/src/stores/mapMonsterStore';

/** 復仇之刃加成取出招者會話的有效最大 HP（`23-class-magic.md`「復仇之刃補充規則」） */
function knight(hp: number): Character {
  return {
    name: 'Tester', className: 'knight', level: 70, exp: 0, expToNext: 100,
    hp, maxHp: 1000, mp: 400, maxMp: 400,
    baseAttributes: { STR: 20, AGI: 0, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

const weapon = {
  id: 1, templateId: 1019, name: '終焉之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false,
  smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
  affixes: [], ownerId: 1, equipped: true,
} as unknown as EquipmentInstance;

const armor = {
  id: 2, templateId: 2001, name: '測試鎧甲', type: 'armor', slot: 'armor',
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, bonusHp: 1000,
} as unknown as EquipmentInstance;

const monster: MonsterInstance = {
  templateId: 12, name: '石像鬼', level: 60, currentHp: 99999, maxHp: 99999,
  attackMin: 60, attackMax: 60, defense: 20, exp: 200,
  race: 'demon', size: 'large', element: 'earth', isBoss: false,
  attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
};

describe('復仇之刃：server 會話的有效最大 HP', () => {
  let session: PlayerSession;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    defaultSession.game.setState({ equippedGear: {}, activeEffects: [] });
    session = createPlayerSession(repo, '127.0.0.1', () => {});
  });

  it('裝備 HP 計入最大 HP：基礎 1000＋裝備 1000、剩 1000 → +50%', () => {
    const vengeance = instantiateFromTemplate('vengeance')!;
    const character = knight(1000);
    const gear = [weapon, armor];
    session.game.setState({
      character, skills: [vengeance], activeEffects: [],
      equippedGear: { rightHand: weapon, armor } as never,
    });

    processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: vengeance.id }, targetMonsterIds: ['m1'], skill: vengeance },
      {
        session, character, equippedGear: gear, activeEffects: [], skills: [vengeance],
        monsterInstances: new Map([['m1', { ...monster }]]),
        mapMonsters: [{ id: 'm1', position: { x: 1, y: 0 }, isBoss: false }] as unknown as MapMonster[],
      },
    );

    const buff = session.game.getState().activeEffects.find(e => e.category === 'vengeance');
    expect(buff?.modifiers).toEqual([{ stat: 'attack_power', value: 50, isPercent: true }]);
    expect(defaultSession.game.getState().activeEffects).toEqual([]);
  });
});
