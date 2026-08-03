import { create } from 'zustand';
import type { Character, ClassName, Attributes } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import { useMapMonsterStore } from './mapMonsterStore';
import { useMapControlStore } from './mapControlStore';
import type { EquipmentInstance, EquippedGear } from '../models/equipment';
import type { Skill } from '../models/skill';
import { CURRENT_DATA_VERSION } from '../config';
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
import { purgeOutdatedData } from '../systems/dataVersionPurge';
import { getExpToNextLevel, addExp, INITIAL_HP, INITIAL_MP } from '../systems/levelUp';
import { SKILL_WIND_BLADE, canUseSkill } from '../models/skill';
import { instantiateFromTemplate, getSkillTemplate } from '../models/skillTemplate';
import { getSkillCooldownReduction, getAffixBonusesFromGear } from '../systems/combat';
import { rollDrops, rollBossDrops } from '../systems/drops';
import { updateErrandProgress, rollQuestMaterialDrop, updateCollectProgress, acceptQuest as acceptQuestAction, completeQuest as completeQuestAction } from '../systems/questSystem';
import { QUEST_MATERIAL_NAME } from '../models/quest';
import type { AdventurerQuest, GuildProgress, AdventurerQuestDifficulty, QuestTownId } from '../models/adventurerQuest';
import { generateQuestList, generateSingleQuest as generateAdvSingleQuest, acceptQuest as acceptAdvQuest, abandonQuest as abandonAdvQuest, updateQuestProgress as updateAdvQuestProgress, updateCollectQuestProgress as updateAdvCollectProgress, rollCollectMaterialDrop as rollAdvCollectDrop, completeQuest as completeAdvQuest } from '../systems/adventurerQuestSystem';
import { getTownDifficulties } from '../models/adventurerQuest';
import type { CharacterStatistics } from '../models/statistics';
import { createDefaultStatistics } from '../models/statistics';
import { getHpRegen, getMpRegen, HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../systems/regen';
import { evaluatePersistentScript, evaluateEmergencyRetreat, type PersistentScriptContext, type EmergencyRetreatContext } from '../systems/scriptRunner';
import type { ScriptRule, CombatRule, PersistentRule, EmergencyRetreat } from '../models/scriptEngine';
import { DEFAULT_SCRIPT, DEFAULT_COMBAT_SCRIPT, DEFAULT_PERSISTENT_SCRIPT, DEFAULT_EMERGENCY_RETREAT } from '../models/scriptEngine';
import type { MapLocation } from '../models/area';
import { getRegion, ZONES } from '../models/mapData';
import { canNavigateTo, consumeScroll } from '../systems/navigation';
import { resolveEquipment } from '../systems/templateSync';
import { findScrollInBag, consumeTownScroll, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { db, type CharacterBagEntry, type WarehouseEntry } from '../db/database';

/** `legacy` 為遺產頁（§ 45.3）：唯讀，只能返回 characterSelect，不可進入任何遊玩畫面 */
export type GamePhase = 'title' | 'characterSelect' | 'create' | 'legacy' | 'explore' | 'combat' | 'result' | 'dead';
export type SearchMode = 'auto' | 'manual';

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

export const POTION_CONFIG: Record<PotionType, { healMin: number; healMax: number; cooldown: number; name: string }> = {
  red: { healMin: 10, healMax: 15, cooldown: 600, name: '紅色藥水' },
  orange: { healMin: 30, healMax: 45, cooldown: 900, name: '橙色藥水' },
  white: { healMin: 60, healMax: 90, cooldown: 1500, name: '白色藥水' },
};

export const SPEED_POTION_CONFIG: Record<SpeedPotionType, { duration: number; name: string; bagName: string }> = {
  green: { duration: 180000, name: '綠色藥水', bagName: '綠色藥水' },
  'enhanced-green': { duration: 900000, name: '強化綠色藥水', bagName: '強化綠色藥水' },
};

export function getPotionName(type: PotionType): string {
  return POTION_CONFIG[type].name;
}

export function getPotionCount(bagItems: BagItem[], type: PotionType): number {
  const name = getPotionName(type);
  const item = bagItems.find(b => b.name === name && b.type === 'potion');
  return item?.amount ?? 0;
}

export function addPotionToBag(bagItems: BagItem[], type: PotionType, amount: number): BagItem[] {
  const name = getPotionName(type);
  const newBag = bagItems.map(b => ({ ...b }));
  const existing = newBag.find(b => b.name === name && b.type === 'potion');
  if (existing) {
    existing.amount += amount;
  } else {
    const potionIds: Record<PotionType, number> = { red: 1, orange: 2, white: 3 };
    newBag.push({ name, type: 'potion', itemTemplateId: potionIds[type], amount });
  }
  return newBag;
}

export function consumePotionFromBag(bagItems: BagItem[], type: PotionType): BagItem[] {
  const name = getPotionName(type);
  return bagItems
    .map(b => b.name === name && b.type === 'potion' ? { ...b, amount: b.amount - 1 } : { ...b })
    .filter(b => b.amount > 0);
}

/** § 35.1：背包基礎格數。腰帶可再擴充，見 `getBagMaxSlots()` */
export const BAG_BASE_SLOTS = 50;

/**
 * 背包實際格數 = 基礎 50 + 腰帶的 `bonusBagSlots`（§ 35.1）。
 * 腰帶最高 +15，因此上限為 65 格。
 */
export function getBagMaxSlots(gear: EquippedGear): number {
  const bonus = Object.values(gear).reduce(
    (sum, item) => sum + (item?.bonusBagSlots ?? 0),
    0,
  );
  return BAG_BASE_SLOTS + bonus;
}

export function getBagUsedSlots(bagItems: BagItem[], inventory: EquipmentInstance[]): number {
  return bagItems.length + inventory.length;
}

export function isBagFull(
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
  gear: EquippedGear,
): boolean {
  return getBagUsedSlots(bagItems, inventory) >= getBagMaxSlots(gear);
}

/**
 * 換裝後背包是否會超出上限（§ 35.1）。
 *
 * 卸下腰帶會**同時**造成兩件事：多佔一格（腰帶進背包）＋上限下降（`bonusBagSlots` 消失），
 * 因此必須用「換裝後的裝備狀態」與「換裝後的佔格數」一起判定，不能只看目前是否已滿。
 *
 * @param gearAfter  換裝後的裝備狀態
 * @param slotDelta  換裝造成的佔格變化（卸下 +1、單純穿上 -1、替換 0）
 */
export function wouldOverflowBag(
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
  gearAfter: EquippedGear,
  slotDelta: number,
): boolean {
  return getBagUsedSlots(bagItems, inventory) + slotDelta > getBagMaxSlots(gearAfter);
}

/**
 * § 35.5.3：從背包拖到地圖上、等待玩家確認的丟棄請求。
 * 堆疊物品會在確認視窗讓玩家選擇數量。
 */
export interface PendingDiscard {
  kind: 'bag' | 'equipment';
  name: string;
  /** 可丟棄的最大數量（裝備恆為 1） */
  maxAmount: number;
  /** kind === 'equipment' 時的實例 id */
  equipmentId?: number;
}

export interface BagItem {
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
}

export interface CharacterSummary {
  id: number;
  name: string;
  className: ClassName;
  level: number;
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
  combatRules: CombatRule[];
  persistentRules: PersistentRule[];
  emergencyRetreat: EmergencyRetreat;
  persistentLoopId: number | null;
  lastPotionUsedAt: number;
  lastPotionCooldown: number;
  searchMode: SearchMode;
  isManualSearching: boolean;
  manualSearchId: number | null;
  afterCombatHpThreshold: number;
  afterCombatMpThreshold: number;
  afterCombatHpResumeThreshold: number;
  afterCombatMpResumeThreshold: number;
  quickSlots: QuickSlots;
  storedEquipment: EquipmentInstance[];
  storedMaterials: BagItem[];
  warehouseGold: number;
  personalStoredEquipment: EquipmentInstance[];
  personalStoredMaterials: BagItem[];
  activeEffects: ActiveEffect[];
  adventurerQuests: AdventurerQuest[];
  adventurerQuestBoard: Record<AdventurerQuestDifficulty, AdventurerQuest[]>;
  questBoardTownId: QuestTownId | null;
  guildProgress: GuildProgress;
  statistics: CharacterStatistics;

  setPhase: (phase: GamePhase) => void;
  initUser: () => Promise<void>;
  loadCharacterList: () => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
  logout: () => Promise<void>;
  /** `uuid` 由建立畫面先產生並向排行榜註冊，註冊成功後才傳入（§ 19.4）；省略時自行產生。 */
  createCharacter: (name: string, className: ClassName, bonusAttrs: Attributes, uuid?: string) => Promise<void>;
  loadCharacter: () => Promise<boolean>;
  startExploring: () => void;
  stopExploring: () => void;
  manualSearch: () => void;
  cancelManualSearch: () => void;
  setSearchMode: (mode: SearchMode) => void;
  startRegen: () => void;
  stopRegen: () => void;
  equipItem: (item: EquipmentInstance) => void;
  unequipItem: (slot: keyof EquippedGear) => void;
  usePotion: () => void;
  usePotionByType: (type: PotionType) => void;
  useSpeedPotion: (type: SpeedPotionType) => void;
  assignQuickSlot: (slotIdx: number, entry: QuickSlotEntry | null) => void;
  useQuickSlot: (slotIdx: number) => void;
  useTownScroll: (scrollName: string) => void;
  useCureItem: (itemName: string) => void;
  changeArea: (areaId: string) => void;
  navigateTo: (location: MapLocation) => void;
  setScriptRules: (rules: ScriptRule[]) => void;
  setCombatRules: (rules: CombatRule[]) => void;
  setPersistentRules: (rules: PersistentRule[]) => void;
  setEmergencyRetreat: (retreat: EmergencyRetreat) => void;
  startPersistentLoop: () => void;
  stopPersistentLoop: () => void;
  addEffect: (effect: ActiveEffect) => void;
  removeEffect: (id: string) => void;
  clearExpiredEffects: () => void;
  discardBagItem: (name: string, amount?: number) => void;
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
  initQuestBoard: () => void;
  saveState: () => void;
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

export function getEffectiveMaxHp(char: Character, gear: EquippedGear): number {
  const allGear = Object.values(gear).filter(Boolean) as EquipmentInstance[];
  const bonuses = getAffixBonusesFromGear(allGear);
  const flatHp = allGear.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0);
  return Math.floor((char.maxHp + flatHp) * (1 + bonuses.max_hp / 100));
}

export function getEffectiveMaxMp(char: Character, gear: EquippedGear): number {
  const allGear = Object.values(gear).filter(Boolean) as EquipmentInstance[];
  const bonuses = getAffixBonusesFromGear(allGear);
  const flatMp = allGear.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0);
  return Math.floor((char.maxMp + flatMp) * (1 + bonuses.max_mp / 100));
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
  combatRules: DEFAULT_COMBAT_SCRIPT,
  persistentRules: DEFAULT_PERSISTENT_SCRIPT,
  emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
  persistentLoopId: null,
  lastPotionUsedAt: 0,
  lastPotionCooldown: 0,
  searchMode: 'auto',
  isManualSearching: false,
  manualSearchId: null,
  afterCombatHpThreshold: 30,
  afterCombatMpThreshold: 20,
  afterCombatHpResumeThreshold: 60,
  afterCombatMpResumeThreshold: 60,
  quickSlots: emptyQuickSlots(),
  storedEquipment: [],
  storedMaterials: [],
  warehouseGold: 0,
  personalStoredEquipment: [],
  personalStoredMaterials: [],
  activeEffects: [],
  adventurerQuests: [],
  adventurerQuestBoard: { D: [], C: [], B: [], A: [], S: [] },
  questBoardTownId: null,
  guildProgress: { rank: 'F', points: 0 },
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
    const bagItems: BagItem[] = [];
    for (const row of bagRows) {
      bagItems.push({ name: row.name, type: row.type, itemTemplateId: row.itemTemplateId, amount: row.amount });
    }

    // Load warehouse materials (account-level shared storage)
    const warehouseRows = await db.warehouses.where('userId').equals(userId)
      .filter(row => !row.storageType || row.storageType === 'shared')
      .toArray();
    const storedMaterials: BagItem[] = [];
    let warehouseGold = 0;
    for (const row of warehouseRows) {
      if (row.type === 'gold') {
        warehouseGold = row.amount;
      } else if (row.type !== 'equipment') {
        storedMaterials.push({ name: row.name, type: row.type as BagItem['type'], itemTemplateId: row.itemTemplateId, amount: row.amount });
      }
    }

    // Load personal warehouse materials (character-level storage)
    const personalWarehouseRows = await db.warehouses
      .where('characterId').equals(char.id!)
      .filter(row => row.storageType === 'personal')
      .toArray();
    const personalStoredMaterials: BagItem[] = [];
    for (const row of personalWarehouseRows) {
      if (row.type !== 'equipment' && row.type !== 'gold') {
        personalStoredMaterials.push({ name: row.name, type: row.type as BagItem['type'], itemTemplateId: row.itemTemplateId, amount: row.amount });
      }
    }

    const prefs = loadLocalPreferences(char.id!);
    const scriptRules = prefs?.scriptRules ?? DEFAULT_SCRIPT;
    const combatRules = prefs?.combatRules ?? DEFAULT_COMBAT_SCRIPT;
    const persistentRules = prefs?.persistentRules ?? DEFAULT_PERSISTENT_SCRIPT;
    const emergencyRetreat = prefs?.emergencyRetreat ?? DEFAULT_EMERGENCY_RETREAT;
    const quickSlots = normalizeQuickSlots(prefs?.quickSlots);
    const afterCombatHpThreshold = prefs?.afterCombatHpThreshold ?? 30;
    const afterCombatMpThreshold = prefs?.afterCombatMpThreshold ?? 20;
    const afterCombatHpResumeThreshold = prefs?.afterCombatHpResumeThreshold ?? 60;
    const afterCombatMpResumeThreshold = prefs?.afterCombatMpResumeThreshold ?? 60;
    const adventurerQuests = prefs?.adventurerQuests ?? [];
    const guildProgress = prefs?.guildProgress ?? { rank: 'F', points: 0 };
    const statistics = prefs?.statistics ?? createDefaultStatistics();

    // Reset areaEnteredAt so pressure doesn't accumulate during character select
    char.areaEnteredAt = Date.now();

    // Backfill unspent attribute points for legacy characters above level 50
    if (char.unspentAttributePoints == null) {
      char.unspentAttributePoints = char.level > 50 ? char.level - 50 : 0;
    }

    // Backfill quests for legacy characters
    if (!char.quests) {
      char.quests = [];
    }

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
      combatRules,
      persistentRules,
      emergencyRetreat,
      quickSlots,
      afterCombatHpThreshold,
      afterCombatMpThreshold,
      afterCombatHpResumeThreshold,
      afterCombatMpResumeThreshold,
      adventurerQuests,
      guildProgress,
      statistics,
      phase: 'explore',
    });
    get().startRegen();
    get().startPersistentLoop();
    get().initQuestBoard();
    const region = getRegion(char.currentRegion);
    if (region?.type !== 'town') {
      get().startExploring();
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
    await db.characters.delete(characterId);
    localStorage.removeItem(`mayana_prefs_${characterId}`);
    await get().loadCharacterList();
  },

  logout: async () => {
    get().stopExploring();
    get().stopRegen();
    get().stopPersistentLoop();
    get().cancelManualSearch();
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
      combatRules: DEFAULT_COMBAT_SCRIPT,
      persistentRules: DEFAULT_PERSISTENT_SCRIPT,
      emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
      quickSlots: emptyQuickSlots(),
      adventurerQuests: [],
      adventurerQuestBoard: { D: [], C: [], B: [], A: [], S: [] },
  questBoardTownId: null,
      guildProgress: { rank: 'F', points: 0 },
    });
    await get().loadCharacterList();
  },

  createCharacter: async (name, className, bonusAttrs, uuid) => {
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
      uuid: uuid ?? generateCharacterUuid(),
      userId,
      name,
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
        ownerId: char.id!, equipped: true, isStarterGear: true,
      };
      const instId = await db.equipmentInstances.add(dbRecord as any);
      equippedGear[template.slot as keyof EquippedGear] = resolveEquipment({
        id: instId as number, templateId: template.id!, name: template.name, type: template.type,
        slot: template.slot, isTwoHanded: template.isTwoHanded,
        quality: 0, enhancement: 0, affixes: [], ownerId: char.id!, equipped: true, isStarterGear: true,
      });
    }

    // Save initial bag items to DB
    await db.characterBag.bulkAdd([
      { characterId: char.id!, name: '紅色藥水', type: 'potion', itemTemplateId: 1, amount: 10 },
    ]);

    set({
      character: char,
      equippedGear,
      inventory: [],
      skills: startingSkills,
      bagItems: [{ name: '紅色藥水', type: 'potion', itemTemplateId: 1, amount: 10 }],
      adventurerQuests: [],
      adventurerQuestBoard: { D: [], C: [], B: [], A: [], S: [] },
  questBoardTownId: null,
      guildProgress: { rank: 'F', points: 0 },
      phase: 'explore',
    });
    get().startRegen();
    get().initQuestBoard();
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

  manualSearch: () => {
    // Map control system handles encounter via red dot collision
    // Manual search is now just "manual movement" on the map (player clicks to move)
  },

  cancelManualSearch: () => {
    const state = get();
    if (state.manualSearchId) {
      clearInterval(state.manualSearchId);
    }
    set({ isManualSearching: false, manualSearchId: null });
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
      const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
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
      const allGearMp = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
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

    // Two-handed mutual exclusion (check BEFORE unequipping existing)
    if (item.isTwoHanded) {
      const otherSlot = targetSlot === 'rightHand' ? 'leftHand' : 'rightHand';
      if (gear[otherSlot]) {
        set({ combatLogs: addLog(state.combatLogs, { text: `無法裝備 ${item.name}，需先卸除副手裝備`, type: 'system' }) });
        return;
      }
    }
    if (!item.isTwoHanded && (targetSlot === 'leftHand' || targetSlot === 'rightHand')) {
      const otherSlot = targetSlot === 'rightHand' ? 'leftHand' : 'rightHand';
      if (gear[otherSlot]?.isTwoHanded) {
        set({ combatLogs: addLog(state.combatLogs, { text: `無法裝備 ${item.name}，已裝備雙手武器`, type: 'system' }) });
        return;
      }
    }

    // § 35.1：換成格數較少的腰帶同樣可能溢出（替換時佔格不變，但上限會降）
    const existingInSlot = gear[targetSlot];
    const gearAfterEquip: EquippedGear = { ...gear, [targetSlot]: item };
    const slotDelta = existingInSlot ? 0 : -1;
    if (wouldOverflowBag(state.bagItems, state.inventory, gearAfterEquip, slotDelta)) {
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

    // § 35.1：卸下腰帶會同時多佔一格並降低上限，必須以卸下後的狀態判定
    const gearAfter: EquippedGear = { ...state.equippedGear, [slot]: null };
    if (wouldOverflowBag(state.bagItems, state.inventory, gearAfter, 1)) {
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
    const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
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

    const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
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
  },

  useSpeedPotion: (type) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;
    const config = SPEED_POTION_CONFIG[type];
    const bagName = config.bagName;
    const bagItem = state.bagItems.find(i => i.name === bagName);
    if (!bagItem || bagItem.amount <= 0) return;

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

    const newBag = state.bagItems.map(i =>
      i.name === bagName ? { ...i, amount: i.amount - 1 } : i
    ).filter(i => i.amount > 0);

    set({
      activeEffects: applied.effects,
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, applied.cancelledSlow
        ? { text: `使用${config.name}，解除減速`, type: 'debuff-self' }
        : { text: `使用${config.name}（攻速+33%）`, type: 'system' }),
    });
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
            || (s.kind === 'bagItem' && entry.kind === 'bagItem' && s.name === entry.name)
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
        get().useCureItem(action.name);
        return;
      case 'townScroll':
        get().useTownScroll(action.name);
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
        const item = state.inventory.find(i => i.id === action.equipmentId);
        if (!item) {
          // 裝備已被賣掉／丟棄／穿上 → 該格失效，直接清空
          get().assignQuickSlot(slotIdx, null);
          return;
        }
        get().equipItem(item);
        get().assignQuickSlot(slotIdx, null);
        return;
      }
    }
  },

  useCureItem: (itemName) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;

    const def = getCureItem(itemName);
    if (!def) return;

    const bagItem = state.bagItems.find(b => b.name === itemName && b.amount > 0);
    if (!bagItem) return;

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
    const newBag = state.bagItems
      .map(b => (b.name === itemName ? { ...b, amount: b.amount - 1 } : b))
      .filter(b => b.amount > 0);

    set({
      activeEffects: remaining,
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, {
        text: `使用${itemName}，解除 ${cleared.map(e => e.name).join('、')}`,
        type: 'debuff-self',
      }),
    });
  },

  useTownScroll: (scrollName) => {
    const state = get();
    if (!state.character) return;
    if (blockedByStun(state, set)) return;

    const scrollInfo = Object.values(TOWN_SCROLL_CONFIG).find(s => s.name === scrollName);
    if (!scrollInfo) return;

    const scrollItem = state.bagItems.find(b => b.name === scrollName && b.amount > 0);
    if (!scrollItem) return;

    const newBag = consumeTownScroll(state.bagItems, scrollName);
    const char = { ...state.character };
    char.currentArea = scrollInfo.townId;
    char.currentRegion = scrollInfo.townId;
    char.currentFloor = null;
    char.mapPositionX = undefined;
    char.mapPositionY = undefined;
    const townZone = ZONES.find(z => z.regions.includes(scrollInfo.townId));
    if (townZone) char.currentZone = townZone.id;
    char.areaEnteredAt = Date.now();

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

    if (region?.entryScrollName) {
      const scrollIdx = state.bagItems.findIndex(b => b.name === region.entryScrollName && b.amount > 0);
      if (scrollIdx === -1) {
        set({ combatLogs: addLog(state.combatLogs, { text: `需要 ${region.entryScrollName} 才能進入！`, type: 'system' }) });
        return;
      }
      const newBag = state.bagItems.map((b, i) =>
        i === scrollIdx ? { ...b, amount: b.amount - 1 } : b
      ).filter(b => b.amount > 0);
      set({ bagItems: newBag });
    }

    const zone = region ? ZONES.find(z => z.id === region.zoneId) : undefined;
    const updated = {
      ...state.character,
      currentArea: areaId,
      currentZone: zone?.id ?? state.character.currentZone,
      currentRegion: areaId,
      currentFloor: region?.type === 'dungeon' ? (region.floors?.[0]?.floor ?? 1) : null,
      areaEnteredAt: Date.now(),
      mapPositionX: undefined,
      mapPositionY: undefined,
    };
    const areaName = region?.name ?? areaId;
    set({
      character: updated,
      combatLogs: addLog(state.combatLogs, { text: `進入 ${areaName}！`, type: 'system' }),
    });
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

  setCombatRules: (rules) => {
    set({ combatRules: rules });
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  setPersistentRules: (rules) => {
    set({ persistentRules: rules });
    get().startPersistentLoop();
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  setEmergencyRetreat: (retreat) => {
    set({ emergencyRetreat: retreat });
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  startPersistentLoop: () => {
    get().stopPersistentLoop();

    const id = window.setInterval(() => {
      const state = get();
      if (!state.character) return;

      get().clearExpiredEffects();

      const now = Date.now();
      const char = state.character;
      const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
      const cooldownReduction = getSkillCooldownReduction(char, allGear, state.activeEffects);

      const ctx: PersistentScriptContext = {
        character: char,
        skills: state.skills,
        bagItems: state.bagItems,
        lastPotionUsedAt: state.lastPotionUsedAt,
        now,
        activeEffects: state.activeEffects,
        cooldownReduction,
        effectiveMaxHp: getEffectiveMaxHp(char, state.equippedGear),
        effectiveMaxMp: getEffectiveMaxMp(char, state.equippedGear),
      };

      const action = evaluatePersistentScript(state.persistentRules, ctx);
      if (!action) {
        const retreatCtx: EmergencyRetreatContext = {
          character: char,
          bagItems: state.bagItems,
          inCombat: isInArpgCombat(),
          effectiveMaxHp: getEffectiveMaxHp(char, state.equippedGear),
        };
        const retreat = evaluateEmergencyRetreat(state.emergencyRetreat, retreatCtx);
        if (retreat) {
          const scroll = retreat.scrollTownId
            ? TOWN_SCROLL_CONFIG[retreat.scrollTownId] ?? null
            : findScrollInBag(state.bagItems);
          if (!scroll) return;
          // 與手動使用回城卷軸共用同一條流程（停止探索、重置地圖座標、存檔）
          get().useTownScroll(scroll.name);
        }
        return;
      }

      switch (action.type) {
        case 'potion': {
          const potionType = action.potionType ?? 'red';
          const config = POTION_CONFIG[potionType];
          if (now - state.lastPotionUsedAt < state.lastPotionCooldown) return;

          if (getPotionCount(state.bagItems, potionType) <= 0) return;

          const bonuses = getAffixBonusesFromGear(allGear);
          const baseHeal = Math.floor(Math.random() * (config.healMax - config.healMin + 1)) + config.healMin;
          const heal = Math.floor(baseHeal * (1 + bonuses.potion_effect / 100));
          const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
          const newHp = Math.min(effMaxHp, char.hp + heal);
          set({
            character: { ...char, hp: newHp },
            bagItems: consumePotionFromBag(state.bagItems, potionType),
            lastPotionUsedAt: now,
            lastPotionCooldown: config.cooldown,
            combatLogs: addLog(state.combatLogs, { text: `使用${config.name}回復 ${heal} HP`, type: 'system' as const }),
          });
          break;
        }
        case 'speed_potion': {
          const speedType = action.speedPotionType ?? 'green';
          get().useSpeedPotion(speedType);
          break;
        }
        case 'cure_item': {
          if (!action.cureItemName) return;
          get().useCureItem(action.cureItemName);
          break;
        }
        case 'buff_skill': {
          const skillIdx = state.skills.findIndex(s => s.id === action.skillId);
          if (skillIdx < 0) return;
          const skill = state.skills[skillIdx];
          if (!canUseSkill(skill, char.mp, now, cooldownReduction)) return;

          const template = getSkillTemplate(skill.id);
          const newChar = { ...char, mp: char.mp - skill.mpCost };
          const newSkills = [...state.skills];
          newSkills[skillIdx] = { ...skill, lastUsedAt: now };
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
          break;
        }
        case 'heal_skill': {
          const skillIdx = state.skills.findIndex(s => s.id === action.skillId);
          if (skillIdx < 0) return;
          const skill = state.skills[skillIdx];
          if (!canUseSkill(skill, char.mp, now, cooldownReduction)) return;
          if (!skill.healAmount) return;

          const allGearForHeal = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
          const healBonuses = getAffixBonusesFromGear(allGearForHeal);
          const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
          const effectiveHeal = Math.floor(skill.healAmount * (1 + healBonuses.heal_effect / 100));
          const healed = Math.min(effMaxHp - char.hp, effectiveHeal);

          const newChar = { ...char, hp: char.hp + healed, mp: char.mp - skill.mpCost };
          const newSkills = [...state.skills];
          newSkills[skillIdx] = { ...skill, lastUsedAt: now };
          const logs = addLog(state.combatLogs, { text: `施放 ${skill.name} 回復 ${healed} HP`, type: 'player' });
          set({ character: newChar, skills: newSkills, combatLogs: logs });
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

  discardBagItem: (name, amount = 1) => {
    const bag = get().bagItems;
    const existing = bag.find(b => b.name === name);
    if (!existing) return;
    const drop = Math.max(1, Math.min(amount, existing.amount));
    if (existing.amount > drop) {
      set({ bagItems: bag.map(b => b.name === name ? { ...b, amount: b.amount - drop } : b) });
    } else {
      set({ bagItems: bag.filter(b => b.name !== name) });
    }
    saveGame(get());
  },

  pendingDiscard: null,

  requestDiscard: (req) => set({ pendingDiscard: req }),

  cancelDiscard: () => set({ pendingDiscard: null }),

  confirmDiscard: (amount) => {
    const req = get().pendingDiscard;
    if (!req) return;
    if (req.kind === 'equipment') {
      if (req.equipmentId != null) get().discardInventoryItem(req.equipmentId);
    } else {
      get().discardBagItem(req.name, amount);
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

    let newBag = state.bagItems.map(b => ({ ...b }));
    const existing = newBag.find(b => b.name === rewardItem && b.type === 'spellbook');
    if (existing) {
      existing.amount += 1;
    } else if (getBagUsedSlots(newBag, state.inventory) < getBagMaxSlots(state.equippedGear)) {
      newBag.push({ name: rewardItem, type: 'spellbook', amount: 1 });
    } else {
      return;
    }

    // Remove quest materials from bag
    newBag = newBag.filter(b => b.name !== QUEST_MATERIAL_NAME || b.amount <= 0);

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
    const { activeQuests, guildProgress, reward } = completeAdvQuest(
      state.adventurerQuests, questId, state.guildProgress
    );
    if (!reward) return;

    let newBag = state.bagItems.map(b => ({ ...b }));
    let newChar = state.character;

    if (reward.type === 'gold' && newChar) {
      newChar = { ...newChar, gold: newChar.gold + reward.amount };
    } else if (reward.itemName) {
      const itemType = reward.type === 'potion' ? 'potion' as const : 'material' as const;
      const bagType = (reward.type === 'weapon-scroll' || reward.type === 'armor-scroll') ? 'scroll' as const : itemType;
      const existingItem = newBag.find(b => b.name === reward.itemName && b.type === bagType);
      if (existingItem) {
        existingItem.amount += reward.amount;
      } else if (getBagUsedSlots(newBag, state.inventory) < getBagMaxSlots(state.equippedGear)) {
        newBag.push({ name: reward.itemName!, type: bagType, itemTemplateId: reward.itemId, amount: reward.amount });
      } else {
        return;
      }
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

  refreshQuestBoard: (difficulty) => {
    const state = get();
    const townId = state.character?.currentArea as QuestTownId | undefined;
    const board = { ...state.adventurerQuestBoard };
    board[difficulty] = generateQuestList(difficulty, state.guildProgress.rank, townId);
    set({ adventurerQuestBoard: board });
  },

  initQuestBoard: () => {
    const state = get();
    const townId = state.character?.currentArea as QuestTownId | undefined;
    const difficulties = townId ? getTownDifficulties(townId) : (['D', 'C', 'B', 'A', 'S'] as AdventurerQuestDifficulty[]);
    const board = { D: [], C: [], B: [], A: [], S: [] } as Record<AdventurerQuestDifficulty, AdventurerQuest[]>;
    for (const d of difficulties) {
      board[d] = generateQuestList(d, state.guildProgress.rank, townId);
    }
    set({ adventurerQuestBoard: board, questBoardTownId: townId ?? null });
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
  logs.push({ text: `${dead.name} 被擊敗！`, type: 'system' });

  // 清除死亡怪物身上的 debuff
  const currentEffects = get().activeEffects;
  const cleanedEffects = currentEffects.filter(
    e => !(e.target === 'monster' && e.targetIdx === deadIdx)
  );
  if (cleanedEffects.length !== currentEffects.length) {
    set({ activeEffects: cleanedEffects });
  }

  const expGained = dead.exp * 3;
  const prevLevel = char.level;
  char = addExp(char, expGained);
  logs.push({ text: `獲得 ${expGained} 經驗值`, type: 'system' });
  if (char.level > prevLevel) {
    logs.push({ text: `升級！等級 ${prevLevel} → ${char.level}`, type: 'system' });
    const equippedGear = get().equippedGear;
    char.hp = getEffectiveMaxHp(char, equippedGear);
    char.mp = getEffectiveMaxMp(char, equippedGear);
  }

  // 掉落處理（排隊避免 race condition）
  const dropBonuses = getAffixBonusesFromGear(allGear);
  const defeatedMonsterName = dead.name;
  const monsterIsBoss = dead.isBoss;
  dropQueue = dropQueue.then(async () => {
    const dropRegion = getRegion(char.currentRegion);
    const dropHasFloors = dropRegion?.floors && dropRegion.floors.length > 0;
    const dropAreaId = dropHasFloors && char.currentFloor != null
      ? `${char.currentRegion}-${char.currentFloor}f`
      : char.currentArea;
    const areaLevel = dropRegion?.levelMax ?? dead.level;
    const drops = monsterIsBoss
      ? await rollBossDrops(defeatedMonsterName, char.id!, areaLevel, { drop_rate: dropBonuses.drop_rate, gold_rate: dropBonuses.gold_rate })
      : await rollDrops(dropAreaId, char.id!, { drop_rate: dropBonuses.drop_rate, gold_rate: dropBonuses.gold_rate }, false, dead.level);
    const state2 = get();
    if (!state2.character) return;
    let char2 = { ...state2.character };
    const logs2 = [...state2.combatLogs];
    let newBag = state2.bagItems.map(b => ({ ...b }));
    const newEquipInv = [...state2.inventory];

    char2.gold += drops.gold;
    if (drops.gold > 0) {
      logs2.push({ text: `獲得 ${drops.gold} 金幣`, type: 'loot' });
    }
    for (const item of drops.items) {
      if (item.equipmentInstance) {
        if (getBagUsedSlots(newBag, newEquipInv) >= getBagMaxSlots(state2.equippedGear)) {
          logs2.push({ text: `背包已滿，${item.name} 被丟棄`, type: 'system' });
        } else {
          newEquipInv.push(item.equipmentInstance);
          logs2.push({ text: `獲得 ${item.name}${item.amount > 1 ? ` ×${item.amount}` : ''}`, type: 'loot' });
        }
      } else if (item.type === 'potion' || item.type === 'material' || item.type === 'scroll' || item.type === 'spellbook') {
        const existing = newBag.find(b => b.name === item.name && b.type === item.type);
        if (existing) {
          existing.amount += item.amount;
          logs2.push({ text: `獲得 ${item.name}${item.amount > 1 ? ` ×${item.amount}` : ''}`, type: 'loot' });
        } else if (getBagUsedSlots(newBag, newEquipInv) >= getBagMaxSlots(state2.equippedGear)) {
          logs2.push({ text: `背包已滿，${item.name} 被丟棄`, type: 'system' });
        } else {
          newBag.push({ name: item.name, type: item.type, itemTemplateId: item.itemTemplateId, amount: item.amount });
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
      const matExisting = newBag.find(b => b.name === QUEST_MATERIAL_NAME && b.type === 'material');
      if (matExisting) {
        matExisting.amount += 1;
      } else if (getBagUsedSlots(newBag, newEquipInv) < getBagMaxSlots(state2.equippedGear)) {
        newBag.push({ name: QUEST_MATERIAL_NAME, type: 'material', amount: 1 });
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

async function saveGame(state: GameState) {
  const char = state.character;
  if (!char || !char.id) return;

  const mapPos = useMapControlStore.getState().playerPosition;

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
    mapPositionX: Math.round(mapPos.x),
    mapPositionY: Math.round(mapPos.y),
  });

  // Save bag items (all items including potions)
  await db.characterBag.where('characterId').equals(char.id).delete();
  const bagEntries: CharacterBagEntry[] = [];
  for (const item of state.bagItems) {
    if (item.amount > 0) {
      bagEntries.push({ characterId: char.id, name: item.name, type: item.type, itemTemplateId: item.itemTemplateId, amount: item.amount });
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
        warehouseEntries.push({ userId, name: item.name, type: item.type, itemTemplateId: item.itemTemplateId, amount: item.amount, storageType: 'shared' });
      }
    }
    if (state.warehouseGold > 0) {
      warehouseEntries.push({ userId, name: 'gold', type: 'gold', amount: state.warehouseGold, storageType: 'shared' });
    }
    if (warehouseEntries.length > 0) {
      await db.warehouses.bulkAdd(warehouseEntries);
    }
  }

  // Save personal warehouse (character-level storage)
  if (userId) {
    await db.warehouses.where('characterId').equals(char.id)
      .filter(row => row.storageType === 'personal')
      .delete();
    const personalEntries: WarehouseEntry[] = [];
    for (const item of state.personalStoredMaterials) {
      if (item.amount > 0) {
        personalEntries.push({ userId, name: item.name, type: item.type, itemTemplateId: item.itemTemplateId, amount: item.amount, storageType: 'personal', characterId: char.id });
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
    combatRules: state.combatRules,
    persistentRules: state.persistentRules,
    emergencyRetreat: state.emergencyRetreat,
    quickSlots: state.quickSlots,
    afterCombatHpThreshold: state.afterCombatHpThreshold,
    afterCombatMpThreshold: state.afterCombatMpThreshold,
    afterCombatHpResumeThreshold: state.afterCombatHpResumeThreshold,
    afterCombatMpResumeThreshold: state.afterCombatMpResumeThreshold,
    adventurerQuests: state.adventurerQuests,
    guildProgress: state.guildProgress,
    statistics: state.statistics,
  };
  localStorage.setItem(key, JSON.stringify(data));
}

interface LoadedPreferences {
  scriptRules: ScriptRule[];
  combatRules: CombatRule[];
  persistentRules: PersistentRule[];
  emergencyRetreat: EmergencyRetreat;
  quickSlots: QuickSlots;
  afterCombatHpThreshold: number;
  afterCombatMpThreshold: number;
  afterCombatHpResumeThreshold: number;
  afterCombatMpResumeThreshold: number;
  adventurerQuests: AdventurerQuest[];
  guildProgress: GuildProgress;
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

function loadLocalPreferences(characterId: number): LoadedPreferences | null {
  const key = `mayana_prefs_${characterId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.combatRules && data.persistentRules) {
      const migratedPersistent = (data.persistentRules as any[]).filter(
        (r: any) => r.action.type !== 'flee_town' && r.action.type !== 'flee_teleport'
      );
      return {
        ...data,
        persistentRules: migratedPersistent.length > 0 ? migratedPersistent : DEFAULT_PERSISTENT_SCRIPT,
        emergencyRetreat: migrateEmergencyRetreat(data.emergencyRetreat),
        quickSlots: normalizeQuickSlots(data.quickSlots),
        afterCombatHpThreshold: data.afterCombatHpThreshold ?? 30,
        afterCombatMpThreshold: data.afterCombatMpThreshold ?? 20,
        afterCombatHpResumeThreshold: data.afterCombatHpResumeThreshold ?? 60,
        afterCombatMpResumeThreshold: data.afterCombatMpResumeThreshold ?? 60,
        adventurerQuests: data.adventurerQuests ?? [],
        guildProgress: data.guildProgress ?? { rank: 'F', points: 0 },
        statistics: data.statistics ?? createDefaultStatistics(),
      };
    }
    // Migration: old format only has scriptRules
    if (data.scriptRules) {
      const combat: CombatRule[] = [];
      const persistent: PersistentRule[] = [];
      for (const rule of data.scriptRules as ScriptRule[]) {
        if (rule.action.type === 'skill' || rule.action.type === 'normal_attack') {
          combat.push({
            id: rule.id,
            enabled: rule.enabled,
            condition: { type: rule.condition.type as any, value: rule.condition.value, skillId: rule.condition.skillId },
            action: { type: rule.action.type, skillId: rule.action.skillId },
          });
        } else if (rule.action.type !== 'flee_town' && rule.action.type !== 'flee_teleport') {
          persistent.push({
            id: rule.id,
            enabled: rule.enabled,
            condition: { type: rule.condition.type as any, value: rule.condition.value, skillId: rule.condition.skillId },
            action: { type: rule.action.type as any, potionType: rule.action.potionType },
          });
        }
      }
      return {
        scriptRules: data.scriptRules,
        combatRules: combat.length > 0 ? combat : DEFAULT_COMBAT_SCRIPT,
        persistentRules: persistent.length > 0 ? persistent : DEFAULT_PERSISTENT_SCRIPT,
        emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
        quickSlots: normalizeQuickSlots(data.quickSlots),
        afterCombatHpThreshold: data.afterCombatHpThreshold ?? 0,
        afterCombatMpThreshold: data.afterCombatMpThreshold ?? 0,
        afterCombatHpResumeThreshold: data.afterCombatHpResumeThreshold ?? 60,
        afterCombatMpResumeThreshold: data.afterCombatMpResumeThreshold ?? 60,
        adventurerQuests: data.adventurerQuests ?? [],
        guildProgress: data.guildProgress ?? { rank: 'F', points: 0 },
        statistics: data.statistics ?? createDefaultStatistics(),
      };
    }
    return null;
  } catch {
    return null;
  }
}
