/**
 * client 與 server 共用的 WebSocket 訊息（JSON）。版本協商見 `97-selfhosted-server.md` § 97.2。
 * 唯一出處；server 以相對路徑引用。
 */
export type StoreKey = 'game' | 'mapControl' | 'mapMonster' | 'talent' | 'mailbox' | 'party' | 'trade';

/** 聊天頻道（`97-selfhosted-server.md` § 97.7.2） */
export type ChatChannel = 'world' | 'guild' | 'party' | 'town' | 'whisper';

export interface ChatMessageView {
  id: number;
  channel: ChatChannel;
  from: { characterId: number; name: string };
  /** 密語的收訊者。其他頻道沒有 */
  to?: { characterId: number; name: string };
  text: string;
  /** wall clock（顯示用） */
  at: number;
}

export type ClientMessage =
  | { t: 'hello'; version: string }
  | { t: 'register'; username: string; password: string; inviteCode?: string }
  | { t: 'login'; username: string; password: string }
  | { t: 'resume'; token: string }
  | { t: 'set_password'; password: string }
  | { t: 'logout' }
  | { t: 'characters' }
  | { t: 'create_character'; name: string; className: string; bonusAttrs: Record<string, number>; appearance?: unknown }
  | { t: 'select_character'; id: number }
  | { t: 'delete_character'; id: number }
  | { t: 'leave_character' }
  | { t: 'action'; id?: number; store: ActionStore; name: string; args?: unknown[] }
  /** 本服排行榜 snapshot（`37-statistics.md` § 37.4）；`top` 預設 20、上限 100 */
  | { t: 'leaderboard'; id?: number; top?: number };

export type ServerMessage =
  | { t: 'hello_ok'; serverName: string; version: string; registration: string; autoLogin?: { token: string; username: string; userId: number; isHost: boolean } }
  | { t: 'version_mismatch'; required: string; received: string }
  /** `isHost`：這個帳號的密碼由 `server.properties` 的 `host-password` 決定，遊戲裡不提供修改 */
  | { t: 'auth_ok'; token: string; username: string; userId: number; hasPassword: boolean; isHost: boolean }
  | { t: 'error'; code: string; message: string; id?: number }
  | { t: 'patch'; store: StoreKey; data: Record<string, unknown> }
  /** 每個 tick 的心跳。`now` 是 server 的遊戲時間（`core/clock.ts` 的 `gameNow()`），client 用它對時 */
  | { t: 'combat'; now: number; instances: CombatInstanceView[]; targetMonsterId: string | null; cast: Record<string, number> }
  | { t: 'visuals'; events: unknown[] }
  | { t: 'action_ok'; id: number; result: unknown }
  | { t: 'chat'; message: ChatMessageView }
  | { t: 'leaderboard'; id?: number; snapshot: LeaderboardSnapshotView }
  | { t: 'kicked'; reason: string };

/** 與 `services/leaderboardService.ts` 的 columnar 格式相同 */
export interface LeaderboardSnapshotView {
  top: number;
  count: number;
  fields: string[];
  rows: (string | number | null)[][];
}

export interface CombatInstanceView {
  id: string;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  isBoss: boolean;
  element: string;
  attackType: string;
  isTrainingDummy?: boolean;
}

export type ActionStore = 'game' | 'mapControl' | 'mapMonster' | 'combatCommand' | 'talent' | 'mailbox' | 'party' | 'chat' | 'trade';

/** 每個 store 允許 client 呼叫的 action（其餘一律拒絕） */
export const ACTION_ALLOWLIST: Record<ActionStore, ReadonlySet<string>> = {
  game: new Set([
    'setPhase', 'startExploring', 'stopExploring', 'setSearchMode',
    'equipItem', 'unequipItem', 'usePotion', 'usePotionByType', 'useSpeedPotion',
    'assignQuickSlot', 'setBagSlotMap', 'useQuickSlot', 'castQuickSlotSkill', 'castSelfSkill',
    'useTownScroll', 'useCureItem', 'changeArea', 'navigateTo',
    'setScriptRules', 'setEmergencyRetreat', 'setActiveTemplate', 'addScriptTemplate',
    'duplicateScriptTemplate', 'renameScriptTemplate', 'removeScriptTemplate',
    'rememberHuntLocation', 'addEffect', 'removeEffect',
    'discardBagItem', 'sellBagItems', 'buyBagItems', 'sellEquipmentInstances',
    'depositToWarehouse', 'withdrawFromWarehouse', 'depositWarehouseGold', 'withdrawWarehouseGold',
    'discardInventoryItem', 'requestDiscard', 'cancelDiscard', 'confirmDiscard',
    'spendAttributePoint', 'acceptQuest', 'completeQuest',
    'acceptAdventurerQuest', 'abandonAdventurerQuest', 'completeAdventurerQuest',
    'refreshQuestBoard', 'rerollQuestBoard', 'initQuestBoard', 'acceptCraftQuest', 'abandonCraftQuest',
    'saveState', 'pushSystemLog',
    'buyShopEquipment', 'craftEquipment', 'applySigil', 'claimStarterGear', 'enhanceStarterGear', 'enhanceWithScroll',
  ]),
  mapControl: new Set(['moveToTarget', 'setAutoMove', 'stopMoving']),
  mapMonster: new Set(['summonDummies', 'clearAll']),
  combatCommand: new Set(['requestTarget', 'requestSkill']),
  talent: new Set(['installSlot', 'uninstallSlot', 'reorderSlot', 'toggleSlot', 'setEntry', 'setEntryParams', 'fuseSlots']),
  mailbox: new Set(['refresh', 'claim', 'claimAll', 'remove', 'purgeClaimed']),
  // 組隊（`97-selfhosted-server.md` § 97.7.3）：判定在 server 的 PartyManager
  party: new Set(['invite', 'accept', 'decline', 'leave', 'kick', 'transferLeader', 'setDropMode']),
  chat: new Set(['send']),
  // 交易（§ 97.7 表）：判定在 server 的 TradeManager
  trade: new Set(['offer', 'accept', 'decline', 'setOffer', 'lock', 'confirm', 'cancel']),
};
