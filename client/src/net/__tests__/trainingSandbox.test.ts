import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyServerMessage, installOnlineProxies } from '../mirror';
import { isTrainingSandbox, resetTrainingSandboxForTest, consumedLines } from '../trainingSandbox';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import { useCombatCommandStore } from '../../stores/combatCommandStore';
import { useTalentStore } from '../../stores/talentStore';
import { useTrainingGroundStore } from '../../stores/trainingGroundStore';
import { gameLoopTick } from '../../systems/gameLoop';
import { tickCombat } from '../../systems/combatLoop';
import type { TalentSlot } from '../../models/talent';
import { defaultSession } from '../../stores/session';
import { TRAINING_GROUND_REGION_ID } from '../../models/trainingGround';
import type { MapData } from '../../models/mapControl';
import type { ServerMessage } from '../protocol';
import type { GameConnection } from '../connection';
import type { BagItem } from '../../models/bagItem';
import type { Character } from '../../models/character';
import '../../stores/talentStore';
import '../../stores/mailboxStore';
import '../../stores/partyStore';
import '../../stores/tradeStore';

/** 線上模式的試驗場本機沙盒（`97-selfhosted-server.md` § 97.2、`50-training-ground.md` § 50.4） */
const RED_POTION = 1;

function map(id: string): MapData {
  const row = (edge: boolean) => Array.from({ length: 10 }, (_, x) => (edge || x === 0 || x === 9 ? 1 : 0));
  return {
    id, name: id, width: 10, height: 10, spawnPoint: { x: 5, y: 5 }, theme: 'battlefield', autoSpawn: false,
    tiles: Array.from({ length: 10 }, (_, y) => row(y === 0 || y === 9)),
  } as MapData;
}

const character = (overrides: Partial<Character> = {}) => ({
  ...(useGameStore.getState().character ?? {}),
  id: 1, name: '測試', className: 'knight', level: 10, hp: 50, mp: 20, maxHp: 100, maxMp: 50,
  currentRegion: 'neutral-town', currentArea: 'neutral-town', currentFloor: null, ...overrides,
}) as Character;

function frame(stores: Extract<ServerMessage, { t: 'frame' }>['stores'], extra: Partial<Extract<ServerMessage, { t: 'frame' }>> = {}) {
  applyServerMessage({ t: 'frame', stores, ...extra } as ServerMessage);
}

function enterTraining() {
  frame({
    game: { merge: { character: { currentRegion: TRAINING_GROUND_REGION_ID, currentArea: TRAINING_GROUND_REGION_ID } } },
    mapControl: { set: { currentMap: map(TRAINING_GROUND_REGION_ID), playerPosition: { x: 5, y: 5 } } },
  });
}

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  rpc = vi.fn(() => Promise.resolve(true));
  useGameStore.setState({
    character: character(),
    bagItems: [{ itemId: RED_POTION, name: '紅色藥水', type: 'potion', amount: 5 }] as BagItem[],
    activeEffects: [], equippedGear: {}, searchMode: 'manual', lastPotionUsedAt: -1e9, lastPotionCooldown: 0,
  });
  useMapControlStore.setState({ currentMap: map('neutral-town'), playerPosition: { x: 5, y: 5 }, isMoving: false, currentPath: [], autoMove: false, paused: false });
  installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);
});

afterEach(() => {
  resetTrainingSandboxForTest();
});

describe('進出沙盒', () => {
  it('進入試驗場開始沙盒；離開時結束', () => {
    expect(isTrainingSandbox()).toBe(false);

    enterTraining();
    expect(isTrainingSandbox()).toBe(true);

    frame({ game: { merge: { character: { currentRegion: 'neutral-town', currentArea: 'neutral-town' } } } });
    expect(isTrainingSandbox()).toBe(false);
  });

  it('在試驗場登出（角色清空）也結束沙盒', () => {
    enterTraining();

    frame({ game: { set: { character: null } } });

    expect(isTrainingSandbox()).toBe(false);
  });

  it('沙盒中點地圖、點怪在本機執行，不送 server', () => {
    enterTraining();

    useMapControlStore.getState().moveToTarget({ x: 2, y: 5 });
    useCombatCommandStore.getState().requestTarget('dummy-1');

    expect(rpc).not.toHaveBeenCalledWith('mapControl', 'moveToTarget', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('combatCommand', 'requestTarget', expect.anything());
    expect(useMapControlStore.getState().targetPosition).toEqual({ x: 2, y: 5 });
  });

  it('離開後點地圖照常送 server', () => {
    enterTraining();
    frame({ game: { merge: { character: { currentRegion: 'neutral-town', currentArea: 'neutral-town' } } } });

    useMapControlStore.getState().moveToTarget({ x: 2, y: 5 });

    expect(rpc).toHaveBeenCalledWith('mapControl', 'moveToTarget', [{ x: 2, y: 5 }]);
  });

  it('沙盒中召喚的木樁在本機，離開時清掉', () => {
    enterTraining();
    useMapMonsterStore.getState().summonDummies(
      { defense: 0, hp: 100, level: 1, size: 'small', element: 'none' } as never, [{ x: 3, y: 5 }],
    );
    expect(useMapMonsterStore.getState().monsters).toHaveLength(1);

    frame({ game: { merge: { character: { currentRegion: 'neutral-town', currentArea: 'neutral-town' } } } });

    expect(useMapMonsterStore.getState().monsters).toHaveLength(0);
  });
});

describe('沙盒中的 server 推送', () => {
  it('HP／MP、位置、怪物、戰鬥不套用；裝備照常套用', () => {
    enterTraining();
    useGameStore.setState({ character: { ...useGameStore.getState().character!, hp: 40, mp: 10 } });
    useMapControlStore.setState({ playerPosition: { x: 3, y: 3 } });

    frame({
      game: { merge: { character: { hp: 100, mp: 50 } }, set: { equippedGear: { rightHand: { id: 9 } } } },
      mapControl: { set: { playerPosition: { x: 7, y: 7 } } },
      mapMonster: { set: { monsters: [] } },
    }, { combat: { full: true, add: [{ id: 'server-mob', name: 'x', level: 1, currentHp: 1, maxHp: 1, element: 'none', isBoss: false, attackType: 'melee' }] } as never });

    expect(useGameStore.getState().character).toMatchObject({ hp: 40, mp: 10 });
    expect(useGameStore.getState().equippedGear).toEqual({ rightHand: { id: 9 } });
    expect(useMapControlStore.getState().playerPosition).toEqual({ x: 3, y: 3 });
    expect(defaultSession.combat.monsterInstances.has('server-mob')).toBe(false);
  });

  it('離開時的完整重送照常套用', () => {
    enterTraining();
    useGameStore.setState({ character: { ...useGameStore.getState().character!, hp: 40 } });

    frame({ game: { set: { character: character({ hp: 100 }) } } });

    expect(useGameStore.getState().character?.hp).toBe(100);
  });

  it('搜尋模式改成自動：本機開始自動移動', () => {
    enterTraining();

    frame({ game: { set: { searchMode: 'auto' } } });

    expect(useMapControlStore.getState().autoMove).toBe(true);
  });
});

describe('沙盒中的道具消耗', () => {
  it('本機喝藥水：效果套在沙盒，server 扣同樣的庫存', () => {
    enterTraining();

    useGameStore.getState().usePotionByType('red');

    expect(useGameStore.getState().character!.hp).toBeGreaterThan(50);
    expect(rpc).not.toHaveBeenCalledWith('game', 'usePotionByType', expect.anything());
    expect(rpc).toHaveBeenCalledWith('game', 'consumeTrainingItems', [[{ itemId: RED_POTION, amount: 1 }]]);
  });

  it('server 推送的背包變動不送消耗', () => {
    enterTraining();

    frame({ game: { set: { bagItems: [{ itemId: RED_POTION, name: '紅色藥水', type: 'potion', amount: 3 }] } } });

    expect(rpc).not.toHaveBeenCalledWith('game', 'consumeTrainingItems', expect.anything());
  });

  it('沙盒外不送消耗', () => {
    useGameStore.setState({ bagItems: [] });

    expect(rpc).not.toHaveBeenCalledWith('game', 'consumeTrainingItems', expect.anything());
  });
});

describe('consumedLines', () => {
  it('只列出減少的道具與數量', () => {
    const before = [{ itemId: 1, amount: 5 }, { itemId: 2, amount: 1 }, { itemId: 3, amount: 2 }] as BagItem[];
    const after = [{ itemId: 1, amount: 4 }, { itemId: 3, amount: 4 }] as BagItem[];

    expect(consumedLines(before, after)).toEqual([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]);
  });
});

describe('沙盒中的戰鬥與量測', () => {
  it('打木樁：本機結算傷害並記進量測，戰鬥不經 server', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    enterTraining();
    useGameStore.setState({
      character: {
        ...character({ currentRegion: TRAINING_GROUND_REGION_ID, currentArea: TRAINING_GROUND_REGION_ID, hp: 200, maxHp: 200, mp: 50 }),
        exp: 0, expToNext: 1_000_000,
        baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
      } as Character,
      skills: [], combatLogs: [],
    });
    const slot: TalentSlot = {
      id: 1, characterId: 1, tier: 1, assignedType: 'combat', templateId: useGameStore.getState().activeTemplateId,
      order: 0, enabled: true, conditions: [null], action: { ruleId: 'normal_attack', params: null },
    };
    useTalentStore.setState({ slots: [slot] });
    useMapMonsterStore.getState().summonDummies(
      { defense: 0, hp: null, level: 1, size: 'small', element: 'none' } as never, [{ x: 6, y: 5 }],
    );
    const dummyId = useMapMonsterStore.getState().monsters[0].id;
    useTrainingGroundStore.getState().start(50);
    useCombatCommandStore.getState().requestTarget(dummyId);

    for (let i = 0; i < 40; i++) {
      gameLoopTick(300);
      tickCombat(300);
    }

    expect(useTrainingGroundStore.getState().measurement.totalDamage).toBeGreaterThan(0);
    expect(rpc.mock.calls.filter(([store]) => store === 'combatCommand' || store === 'mapControl')).toEqual([]);
    useTrainingGroundStore.getState().reset();
  });
});
