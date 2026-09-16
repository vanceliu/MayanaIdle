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
  /*
   * 以下三條佇列**必須每個 session 一份**（§ 97.6）。
   * 放在模組層的話 server 上全服共用一條：A 的掉落結算會卡住 B 的存檔，
   * 而它們都是 `await` 持久層的非同步工作，人一多就互相排隊。
   */
  /** 掉落結算佇列：同一次擊殺的掉落要照順序寫，不可交錯 */
  dropQueue: Promise<void>;
  /** 存檔佇列：寫入順序等於呼叫順序（`18-data-schema.md`） */
  saveQueue: Promise<void>;
  /** 天賦與信箱的初始化（載入角色與創角都會跑） */
  talentInit: Promise<void>;

  /*
   * 存檔改為 dirty 標記 ＋ 週期 flush（§ 97.4）。
   * 原本每殺一隻怪就寫一次盤，而一次寫入是角色列＋整份背包＋兩個倉庫、各自提交。
   */
  /** 有沒有還沒落地的變動 */
  saveDirty: boolean;
  /** 距離上次 flush 累積的毫秒 */
  saveAcc: number;
  /** 各表上次寫進去的內容簽章：一樣就不重寫（§ 97.4 只寫有變的表） */
  savedSig: Record<string, string>;
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
    dropQueue: Promise.resolve(),
    saveQueue: Promise.resolve(),
    talentInit: Promise.resolve(),
    saveDirty: false,
    saveAcc: 0,
    savedSig: {},
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
