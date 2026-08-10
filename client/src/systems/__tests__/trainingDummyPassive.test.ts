/**
 * 木樁不還手（`docs/design/50-training-ground.md` § 50.4.1）。
 *
 * 反過來也要守住：**只有**帶旗標的怪被跳過。整段 FSM 被跳過而不是只丟掉
 * attack 事件，所以這裡連攻擊計時器有沒有偷偷累積都一起驗。
 */
import { describe, it, expect } from 'vitest';
import { createArpgEngine, tickArpgEngine, type ArpgTickInput } from '../arpgEngine';
import type { MonsterInstance } from '../../models/monster';
import type { Character } from '../../models/character';

const ATTRS = { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 };

function makeChar(): Character {
  return {
    name: '測試', class: 'knight', level: 1, exp: 0, gold: 0,
    hp: 100, mp: 50,
    baseAttributes: { ...ATTRS },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    attributePoints: 0,
  } as never;
}

function makeInstance(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 0, name: '木樁', level: 1,
    currentHp: 1000, maxHp: 1000,
    attackMin: 10, attackMax: 10, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...overrides,
  };
}

/** 全通行的小地圖：視線判定要有實際 tiles，空陣列會被當成擋住 */
const OPEN_MAP = {
  id: 't', name: 't', width: 10, height: 10, theme: 'battlefield' as const,
  tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
  spawnPoint: { x: 5, y: 5 },
};

/**
 * 怪物 FSM 要走 roaming → chasing → attacking 才會出手，
 * 所以連跑幾拍並把所有事件收起來，避免測到「剛好那一拍還沒轉狀態」。
 */
function tick(instance: MonsterInstance) {
  const engine = createArpgEngine();
  const input: ArpgTickInput = {
    playerPos: { x: 5, y: 5 },
    character: makeChar(),
    skills: [],
    activeEffects: [],
    equippedGear: [],
    combatRules: [],
    // 貼在玩家臉上：一般怪這個距離一定會出手
    mapMonsters: [{ id: 'm1', position: { x: 5, y: 5 } } as never],
    monsterInstances: new Map([['m1', instance]]),
    map: OPEN_MAP as never,
    // 遠大於攻擊間隔，計時器一定跑完
    deltaMs: 5000,
    bagItems: [],
  };
  const events = [];
  for (let i = 0; i < 5; i++) events.push(...tickArpgEngine(engine, input));
  return events;
}

describe('木樁不攻擊（§ 50.4.1）', () => {
  it('帶 isTrainingDummy 的怪不產生 monster_attack', () => {
    const events = tick(makeInstance({ isTrainingDummy: true }));
    expect(events.some(e => e.type === 'monster_attack')).toBe(false);
  });

  it('對照組：同樣位置的一般怪會出手，證明跳過的是旗標不是整條路', () => {
    const events = tick(makeInstance());
    expect(events.some(e => e.type === 'monster_attack')).toBe(true);
  });

  it('血量歸零的木樁一樣不出手（與一般死怪走同一條早退）', () => {
    const events = tick(makeInstance({ isTrainingDummy: true, currentHp: 0 }));
    expect(events.some(e => e.type === 'monster_attack')).toBe(false);
  });
});
