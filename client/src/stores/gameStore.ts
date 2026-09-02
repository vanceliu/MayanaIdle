import { create } from 'zustand';
import { normalizeAppearance, type Appearance } from '../models/appearance';
import type { Character, ClassName, Attributes } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import { useMapMonsterStore } from './mapMonsterStore';
import { useMapControlStore } from './mapControlStore';
import type { EquipmentInstance, EquipmentTemplate, EquippedGear } from '../models/equipment';
import { BOSS_DROP_ONLY_TIER, isWeaponEquipment, occupiesHand, SLOT_ORDER } from '../models/equipment';
import type { Skill } from '../models/skill';
import { CURRENT_DATA_VERSION } from '../config';
import { syncTalentSlotGrants, syncCompensations, mailPurgeStorageKey } from '../systems/mailbox';
import { talentBagOrderStorageKey } from '../models/talentBag';
import { rollTalentSlotDrop } from '../systems/talentDrops';
import { emptyConditions } from '../models/talent';
import { useMailboxStore } from './mailboxStore';
import { purgeClaimedMailOnVersionChange } from '../systems/mailbox';
import { useTalentStore, talentPersistentRules, talentVillageRules } from './talentStore';
import { BUILD_INFO } from '../buildInfo';
import type { DropResult } from '../systems/drops';
import type { ActiveEffect } from '../models/effect';
import { getCureItem, hasCurableDebuff } from '../models/cureItem';
import { getStarterGearNames } from '../systems/starterNpc';
import {
  QUICK_SLOT_COUNT,
  emptyQuickSlots,
  normalizeQuickSlots,
  resolveQuickSlotAction,
  type QuickSlotEntry,
  type QuickSlots,
} from '../models/quickSlot';
import { isPlayerStunned, applySpeedBuff, applyPlayerBuff } from '../systems/playerDebuffSystem';
import { CLASS_BASE_ATTRIBUTES, getTotalAttributes, ATTRIBUTE_CAP } from '../models/character';
import { generateCharacterUuid } from '../models/characterIdentity';
import { ensureCharacterAuthToken } from '../systems/authToken';
import {
  uploadStats,
  shouldUploadStats,
  markStatsUploaded,
  LeaderboardError,
} from '../services/leaderboardService';
import { purgeOutdatedData } from '../systems/dataVersionPurge';
import { getExpToNextLevel, addExp, INITIAL_HP, INITIAL_MP } from '../systems/levelUp';
import { calculatePressure, getPressureDropMultiplier } from '../systems/pressure';
import { accrueRestedExp, getRestedExpMultiplier } from '../systems/restedExp';
import { SKILL_WIND_BLADE, canUseSkill } from '../models/skill';
import { instantiateFromTemplate, getSkillTemplate } from '../models/skillTemplate';
import { getSkillCooldownReduction, getAffixBonusesFromGear, getEquippedWeapon, calculateHealAmount } from '../systems/combat';
import { getEffectiveGearArray } from '../systems/gear';
import { getWeightStatus } from '../systems/weight';
import type { HpSample } from '../systems/scriptRunner';

/**
 * 短期 HP 取樣（`51-auto-talent.md` § 51.4.5 的 `hp_dropped_recently`）。
 *
 * **不進 store、不持久化**：這是「剛剛掉多快」的暫時緩衝，
 * 進 state 會讓每 300ms 一次的取樣觸發整棵樹重繪。
 */
const HP_SAMPLE_WINDOW_MS = 10_000;
let hpSamples: HpSample[] = [];
import { rollDrops, rollBossDrops } from '../systems/drops';
import { updateErrandProgress, rollQuestMaterialDrop, updateCollectProgress, acceptQuest as acceptQuestAction, completeQuest as completeQuestAction } from '../systems/questSystem';
import { QUEST_MATERIAL_NAME } from '../models/quest';
import { getItemId, getItemById } from '../models/items';
import { bagLayoutStorageKey, type BagSlotMap } from '../models/bagLayout';
import { isSigilItemId } from '../models/sigil';
import type { BagItem } from '../models/bagItem';
import { makeBagItem, addBagItem, consumeBagItem, getBagItemAmount, hasBagItem } from '../models/bagItem';
import type { AdventurerQuest, GuildProgress, AdventurerQuestDifficulty, QuestTownId } from '../models/adventurerQuest';
import { generateQuestList, generateSingleQuest as generateAdvSingleQuest, acceptQuest as acceptAdvQuest, abandonQuest as abandonAdvQuest, updateQuestProgress as updateAdvQuestProgress, updateCollectQuestProgress as updateAdvCollectProgress, rollCollectMaterialDrop as rollAdvCollectDrop, completeQuest as completeAdvQuest } from '../systems/adventurerQuestSystem';
import { getTownDifficulties, QUEST_DIFFICULTY_ORDER, createEmptyQuestBoard, QUEST_BOARD_REFRESH_COST, getRankForPoints } from '../models/adventurerQuest';
import type { CraftQuest } from '../models/craftQuest';
import { acceptCraftQuest as acceptCraftQuestFn, abandonCraftQuest as abandonCraftQuestFn } from '../systems/craftQuestSystem';
import type { CharacterStatistics } from '../models/statistics';
import { createDefaultStatistics, normalizeStatistics } from '../models/statistics';
import { getHpRegen, getMpRegen, HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../systems/regen';
import { evaluatePersistentScript, evaluateEmergencyRetreat, skillMeetsWeaponRequirement, type PersistentScriptContext, type EmergencyRetreatContext } from '../systems/scriptRunner';
import { useCombatCommandStore } from './combatCommandStore';
import { pushSelfCastFx } from '../systems/selfCastFx';
import type { ScriptRule, EmergencyRetreat } from '../models/scriptEngine';
import {
  DEFAULT_SCRIPT, DEFAULT_EMERGENCY_RETREAT,
} from '../models/scriptEngine';
import type { ScriptTemplate } from '../models/scriptTemplate';
import {
  DEFAULT_TEMPLATE_ID, createDefaultTemplate, createScriptTemplate,
  nextTemplateName, normalizeScriptTemplates, resolveActiveTemplate, isDeletableTemplate,
} from '../models/scriptTemplate';
import type { MapLocation } from '../models/area';
import { getRegion, resolveArea, ZONES } from '../models/mapData';
import { canNavigateTo, consumeScroll } from '../systems/navigation';
import { resolveEquipment, rollNewInstanceFields } from '../systems/templateSync';
import { findScrollInBag, consumeTownScroll, getTownScrollByItemId, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { db, type CharacterBagEntry, type WarehouseEntry } from '../db/database';
import { getItemSellPrice, getEquipmentSellTotal } from '../systems/shop';
import { getItemBasePrice } from '../systems/shop';
import { getCachedEquipmentTemplates } from '../db/equipmentTemplateCache';
import type { HuntLocation } from '../models/villageScript';
import {
  evaluateVillageScript, findReturnScroll, getBuyAmount, getWarehouseKind,
  collectVillageSellMaterials, collectVillageSellEquipment,
  collectDepositMaterials, collectDepositEquipment,
  getWithdrawAmount, getDepositGoldAmount, getWithdrawGoldAmount,
  type VillageScriptContext,
} from '../systems/villageScriptRunner';

/** 倉庫存取的搬運單。裝備走實例 id，道具走 id＋數量 */
export interface WarehouseMove {
  warehouse: 'shared' | 'personal';
  equipmentIds?: number[];
  materials?: { itemId: number; amount: number }[];
}

/** 共用／個人倉庫是兩組獨立欄位，寫哪一組由這裡決定 */
function warehousePatch(shared: boolean, equip: EquipmentInstance[], materials: BagItem[]) {
  return shared
    ? { storedEquipment: equip, storedMaterials: materials }
    : { personalStoredEquipment: equip, personalStoredMaterials: materials };
}

/** 村莊腳本的判定間隔。它會花錢與存檔，不需要跟常駐腳本的 300ms 一樣快 */
const VILLAGE_TICK_MS = 1000;

/** `legacy` 為遺產頁（§ 45.3）：唯讀，只能返回 characterSelect，不可進入任何遊玩畫面 */
export type GamePhase = 'title' | 'characterSelect' | 'create' | 'legacy' | 'explore' | 'combat' | 'result' | 'dead';
export type SearchMode = 'auto' | 'manual';

/** 統計上傳結果（§ 37.4.5）。`skipped` = 節流或數值未變，不算失敗。 */
export type StatsUploadResult =
  | 'skipped'
  | 'uploaded'
  | 'invalid_auth_token'
  | 'outdated_client'
  | 'invalid_name'
  | 'failed';

export interface CombatLog {
  text: string;
  /**
   * debuff-self  = 我方身上的 debuff（施加、DoT 傷害、解除）→ 粉紅
   * debuff-enemy = 敵方身上的 debuff（施加、DoT 傷害、免疫）→ 淺藍
   */
  type: 'player' | 'monster' | 'system' | 'loot' | 'miss' | 'debuff-self' | 'debuff-enemy';
}

export type CombatLowHpAction = 'town' | 'teleport';
export type PotionType = 'red' | 'orange' | 'white';
export type SpeedPotionType = 'green' | 'enhanced-green';

/**
 * 旅館價格（`13-town.md` § 13.7）。
 *
 * 手動使用（`components/town/Inn.tsx`）與補給天賦的「使用旅館」共用同一份 ——
 * 兩邊各抄一份的話，改價時一定有一邊忘了。
 */
export const INN_PRICES = { full: 50, hpOnly: 30, mpOnly: 20 } as const;

export const POTION_CONFIG: Record<PotionType, { itemId: number; healMin: number; healMax: number; cooldown: number; name: string }> = {
  red: { itemId: 1, healMin: 10, healMax: 15, cooldown: 600, name: '紅色藥水' },
  orange: { itemId: 2, healMin: 30, healMax: 45, cooldown: 900, name: '橙色藥水' },
  white: { itemId: 3, healMin: 60, healMax: 90, cooldown: 1500, name: '白色藥水' },
};

export const SPEED_POTION_CONFIG: Record<SpeedPotionType, { itemId: number; duration: number; name: string }> = {
  green: { itemId: 133, duration: 180000, name: '綠色藥水' },
  'enhanced-green': { itemId: 134, duration: 900000, name: '強化綠色藥水' },
};

export function getPotionName(type: PotionType): string {
  return getItemById(POTION_CONFIG[type].itemId)?.name ?? POTION_CONFIG[type].name;
}

export function getPotionCount(bagItems: BagItem[], type: PotionType): number {
  return getBagItemAmount(bagItems, POTION_CONFIG[type].itemId);
}

export function addPotionToBag(bagItems: BagItem[], type: PotionType, amount: number): BagItem[] {
  return addBagItem(bagItems, POTION_CONFIG[type].itemId, amount);
}

export function consumePotionFromBag(bagItems: BagItem[], type: PotionType): BagItem[] {
  return consumeBagItem(bagItems, POTION_CONFIG[type].itemId);
}

/** § 35.1：背包基礎格數。腰帶可再擴充，見 `getBagMaxSlots()` */
export const BAG_BASE_SLOTS = 60;

/**
 * 背包實際格數 = 基礎 60 + 腰帶的 `bonusBagSlots`（§ 35.1）。
 * 腰帶最高 +20，因此上限為 80 格。
 */
export function getBagMaxSlots(gear: EquippedGear): number {
  const bonus = Object.values(gear).reduce(
    (sum, item) => sum + (item?.bonusBagSlots ?? 0),
    0,
  );
  return BAG_BASE_SLOTS + bonus;
}

/** 身上的裝備件數。裝備中的裝備一樣留在背包格上並佔格（§ 35.1） */
export function getEquippedCount(gear: EquippedGear): number {
  return Object.values(gear).filter(Boolean).length;
}

/**
 * 已用格數（§ 35.1）＝ 消耗品種類 + 背包裝備 + **身上裝備**，**不含印記**。
 *
 * 裝備中的裝備沒有離開背包，只是多一個「裝備中」標記，因此一樣佔格 ——
 * 穿脫只是同一格換個狀態，不再有佔格增減。
 *
 * 印記走獨立分頁、完全不進格數體系（§ 35.20），所以在這裡就濾掉 ——
 * 容量檢查的入口有十來個，讓每個入口各自記得排除印記必然會漏。
 */
export function getBagUsedSlots(
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
  gear: EquippedGear,
): number {
  const countable = bagItems.filter(b => !isSigilItemId(b.itemId)).length;
  return countable + inventory.length + getEquippedCount(gear);
}

export function isBagFull(
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
  gear: EquippedGear,
): boolean {
  return getBagUsedSlots(bagItems, inventory, gear) >= getBagMaxSlots(gear);
}

/**
 * 換裝後背包是否會超出上限（§ 35.1）。
 *
 * 裝備中一樣佔格，所以**穿脫不會改變佔格數** —— 同一件東西只是從「背包裡」
 * 換成「裝備中」，格子沒動。唯一還會溢出的是腰帶：換掉／卸下腰帶會讓**上限下降**，
 * 因此必須用換裝後的狀態一起判定，不能只看目前是否已滿。
 *
 * @param inventoryAfter 換裝後的背包裝備清單
 * @param gearAfter      換裝後的裝備狀態（佔格與上限都依這份算）
 */
export function wouldOverflowBag(
  bagItems: BagItem[],
  inventoryAfter: EquipmentInstance[],
  gearAfter: EquippedGear,
): boolean {
  return getBagUsedSlots(bagItems, inventoryAfter, gearAfter) > getBagMaxSlots(gearAfter);
}

/**
 * § 35.5.3：從背包拖到地圖上、等待玩家確認的丟棄請求。
 * 堆疊物品會在確認視窗讓玩家選擇數量。
 */
export interface PendingDiscard {
  kind: 'bag' | 'equipment';
  /** 顯示用名稱。裝備用實例名，背包物品由 `itemId` 反查 */
  name: string;
  /** kind === 'bag' 時的道具 id（丟棄一律以 id 定位） */
  itemId?: number;
  /** 可丟棄的最大數量（裝備恆為 1） */
  maxAmount: number;
  /** kind === 'equipment' 時的實例 id */
  equipmentId?: number;
}

export type { BagItem } from '../models/bagItem';

export interface CharacterSummary {
  id: number;
  name: string;
  className: ClassName;
  level: number;
  /**
   * 建角配點 + Lv.51+ 升級配點，**不含裝備與 buff**（`20-attributes.md` § 20.10）。
   * 角色選擇畫面只表達角色本身的成長，換裝不該讓這裡的數字跳動。
   */
  attributes: Attributes;
}

interface GameState {
  phase: GamePhase;
  userId: number | null;
  characterList: CharacterSummary[];
  character: Character | null;
  equippedGear: EquippedGear;
  inventory: EquipmentInstance[];
  bagItems: BagItem[];
  skills: Skill[];
  combatLogs: CombatLog[];
  lastDropResult: DropResult | null;
  gameLoopId: number | null;
  hpRegenId: number | null;
  mpRegenId: number | null;
  scriptRules: ScriptRule[];
  /**
   * 腳本 template（`03-combat.md` § 3.14）。
   * 戰鬥／常駐／緊急撤退**唯一的真相在這裡**，不另存頂層鏡像 ——
   * 兩份互相同步的資料必然會不同步，症狀是「面板顯示 A、實際跑 B」。
   * 讀取一律走 `selectCombatRules` / `selectPersistentRules` / `selectEmergencyRetreat`。
   */
  scriptTemplates: ScriptTemplate[];
  activeTemplateId: string;
  persistentLoopId: number | null;
  lastPotionUsedAt: number;
  lastPotionCooldown: number;
  /** 上次掛機點（`49-village-script.md` § 49.5）。進入非城鎮區域時記下來 */
  lastHuntLocation: HuntLocation | null;
  /** 待返回掛機點（§ 49.5）。只有自動回城設起，回到野外清除 */
  huntReturnPending: boolean;
  /** 村莊腳本上次判定的時間戳。它會花錢與存檔，不需要跟常駐腳本一樣快 */
  lastVillageTickAt: number;
  searchMode: SearchMode;
  afterCombatHpThreshold: number;
  afterCombatMpThreshold: number;
  afterCombatHpResumeThreshold: number;
  afterCombatMpResumeThreshold: number;
  quickSlots: QuickSlots;
  /**
   * 背包格子位置（`35-inventory-constraints.md` § 35.1.3、§ 35.17）。
   * 只收錄被拖曳或整理過的項目，存在獨立的 localStorage key，
   * **不隨角色匯出** —— 匯入會重發裝備實例 id，帶過去必然全部對不上。
   */
  bagSlotMap: BagSlotMap;
  storedEquipment: EquipmentInstance[];
  storedMaterials: BagItem[];
  warehouseGold: number;
  personalStoredEquipment: EquipmentInstance[];
  personalStoredMaterials: BagItem[];
  activeEffects: ActiveEffect[];
  adventurerQuests: AdventurerQuest[];
  /** 任務板：一般分頁 D/C/B/A/S 與 BOSS 分頁 B+/A+/S+（§ 36.6.1） */
  adventurerQuestBoard: Record<AdventurerQuestDifficulty, AdventurerQuest[]>;
  questBoardTownId: QuestTownId | null;
  guildProgress: GuildProgress;
  /** 製作任務（§ 36.13）。上限與冒險者工會分開計算 */
  craftQuests: CraftQuest[];
  statistics: CharacterStatistics;

  setPhase: (phase: GamePhase) => void;
  initUser: () => Promise<void>;
  loadCharacterList: () => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  /** 純本機刪除。刪角不通知伺服端（§ 37.4.3），榜上舊列靠版本跳號清掉。 */
  deleteCharacter: (characterId: number) => Promise<void>;
  logout: () => Promise<void>;
  /** `uuid` 與 `authToken` 皆於此產生，建立角色是純本機行為、不需要連線（§ 19.4）。 */
  createCharacter: (name: string, className: ClassName, bonusAttrs: Attributes, appearance?: Appearance) => Promise<void>;
  /** 取得目前角色的排行榜寫入密鑰；此機制上線前建立的角色在此補產生（TOFU，§ 37.4.3）。 */
  ensureAuthToken: () => Promise<string | null>;
  /**
   * 上傳目前角色的統計（§ 37.4.5）。`force` 略過 10 分鐘節流與「數值未變」判定，
   * 匯出前要用它把密鑰在伺服端綁定好。回傳結果碼供 UI 決定提示文字。
   */
  uploadOwnStats: (options?: { force?: boolean }) => Promise<StatsUploadResult>;
  loadCharacter: () => Promise<boolean>;
  startExploring: () => void;
  stopExploring: () => void;
  setSearchMode: (mode: SearchMode) => void;
  startRegen: () => void;
  stopRegen: () => void;
  equipItem: (item: EquipmentInstance) => void;
  unequipItem: (slot: keyof EquippedGear) => void;
  usePotion: () => void;
  usePotionByType: (type: PotionType) => void;
  useSpeedPotion: (type: SpeedPotionType) => void;
  assignQuickSlot: (slotIdx: number, entry: QuickSlotEntry | null) => void;
  /** § 35.1.3：寫入背包格子位置（拖曳與整理共用），同時持久化到本機 */
  setBagSlotMap: (slotMap: BagSlotMap) => void;
  useQuickSlot: (slotIdx: number) => void;
  /**
   * 快捷格的手動施放（`03-combat.md` § 3.6.2）。回傳是否受理。
   *
   * 攻擊技能排進下一個攻擊 tick；buff／治癒立即施放。
   * CD／MP／武器不符當場拒絕並發日誌，**不排隊**。
   */
  castQuickSlotSkill: (skillId: string) => boolean;
  /**
   * 對自己施放 buff／治癒技能。回傳是否真的放出去。
   * 常駐腳本與快捷格手動施放共用這一支，不可各寫一套。
   */
  castSelfSkill: (skillId: string) => boolean;
  useTownScroll: (scrollItemId: number) => void;
  useCureItem: (itemId: number) => void;
  changeArea: (areaId: string) => void;
  navigateTo: (location: MapLocation) => void;
  setScriptRules: (rules: ScriptRule[]) => void;
  setEmergencyRetreat: (retreat: EmergencyRetreat) => void;
  /** 切換使用中的 template；id 不存在時不動作 */
  setActiveTemplate: (id: string) => void;
  /** 新增一頁（內容為預設腳本），並立刻切過去 */
  addScriptTemplate: () => void;
  /** 複製指定 template，並立刻切過去 */
  duplicateScriptTemplate: (id: string) => void;
  renameScriptTemplate: (id: string, name: string) => void;
  /** 刪除 template；預設 template（`DEFAULT_TEMPLATE_ID`）不可刪 */
  removeScriptTemplate: (id: string) => void;
  startPersistentLoop: () => void;
  stopPersistentLoop: () => void;
  rememberHuntLocation: () => void;
  /** 村莊腳本判定一輪（由常駐迴圈帶動，見 `49-village-script.md`） */
  runVillageScriptTick: () => void;
  addEffect: (effect: ActiveEffect) => void;
  removeEffect: (id: string) => void;
  clearExpiredEffects: () => void;
  discardBagItem: (itemId: number, amount?: number) => void;
  /** 賣掉背包道具，回傳獲得金幣（`39-batch-sell.md`；定價見 `systems/shop.ts`） */
  sellBagItems: (lines: { itemId: number; amount: number }[]) => number;
  /** 買進背包道具，回傳花費金幣；金幣不足時不成交回 0 */
  buyBagItems: (lines: { itemId: number; amount: number; unitPrice: number }[]) => number;
  /**
   * 賣掉裝備實例，回傳獲得金幣。
   * 模板要由呼叫端傳進來 —— 價格算不出來就等於 0 元成交，
   * 讓依賴的模板從參數走，就不會有「快取還沒暖起來就白送」這種靜默失敗。
   */
  sellEquipmentInstances: (ids: number[], templates: EquipmentTemplate[]) => number;
  /**
   * === 倉庫存取（`13-town.md` § 13.8）===
   * 手動存取與村莊腳本的自動存取共用這兩個 action。
   */
  depositToWarehouse: (params: WarehouseMove) => void;
  withdrawFromWarehouse: (params: WarehouseMove) => void;
  /** 共用倉庫金幣（跨角色轉移用）。回傳實際搬動的金額 */
  depositWarehouseGold: (amount: number) => number;
  withdrawWarehouseGold: (amount: number) => number;
  discardInventoryItem: (id: number) => void;
  /** § 35.5.3：拖出背包後等待確認的丟棄請求 */
  pendingDiscard: PendingDiscard | null;
  requestDiscard: (req: PendingDiscard) => void;
  cancelDiscard: () => void;
  confirmDiscard: (amount: number) => void;
  spendAttributePoint: (attr: keyof Attributes) => void;
  acceptQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
  acceptAdventurerQuest: (quest: AdventurerQuest) => void;
  abandonAdventurerQuest: (questId: string) => void;
  completeAdventurerQuest: (questId: string) => void;
  refreshQuestBoard: (difficulty: AdventurerQuestDifficulty) => void;
  /** § 36.6.3：花 50 貢獻重刷單一分頁 */
  rerollQuestBoard: (difficulty: AdventurerQuestDifficulty) => void;
  initQuestBoard: () => void;
  /** 加入製作追蹤（§ 36.13.2）。滿 3 個或已追蹤同配方時不做事 */
  acceptCraftQuest: (templateId: number) => void;
  /** 取消製作任務（§ 36.13.5）。無代價，不動貢獻 */
  abandonCraftQuest: (questId: string) => void;
  saveState: () => void;
  /** 推一則系統訊息到戰鬥日誌。面板動作的提示與結果一律走這裡，不各自持有 log 陣列 */
  pushSystemLog: (text: string) => void;
}

/**
 * 倉庫金幣輸入框空白時 `parseInt('')` 產生 NaN，把身上與倉庫的餘額一起寫成 NaN，
 * 金額本身無法從存檔還原。這是那一次事故的一次性補回，每個瀏覽器只執行一次。
 * 補回後即可刪除本區塊與 `takeGoldNaNRepair()` 的呼叫點。
 */
const GOLD_NAN_REPAIR_AMOUNT = 2_379_024;
const GOLD_NAN_REPAIR_KEY = 'mayana_gold_nan_repair';

function takeGoldNaNRepair(): number {
  if (localStorage.getItem(GOLD_NAN_REPAIR_KEY)) return 0;
  localStorage.setItem(GOLD_NAN_REPAIR_KEY, '1');
  return GOLD_NAN_REPAIR_AMOUNT;
}

const MAX_LOGS = 200;

/**
 * § 24.5.1 / § 24.10.1：暈眩狀態下無法使用任何道具
 * 回傳 true 表示本次使用被暈眩阻擋。
 */
function blockedByStun(
  state: { activeEffects: ActiveEffect[]; combatLogs: CombatLog[] },
  set: (partial: Partial<GameState>) => void,
): boolean {
  if (!isPlayerStunned(state.activeEffects)) return false;
  set({ combatLogs: addLog(state.combatLogs, { text: '暈眩中，無法使用道具', type: 'system' }) });
  return true;
}

function addLog(logs: CombatLog[], entry: CombatLog): CombatLog[] {
  const next = [...logs, entry];
  return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
}

/**
 * 最大 HP／MP 的詞綴是**固定值**（`07-affix.md` § 7.3.1），直接加算，不是百分比。
 * 飾品模板的 `bonusHp`／`bonusMp` 仍是另一個加算來源。
 */
export function getEffectiveMaxHp(char: Character, gear: EquippedGear, activeEffects: ActiveEffect[] = []): number {
  const allGear = getEffectiveGearArray(char, activeEffects, gear);
  const bonuses = getAffixBonusesFromGear(allGear);
  const flatHp = allGear.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0);
  return char.maxHp + flatHp + bonuses.max_hp;
}

export function getEffectiveMaxMp(char: Character, gear: EquippedGear, activeEffects: ActiveEffect[] = []): number {
  const allGear = getEffectiveGearArray(char, activeEffects, gear);
  const bonuses = getAffixBonusesFromGear(allGear);
  const flatMp = allGear.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0);
  return char.maxMp + flatMp + bonuses.max_mp;
}

function isInArpgCombat(): boolean {
  const monsters = useMapMonsterStore.getState().monsters;
  if (monsters.length === 0) return false;
  const playerPos = useMapControlStore.getState().playerPosition;
  return monsters.some((m: any) => {
    const dx = m.position.x - playerPos.x;
    const dy = m.position.y - playerPos.y;
    return Math.sqrt(dx * dx + dy * dy) <= 8;
  });
}

// === 腳本 template selector（唯一真相在 scriptTemplates，讀取一律走這裡）===

export function selectActiveTemplate(state: GameState): ScriptTemplate {
  return resolveActiveTemplate(state.scriptTemplates, state.activeTemplateId);
}

export function selectEmergencyRetreat(state: GameState): EmergencyRetreat {
  return selectActiveTemplate(state).emergencyRetreat;
}

type StoreSet = (partial: Partial<GameState>) => void;
type StoreGet = () => GameState;

function persistTemplates(get: StoreGet): void {
  const char = get().character;
  if (char?.id) saveLocalPreferences(char.id, get());
}

/** 所有腳本編輯都寫進「使用中的那一頁」，寫完立刻持久化 */
function updateActiveTemplate(
  set: StoreSet,
  get: StoreGet,
  updater: (template: ScriptTemplate) => ScriptTemplate,
): void {
  const activeId = selectActiveTemplate(get()).id;
  set({
    scriptTemplates: get().scriptTemplates.map(t => (t.id === activeId ? updater(t) : t)),
  });
  persistTemplates(get);
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'title',
  userId: null,
  characterList: [],
  character: null,
  equippedGear: {},
  inventory: [],
  bagItems: [],
  skills: [],
  combatLogs: [],
  lastDropResult: null,
  gameLoopId: null,
  hpRegenId: null,
  mpRegenId: null,
  scriptRules: DEFAULT_SCRIPT,
  scriptTemplates: [createDefaultTemplate()],
  activeTemplateId: DEFAULT_TEMPLATE_ID,
  persistentLoopId: null,
  lastPotionUsedAt: 0,
  lastPotionCooldown: 0,
  lastHuntLocation: null,
  huntReturnPending: false,
  lastVillageTickAt: 0,
  searchMode: 'auto',
  afterCombatHpThreshold: 30,
  afterCombatMpThreshold: 20,
  afterCombatHpResumeThreshold: 60,
  afterCombatMpResumeThreshold: 60,
  quickSlots: emptyQuickSlots(),
  bagSlotMap: {},
  storedEquipment: [],
  storedMaterials: [],
  warehouseGold: 0,
  personalStoredEquipment: [],
  personalStoredMaterials: [],
  activeEffects: [],
  adventurerQuests: [],
  adventurerQuestBoard: createEmptyQuestBoard(),
  questBoardTownId: null,
  guildProgress: { rank: 'F', points: 0 },
  craftQuests: [],
  statistics: createDefaultStatistics(),

  setPhase: (phase) => set({ phase }),

  initUser: async () => {
    const existingUser = await db.users.orderBy('createdAt').first();
    if (existingUser) {
      set({ userId: existingUser.id! });
    } else {
      const id = await db.users.add({ createdAt: Date.now() });
      set({ userId: id as number });
    }
  },

  loadCharacterList: async () => {
    const userId = get().userId;
    if (!userId) return;
    const chars = await db.characters.where('userId').equals(userId).toArray();
    const list: CharacterSummary[] = chars.map(c => ({
      id: c.id!,
      name: c.name,
      className: c.className,
      level: c.level,
      // 不傳 equippedGear / activeEffects：角色選擇畫面只算建角配點 + Lv.51+ 配點
      attributes: getTotalAttributes(c),
    }));
    set({ characterList: list, phase: 'characterSelect' });
  },

  selectCharacter: async (characterId) => {
    const char = await db.characters.get(characterId);
    if (!char) return;

    // 開機時已掃過一次，這裡是保險：匯入還原的角色也可能帶著過期的 dataVersion。
    // 一律走同一個清除流程，避免兩處邏輯不一致而留下孤兒資料。
    if (!char.dataVersion || char.dataVersion < CURRENT_DATA_VERSION) {
      await purgeOutdatedData();
      await get().loadCharacterList();
      return;
    }

    const items = await db.equipmentInstances.where('ownerId').equals(char.id!).toArray();
    const equipped: EquippedGear = {};
    const inventory: EquipmentInstance[] = [];
    const personalStoredEquipItems: EquipmentInstance[] = [];
    for (const item of items) {
      const resolved = resolveEquipment(item);
      if (resolved.equipped) {
        equipped[resolved.slot] = resolved;
      } else if (resolved.inStorage && resolved.storageType === 'personal') {
        personalStoredEquipItems.push(resolved);
      } else if (!resolved.inStorage) {
        inventory.push(resolved);
      }
    }

    // Load shared warehouse equipment (ownerId = userId)
    const userId = get().userId!;
    const sharedEquipItems = await db.equipmentInstances
      .where('ownerId').equals(userId)
      .filter(item => item.inStorage === true && item.storageType === 'shared')
      .toArray();
    const storedEquipItems: EquipmentInstance[] = sharedEquipItems.map(resolveEquipment);

    const bagRows = await db.characterBag.where('characterId').equals(char.id!).toArray();
    // 名稱與分頁一律由 id 反查（§ 99.1），DB 列裡的舊 name 只是遷移殘留，不採用
    const bagItems: BagItem[] = bagRows
      .map(row => makeBagItem(row.itemTemplateId!, row.amount))
      .filter((b): b is BagItem => b !== null);

    // Load warehouse materials (account-level shared storage)
    const warehouseRows = await db.warehouses.where('userId').equals(userId)
      .filter(row => !row.storageType || row.storageType === 'shared')
      .toArray();
    const storedMaterials: BagItem[] = [];
    for (const row of warehouseRows) {
      if (row.type !== 'equipment') {
        const entry = makeBagItem(row.itemTemplateId!, row.amount);
        if (entry) storedMaterials.push(entry);
      }
    }
    // 金幣是餘額不是物品，自 v16 起存在獨立表（`18-data-schema.md` § 18.7）
    const storedWarehouseGold = (await db.warehouseGold.get(userId))?.amount ?? 0;
    const warehouseGold = Number.isFinite(storedWarehouseGold) ? storedWarehouseGold : 0;

    // Load personal warehouse materials (character-level storage)
    const personalWarehouseRows = await db.warehouses
      .where('characterId').equals(char.id!)
      .filter(row => row.storageType === 'personal')
      .toArray();
    const personalStoredMaterials: BagItem[] = [];
    for (const row of personalWarehouseRows) {
      if (row.type !== 'equipment') {
        const entry = makeBagItem(row.itemTemplateId!, row.amount);
        if (entry) personalStoredMaterials.push(entry);
      }
    }

    const prefs = loadLocalPreferences(char.id!);
    const scriptRules = prefs?.scriptRules ?? DEFAULT_SCRIPT;
    const scriptTemplates = prefs?.scriptTemplates ?? [createDefaultTemplate()];
    const activeTemplateId = prefs?.activeTemplateId ?? DEFAULT_TEMPLATE_ID;
    const lastHuntLocation = prefs?.lastHuntLocation ?? null;
    const huntReturnPending = prefs?.huntReturnPending ?? false;
    // 技能格指向未習得的技能時剔除（§ 35.7.4）；名單取自這隻角色實際學到的招
    const quickSlots = normalizeQuickSlots(
      prefs?.quickSlots,
      new Set((char.skills ?? []).map(s => s.id)),
    );
    // § 35.17：格子位置不在 prefs 裡，走獨立 key（不隨角色匯出）
    const bagSlotMap = loadBagLayout(char.id!);
    const afterCombatHpThreshold = prefs?.afterCombatHpThreshold ?? 30;
    const afterCombatMpThreshold = prefs?.afterCombatMpThreshold ?? 20;
    const afterCombatHpResumeThreshold = prefs?.afterCombatHpResumeThreshold ?? 60;
    const afterCombatMpResumeThreshold = prefs?.afterCombatMpResumeThreshold ?? 60;
    const adventurerQuests = prefs?.adventurerQuests ?? [];
    const guildProgress = prefs?.guildProgress ?? { rank: 'F', points: 0 };
    const craftQuests = prefs?.craftQuests ?? [];
    // 舊存檔缺少後來新增的統計欄位，補上預設值
    const statistics = normalizeStatistics(prefs?.statistics);

    // Reset areaEnteredAt so pressure doesn't accumulate during character select
    char.areaEnteredAt = Date.now();
    char.areaKills = 0;

    // 離線時長換成加倍存量（`04-character.md` § 4.11）
    Object.assign(char, accrueRestedExp(char, Date.now()));

    // Backfill unspent attribute points for legacy characters above level 50
    if (char.unspentAttributePoints == null) {
      char.unspentAttributePoints = char.level > 50 ? char.level - 50 : 0;
    }

    // Backfill quests for legacy characters
    if (!char.quests) {
      char.quests = [];
    }

    // 讀檔防線：存檔裡的金幣曾被 NaN 汙染過，NaN 會沿著每次加減擴散出去
    const goldCorrupted = !Number.isFinite(char.gold) || !Number.isFinite(storedWarehouseGold);
    if (!Number.isFinite(char.gold)) char.gold = 0;
    if (goldCorrupted) char.gold += takeGoldNaNRepair();

    set({
      character: char,
      equippedGear: equipped,
      inventory,
      skills: (char.skills ?? []).map(s => {
        return instantiateFromTemplate(s.id, s.lastUsedAt ?? 0);
      }).filter(Boolean) as Skill[],
      bagItems,
      storedMaterials,
      storedEquipment: storedEquipItems,
      warehouseGold,
      personalStoredEquipment: personalStoredEquipItems,
      personalStoredMaterials,
      scriptRules,
      scriptTemplates,
      activeTemplateId,
      lastHuntLocation,
      huntReturnPending,
      quickSlots,
      bagSlotMap,
      afterCombatHpThreshold,
      afterCombatMpThreshold,
      afterCombatHpResumeThreshold,
      afterCombatMpResumeThreshold,
      adventurerQuests,
      guildProgress,
      craftQuests,
      statistics,
      phase: 'explore',
    });
    get().startRegen();
    get().startPersistentLoop();
    get().initQuestBoard();

    startTalentAndMailboxInit(char.id!, char.level);
    const region = getRegion(char.currentRegion);
    if (region?.type !== 'town') {
      get().startExploring();
    }
  },

  ensureAuthToken: async () => {
    const char = get().character;
    if (!char?.id) return null;

    const authToken = await ensureCharacterAuthToken(char.id);
    if (authToken && authToken !== char.authToken) {
      set({ character: { ...char, authToken } });
    }
    return authToken;
  },

  uploadOwnStats: async (options = {}) => {
    const { character, statistics, guildProgress } = get();
    if (!character?.uuid || !statistics) return 'skipped';

    const authToken = await get().ensureAuthToken();
    if (!authToken) return 'skipped';

    const payload = {
      character_id: character.uuid,
      character_name: character.name,
      auth_token: authToken,
      class_name: character.className,
      character_level: character.level,
      monstersKilled: statistics.monstersKilled,
      bossesKilled: statistics.bossesKilled,
      deathCount: statistics.deathCount,
      equipmentCrafted: statistics.equipmentCrafted,
      weaponEnhanceAttempts: statistics.weaponEnhanceAttempts,
      armorEnhanceAttempts: statistics.armorEnhanceAttempts,
      weaponsBroken: statistics.weaponsBroken,
      armorsBroken: statistics.armorsBroken,
      questsCompleted: statistics.questsCompleted,
      totalGoldEarned: statistics.totalGoldEarned,
      tier7WeaponsLooted: statistics.tier7WeaponsLooted,
      tier7ArmorsLooted: statistics.tier7ArmorsLooted,
      contribution: guildProgress.points,
    };

    // 節流 + 數值未變則完全不送出（見 leaderboardService.shouldUploadStats）
    if (!options.force && !shouldUploadStats(character.uuid, payload)) return 'skipped';

    try {
      // upsert：首次上傳直接建列並綁定密鑰，不需要事先註冊
      await uploadStats(payload);
      markStatsUploaded(character.uuid, payload);
      return 'uploaded';
    } catch (err) {
      if (!(err instanceof LeaderboardError)) return 'failed';
      if (err.code === 'invalid_auth_token') return 'invalid_auth_token';
      if (err.code === 'outdated_client') return 'outdated_client';
      if (err.code === 'invalid_name') return 'invalid_name';
      return 'failed';
    }
  },

  deleteCharacter: async (characterId) => {
    await db.equipmentInstances.where('ownerId').equals(characterId)
      .filter(item => item.storageType !== 'shared')
      .delete();
    await db.characterBag.where('characterId').equals(characterId).delete();
    await db.warehouses.where('characterId').equals(characterId)
      .filter(row => row.storageType === 'personal')
      .delete();
    /*
     * characterId 會被重用，下列各項必須一併清除：
     * 天賦格、未領取的信、背包排列（§ 35.17）、天賦分頁順序、換版清理的版本戳記。
     */
    await db.talentSlots.where('characterId').equals(characterId).delete();
    await db.mailbox.where('characterId').equals(characterId).delete();
    await db.characters.delete(characterId);
    localStorage.removeItem(`mayana_prefs_${characterId}`);
    localStorage.removeItem(bagLayoutStorageKey(characterId));
    localStorage.removeItem(talentBagOrderStorageKey(characterId));
    localStorage.removeItem(mailPurgeStorageKey(characterId));
    if (get().character?.id === characterId) {
      useTalentStore.getState().reset();
      useMailboxStore.getState().reset();
    }
    await get().loadCharacterList();
  },

  logout: async () => {
    get().stopExploring();
    get().stopRegen();
    get().stopPersistentLoop();
    await saveGame(get());
    set({
      character: null,
      equippedGear: {},
      inventory: [],
      bagItems: [],
      skills: [],
      combatLogs: [],
      storedEquipment: [],
      personalStoredEquipment: [],
      personalStoredMaterials: [],
      activeEffects: [],
      scriptRules: DEFAULT_SCRIPT,
      scriptTemplates: [createDefaultTemplate()],
      activeTemplateId: DEFAULT_TEMPLATE_ID,
      quickSlots: emptyQuickSlots(),
      bagSlotMap: {},
      adventurerQuests: [],
      adventurerQuestBoard: createEmptyQuestBoard(),
  questBoardTownId: null,
      guildProgress: { rank: 'F', points: 0 },
      craftQuests: [],
    });
    // 天賦與信箱是獨立 store，不跟著 set 清掉的話會留著上一隻角色的資料
    useTalentStore.getState().reset();
    useMailboxStore.getState().reset();
    await get().loadCharacterList();
  },

  createCharacter: async (name, className, bonusAttrs, appearance) => {
    const userId = get().userId;
    if (!userId) return;

    // Check character limit (max 4)
    const existingCount = await db.characters.where('userId').equals(userId).count();
    if (existingCount >= 4) return;

    const base = CLASS_BASE_ATTRIBUTES[className];

    // Determine starting skills based on class
    const startingSkills: Skill[] = [];
    if (className === 'elementalist' || className === 'priest') {
      startingSkills.push({ ...SKILL_WIND_BLADE });
    }

    const char: Character = {
      uuid: generateCharacterUuid(),
      // 密鑰只存在本機與匯出檔，伺服端只拿得到 SHA-256（§ 37.4.3）
      authToken: generateCharacterUuid(),
      userId,
      name,
      // 沒指定就給預設外觀 —— 角色一定要有外觀才畫得出來
      appearance: normalizeAppearance(appearance),
      className,
      level: 1,
      exp: 0,
      expToNext: getExpToNextLevel(1),
      hp: INITIAL_HP,
      maxHp: INITIAL_HP,
      mp: INITIAL_MP,
      maxMp: INITIAL_MP,
      baseAttributes: { ...base },
      bonusAttributes: bonusAttrs,
      unspentAttributePoints: 0,
      gold: 100,
      currentArea: 'neutral-town',
      currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town',
      currentFloor: null,
      skills: startingSkills,
      quests: [],
      areaEnteredAt: Date.now(),
      areaKills: 0,
      restedExpMs: 0,
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      dataVersion: CURRENT_DATA_VERSION,
    };
    const id = await db.characters.add(char);
    char.id = id as number;

    // 創角直接穿上整套新手裝（裝備Tier 1）。清單與新手指導員共用
    // `STARTER_GEAR_MAP`，不要在這裡另外推導一份。
    // 舊版寫死「短劍／木弓…＋皮甲」，發的其實是商店貨而不是新手裝，
    // 而且只有武器與胸甲兩件。
    const starterNames = new Set(getStarterGearNames(className));
    const starterTemplates = (await db.equipmentTemplates.toArray())
      .filter(t => starterNames.has(t.name));

    const equippedGear: EquippedGear = {};
    for (const template of starterTemplates) {
      const dbRecord = {
        templateId: template.id!, slot: template.slot, quality: 0, enhancement: 0, affixes: [] as any[],
        ...rollNewInstanceFields(template),
        ownerId: char.id!, equipped: true, isStarterGear: true,
      };
      const instId = await db.equipmentInstances.add(dbRecord as any);
      equippedGear[template.slot as keyof EquippedGear] = resolveEquipment({
        id: instId as number, templateId: template.id!, name: template.name, type: template.type,
        slot: template.slot, isTwoHanded: template.isTwoHanded,
        quality: 0, enhancement: 0, affixes: [], ...rollNewInstanceFields(template),
        ownerId: char.id!, equipped: true, isStarterGear: true,
      });
    }

    // Save initial bag items to DB
    const starterBag = addPotionToBag([], 'red', 10);
    await db.characterBag.bulkAdd(starterBag.map(item => ({
      characterId: char.id!, name: item.name, type: item.type, itemTemplateId: item.itemId, amount: item.amount,
    })));

    set({
      character: char,
      equippedGear,
      inventory: [],
      skills: startingSkills,
      bagItems: starterBag,
      adventurerQuests: [],
      adventurerQuestBoard: createEmptyQuestBoard(),
  questBoardTownId: null,
      guildProgress: { rank: 'F', points: 0 },
      craftQuests: [],
      phase: 'explore',
    });
    get().startRegen();
    // 常駐迴圈同時餵常駐天賦、緊急撤退與補給天賦（`runVillageScriptTick`）。
    // 少這一行的話新角色要登出重進才會有這三樣，而且不會報錯。
    get().startPersistentLoop();
    get().initQuestBoard();
    startTalentAndMailboxInit(char.id!, char.level);
  },

  loadCharacter: async () => {
    const userId = get().userId;
    if (!userId) return false;
    const char = await db.characters.where('userId').equals(userId).last();
    if (!char) return false;
    await get().selectCharacter(char.id!);
    return true;
  },

  startExploring: () => {
    const existing = get().gameLoopId;
    if (existing) clearInterval(existing);

    // Map control system handles encounter via red dot collision
    // Only keep the HP/MP regen wait check for the old non-map flow
    set({ gameLoopId: null });
  },

  stopExploring: () => {
    const id = get().gameLoopId;
    if (id) clearInterval(id);
    set({ gameLoopId: null });
  },

  setSearchMode: (mode) => {
    set({ searchMode: mode });
    if (mode === 'auto') {
      get().startExploring();
    } else {
      get().stopExploring();
    }
  },

  startRegen: () => {
    get().stopRegen();

    const hpId = window.setInterval(() => {
      const state = get();
      if (!state.character || state.character.hp <= 0) return;
      const effMaxHp = getEffectiveMaxHp(state.character, state.equippedGear);
      if (state.character.hp >= effMaxHp) return;
      const inCombat = state.phase === 'combat' || isInArpgCombat();
      const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
      const regen = getHpRegen(state.character, inCombat, allGear, state.activeEffects);
      if (regen <= 0) return;
      const newHp = Math.min(effMaxHp, state.character.hp + regen);
      set({ character: { ...state.character, hp: newHp } });
    }, HP_REGEN_INTERVAL_MS);

    const mpId = window.setInterval(() => {
      const state = get();
      if (!state.character || state.character.hp <= 0) return;
      const effMaxMp = getEffectiveMaxMp(state.character, state.equippedGear);
      if (state.character.mp >= effMaxMp) return;
      const inCombat = state.phase === 'combat' || isInArpgCombat();
      const allGearMp = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
      const regen = getMpRegen(state.character, inCombat, allGearMp, state.activeEffects);
      if (regen <= 0) return;
      const newMp = Math.min(effMaxMp, state.character.mp + regen);
      set({ character: { ...state.character, mp: newMp } });
    }, MP_REGEN_INTERVAL_MS);

    set({ hpRegenId: hpId, mpRegenId: mpId });
  },

  stopRegen: () => {
    const { hpRegenId, mpRegenId } = get();
    if (hpRegenId) clearInterval(hpRegenId);
    if (mpRegenId) clearInterval(mpRegenId);
    set({ hpRegenId: null, mpRegenId: null });
  },

  equipItem: (item) => {
    const state = get();

    if (item.requiredClass && item.requiredClass.length > 0 && state.character) {
      if (!item.requiredClass.includes(state.character.className)) {
        return;
      }
    }

    const gear = { ...state.equippedGear };
    const inv = [...state.inventory];

    let targetSlot = item.slot;
    if (targetSlot === 'ring1' && gear['ring1'] && !gear['ring2']) {
      targetSlot = 'ring2';
    }

    /*
     * 雙手武器與副手的雙向互斥（`06-equipment.md` § 6.5）。
     *
     * **臂甲不在互斥範圍內**：它套在前臂上，手仍然是空的，
     * 所以雙手武器照樣裝得下（`occupiesHand()`）。盾牌與魔導書要握著，不行。
     */
    if (item.isTwoHanded) {
      const otherSlot = targetSlot === 'rightHand' ? 'leftHand' : 'rightHand';
      if (occupiesHand(gear[otherSlot])) {
        set({ combatLogs: addLog(state.combatLogs, { text: `無法裝備 ${item.name}，需先卸除副手裝備`, type: 'system' }) });
        return;
      }
    }
    if (!item.isTwoHanded && occupiesHand(item)) {
      const otherSlot = targetSlot === 'rightHand' ? 'leftHand' : 'rightHand';
      if (gear[otherSlot]?.isTwoHanded) {
        set({ combatLogs: addLog(state.combatLogs, { text: `無法裝備 ${item.name}，已裝備雙手武器`, type: 'system' }) });
        return;
      }
    }

    // § 35.1：裝備中一樣佔格，所以換裝的佔格數不變；會溢出的只有「換上格數較少的腰帶」
    const existingInSlot = gear[targetSlot];
    const gearAfterEquip: EquippedGear = { ...gear, [targetSlot]: item };
    const invAfterEquip = inv.filter(i => i.id !== item.id).concat(existingInSlot ? [existingInSlot] : []);
    if (wouldOverflowBag(state.bagItems, invAfterEquip, gearAfterEquip)) {
      const lostSlots = (existingInSlot?.bonusBagSlots ?? 0) - (item.bonusBagSlots ?? 0);
      set({
        combatLogs: addLog(state.combatLogs, {
          text: `背包空間不足，換上${item.name}會少 ${lostSlots} 格`,
          type: 'system',
        }),
      });
      return;
    }

    // Unequip existing item in slot
    const existing = gear[targetSlot];
    if (existing) {
      existing.equipped = false;
      inv.push(existing);
      db.equipmentInstances.update(existing.id!, { equipped: false });
    }

    // Equip
    gear[targetSlot] = item;
    item.equipped = true;
    item.slot = targetSlot;
    db.equipmentInstances.update(item.id!, { equipped: true, slot: targetSlot });

    const filtered = inv.filter(i => i.id !== item.id);
    set({ equippedGear: gear, inventory: filtered });
  },

  unequipItem: (slot) => {
    const state = get();
    const gear = { ...state.equippedGear };
    const item = gear[slot];
    if (!item) return;

    // § 35.1：卸下不會多佔格（裝備中本來就佔著），但卸下腰帶會降低上限，仍須以卸下後的狀態判定
    const gearAfter: EquippedGear = { ...state.equippedGear, [slot]: null };
    if (wouldOverflowBag(state.bagItems, [...state.inventory, item], gearAfter)) {
      const lostSlots = item.bonusBagSlots ?? 0;
      set({
        combatLogs: addLog(state.combatLogs, {
          text: lostSlots > 0
            ? `背包空間不足，卸下${item.name}會少 ${lostSlots} 格`
            : '背包已滿，無法卸除裝備',
          type: 'system',
        }),
      });
      return;
    }

    item.equipped = false;
    if (slot === 'ring2') {
      item.slot = 'ring1';
    }
    gear[slot] = null;
    db.equipmentInstances.update(item.id!, { equipped: false, slot: item.slot });
    set({ equippedGear: gear, inventory: [...state.inventory, item] });
  },

  usePotion: () => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;
    const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
    const effMaxHp = getEffectiveMaxHp(state.character, state.equippedGear);
    if (state.character.hp >= effMaxHp) {
      set({ combatLogs: addLog(state.combatLogs, { text: 'HP 已滿，無法使用藥水', type: 'system' }) });
      return;
    }
    let potionType: PotionType | null = null;
    if (getPotionCount(state.bagItems, 'red') > 0) potionType = 'red';
    if (getPotionCount(state.bagItems, 'orange') > 0) potionType = 'orange';
    if (getPotionCount(state.bagItems, 'white') > 0) potionType = 'white';
    if (!potionType) return;

    const config = POTION_CONFIG[potionType];
    const bonuses = getAffixBonusesFromGear(allGear);
    const baseHeal = Math.floor(Math.random() * (config.healMax - config.healMin + 1)) + config.healMin;
    const heal = Math.floor(baseHeal * (1 + bonuses.potion_effect / 100));
    const newHp = Math.min(effMaxHp, state.character.hp + heal);
    set({
      character: { ...state.character, hp: newHp },
      bagItems: consumePotionFromBag(state.bagItems, potionType),
      combatLogs: addLog(state.combatLogs, { text: `使用${config.name}回復 ${heal} HP`, type: 'system' }),
    });
    get().saveState();
  },

  usePotionByType: (type) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;
    const effMaxHp = getEffectiveMaxHp(state.character, state.equippedGear);
    if (state.character.hp >= effMaxHp) {
      set({ combatLogs: addLog(state.combatLogs, { text: 'HP 已滿，無法使用藥水', type: 'system' }) });
      return;
    }
    if (getPotionCount(state.bagItems, type) <= 0) return;

    const now = Date.now();
    const config = POTION_CONFIG[type];
    if (now - state.lastPotionUsedAt < state.lastPotionCooldown) return;

    const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
    const bonuses = getAffixBonusesFromGear(allGear);
    const baseHeal = Math.floor(Math.random() * (config.healMax - config.healMin + 1)) + config.healMin;
    const heal = Math.floor(baseHeal * (1 + bonuses.potion_effect / 100));
    const newHp = Math.min(effMaxHp, state.character.hp + heal);
    set({
      character: { ...state.character, hp: newHp },
      bagItems: consumePotionFromBag(state.bagItems, type),
      lastPotionUsedAt: now,
      lastPotionCooldown: config.cooldown,
      combatLogs: addLog(state.combatLogs, { text: `使用${config.name}回復 ${heal} HP`, type: 'system' }),
    });
    get().saveState();
  },

  useSpeedPotion: (type) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;
    const config = SPEED_POTION_CONFIG[type];
    if (!hasBagItem(state.bagItems, config.itemId)) return;

    const speedBuff: ActiveEffect = {
      id: `buff-speed-potion-${Date.now()}`,
      sourceSkillId: `speed-potion-${type}`,
      sourceSkillName: config.name,
      category: 'speed',
      type: 'buff',
      target: 'player',
      modifiers: [{ stat: 'attack_speed', value: 33, isPercent: true }],
      startTime: Date.now(),
      duration: config.duration,
      tags: [],
      name: config.name,
      description: '攻速+33%',
    };

    // 減速與加速互相抵銷（§ 24.4.6）
    const applied = applySpeedBuff(state.activeEffects, speedBuff);

    const newBag = consumeBagItem(state.bagItems, config.itemId);

    set({
      activeEffects: applied.effects,
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, applied.cancelledSlow
        ? { text: `使用${config.name}，解除減速`, type: 'debuff-self' }
        : { text: `使用${config.name}（攻速+33%）`, type: 'system' }),
    });
    get().saveState();
  },

  assignQuickSlot: (slotIdx, entry) => {
    if (slotIdx < 0 || slotIdx >= QUICK_SLOT_COUNT) return;
    const slots = [...get().quickSlots];
    // 同一個物品已在別格時先移除，避免重複佔格
    if (entry) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s) continue;
        if (s.kind === entry.kind
          && ((s.kind === 'potion' && entry.kind === 'potion' && s.potionType === entry.potionType)
            || (s.kind === 'bagItem' && entry.kind === 'bagItem' && s.itemId === entry.itemId)
            || (s.kind === 'equipment' && entry.kind === 'equipment' && s.equipmentId === entry.equipmentId))) {
          slots[i] = null;
        }
      }
    }
    slots[slotIdx] = entry;
    set({ quickSlots: slots });
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  setBagSlotMap: (slotMap) => {
    set({ bagSlotMap: slotMap });
    const char = get().character;
    if (char?.id) saveBagLayout(char.id, slotMap);
  },

  useQuickSlot: (slotIdx) => {
    const state = get();
    const action = resolveQuickSlotAction(state.quickSlots[slotIdx] ?? null);
    if (!action) return;

    switch (action.type) {
      case 'potion':
        get().usePotionByType(action.potionType);
        return;
      case 'speedPotion':
        get().useSpeedPotion(action.speedType);
        return;
      case 'cure':
        get().useCureItem(action.itemId);
        return;
      case 'townScroll':
        get().useTownScroll(action.itemId);
        return;
      case 'travel': {
        // § 35.7：通行卷軸直飛。changeArea 會做卷軸檢查與消耗
        if (state.character?.currentRegion === action.regionId) {
          set({ combatLogs: addLog(state.combatLogs, { text: '已經在這個區域了', type: 'system' }) });
          return;
        }
        get().changeArea(action.regionId);
        return;
      }
      case 'equip': {
        // § 35.7.2：裝備中的東西還在背包上，所以這一格是穿／脫的切換，不再用完就清空
        const item = state.inventory.find(i => i.id === action.equipmentId);
        if (item) {
          get().equipItem(item);
          return;
        }
        const slot = SLOT_ORDER.find(s => state.equippedGear[s]?.id === action.equipmentId);
        if (slot) {
          get().unequipItem(slot);
          return;
        }
        // 裝備已被賣掉／丟棄／存進倉庫 → 該格失效，直接清空
        get().assignQuickSlot(slotIdx, null);
        return;
      }
      case 'skill': {
        const skill = state.skills.find(s => s.id === action.skillId);
        // 未習得 → 該格失效（§ 35.7.4）。CD／MP／武器不符**不清空**，那些是暫時狀態
        if (!skill) {
          get().assignQuickSlot(slotIdx, null);
          return;
        }
        get().castQuickSlotSkill(skill.id);
        return;
      }
    }
  },

  castQuickSlotSkill: (skillId) => {
    const state = get();
    const char = state.character;
    if (!char) return false;

    const skill = state.skills.find(s => s.id === skillId);
    if (!skill) return false;

    const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
    const weapon = getEquippedWeapon(allGear);
    const weaponType = weapon?.type !== 'armor' ? weapon?.type : undefined;
    const cooldownReduction = getSkillCooldownReduction(char, allGear, state.activeEffects);

    /*
     * § 3.6.2：CD 中／MP 不足／武器不符一律**當場拒絕並說明原因**，不排隊等待。
     * 排隊會讓「按下去之後不知道何時會放」變成常態；說明原因是為了讓玩家
     * 分得出「還在轉 CD」與「這把武器放不出這招」——兩者的畫面都是灰的。
     */
    if (!skillMeetsWeaponRequirement(skill, weaponType)) {
      set({ combatLogs: addLog(state.combatLogs, { text: `${skill.name} 需要對應武器`, type: 'system' }) });
      return false;
    }
    if (char.mp < skill.mpCost) {
      set({ combatLogs: addLog(state.combatLogs, { text: `${skill.name} MP 不足`, type: 'system' }) });
      return false;
    }
    if (!canUseSkill(skill, char.mp, Date.now(), cooldownReduction)) {
      set({ combatLogs: addLog(state.combatLogs, { text: `${skill.name} 冷卻中`, type: 'system' }) });
      return false;
    }

    /*
     * buff／治癒**不佔攻擊 tick**，立即施放（§ 3.6.2）。
     * 攻擊 tick 只在「有目標且進入射程」時才觸發，把補血排進去
     * 等於「地圖上沒怪就補不了血」—— 而那正是最需要手動補的時候。
     */
    if (skill.type === 'buff' || skill.type === 'heal') {
      return get().castSelfSkill(skill.id);
    }

    // 攻擊技能排進下一個攻擊 tick，由 ARPG 引擎覆蓋該 tick 的腳本判定
    useCombatCommandStore.getState().requestSkill(skill.id);
    return true;
  },

  castSelfSkill: (skillId) => {
    const state = get();
    const char = state.character;
    if (!char) return false;

    const skillIdx = state.skills.findIndex(s => s.id === skillId);
    if (skillIdx < 0) return false;
    const skill = state.skills[skillIdx];
    if (skill.type !== 'buff' && skill.type !== 'heal') return false;

    const now = Date.now();
    const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
    const cooldownReduction = getSkillCooldownReduction(char, allGear, state.activeEffects);
    if (!canUseSkill(skill, char.mp, now, cooldownReduction)) return false;

    const template = getSkillTemplate(skill.id);
    const newSkills = [...state.skills];
    newSkills[skillIdx] = { ...skill, lastUsedAt: now };

    if (skill.type === 'heal') {
      if (!skill.power) return false;
      const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
      // § 21.4c：治癒量走技能側公式（技能攻擊力 × 魔攻乘區 + INT 加成）× 治癒效果%
      const effectiveHeal = calculateHealAmount(char, skill.power, allGear, state.activeEffects);
      const healed = Math.min(effMaxHp - char.hp, effectiveHeal);
      set({
        character: { ...char, hp: char.hp + healed, mp: char.mp - skill.mpCost },
        skills: newSkills,
        combatLogs: addLog(state.combatLogs, { text: `施放 ${skill.name} 回復 ${healed} HP`, type: 'player' }),
      });
      pushSelfCastFx({ skillId: skill.id, healed });
      get().saveState();
      return true;
    }

    const newChar = { ...char, mp: char.mp - skill.mpCost };
    const logs = addLog(state.combatLogs, { text: `施放 ${skill.name}`, type: 'player' });
    const buffDuration = template?.buffDuration ?? skill.buffDuration;

    if (buffDuration) {
      const buffEffect: ActiveEffect = {
        id: `buff-${skill.id}-${now}`,
        sourceSkillId: skill.id,
        sourceSkillName: skill.name,
        category: template?.buffCategory ?? skill.buffCategory ?? skill.id,
        type: 'buff',
        target: 'player',
        modifiers: template?.buffModifiers ?? skill.buffModifiers ?? [],
        startTime: now,
        duration: buffDuration,
        tags: [],
        name: skill.name,
        description: template?.buffEffect ?? skill.buffEffect ?? '',
      };
      const hotAmount = template?.hotAmount ?? skill.hotAmount;
      if (hotAmount) buffEffect.hot = { amount: hotAmount, interval: 1000 };
      if (template?.invincible ?? skill.invincible) buffEffect.invincible = true;
      if (template?.immuneDebuff ?? skill.immuneDebuff) buffEffect.immuneDebuff = true;
      const shieldMod = buffEffect.modifiers?.find(m => m.stat === 'shield_absorb');
      if (shieldMod) buffEffect.shieldRemaining = shieldMod.value;
      const applied = applyPlayerBuff(get().activeEffects, buffEffect);
      const buffLogs = applied.cancelledSlow
        ? addLog(logs, { text: `${skill.name} 解除了減速`, type: 'debuff-self' })
        : logs;
      set({ character: newChar, skills: newSkills, combatLogs: buffLogs, activeEffects: applied.effects });
    } else {
      set({ character: newChar, skills: newSkills, combatLogs: logs });
    }

    /*
     * 常駐腳本碰不到 Pixi，所以演出走佇列（`48-vfx.md` § 48.8.5）——
     * 少了這一行，設在常駐腳本上的 buff 一個特效都不會演。
     */
    pushSelfCastFx({ skillId: skill.id, healed: 0 });
    get().saveState();
    return true;
  },

  useCureItem: (itemId) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;

    const def = getCureItem(itemId);
    if (!def) return;

    if (!hasBagItem(state.bagItems, itemId)) return;

    // § 24.10.1：無對應 debuff 時不可使用
    if (!hasCurableDebuff(def, state.activeEffects)) {
      set({ combatLogs: addLog(state.combatLogs, { text: '沒有需要解除的狀態', type: 'system' }) });
      return;
    }

    const now = Date.now();
    const cleared = state.activeEffects.filter(
      e => e.type === 'debuff' && e.target === 'player'
        && def.cures.includes(e.category)
        && now < e.startTime + e.duration
    );
    const remaining = state.activeEffects.filter(e => !cleared.includes(e));
    const newBag = consumeBagItem(state.bagItems, itemId);

    set({
      activeEffects: remaining,
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, {
        text: `使用${getItemById(itemId)?.name ?? def.name}，解除 ${cleared.map(e => e.name).join('、')}`,
        type: 'debuff-self',
      }),
    });
    get().saveState();
  },

  useTownScroll: (scrollItemId) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;

    const scrollInfo = getTownScrollByItemId(scrollItemId);
    if (!scrollInfo) return;

    if (!hasBagItem(state.bagItems, scrollItemId)) return;

    const newBag = consumeTownScroll(state.bagItems, scrollItemId);
    const char = { ...state.character };
    char.currentArea = scrollInfo.townId;
    char.currentRegion = scrollInfo.townId;
    char.currentFloor = null;
    char.mapPositionX = undefined;
    char.mapPositionY = undefined;
    const townZone = ZONES.find(z => z.regions.includes(scrollInfo.townId));
    if (townZone) char.currentZone = townZone.id;
    char.areaEnteredAt = Date.now();
    char.areaKills = 0;

    get().stopExploring();
    set({
      character: char,
      bagItems: newBag,
      phase: 'explore',
      combatLogs: addLog(state.combatLogs, { text: `使用${scrollInfo.name}，傳送至${scrollInfo.townName}`, type: 'system' }),
    });
    saveGame(get());
  },

  changeArea: (areaId) => {
    const state = get();
    if (!state.character) return;
    const region = getRegion(areaId);

    if (region?.entryScrollItemId) {
      if (!hasBagItem(state.bagItems, region.entryScrollItemId)) {
        const scrollLabel = getItemById(region.entryScrollItemId)?.name ?? '通行卷軸';
        set({ combatLogs: addLog(state.combatLogs, { text: `需要 ${scrollLabel} 才能進入！`, type: 'system' }) });
        return;
      }
      set({ bagItems: consumeBagItem(state.bagItems, region.entryScrollItemId) });
    }

    const zone = region ? ZONES.find(z => z.id === region.zoneId) : undefined;
    const updated = {
      ...state.character,
      currentArea: areaId,
      currentZone: zone?.id ?? state.character.currentZone,
      currentRegion: areaId,
      currentFloor: region?.type === 'dungeon' ? (region.floors?.[0]?.floor ?? 1) : null,
      areaEnteredAt: Date.now(),
      areaKills: 0,
      mapPositionX: undefined,
      mapPositionY: undefined,
    };
    const areaName = region?.name ?? areaId;
    set({
      character: updated,
      combatLogs: addLog(state.combatLogs, { text: `進入 ${areaName}！`, type: 'system' }),
    });
    // 必須在 saveGame 之前，否則存到的是舊快照
    get().rememberHuntLocation();
    saveGame(get());
    get().stopExploring();
    get().startExploring();
  },

  navigateTo: (location) => {
    const state = get();
    if (!state.character) return;

    const result = canNavigateTo(location, state.bagItems);
    if (!result.success) {
      set({ combatLogs: addLog(state.combatLogs, { text: result.error!, type: 'system' }) });
      return;
    }

    let newBag = state.bagItems;
    if (result.scrollConsumed) {
      newBag = consumeScroll(state.bagItems, result.scrollConsumed);
    }

    const region = getRegion(location.regionId);
    const updated = {
      ...state.character,
      currentArea: location.regionId,
      currentZone: location.zoneId,
      currentRegion: location.regionId,
      currentFloor: location.floor,
      areaEnteredAt: Date.now(),
      areaKills: 0,
      mapPositionX: undefined,
      mapPositionY: undefined,
    };

    const floorText = location.floor != null ? ` ${location.floor}F` : '';
    const areaName = region?.name ?? location.regionId;
    set({
      character: updated,
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, { text: `進入 ${areaName}${floorText}！`, type: 'system' }),
    });
    // 必須在 saveGame 之前，否則存到的是舊快照
    get().rememberHuntLocation();
    saveGame(get());
    get().stopExploring();
    if (region?.type !== 'town') {
      get().startExploring();
    }
  },

  setScriptRules: (rules) => {
    set({ scriptRules: rules });
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  setEmergencyRetreat: (retreat) => {
    updateActiveTemplate(set, get, t => ({ ...t, emergencyRetreat: retreat }));
  },

  setActiveTemplate: (id) => {
    if (!get().scriptTemplates.some(t => t.id === id)) return;
    set({ activeTemplateId: id });
    // 常駐腳本換了一整份，計時器要重掛
    get().startPersistentLoop();
    persistTemplates(get);
  },

  addScriptTemplate: () => {
    const templates = get().scriptTemplates;
    const created = createScriptTemplate(`tpl-${Date.now()}`, nextTemplateName(templates));
    set({ scriptTemplates: [...templates, created], activeTemplateId: created.id });
    get().startPersistentLoop();
    persistTemplates(get);
  },

  duplicateScriptTemplate: (id) => {
    const templates = get().scriptTemplates;
    const source = templates.find(t => t.id === id);
    if (!source) return;
    const copy: ScriptTemplate = {
      ...source,
      id: `tpl-${Date.now()}`,
      name: nextTemplateName(templates),
    };
    set({ scriptTemplates: [...templates, copy], activeTemplateId: copy.id });
    get().startPersistentLoop();
    persistTemplates(get);
  },

  renameScriptTemplate: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      scriptTemplates: get().scriptTemplates.map(t => (t.id === id ? { ...t, name: trimmed } : t)),
    });
    persistTemplates(get);
  },

  removeScriptTemplate: (id) => {
    // 預設 template 不可刪 —— 這同時保證清單永遠不會空掉
    if (!isDeletableTemplate(id)) return;
    const remaining = get().scriptTemplates.filter(t => t.id !== id);
    if (remaining.length === 0) return;
    const activeId = get().activeTemplateId === id ? remaining[0].id : get().activeTemplateId;
    set({ scriptTemplates: remaining, activeTemplateId: activeId });
    get().startPersistentLoop();
    persistTemplates(get);
  },

  startPersistentLoop: () => {
    get().stopPersistentLoop();

    const id = window.setInterval(() => {
      const state = get();
      if (!state.character) return;

      get().clearExpiredEffects();

      const now = Date.now();
      const char = state.character;
      const allGear = getEffectiveGearArray(state.character!, state.activeEffects, state.equippedGear);
      const cooldownReduction = getSkillCooldownReduction(char, allGear, state.activeEffects);

      /**
       * HP 取樣（`hp_dropped_recently`）。在常駐 loop 維護：它每 300ms 跑一次，
       * 是全遊戲最穩定的取樣節奏，掛在戰鬥 tick 上則會隨攻速變頻。
       */
      const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
      hpSamples.push({ t: now, percent: effMaxHp > 0 ? (char.hp / effMaxHp) * 100 : 100 });
      while (hpSamples.length > 0 && now - hpSamples[0].t > HP_SAMPLE_WINDOW_MS) hpSamples.shift();

      const ctx: PersistentScriptContext = {
        character: char,
        skills: state.skills,
        bagItems: state.bagItems,
        lastPotionUsedAt: state.lastPotionUsedAt,
        lastPotionCooldown: state.lastPotionCooldown,
        now,
        activeEffects: state.activeEffects,
        cooldownReduction,
        effectiveMaxHp: getEffectiveMaxHp(char, state.equippedGear),
        effectiveMaxMp: getEffectiveMaxMp(char, state.equippedGear),
        /**
         * 共用鑲材（§ 51.4.5）在常駐格也要成立，因此這幾個欄位不能只餵給戰鬥。
         * 少一個就等於那些鑲材鑲進常駐格之後永遠不觸發，而且不會報錯。
         */
        playerPos: useMapControlStore.getState().playerPosition,
        monsterPositions: useMapMonsterStore.getState().monsters.map(m => m.position),
        weaponType: getEquippedWeapon(allGear)?.type,
        hpHistory: hpSamples,
        weightPercent: (() => {
          const w = getWeightStatus(char, allGear, state.bagItems);
          return w.capacity > 0 ? (w.carried / w.capacity) * 100 : 0;
        })(),
      };

      // 規則來自天賦格（`51-auto-talent.md`），不再讀 template 的規則陣列
      const action = evaluatePersistentScript(talentPersistentRules(state.activeTemplateId), ctx);
      if (!action) {
        const retreatCtx: EmergencyRetreatContext = {
          character: char,
          bagItems: state.bagItems,
          inCombat: isInArpgCombat(),
          effectiveMaxHp: getEffectiveMaxHp(char, state.equippedGear),
        };
        const retreat = evaluateEmergencyRetreat(selectEmergencyRetreat(state), retreatCtx);
        if (retreat) {
          const scroll = retreat.scrollTownId
            ? TOWN_SCROLL_CONFIG[retreat.scrollTownId] ?? null
            : findScrollInBag(state.bagItems);
          if (!scroll) return;
          set({ huntReturnPending: true });
          // 與手動使用回城卷軸共用同一條流程（停止探索、重置地圖座標、存檔）
          get().useTownScroll(scroll.itemId);
          return;
        }
        // 保命動作都沒事做的時候才輪到村莊腳本（它會花錢、賣東西、把角色傳走）
        get().runVillageScriptTick();
        return;
      }

      switch (action.type) {
        case 'potion': {
          drinkPotion(set, state, char, allGear, now, action.potionType ?? 'red');
          break;
        }
        case 'speed_potion': {
          const speedType = action.speedPotionType ?? 'green';
          get().useSpeedPotion(speedType);
          break;
        }
        case 'cure_item': {
          if (action.cureItemId == null) return;
          get().useCureItem(action.cureItemId);
          break;
        }
        /*
         * buff／治癒與快捷格的手動施放**共用同一支** `castSelfSkill()`（§ 3.6.2）。
         * 兩份實作會走鐘：MP 扣除、CD 寫入、buff 疊加規則、特效佇列全都要一致，
         * 而其中任何一項改了只改一邊，症狀都是「手動放跟自動放效果不同」這種難查的 bug。
         */
        case 'buff_skill':
        case 'heal_skill': {
          if (!action.skillId) break;
          get().castSelfSkill(action.skillId);
          break;
        }
        case 'use_town_scroll': {
          const scroll = findScrollInBag(state.bagItems);
          if (!scroll) break;
          set({ huntReturnPending: true });
          get().useTownScroll(scroll.itemId);
          break;
        }
        case 'use_consumable': {
          if (action.itemId == null) break;
          useConsumableById(get, action.itemId);
          break;
        }
        /*
         * 補到指定百分比：每一次判定喝一瓶，到標了條件就不成立，自然停下來。
         * 藥水冷卻擋住時直接跳過這一次（§ 51.4.10）。
         */
        case 'refill_to_percent': {
          const target = action.value ?? 80;
          const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
          if (char.hp / effMaxHp * 100 >= target) break;
          drinkPotion(set, state, char, allGear, now, action.potionType ?? 'red');
          break;
        }
        // 依序檢查，第一個沒生效的就放。一次只放一個，下一輪再處理下一個
        // 走位只設意圖，實際移動由 ARPG 的 FSM 處理（§ 51.4.9 T5）
        case 'keep_distance':
        case 'close_in':
          useCombatCommandStore.getState().requestMove({
            kind: action.type, distance: action.distance,
          });
          break;
        case 'refill_all_buffs': {
          const ids = [action.skillId, action.skillId2, action.skillId3].filter(Boolean) as string[];
          const next = ids.find(id => !isBuffActive(id, state.skills, state.activeEffects, now));
          if (next) get().castSelfSkill(next);
          break;
        }
      }
    }, 300);

    set({ persistentLoopId: id });
  },

  stopPersistentLoop: () => {
    const id = get().persistentLoopId;
    if (id) clearInterval(id);
    set({ persistentLoopId: null });
  },

  rememberHuntLocation: () => {
    const char = get().character;
    if (!char) return;
    // 城鎮不是掛機點，記下去會讓「返回上次掛機點」原地打轉
    if (getRegion(char.currentRegion)?.type === 'town') return;
    set({
      lastHuntLocation: {
        zoneId: char.currentZone,
        regionId: char.currentRegion,
        floor: char.currentFloor,
      },
      huntReturnPending: false,
    });
  },

  runVillageScriptTick: () => {
    const state = get();
    const char = state.character;
    if (!char) return;

    const rules = talentVillageRules(state.activeTemplateId);
    if (rules.length === 0) return;

    const now = Date.now();
    if (now - state.lastVillageTickAt < VILLAGE_TICK_MS) return;
    set({ lastVillageTickAt: now });

    const templates = getCachedEquipmentTemplates();
    const equippedIds = new Set(
      Object.values(state.equippedGear).filter(Boolean).map(e => e!.id)
    );
    const ctx: VillageScriptContext = {
      className: char.className,
      // 不傳 activeEffects／equippedGear：篩選基準不含裝備與 buff（§ 49.4）
      selfAttributes: getTotalAttributes(char),
      gold: char.gold,
      bagItems: state.bagItems,
      inventory: state.inventory,
      equippedIds,
      templates,
      bagUsedSlots: getBagUsedSlots(state.bagItems, state.inventory, state.equippedGear),
      bagMaxSlots: getBagMaxSlots(state.equippedGear),
      inTown: getRegion(char.currentRegion)?.type === 'town',
      currentArea: char.currentArea,
      lastHuntLocation: state.lastHuntLocation,
      huntReturnPending: state.huntReturnPending,
      warehouse: {
        shared: { materials: state.storedMaterials, equipment: state.storedEquipment },
        personal: { materials: state.personalStoredMaterials, equipment: state.personalStoredEquipment },
        gold: state.warehouseGold,
      },
      bagFreeSlots: getBagMaxSlots(state.equippedGear)
        - getBagUsedSlots(state.bagItems, state.inventory, state.equippedGear),
      weightPercent: (() => {
        const w = getWeightStatus(
          char,
          getEffectiveGearArray(char, state.activeEffects, state.equippedGear),
          state.bagItems,
        );
        return w.capacity > 0 ? (w.carried / w.capacity) * 100 : 0;
      })(),
      // 旅館有沒有事情可做（`13-town.md` § 13.7）。全滿又沒異常狀態時為 false。
      needsInn: char.hp < getEffectiveMaxHp(char, state.equippedGear)
        || char.mp < getEffectiveMaxMp(char, state.equippedGear)
        || state.activeEffects.some(e => e.type === 'debuff' && e.target === 'player'),
    };

    const action = evaluateVillageScript(rules, ctx);
    if (!action) return;

    switch (action.type) {
      case 'return_town': {
        const scroll = findReturnScroll(action.scrollTownId, ctx);
        if (!scroll) return;
        set({ huntReturnPending: true });
        get().useTownScroll(scroll.itemId);
        break;
      }
      case 'use_inn': {
        /**
         * 旅館：恢復 HP／MP ＋ 解除異常狀態（`13-town.md` § 13.7）。
         * 價格與手動使用同一份（`components/town/Inn.tsx` 的 `INN_PRICES.full`）。
         */
        if (char.gold < INN_PRICES.full) return;
        set({
          character: {
            ...char,
            hp: getEffectiveMaxHp(char, state.equippedGear),
            mp: getEffectiveMaxMp(char, state.equippedGear),
            gold: char.gold - INN_PRICES.full,
          },
          activeEffects: state.activeEffects.filter(
            e => !(e.type === 'debuff' && e.target === 'player'),
          ),
        });
        get().saveState();
        break;
      }
      case 'return_to_hunt': {
        const target = state.lastHuntLocation;
        if (!target) return;
        get().navigateTo({ zoneId: target.zoneId, regionId: target.regionId, floor: target.floor });
        break;
      }
      case 'buy_item': {
        const amount = getBuyAmount(action, ctx);
        if (amount <= 0 || action.itemId == null) return;
        const spent = get().buyBagItems([
          { itemId: action.itemId, amount, unitPrice: getItemBasePrice(action.itemId) },
        ]);
        if (spent > 0) {
          const name = getItemById(action.itemId)?.name ?? '道具';
          set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：購買${name} ×${amount}`, type: 'system' }) });
        }
        break;
      }
      case 'sell_materials': {
        const items = collectVillageSellMaterials(action, ctx);
        if (items.length === 0) return;
        const gained = get().sellBagItems(items.map(i => ({ itemId: i.itemId, amount: i.amount })));
        set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：販售素材 ${items.length} 種，獲得 ${gained.toLocaleString()}G`, type: 'system' }) });
        break;
      }
      case 'sell_equipment': {
        const items = collectVillageSellEquipment(action, ctx);
        if (items.length === 0) return;
        const gained = get().sellEquipmentInstances(items.map(i => i.id!), templates);
        set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：販售裝備 ${items.length} 件，獲得 ${gained.toLocaleString()}G`, type: 'system' }) });
        break;
      }
      case 'deposit_materials': {
        const items = collectDepositMaterials(action, ctx);
        if (items.length === 0) return;
        get().depositToWarehouse({
          warehouse: getWarehouseKind(action),
          materials: items.map(i => ({ itemId: i.itemId, amount: i.amount })),
        });
        set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：存入素材 ${items.length} 種`, type: 'system' }) });
        break;
      }
      case 'deposit_equipment': {
        const items = collectDepositEquipment(action, ctx);
        if (items.length === 0) return;
        get().depositToWarehouse({
          warehouse: getWarehouseKind(action),
          equipmentIds: items.map(i => i.id!),
        });
        set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：存入裝備 ${items.length} 件`, type: 'system' }) });
        break;
      }
      case 'withdraw_item': {
        const amount = getWithdrawAmount(action, ctx);
        if (amount <= 0 || action.itemId == null) return;
        get().withdrawFromWarehouse({
          warehouse: getWarehouseKind(action),
          materials: [{ itemId: action.itemId, amount }],
        });
        const name = getItemById(action.itemId)?.name ?? '道具';
        set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：從倉庫取出${name} ×${amount}`, type: 'system' }) });
        break;
      }
      case 'deposit_gold': {
        const amount = getDepositGoldAmount(action, ctx);
        const moved = get().depositWarehouseGold(amount);
        if (moved > 0) {
          set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：存入 ${moved.toLocaleString()}G`, type: 'system' }) });
        }
        break;
      }
      case 'withdraw_gold': {
        const amount = getWithdrawGoldAmount(action, ctx);
        const moved = get().withdrawWarehouseGold(amount);
        if (moved > 0) {
          set({ combatLogs: addLog(get().combatLogs, { text: `村莊腳本：領出 ${moved.toLocaleString()}G`, type: 'system' }) });
        }
        break;
      }
    }
  },

  addEffect: (effect) => {
    const { activeEffects } = get();
    // Same category buff overwrites (refresh duration)
    if (effect.type === 'buff') {
      const filtered = activeEffects.filter(
        e => !(e.type === 'buff' && e.category === effect.category && e.target === effect.target)
      );
      set({ activeEffects: [...filtered, effect] });
    } else {
      // Debuffs: DoT and stun cannot refresh while active
      const existing = activeEffects.find(
        e => e.category === effect.category && e.target === effect.target && e.targetIdx === effect.targetIdx
      );
      if (existing) return;
      set({ activeEffects: [...activeEffects, effect] });
    }
  },

  removeEffect: (id) => {
    set({ activeEffects: get().activeEffects.filter(e => e.id !== id) });
  },

  clearExpiredEffects: () => {
    const now = Date.now();
    set({ activeEffects: get().activeEffects.filter(e => e.startTime + e.duration > now) });
  },

  discardBagItem: (itemId, amount = 1) => {
    const bag = get().bagItems;
    const existing = bag.find(b => b.itemId === itemId);
    if (!existing) return;
    const drop = Math.max(1, Math.min(amount, existing.amount));
    set({ bagItems: consumeBagItem(bag, itemId, drop) });
    saveGame(get());
  },

  /**
   * === 商店買賣（`39-batch-sell.md`）===
   *
   * 三家商店的手動買賣、批量販售，之後的村莊腳本自動買賣，全部經過這三個 action。
   * 定價與可賣判定在 `systems/shop.ts`，這裡只負責寫入。
   */

  sellBagItems: (lines) => {
    let bag = get().bagItems;
    let gained = 0;
    for (const line of lines) {
      const held = bag.find(b => b.itemId === line.itemId);
      if (!held) continue;
      const actual = Math.min(line.amount, held.amount);
      if (actual <= 0) continue;
      gained += getItemSellPrice(line.itemId) * actual;
      bag = consumeBagItem(bag, line.itemId, actual);
    }
    if (gained === 0 && bag === get().bagItems) return 0;
    set({
      character: { ...get().character!, gold: get().character!.gold + gained },
      bagItems: bag,
    });
    get().saveState();
    return gained;
  },

  buyBagItems: (lines) => {
    const cost = lines.reduce((sum, l) => sum + l.unitPrice * l.amount, 0);
    if (cost > (get().character?.gold ?? 0)) return 0;
    let bag = get().bagItems;
    for (const line of lines) {
      bag = addBagItem(bag, line.itemId, line.amount);
    }
    set({
      character: { ...get().character!, gold: get().character!.gold - cost },
      bagItems: bag,
    });
    get().saveState();
    return cost;
  },

  depositToWarehouse: ({ warehouse, equipmentIds = [], materials = [] }) => {
    const state = get();
    const shared = warehouse === 'shared';
    // 共用倉庫的裝備要記 ownerId，沒有登入者就不搬裝備
    const canMoveEquip = shared ? !!state.userId : !!state.character;

    let inv = state.inventory;
    let bag = state.bagItems;
    let equip = shared ? state.storedEquipment : state.personalStoredEquipment;
    let mats = shared ? state.storedMaterials : state.personalStoredMaterials;

    if (canMoveEquip) {
      for (const id of equipmentIds) {
        const item = inv.find(i => i.id === id);
        if (!item) continue;
        const changes = shared
          ? { inStorage: true, storageType: 'shared' as const, ownerId: state.userId! }
          : { inStorage: true, storageType: 'personal' as const, ownerId: state.character!.id! };
        inv = inv.filter(i => i.id !== id);
        equip = [...equip, { ...item, ...changes }];
        db.equipmentInstances.update(id, changes);
      }
    }

    for (const line of materials) {
      const held = bag.find(b => b.itemId === line.itemId);
      if (!held) continue;
      const actual = Math.min(line.amount, held.amount);
      if (actual <= 0) continue;
      bag = consumeBagItem(bag, line.itemId, actual);
      mats = addBagItem(mats, line.itemId, actual);
    }

    set({ inventory: inv, bagItems: bag, ...warehousePatch(shared, equip, mats) });
    get().saveState();
  },

  withdrawFromWarehouse: ({ warehouse, equipmentIds = [], materials = [] }) => {
    const state = get();
    const shared = warehouse === 'shared';
    // 取出的裝備要掛回自己名下，沒有角色就不動
    if (!state.character && equipmentIds.length > 0) return;

    let inv = state.inventory;
    let bag = state.bagItems;
    let equip = shared ? state.storedEquipment : state.personalStoredEquipment;
    let mats = shared ? state.storedMaterials : state.personalStoredMaterials;

    for (const id of equipmentIds) {
      const item = equip.find(i => i.id === id);
      if (!item) continue;
      const changes = shared
        ? { inStorage: false, storageType: undefined, ownerId: state.character!.id! }
        : { inStorage: false, storageType: undefined };
      equip = equip.filter(i => i.id !== id);
      inv = [...inv, { ...item, ...changes }];
      db.equipmentInstances.update(id, changes);
    }

    for (const line of materials) {
      const held = mats.find(m => m.itemId === line.itemId);
      if (!held) continue;
      const actual = Math.min(line.amount, held.amount);
      if (actual <= 0) continue;
      mats = consumeBagItem(mats, line.itemId, actual);
      bag = addBagItem(bag, line.itemId, actual);
    }

    set({ inventory: inv, bagItems: bag, ...warehousePatch(shared, equip, mats) });
    get().saveState();
  },

  depositWarehouseGold: (amount) => {
    const char = get().character;
    // NaN 過不了 `<= 0`，不擋就會把身上與倉庫的餘額一起寫成 NaN
    if (!char || !Number.isFinite(amount) || amount <= 0) return 0;
    const actual = Math.min(amount, char.gold);
    if (actual <= 0) return 0;
    set({
      character: { ...char, gold: char.gold - actual },
      warehouseGold: get().warehouseGold + actual,
    });
    get().saveState();
    return actual;
  },

  withdrawWarehouseGold: (amount) => {
    const char = get().character;
    if (!char || !Number.isFinite(amount) || amount <= 0) return 0;
    const actual = Math.min(amount, get().warehouseGold);
    if (actual <= 0) return 0;
    set({
      character: { ...char, gold: char.gold + actual },
      warehouseGold: get().warehouseGold - actual,
    });
    get().saveState();
    return actual;
  },

  sellEquipmentInstances: (ids, templates) => {
    if (ids.length === 0 || templates.length === 0) return 0;
    const idSet = new Set(ids);
    const inventory = get().inventory;
    const selling = inventory.filter(i => i.id != null && idSet.has(i.id));
    if (selling.length === 0) return 0;

    const gained = getEquipmentSellTotal(selling, templates);
    set({
      character: { ...get().character!, gold: get().character!.gold + gained },
      inventory: inventory.filter(i => i.id == null || !idSet.has(i.id)),
    });
    db.equipmentInstances.bulkDelete(selling.map(i => i.id!));
    get().saveState();
    return gained;
  },

  pendingDiscard: null,

  requestDiscard: (req) => set({ pendingDiscard: req }),

  cancelDiscard: () => set({ pendingDiscard: null }),

  confirmDiscard: (amount) => {
    const req = get().pendingDiscard;
    if (!req) return;
    if (req.kind === 'equipment') {
      if (req.equipmentId != null) get().discardInventoryItem(req.equipmentId);
    } else if (req.itemId != null) {
      get().discardBagItem(req.itemId, amount);
    }
    const dropped = req.kind === 'equipment' ? 1 : Math.max(1, Math.min(amount, req.maxAmount));
    set({
      pendingDiscard: null,
      combatLogs: addLog(get().combatLogs, {
        text: `丟棄了 ${req.name}${dropped > 1 ? ` ×${dropped}` : ''}`,
        type: 'system',
      }),
    });
  },

  discardInventoryItem: (id) => {
    const inv = get().inventory;
    set({ inventory: inv.filter(i => i.id !== id) });
    db.equipmentInstances.delete(id);
    saveGame(get());
  },

  spendAttributePoint: (attr) => {
    const char = get().character;
    if (!char || char.unspentAttributePoints <= 0) return;
    const total = getTotalAttributes(char);
    if (total[attr] >= ATTRIBUTE_CAP) return;
    const newBonus = { ...char.bonusAttributes, [attr]: char.bonusAttributes[attr] + 1 };
    set({
      character: {
        ...char,
        bonusAttributes: newBonus,
        unspentAttributePoints: char.unspentAttributePoints - 1,
      },
    });
    saveGame(get());
  },

  acceptQuest: (questId) => {
    const char = get().character;
    if (!char) return;
    const updated = acceptQuestAction(char, questId);
    set({ character: updated });
    saveGame(get());
  },

  completeQuest: (questId) => {
    const state = get();
    const char = state.character;
    if (!char) return;
    const { character: updated, rewardItem } = completeQuestAction(char, questId);
    if (!rewardItem) return;

    const rewardItemId = getItemId(rewardItem);
    if (rewardItemId == null) return;

    let newBag = state.bagItems;
    if (!hasBagItem(newBag, rewardItemId)
      && getBagUsedSlots(newBag, state.inventory, state.equippedGear) >= getBagMaxSlots(state.equippedGear)) {
      return;
    }
    newBag = addBagItem(newBag, rewardItemId, 1);

    // Remove quest materials from bag
    const questMaterialId = getItemId(QUEST_MATERIAL_NAME);
    if (questMaterialId != null) newBag = newBag.filter(b => b.itemId !== questMaterialId);

    const questStats = { ...get().statistics, questsCompleted: get().statistics.questsCompleted + 1 };
    set({ character: updated, bagItems: newBag, statistics: questStats });
    saveGame(get());
  },

  acceptAdventurerQuest: (quest) => {
    const state = get();
    const result = acceptAdvQuest(state.adventurerQuests, quest);
    if (!result) return;
    set({ adventurerQuests: result });
    saveGame(get());
  },

  abandonAdventurerQuest: (questId) => {
    const state = get();
    const quest = state.adventurerQuests.find(q => q.id === questId);
    const { activeQuests, guildProgress } = abandonAdvQuest(
      state.adventurerQuests, questId, state.guildProgress
    );

    const townId = state.character?.currentArea as QuestTownId | undefined;
    const board = { ...state.adventurerQuestBoard };
    if (quest) {
      const diff = quest.difficulty;
      const oldList = board[diff];
      const idx = oldList.findIndex(q => q.id === questId);
      if (idx !== -1) {
        const newQuest = generateAdvSingleQuest(diff, guildProgress.rank, idx, townId);
        board[diff] = [...oldList.slice(0, idx), newQuest, ...oldList.slice(idx + 1)];
      }
    }

    set({ adventurerQuests: activeQuests, guildProgress, adventurerQuestBoard: board });
    saveGame(get());
  },

  completeAdventurerQuest: (questId) => {
    const state = get();
    const quest = state.adventurerQuests.find(q => q.id === questId);
    const { activeQuests, guildProgress, reward, consumed } = completeAdvQuest(
      state.adventurerQuests, questId, state.guildProgress, state.bagItems
    );
    if (!reward) return;

    let newBag = state.bagItems;
    let newChar = state.character;

    // 交付型：先扣掉交出去的東西，再給獎勵（§ 36.11）
    if (consumed) newBag = consumeBagItem(newBag, consumed.itemId, consumed.amount);

    if (reward.type === 'gold' && newChar) {
      newChar = { ...newChar, gold: newChar.gold + reward.amount };
    } else if (reward.itemId != null) {
      // 名稱與背包分頁一律由 id 反查 seed（§ 99.1）——
      // 寫死成 material 會讓改歸 scroll 的道具（印記）在背包裡分裂成兩堆
      // 印記不佔格（§ 35.20），背包滿了照樣交得了任務
      if (!isSigilItemId(reward.itemId)
        && !hasBagItem(newBag, reward.itemId)
        && getBagUsedSlots(newBag, state.inventory, state.equippedGear) >= getBagMaxSlots(state.equippedGear)) {
        return;
      }
      newBag = addBagItem(newBag, reward.itemId, reward.amount);
    }

    const townId2 = state.character?.currentArea as QuestTownId | undefined;
    const board = { ...state.adventurerQuestBoard };
    if (quest) {
      const diff = quest.difficulty;
      const oldList = board[diff];
      const idx = oldList.findIndex(q => q.id === questId);
      if (idx !== -1) {
        const newQuest = generateAdvSingleQuest(diff, guildProgress.rank, idx, townId2);
        board[diff] = [...oldList.slice(0, idx), newQuest, ...oldList.slice(idx + 1)];
      }
    }

    const advQuestStats = { ...state.statistics, questsCompleted: state.statistics.questsCompleted + 1 };
    if (reward.type === 'gold') advQuestStats.totalGoldEarned += reward.amount;

    set({
      adventurerQuests: activeQuests,
      guildProgress,
      character: newChar,
      bagItems: newBag,
      statistics: advQuestStats,
      adventurerQuestBoard: board,
    });
    saveGame(get());
  },

  acceptCraftQuest: (templateId) => {
    const result = acceptCraftQuestFn(get().craftQuests, templateId);
    if (!result) return;
    set({ craftQuests: result });
    saveGame(get());
  },

  abandonCraftQuest: (questId) => {
    // § 36.13.5：取消製作任務不動貢獻，與冒險者工會的退出不同
    set({ craftQuests: abandonCraftQuestFn(get().craftQuests, questId) });
    saveGame(get());
  },

  refreshQuestBoard: (difficulty) => {
    const state = get();
    const townId = state.character?.currentArea as QuestTownId | undefined;
    const board = { ...state.adventurerQuestBoard };
    board[difficulty] = generateQuestList(difficulty, state.guildProgress.rank, townId);
    set({ adventurerQuestBoard: board });
  },

  /**
   * § 36.6.3 手動刷新：只刷目前分頁，扣 50 貢獻。
   * 貢獻不足時不做任何事（UI 也會禁用按鈕），扣完跌破門檻照常降階。
   */
  rerollQuestBoard: (difficulty) => {
    const state = get();
    if (state.guildProgress.points < QUEST_BOARD_REFRESH_COST) return;

    const points = state.guildProgress.points - QUEST_BOARD_REFRESH_COST;
    const guildProgress = { rank: getRankForPoints(points), points };
    const townId = state.character?.currentArea as QuestTownId | undefined;
    const board = { ...state.adventurerQuestBoard };
    board[difficulty] = generateQuestList(difficulty, guildProgress.rank, townId);

    set({ adventurerQuestBoard: board, guildProgress });
    saveGame(get());
  },

  initQuestBoard: () => {
    const state = get();
    const townId = state.character?.currentArea as QuestTownId | undefined;
    const difficulties = townId ? getTownDifficulties(townId) : QUEST_DIFFICULTY_ORDER;
    const board = createEmptyQuestBoard();
    for (const d of difficulties) {
      board[d] = generateQuestList(d, state.guildProgress.rank, townId);
    }
    set({ adventurerQuestBoard: board, questBoardTownId: townId ?? null });
  },

  pushSystemLog: (text: string) => {
    set(state => ({ combatLogs: addLog(state.combatLogs, { text, type: 'system' }) }));
  },

  saveState: () => {
    saveGame(get());
  },

}));

/**
 * 單隻怪物死亡處理：任何傷害來源（普攻、技能、AOE、DOT）導致怪物 HP <= 0 時，
 * 對該隻怪物呼叫此函式。每隻怪物死亡各呼叫一次。
 * 負責：擊敗日誌、清除 debuff、經驗值、掉落 roll、任務進度更新。
 * 回傳更新後的 character 與 logs。
 */
export function processMonsterDeath(
  get: () => GameState,
  set: (s: Partial<GameState>) => void,
  monsters: MonsterInstance[],
  deadIdx: number,
  char: Character,
  logs: CombatLog[],
  allGear: EquipmentInstance[]
): { char: Character; logs: CombatLog[] } {
  const dead = monsters[deadIdx];
  monsters[deadIdx] = { ...dead, _processed: true };

  /*
   * 試驗場木樁零產出（`50-training-ground.md` § 50.1、§ 50.4.1）。
   *
   * 擋在這裡而不是只擋呼叫端：擊殺結算有兩個入口（直接傷害與 DoT），
   * 未來還可能長出第三個。任何一條漏掉，木樁就會開始給經驗、掉裝備、
   * 累加 `37-statistics.md` 的殺敵數 —— 而那些數字會上傳排行榜。
   */
  if (dead.isTrainingDummy) return { char, logs };

  logs.push({ text: `${dead.name} 被擊敗！`, type: 'system' });

  // 清除死亡怪物身上的 debuff
  const currentEffects = get().activeEffects;
  const cleanedEffects = currentEffects.filter(
    e => !(e.target === 'monster' && e.targetIdx === deadIdx)
  );
  if (cleanedEffects.length !== currentEffects.length) {
    set({ activeEffects: cleanedEffects });
  }

  // 該地圖累積擊殺數是 Pressure 的輸入（`26-spawn-pressure.md` § 26.3）。
  // 木樁在上面就 return 了，不會計入。
  char = { ...char, areaKills: (char.areaKills ?? 0) + 1 };

  // 基礎 ×3（`28-monster-stats.md` § 28.1）再乘回鍋加倍（`04-character.md` § 4.11）
  const expGained = dead.exp * 3 * getRestedExpMultiplier(char);
  const prevLevel = char.level;
  char = addExp(char, expGained);
  logs.push({ text: `獲得 ${expGained} 經驗值`, type: 'system' });
  if (char.level > prevLevel) {
    logs.push({ text: `升級！等級 ${prevLevel} → ${char.level}`, type: 'system' });
    const equippedGear = get().equippedGear;
    char.hp = getEffectiveMaxHp(char, equippedGear);
    char.mp = getEffectiveMaxMp(char, equippedGear);
    // 每 5 級一封天賦格信（`52-mailbox.md` § 52.2）
    const levelForGrant = char.level;
    const charIdForGrant = char.id;
    if (charIdForGrant) {
      void syncTalentSlotGrants(charIdForGrant, levelForGrant)
        .then(sent => { if (sent > 0) return useMailboxStore.getState().refresh(); })
        // 發信失敗不該打斷結算：下次載入角色會用累計數補回來
        .catch(() => {});
    }
  }

  // 掉落處理（排隊避免 race condition）
  const dropBonuses = getAffixBonusesFromGear(allGear);
  // Pressure 掉落倍率是掉寶倍率的一個因子（`26-spawn-pressure.md` § 26.3）
  const pressureDropMult = getPressureDropMultiplier(
    calculatePressure(char.areaKills ?? 0).pressure,
  );
  const defeatedMonsterName = dead.name;
  const monsterIsBoss = dead.isBoss;
  dropQueue = dropQueue.then(async () => {
    const dropRegion = getRegion(char.currentRegion);
    const dropHasFloors = dropRegion?.floors && dropRegion.floors.length > 0;
    const dropAreaId = dropHasFloors && char.currentFloor != null
      ? `${char.currentRegion}-${char.currentFloor}f`
      : char.currentArea;
    // Boss 掉落的區域等級也走 area id 解析：副本要取**該樓層**的等級，
    // 不是整座副本的（`27-drop-table.md` § 27.3 的掉落表本來就是逐層列的）
    const areaLevel = resolveArea(dropAreaId)?.levelMax ?? dropRegion?.levelMax ?? dead.level;
    const drops = monsterIsBoss
      ? await rollBossDrops(defeatedMonsterName, char.id!, areaLevel, { drop_rate: dropBonuses.drop_rate, gold_rate: dropBonuses.gold_rate, pressure_mult: pressureDropMult })
      : await rollDrops(dropAreaId, char.id!, { drop_rate: dropBonuses.drop_rate, gold_rate: dropBonuses.gold_rate, pressure_mult: pressureDropMult }, false, dead.level);
    // 天賦格走獨立實例表，不進 characterBag（`51-auto-talent.md` § 51.11）。
    // 不佔背包格，所以不需要容量檢查，撿不到的情況不存在。
    // 條件與動作不掉落 —— 一律內建（§ 51.4.1）
    const talentDropMult = 1 + dropBonuses.drop_rate / 100;
    const talentSlotTier = rollTalentSlotDrop(areaLevel, monsterIsBoss, talentDropMult);
    const talentLogs: string[] = [];
    if (char.id && talentSlotTier !== null) {
      await db.talentSlots.add({
        characterId: char.id,
        tier: talentSlotTier,
        assignedType: null,
        templateId: null,
        order: null,
        enabled: true,
        conditions: emptyConditions(talentSlotTier),
        action: null,
      });
      talentLogs.push(`獲得天賦格（T${talentSlotTier}）`);
      // 掉落只寫 DB，天賦面板與背包分頁讀的是 store，不重載就要等下次載入角色才看得到
      await useTalentStore.getState().load(char.id);
    }

    const state2 = get();
    if (!state2.character) return;
    let char2 = { ...state2.character };
    const logs2 = [...state2.combatLogs];
    let newBag = state2.bagItems.map(b => ({ ...b }));
    const newEquipInv = [...state2.inventory];

    for (const text of talentLogs) logs2.push({ text, type: 'loot' });

    char2.gold += drops.gold;
    if (drops.gold > 0) {
      logs2.push({ text: `獲得 ${drops.gold} 金幣`, type: 'loot' });
    }
    for (const item of drops.items) {
      if (item.equipmentInstance) {
        if (getBagUsedSlots(newBag, newEquipInv, state2.equippedGear) >= getBagMaxSlots(state2.equippedGear)) {
          logs2.push({ text: `背包已滿，${item.name} 被丟棄`, type: 'system' });
        } else {
          newEquipInv.push(item.equipmentInstance);
          logs2.push({ text: `獲得 ${item.name}${item.amount > 1 ? ` ×${item.amount}` : ''}`, type: 'loot' });
        }
      } else if (item.type === 'potion' || item.type === 'material' || item.type === 'scroll' || item.type === 'spellbook') {
        if (item.itemTemplateId == null) {
          logs2.push({ text: `無法處理掉落物 ${item.name}（缺少道具 id）`, type: 'system' });
        } else if (!isSigilItemId(item.itemTemplateId)
          && !hasBagItem(newBag, item.itemTemplateId)
          && getBagUsedSlots(newBag, newEquipInv, state2.equippedGear) >= getBagMaxSlots(state2.equippedGear)) {
          // 印記不佔格（§ 35.20），背包再滿都收得下
          logs2.push({ text: `背包已滿，${item.name} 被丟棄`, type: 'system' });
        } else {
          newBag = addBagItem(newBag, item.itemTemplateId, item.amount);
          logs2.push({ text: `獲得 ${item.name}${item.amount > 1 ? ` ×${item.amount}` : ''}`, type: 'loot' });
        }
      } else {
        logs2.push({ text: `無法處理掉落物 ${item.name}（未知類型：${item.type}）`, type: 'system' });
      }
    }

    // 任務進度：跑腿（擊殺數）
    char2 = updateErrandProgress(char2, dropAreaId, 1);

    // 任務進度：收集（素材掉落）
    if (rollQuestMaterialDrop(char2, defeatedMonsterName)) {
      const questMaterialId = getItemId(QUEST_MATERIAL_NAME);
      if (questMaterialId != null
        && (hasBagItem(newBag, questMaterialId)
          || getBagUsedSlots(newBag, newEquipInv, state2.equippedGear) < getBagMaxSlots(state2.equippedGear))) {
        newBag = addBagItem(newBag, questMaterialId, 1);
      }
      char2 = updateCollectProgress(char2, 1);
      logs2.push({ text: `獲得 ${QUEST_MATERIAL_NAME}`, type: 'loot' });
    }

    // 冒險者工會任務進度
    let advQuests = updateAdvQuestProgress(state2.adventurerQuests, dropAreaId, defeatedMonsterName, 1);
    if (rollAdvCollectDrop(state2.adventurerQuests, defeatedMonsterName)) {
      advQuests = updateAdvCollectProgress(advQuests, defeatedMonsterName, 1);
    }

    // 統計計數
    const stats = { ...state2.statistics };
    stats.monstersKilled += 1;
    if (monsterIsBoss) stats.bossesKilled += 1;
    if (drops.gold > 0) stats.totalGoldEarned += drops.gold;
    // T7 掉落計數（`37-statistics.md` § 37.3）：以「掉出來」為準，
    // 背包滿而被丟棄的那件仍然計入 —— 記錄的是運氣，不是持有數。
    for (const item of drops.items) {
      if (item.equipmentTier !== BOSS_DROP_ONLY_TIER || !item.equipmentInstance) continue;
      const inst = item.equipmentInstance;
      if (isWeaponEquipment(inst.slot, inst.type)) stats.tier7WeaponsLooted += 1;
      else stats.tier7ArmorsLooted += 1;
    }

    newBag = newBag.filter(b => b.amount > 0);

    set({
      character: char2,
      combatLogs: logs2.slice(-MAX_LOGS),
      inventory: newEquipInv,
      bagItems: newBag,
      adventurerQuests: advQuests,
      statistics: stats,
    });
  });

  return { char, logs };
}

let dropQueue: Promise<void> = Promise.resolve();

export function waitForPendingDrops(): Promise<void> {
  return dropQueue;
}

/**
 * 自動天賦與信箱的初始化（`51-auto-talent.md`、`52-mailbox.md`）。
 * 載入角色與**創角**都要跑 —— 創角不跑的話新角色身上一個天賦格都沒有。
 *
 * 順序有意義：
 * 1. 換版清理先做，只刪已領取的（§ 52.7.1）
 * 2. 補發天賦格信（走發放計數）
 * 3. 這一版的補償
 * 4. 起始配置只在完全沒有資料時發
 */
let talentInitPromise: Promise<void> = Promise.resolve();

export function talentInitReady(): Promise<void> {
  return talentInitPromise;
}

function startTalentAndMailboxInit(characterId: number, level: number): void {
  talentInitPromise = initTalentAndMailbox(characterId, level);
}

async function initTalentAndMailbox(characterId: number, level: number): Promise<void> {
  try {
    await purgeClaimedMailOnVersionChange(characterId, BUILD_INFO.version);
    await syncTalentSlotGrants(characterId, level);
    await syncCompensations(characterId, BUILD_INFO.version);
    await useTalentStore.getState().grantStartingIfEmpty(characterId);
  } catch {
    // 發放失敗不可中斷載入，否則面板會停在空的
  }

  try {
    await useTalentStore.getState().load(characterId);
    await useMailboxStore.getState().load(characterId);
  } catch {
    // 背景初始化，失敗只是天賦格晚一點出現。測試關掉 DB 時最常見（DatabaseClosedError）
  }
}

/**
 * 常駐天賦的喝藥（`51-auto-talent.md` § 51.4.10）。
 * `potion` 與 `refill_to_percent` 共用 —— 冷卻、存量、詞綴加成三件事必須一致。
 */
function drinkPotion(
  set: (partial: Partial<GameState>) => void,
  state: GameState,
  char: Character,
  allGear: EquipmentInstance[],
  now: number,
  potionType: PotionType,
): void {
  const config = POTION_CONFIG[potionType];
  if (now - state.lastPotionUsedAt < state.lastPotionCooldown) return;
  if (getPotionCount(state.bagItems, potionType) <= 0) return;

  const bonuses = getAffixBonusesFromGear(allGear);
  const baseHeal = Math.floor(Math.random() * (config.healMax - config.healMin + 1)) + config.healMin;
  const heal = Math.floor(baseHeal * (1 + bonuses.potion_effect / 100));
  const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
  set({
    character: { ...char, hp: Math.min(effMaxHp, char.hp + heal) },
    bagItems: consumePotionFromBag(state.bagItems, potionType),
    lastPotionUsedAt: now,
    lastPotionCooldown: config.cooldown,
    combatLogs: addLog(state.combatLogs, { text: `使用${config.name}回復 ${heal} HP`, type: 'system' as const }),
  });
}

/** buff 是否還在生效。判定與 `buff_not_active` 條件同一套（`systems/scriptRunner.ts`） */
function isBuffActive(
  skillId: string, skills: Skill[], activeEffects: ActiveEffect[], now: number,
): boolean {
  const category = skills.find(s => s.id === skillId)?.buffCategory;
  if (!category) return false;
  const active = activeEffects.find(
    e => e.category === category && e.type === 'buff' && e.target === 'player',
  );
  return active !== undefined && now - active.startTime < active.duration;
}

/**
 * 使用指定消耗品（§ 51.4.10）。依道具 id 分派到既有的使用路徑，
 * 不另寫一套消耗與效果邏輯。
 */
function useConsumableById(get: () => GameState, itemId: number): void {
  const potion = (Object.entries(POTION_CONFIG) as [PotionType, { itemId: number }][])
    .find(([, c]) => c.itemId === itemId);
  if (potion) { get().usePotionByType(potion[0]); return; }

  const speed = (Object.entries(SPEED_POTION_CONFIG) as [SpeedPotionType, { itemId: number }][])
    .find(([, c]) => c.itemId === itemId);
  if (speed) { get().useSpeedPotion(speed[0]); return; }

  if (getTownScrollByItemId(itemId)) { get().useTownScroll(itemId); return; }

  get().useCureItem(itemId);
}

let saveQueue: Promise<void> = Promise.resolve();

/** 存檔唯一入口，不可直接呼叫 `writeSave()`。串成佇列使寫入順序等於呼叫順序 */
function saveGame(state: GameState): Promise<void> {
  const mapPos = useMapControlStore.getState().playerPosition;
  const mine = saveQueue.then(() => writeSave(state, mapPos));
  saveQueue = mine.catch(() => {});
  return mine;
}

async function writeSave(state: GameState, mapPos: { x: number; y: number }) {
  const char = state.character;
  if (!char || !char.id) return;

  await db.characters.update(char.id, {
    level: char.level,
    exp: char.exp,
    expToNext: char.expToNext,
    hp: char.hp,
    maxHp: char.maxHp,
    mp: char.mp,
    maxMp: char.maxMp,
    gold: char.gold,
    skills: state.skills,
    quests: char.quests ?? [],
    bonusAttributes: char.bonusAttributes,
    unspentAttributePoints: char.unspentAttributePoints,
    currentArea: char.currentArea,
    currentZone: char.currentZone,
    currentRegion: char.currentRegion,
    currentFloor: char.currentFloor,
    areaEnteredAt: char.areaEnteredAt,
    areaKills: char.areaKills ?? 0,
    // 這兩個漏掉的話離線時長永遠算不出來（`18-data-schema.md` § 18.11）
    restedExpMs: char.restedExpMs ?? 0,
    lastSeenAt: char.lastSeenAt ?? Date.now(),
    mapPositionX: Math.round(mapPos.x),
    mapPositionY: Math.round(mapPos.y),
  });

  // Save bag items (all items including potions)
  await db.characterBag.where('characterId').equals(char.id).delete();
  const bagEntries: CharacterBagEntry[] = [];
  for (const item of state.bagItems) {
    if (item.amount > 0) {
      bagEntries.push({ characterId: char.id, name: item.name, type: item.type, itemTemplateId: item.itemId, amount: item.amount });
    }
  }
  if (bagEntries.length > 0) {
    await db.characterBag.bulkAdd(bagEntries);
  }

  // Save shared warehouse (account-level storage)
  const userId = state.userId;
  if (userId) {
    await db.warehouses.where('userId').equals(userId)
      .filter(row => !row.storageType || row.storageType === 'shared')
      .delete();
    const warehouseEntries: WarehouseEntry[] = [];
    for (const item of state.storedMaterials) {
      if (item.amount > 0) {
        warehouseEntries.push({ userId, name: item.name, type: item.type, itemTemplateId: item.itemId, amount: item.amount, storageType: 'shared' });
      }
    }
    if (warehouseEntries.length > 0) {
      await db.warehouses.bulkAdd(warehouseEntries);
    }
    // 金幣走獨立表：以 userId 為主鍵 put，不需要先刪再寫（§ 18.7）。
    // 餘額為 0 也要寫。
    await db.warehouseGold.put({ userId, amount: state.warehouseGold });
  }

  // Save personal warehouse (character-level storage)
  if (userId) {
    await db.warehouses.where('characterId').equals(char.id)
      .filter(row => row.storageType === 'personal')
      .delete();
    const personalEntries: WarehouseEntry[] = [];
    for (const item of state.personalStoredMaterials) {
      if (item.amount > 0) {
        personalEntries.push({ userId, name: item.name, type: item.type, itemTemplateId: item.itemId, amount: item.amount, storageType: 'personal', characterId: char.id });
      }
    }
    if (personalEntries.length > 0) {
      await db.warehouses.bulkAdd(personalEntries);
    }
  }

  // Save script rules + quick slots to localStorage
  saveLocalPreferences(char.id, state);
}

function saveLocalPreferences(characterId: number, state: GameState) {
  const key = `mayana_prefs_${characterId}`;
  const data = {
    scriptRules: state.scriptRules,
    scriptTemplates: state.scriptTemplates,
    activeTemplateId: state.activeTemplateId,
    lastHuntLocation: state.lastHuntLocation,
    huntReturnPending: state.huntReturnPending,
    quickSlots: state.quickSlots,
    afterCombatHpThreshold: state.afterCombatHpThreshold,
    afterCombatMpThreshold: state.afterCombatMpThreshold,
    afterCombatHpResumeThreshold: state.afterCombatHpResumeThreshold,
    afterCombatMpResumeThreshold: state.afterCombatMpResumeThreshold,
    adventurerQuests: state.adventurerQuests,
    guildProgress: state.guildProgress,
    craftQuests: state.craftQuests,
    statistics: state.statistics,
  };
  localStorage.setItem(key, JSON.stringify(data));
}

function saveBagLayout(characterId: number, slotMap: BagSlotMap) {
  localStorage.setItem(bagLayoutStorageKey(characterId), JSON.stringify(slotMap));
}

function loadBagLayout(characterId: number): BagSlotMap {
  const raw = localStorage.getItem(bagLayoutStorageKey(characterId));
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const next: BagSlotMap = {};
    for (const [id, idx] of Object.entries(data)) {
      if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0) next[id] = idx;
    }
    return next;
  } catch {
    return {};
  }
}

interface LoadedPreferences {
  scriptRules: ScriptRule[];
  scriptTemplates: ScriptTemplate[];
  activeTemplateId: string;
  lastHuntLocation: HuntLocation | null;
  huntReturnPending: boolean;
  quickSlots: QuickSlots;
  afterCombatHpThreshold: number;
  afterCombatMpThreshold: number;
  afterCombatHpResumeThreshold: number;
  afterCombatMpResumeThreshold: number;
  adventurerQuests: AdventurerQuest[];
  guildProgress: GuildProgress;
  craftQuests: CraftQuest[];
  statistics: CharacterStatistics;
}

/** 舊存檔可能存有已移除的 flee_teleport，統一導回回城（§ 3.13） */
function migrateEmergencyRetreat(saved: EmergencyRetreat | undefined): EmergencyRetreat {
  if (!saved) return DEFAULT_EMERGENCY_RETREAT;
  if (saved.action !== 'flee_town') {
    return { ...saved, action: 'flee_town', scrollTownId: undefined };
  }
  return saved;
}

/**
 * 還沒有 template 概念的存檔：只撈得回緊急撤退，包成名為「預設」的第一頁。
 *
 * 舊存檔的三個規則陣列隨自動天賦改版廢除，這裡直接丟棄不再轉換
 * （規則本體現在在天賦格，見 `51-auto-talent.md`）。
 */
function wrapLegacyScriptsAsTemplate(data: any): ScriptTemplate[] {
  return [{
    ...createDefaultTemplate(),
    emergencyRetreat: migrateEmergencyRetreat(data.emergencyRetreat),
  }];
}

function loadLocalPreferences(characterId: number): LoadedPreferences | null {
  const key = `mayana_prefs_${characterId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    /**
     * 腳本一律走 normalize：認不得的舊格式**整份重置成預設**，不做欄位轉換。
     * 腳本以外的欄位（快捷列、統計、公會、冒險者／工藝任務）照常讀回來 ——
     * 那些是進度資料，不該被腳本格式的世代交替波及。
     */
    const templates = normalizeScriptTemplates(
      data.scriptTemplates ?? wrapLegacyScriptsAsTemplate(data)
    );
    return {
      ...data,
      scriptTemplates: templates,
      activeTemplateId: templates.some((t: ScriptTemplate) => t.id === data.activeTemplateId)
        ? data.activeTemplateId
        : templates[0].id,
      lastHuntLocation: data.lastHuntLocation ?? null,
      huntReturnPending: data.huntReturnPending ?? false,
      quickSlots: normalizeQuickSlots(data.quickSlots),
      afterCombatHpThreshold: data.afterCombatHpThreshold ?? 30,
      afterCombatMpThreshold: data.afterCombatMpThreshold ?? 20,
      afterCombatHpResumeThreshold: data.afterCombatHpResumeThreshold ?? 60,
      afterCombatMpResumeThreshold: data.afterCombatMpResumeThreshold ?? 60,
      adventurerQuests: data.adventurerQuests ?? [],
      guildProgress: data.guildProgress ?? { rank: 'F', points: 0 },
      craftQuests: data.craftQuests ?? [],
      statistics: normalizeStatistics(data.statistics),
    };
  } catch {
    return null;
  }
}
