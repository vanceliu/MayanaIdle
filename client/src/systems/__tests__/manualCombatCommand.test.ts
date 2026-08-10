import { describe, it, expect, beforeEach } from 'vitest';
import type { Character } from '../../models/character';
import type { MapData } from '../../models/mapControl';
import type { MonsterInstance } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';
import type { CombatRule } from '../../models/scriptEngine';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { Skill } from '../../models/skill';
import {
  createArpgEngine,
  tickArpgEngine,
  applyManualTarget,
  queueManualSkill,
  type ArpgEngineState,
  type ArpgTickInput,
} from '../arpgEngine';

/**
 * 手動介入（`03-combat.md` § 3.6）。
 *
 * 這裡驗的是「引擎接不接受指令、優先權對不對、有沒有用掉」，
 * 傷害結算、AoE 命中集合那些都走既有流程，不在這一份的範圍內。
 */

function createMap(): MapData {
  // 全通行的 10×10，視線一律通過，避免地形干擾指令判定
  return {
    id: 'test',
    name: 'Test Map',
    width: 10,
    height: 10,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
    spawnPoint: { x: 0, y: 0 },
  };
}

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    userId: 1,
    name: '元素師',
    className: 'elementalist',
    level: 30,
    exp: 0,
    expToNext: 100,
    hp: 500,
    maxHp: 500,
    mp: 500,
    maxMp: 500,
    baseAttributes: { STR: 8, AGI: 8, VIT: 10, SPI: 14, INT: 18, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: 'ivory-tower-1f',
    currentZone: 'ivory-tower',
    currentRegion: 'ivory-tower',
    currentFloor: 1,
    skills: [],
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function createInstance(name: string): MonsterInstance {
  return {
    templateId: 1,
    name,
    level: 20,
    currentHp: 999999,
    maxHp: 999999,
    attackMin: 1,
    attackMax: 1,
    defense: 0,
    exp: 1,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
  };
}

function createMapMonster(id: string, x: number, y: number): MapMonster {
  const position = { x, y };
  return {
    id,
    position,
    targetPosition: { ...position },
    speed: 0,
    path: [],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: { x: 0, y: 0 },
    isBoss: false,
  };
}

/** 兩隻怪都貼在玩家旁邊，站位不會影響「選誰」的判定 */
function createWorld() {
  const near = createMapMonster('near', 1, 0);
  const far = createMapMonster('far', 2, 0);
  const instances = new Map<string, MonsterInstance>([
    ['near', createInstance('近的')],
    ['far', createInstance('遠的')],
  ]);
  return { mapMonsters: [near, far], instances };
}

const NORMAL_ATTACK_ONLY: CombatRule[] = [
  { id: 'r1', enabled: true, conditions: [], action: { type: 'normal_attack' } },
];

function makeInput(
  overrides: Partial<ArpgTickInput> = {},
): ArpgTickInput {
  const world = createWorld();
  return {
    playerPos: { x: 0, y: 0 },
    character: createCharacter(),
    skills: [],
    activeEffects: [],
    equippedGear: [],
    combatRules: NORMAL_ATTACK_ONLY,
    mapMonsters: world.mapMonsters,
    monsterInstances: world.instances,
    map: createMap(),
    deltaMs: 16,
    ...overrides,
  };
}

/** 跑到攻擊冷卻結束、真的打出一次為止，回傳那一次的攻擊事件 */
function tickUntilAttack(engine: ArpgEngineState, input: ArpgTickInput, maxTicks = 400) {
  for (let i = 0; i < maxTicks; i++) {
    const events = tickArpgEngine(engine, input);
    const attack = events.find(e => e.type === 'player_attack');
    if (attack && attack.type === 'player_attack') return attack;
  }
  return null;
}

describe('點怪切目標（§ 3.6.1）', () => {
  let engine: ArpgEngineState;
  let input: ArpgTickInput;

  beforeEach(() => {
    engine = createArpgEngine();
    input = makeInput();
    // 先跑一 tick 讓引擎把怪同步進 engine.monsters
    tickArpgEngine(engine, input);
  });

  it('沒有手動指定時，FSM 自動選最近的一隻', () => {
    expect(engine.playerCtx.targetMonsterId).toBe('near');
  });

  it('手動指定會覆寫 FSM 選的目標', () => {
    expect(applyManualTarget(engine, 'far')).toBe(true);
    expect(engine.playerCtx.targetMonsterId).toBe('far');
    // 目標還活著，之後的 tick 不會被自動選取搶回去
    tickArpgEngine(engine, input);
    expect(engine.playerCtx.targetMonsterId).toBe('far');
  });

  it('指定不存在的怪不採納，維持原目標', () => {
    expect(applyManualTarget(engine, 'ghost')).toBe(false);
    expect(engine.playerCtx.targetMonsterId).toBe('near');
  });

  it('指定屍體不採納，維持原目標', () => {
    input.monsterInstances.get('far')!.currentHp = 0;
    tickArpgEngine(engine, input);
    expect(applyManualTarget(engine, 'far')).toBe(false);
    expect(engine.playerCtx.targetMonsterId).toBe('near');
  });

  it('指定的目標死亡後落回自動選取，不維持空目標', () => {
    applyManualTarget(engine, 'far');
    expect(engine.playerCtx.targetMonsterId).toBe('far');

    input.monsterInstances.get('far')!.currentHp = 0;
    input.mapMonsters = input.mapMonsters.filter(m => m.id !== 'far');
    tickArpgEngine(engine, input);

    expect(engine.playerCtx.targetMonsterId).toBe('near');
  });
});

describe('手動施放攻擊技能（§ 3.6.2）', () => {
  /** 元素師的一級風系單體技，射程夠遠、CD 短，適合當測試素材 */
  function windBlade(): Skill {
    const skill = instantiateFromTemplate('wind-blade', 0);
    if (!skill) throw new Error('測試素材 wind-blade 不存在，技能表改過就要換一支攻擊技能');
    return skill;
  }

  it('手動指定的技能覆蓋腳本判定', () => {
    const engine = createArpgEngine();
    const skill = windBlade();
    const input = makeInput({ skills: [skill] });

    tickArpgEngine(engine, input);
    queueManualSkill(engine, skill.id);

    const attack = tickUntilAttack(engine, input);
    expect(attack?.action).toEqual({ type: 'skill', skillId: skill.id });
  });

  it('用掉後即消費，下一次出手回到腳本', () => {
    const engine = createArpgEngine();
    const skill = windBlade();
    const input = makeInput({ skills: [skill] });

    tickArpgEngine(engine, input);
    queueManualSkill(engine, skill.id);

    expect(tickUntilAttack(engine, input)?.action.type).toBe('skill');
    expect(engine.manualSkillId).toBeNull();
    // 第二次出手沒有指令了，照腳本走普通攻擊
    expect(tickUntilAttack(engine, input)?.action).toEqual({ type: 'normal_attack' });
  });

  it('MP 不足時不採用，該次出手落回腳本，且指令不留到下一次', () => {
    const engine = createArpgEngine();
    const skill = windBlade();
    const input = makeInput({
      skills: [skill],
      character: createCharacter({ mp: 0 }),
    });

    tickArpgEngine(engine, input);
    queueManualSkill(engine, skill.id);

    expect(tickUntilAttack(engine, input)?.action).toEqual({ type: 'normal_attack' });
    expect(engine.manualSkillId).toBeNull();
  });

  it('重複指定只保留最後一次', () => {
    const engine = createArpgEngine();
    const skill = windBlade();
    queueManualSkill(engine, 'first');
    queueManualSkill(engine, skill.id);
    expect(engine.manualSkillId).toBe(skill.id);
  });

  it('沒有怪的時候不會出手，指令留著等下一次接敵', () => {
    const engine = createArpgEngine();
    const skill = windBlade();
    const input = makeInput({
      skills: [skill],
      mapMonsters: [],
      monsterInstances: new Map(),
    });

    queueManualSkill(engine, skill.id);
    for (let i = 0; i < 200; i++) tickArpgEngine(engine, input);

    expect(engine.manualSkillId).toBe(skill.id);
  });
});
