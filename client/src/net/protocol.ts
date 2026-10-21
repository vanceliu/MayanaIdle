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

/**
 * 協定版本（`97-selfhosted-server.md` § 97.2）：本檔訊息格式改到不相容時 +1。
 *
 * 版本協商**兩個都要比**：協定版本擋格式不相容，發布版本擋同格式但行為不同的 client。
 */
export const PROTOCOL_VERSION = '2';

/** 版本協商擋在哪一關（`97-selfhosted-server.md` § 97.2） */
export type VersionMismatchKind = 'protocol' | 'release';

export type ClientMessage =
  | { t: 'hello'; version: string; release: string }
  | { t: 'register'; username: string; password: string; inviteCode?: string }
  | { t: 'login'; username: string; password: string }
  | { t: 'resume'; token: string }
  /** `current`：目前的密碼或救援碼（`97-selfhosted-server.md` § 97.5） */
  | { t: 'set_password'; id?: number; current: string; password: string }
  /** 以救援碼重設密碼並登入（§ 97.5） */
  | { t: 'recover'; code: string; password: string }
  /** `current`：已有救援碼時為目前的救援碼，沒有時為目前的密碼（§ 97.5） */
  | { t: 'regenerate_recovery_code'; id?: number; current: string }
  | { t: 'logout' }
  | { t: 'characters' }
  | { t: 'create_character'; name: string; className: string; bonusAttrs: Record<string, number>; appearance?: unknown }
  | { t: 'select_character'; id: number }
  | { t: 'delete_character'; id: number }
  | { t: 'leave_character' }
  | { t: 'action'; id?: number; store: ActionStore; name: string; args?: unknown[] }
  /** 本服排行榜 snapshot（`37-statistics.md` § 37.4）；`top` 預設 20、上限 100 */
  | { t: 'leaderboard'; id?: number; top?: number };

/**
 * 單條聊天訊息的字數上限（`97-selfhosted-server.md` § 97.7.2）。
 *
 * 放在協定檔：server 的判定與 client 輸入框的限制必須是同一個數字，
 * 各寫一份的結果是打得進去卻送不出來。
 * 以**碼位**計 —— 中日文一字一碼位，表情符號的代理對也算一個。
 */
export const CHAT_MAX_LENGTH = 50;

/** 世界形態（`97-selfhosted-server.md` § 97.1）。單機不提供聊天、隊伍、交易 */
export type WorldMode = 'solo' | 'open';

export type ServerMessage =
  | { t: 'hello_ok'; serverName: string; version: string; registration: string; mode: WorldMode; autoLogin?: { token: string; username: string; userId: number; isHost: boolean } }
  | { t: 'version_mismatch'; kind: VersionMismatchKind; required: string; received: string }
  /** `isHost`：單機世界的 host 帳號，不設密碼（§ 97.5）；管理介面密碼是 `server.properties` 的 `admin-password` */
  /** `recoveryCode`：註冊或救援碼重設時換發的新救援碼，只送這一次（§ 97.5） */
  | { t: 'auth_ok'; token: string; username: string; userId: number; hasPassword: boolean; hasRecoveryCode: boolean; isHost: boolean; recoveryCode?: string }
  | { t: 'recovery_code'; code: string }
  | { t: 'error'; code: string; message: string; id?: number }
  | { t: 'patch'; store: StoreKey; data: Record<string, unknown> }
  /** 每個 tick 的心跳。`now` 是 server 的遊戲時間（`core/clock.ts` 的 `gameNow()`），client 用它對時 */
  | { t: 'combat'; now: number; instances: CombatInstanceView[]; targetMonsterId: string | null; cast: Record<string, number> }
  | { t: 'visuals'; events: unknown[] }
  | { t: 'action_ok'; id: number; result: unknown }
  | { t: 'chat'; message: ChatMessageView }
  | { t: 'leaderboard'; id?: number; snapshot: LeaderboardSnapshotView }
  /** server 公告（`97-selfhosted-server.md` § 97.8）：關服倒數這類全服訊息，不走聊天頻道 */
  | { t: 'notice'; text: string }
  /** 連線心跳量到的往返時間（`97-selfhosted-server.md` § 97.2），毫秒 */
  | { t: 'latency'; ms: number }
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
    'restAtInn', 'learnClassSkill', 'learnBasicMagic', 'craftSpellbook', 'restoreInTrainingGround',
    'setAfterCombatThreshold',
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
