/**
 * 一個玩家會話擁有的全部遊戲狀態（`97-selfhosted-server.md` § 97.6）。
 * client 只有 `defaultSession`；server 每個連線一個 session。
 *
 * 地圖上的共用狀態（怪物、佔位表、Pressure）屬於 `MapInstance`（§ 97.7.1）；
 * session 上的 `mapMonster`／`combat.monsterInstances`／`loop.occupation` 是它的別名，
 * 由 `systems/mapInstance.ts` 的 `attachInstance` 設定。
 */
import type { StoreApi } from 'zustand';
import type { GameState } from './gameStore';
import type { MapControlState } from './mapControlStore';
import type { MapMonsterState } from './mapMonsterStore';
import type { CombatCommandState } from './combatCommandStore';
import type { TalentState } from './talentStore';
import type { MailboxState } from './mailboxStore';
import type { PartyState } from './partyStore';
import type { TradeState } from './tradeStore';
import { OccupationManager } from '../systems/occupationManager';
import type { ArpgEngineState } from '../systems/arpgEngine';
import type { MonsterInstance, MonsterTemplate } from '../models/monster';
import type { GameRepository } from '../db/repository';
import type { MapInstance } from '../systems/mapInstance';
import type { SelfCastFxEvent } from '../systems/selfCastFx';

/** 遊戲迴圈的跨 tick 狀態，一個 session 一份 */
export interface LoopState {
  /** 實例的佔位表別名（`attachInstance`） */
  occupation: OccupationManager;
  dotTickTimer: number;
  restedTickTimer: number;
  pauseLogShown: boolean;
  combatInterruptLogShown: boolean;
  dotTickReady: boolean;
  regenHpAcc: number;
  regenMpAcc: number;
  persistentAcc: number;
  /** 常駐天賦的自身施法演出佇列（`48-vfx.md` § 48.8.5） */
  selfCastFx: SelfCastFxEvent[];
}

export function createLoopState(): LoopState {
  return {
    occupation: new OccupationManager(),
    dotTickTimer: 0,
    restedTickTimer: 0,
    pauseLogShown: false,
    combatInterruptLogShown: false,
    dotTickReady: false,
    regenHpAcc: 0,
    regenMpAcc: 0,
    persistentAcc: 0,
    selfCastFx: [],
  };
}

/**
 * 戰鬥模擬的跨 tick 狀態。`engine.playerCtx` 是玩家自己的；
 * `engine.monsters`／`monsterInstances`／`areaTemplates` 是實例的別名。
 */
export interface CombatState {
  engine: ArpgEngineState;
  monsterInstances: Map<string, MonsterInstance>;
  areaTemplates: MonsterTemplate[];
}

export interface Session {
  game: StoreApi<GameState>;
  mapControl: StoreApi<MapControlState>;
  /** 實例的怪物 store 別名 */
  mapMonster: StoreApi<MapMonsterState>;
  combatCommand: StoreApi<CombatCommandState>;
  talent: StoreApi<TalentState>;
  mailbox: StoreApi<MailboxState>;
  party: StoreApi<PartyState>;
  trade: StoreApi<TradeState>;
  loop: LoopState;
  /** 持久層：正式路徑在 server（SQLite），測試由 `testing/testDb.ts` 登記記憶體實作 */
  repo: GameRepository;
  combat: CombatState;
  /** 所在的（隊伍，地圖）實例（§ 97.7.1）；本機永遠是一人實例 */
  instance: MapInstance;
}

/** client 的唯一會話；各 store 模組載入時把自己登記進來 */
export const defaultSession = { loop: createLoopState() } as Session;
