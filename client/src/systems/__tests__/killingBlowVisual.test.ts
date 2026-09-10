/**
 * 致命的那一擊必須演得出來（`48-vfx.md` § 48.7.6）。
 *
 * **判定與演出是兩條時間線**：怪在判定的同一個 tick 就從 store 拿掉，
 * 但武器揮擊、投射物、傷害數字、白閃、屍體保留都還沒開始。
 * 所以演出事件必須自帶判定當下的座標 —— 渲染端回頭查 store 的話，
 * 最後一下會整段不演（怪憑空消失），而且**不會有任何錯誤訊息**。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tickCombat } from '../combatLoop';
import { createMapInstance, attachInstance } from '../mapInstance';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useTalentStore } from '../../stores/talentStore';
import { defaultSession } from '../../stores/session';
import { createMonsterCombatContext } from '../monsterCombatFSM';
import type { MapData } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { TalentSlot } from '../../models/talent';

/** 一格「一律普通攻擊」的戰鬥天賦格（`51-auto-talent.md` § 51.3.1：條件留空＝恆真） */
const NORMAL_ATTACK_SLOT: TalentSlot = {
  id: 1, characterId: 1, tier: 1, assignedType: 'combat', templateId: 'default',
  order: 0, enabled: true, conditions: [null], action: { ruleId: 'normal_attack', params: null },
};

const MAP: MapData = {
  id: 'test-map',
  name: 'Test Map',
  width: 12,
  height: 12,
  spawnPoint: { x: 5, y: 5 },
  autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 10,
    exp: 0, expToNext: 1_000_000, hp: 200, maxHp: 200, mp: 50, maxMp: 50,
    baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

/** 站在玩家旁邊、只剩 1 滴血的怪 */
function dyingMonster(): { mapMonster: MapMonster; instance: MonsterInstance } {
  const mapMonster: MapMonster = {
    id: 'm1',
    position: { x: 6, y: 5 },
    targetPosition: { x: 5, y: 5 },
    speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false, attackRange: 1.5,
  };
  const instance: MonsterInstance = {
    templateId: 1, name: '瀕死怪', level: 1, currentHp: 1, maxHp: 30,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
  };
  return { mapMonster, instance };
}

describe('致命一擊的演出事件', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const instance = createMapInstance('test', useMapMonsterStore);
    attachInstance(defaultSession, instance);

    const { mapMonster, instance: inst } = dyingMonster();
    useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
    useMapControlStore.setState({
      currentMap: MAP, playerPosition: { x: 5, y: 5 }, prevPlayerPosition: { x: 5, y: 5 },
      currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
    });
    useGameStore.setState({ character: character(), equippedGear: {}, inventory: [], bagItems: [], activeEffects: [], combatLogs: [], skills: [] });
    useTalentStore.setState({ slots: [NORMAL_ATTACK_SLOT] });

    // 引擎的怪物 context 直接放好，省掉走位與追擊
    defaultSession.combat.monsterInstances.set('m1', inst);
    defaultSession.combat.engine.monsters.set('m1', {
      instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
      attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
    });
    defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
    defaultSession.combat.engine.playerCtx.attackTimer = 100_000;
  });

  it('怪被打死後從 store 消失，但演出事件仍帶著牠判定當下的座標', () => {
    let attack: Extract<ReturnType<typeof tickCombat>[number], { kind: 'player_attack' }> | undefined;
    for (let i = 0; i < 12 && !attack; i++) {
      const visuals = tickCombat(300, defaultSession);
      attack = visuals.find(v => v.kind === 'player_attack') as typeof attack;
    }

    expect(attack, '十二個 tick 內應該要出手').toBeDefined();
    const killed = attack!.result.damages.find(d => d.killed);
    expect(killed, '這一擊應該打死牠').toBeDefined();

    // 判定已經把牠從 store 拿掉了
    expect(useMapMonsterStore.getState().monsters.some(m => m.id === 'm1')).toBe(false);

    // 但演出還找得到落點：這就是渲染端唯一的依據
    expect(attack!.targetPositions[killed!.targetId]).toEqual({ x: 6, y: 5 });
  });

  it('沒死的目標一樣帶座標（同一條路徑，不分死活）', () => {
    const inst = defaultSession.combat.monsterInstances.get('m1')!;
    inst.currentHp = 9999;
    inst.maxHp = 9999;

    let attack: Extract<ReturnType<typeof tickCombat>[number], { kind: 'player_attack' }> | undefined;
    for (let i = 0; i < 12 && !attack; i++) {
      const visuals = tickCombat(300, defaultSession);
      attack = visuals.find(v => v.kind === 'player_attack') as typeof attack;
    }

    expect(attack).toBeDefined();
    expect(attack!.result.damages[0].killed).toBe(false);
    expect(attack!.targetPositions[attack!.result.damages[0].targetId]).toEqual({ x: 6, y: 5 });
  });
});
