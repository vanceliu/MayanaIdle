import { create } from 'zustand';
import type { Character, ClassName, Attributes } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { EquipmentInstance, EquippedGear } from '../models/equipment';
import type { Skill } from '../models/skill';
import type { DropResult } from '../systems/drops';
import type { ActiveEffect } from '../models/effect';
import { CLASS_BASE_ATTRIBUTES, getTotalAttributes, ATTRIBUTE_CAP } from '../models/character';
import { getExpToNextLevel, addExp } from '../systems/levelUp';
import { SKILL_WIND_BLADE, canUseSkill } from '../models/skill';
import { instantiateFromTemplate, getSkillTemplate } from '../models/skillTemplate';
import { rollEncounter, rollEncounterCount, calculatePressure } from '../systems/pressure';
import { processCombatRound, calculateMonsterAttack, calculatePhysicalSkillHit, calculateSkillAttack, getPlayerAttackInterval, getSkillCooldownReduction, getAffixBonusesFromGear, hasActiveFireEnchant, calculateBasePhysicalDamage } from '../systems/combat';
import { rollDrops, rollBossDrops } from '../systems/drops';
import { updateErrandProgress, rollQuestMaterialDrop, updateCollectProgress, acceptQuest as acceptQuestAction, completeQuest as completeQuestAction } from '../systems/questSystem';
import { QUEST_MATERIAL_NAME } from '../models/quest';
import { getHpRegen, getMpRegen, HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../systems/regen';
import { evaluateCombatScript, evaluatePersistentScript, evaluateEmergencyRetreat, type CombatScriptContext, type PersistentScriptContext, type EmergencyRetreatContext } from '../systems/scriptRunner';
import type { ScriptRule, CombatRule, PersistentRule, EmergencyRetreat } from '../models/scriptEngine';
import { DEFAULT_SCRIPT, DEFAULT_COMBAT_SCRIPT, DEFAULT_PERSISTENT_SCRIPT, DEFAULT_EMERGENCY_RETREAT } from '../models/scriptEngine';
import type { MapLocation } from '../models/area';
import { getRegion, ZONES, getNearestTown } from '../models/mapData';
import { canNavigateTo, consumeScroll } from '../systems/navigation';
import { resolveEquipment } from '../systems/templateSync';
import { findScrollInBag, consumeTownScroll, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { db, type CharacterBagEntry, type WarehouseEntry } from '../db/database';

export type GamePhase = 'title' | 'characterSelect' | 'create' | 'explore' | 'combat' | 'result' | 'dead';
export type SearchMode = 'auto' | 'manual';

export interface CombatLog {
  text: string;
  type: 'player' | 'monster' | 'system' | 'loot' | 'dot';
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
  green: { duration: 120000, name: '綠色藥水', bagName: '綠色藥水' },
  'enhanced-green': { duration: 600000, name: '強化綠色藥水', bagName: '強化綠色藥水' },
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
    newBag.push({ name, type: 'potion', amount });
  }
  return newBag;
}

export function consumePotionFromBag(bagItems: BagItem[], type: PotionType): BagItem[] {
  const name = getPotionName(type);
  return bagItems
    .map(b => b.name === name && b.type === 'potion' ? { ...b, amount: b.amount - 1 } : { ...b })
    .filter(b => b.amount > 0);
}

export const BAG_MAX_SLOTS = 100;

export function getBagUsedSlots(bagItems: BagItem[], inventory: EquipmentInstance[]): number {
  return bagItems.length + inventory.length;
}

export function isBagFull(bagItems: BagItem[], inventory: EquipmentInstance[]): boolean {
  return getBagUsedSlots(bagItems, inventory) >= BAG_MAX_SLOTS;
}

export interface BagItem {
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
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
  monsters: MonsterInstance[];
  selectedTargetIdx: number;
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
  quickSlots: (PotionType | null)[];
  storedEquipment: EquipmentInstance[];
  storedMaterials: BagItem[];
  warehouseGold: number;
  personalStoredEquipment: EquipmentInstance[];
  personalStoredMaterials: BagItem[];
  activeEffects: ActiveEffect[];

  setPhase: (phase: GamePhase) => void;
  initUser: () => Promise<void>;
  loadCharacterList: () => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
  logout: () => Promise<void>;
  createCharacter: (name: string, className: ClassName, bonusAttrs: Attributes) => Promise<void>;
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
  assignQuickSlot: (slotIdx: number, type: PotionType | null) => void;
  useQuickSlot: (slotIdx: number) => void;
  useTownScroll: (scrollName: string) => void;
  changeArea: (areaId: string) => void;
  navigateTo: (location: MapLocation) => void;
  selectTarget: (idx: number) => void;
  setScriptRules: (rules: ScriptRule[]) => void;
  setCombatRules: (rules: CombatRule[]) => void;
  setPersistentRules: (rules: PersistentRule[]) => void;
  setEmergencyRetreat: (retreat: EmergencyRetreat) => void;
  startPersistentLoop: () => void;
  stopPersistentLoop: () => void;
  addEffect: (effect: ActiveEffect) => void;
  removeEffect: (id: string) => void;
  clearExpiredEffects: () => void;
  discardBagItem: (name: string) => void;
  discardInventoryItem: (id: number) => void;
  spendAttributePoint: (attr: keyof Attributes) => void;
  acceptQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
  saveState: () => void;
}

const MAX_LOGS = 200;

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

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'title',
  userId: null,
  characterList: [],
  character: null,
  equippedGear: {},
  inventory: [],
  bagItems: [],
  skills: [],
  monsters: [],
  selectedTargetIdx: 0,
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
  quickSlots: [null, null, null, null, null],
  storedEquipment: [],
  storedMaterials: [],
  warehouseGold: 0,
  personalStoredEquipment: [],
  personalStoredMaterials: [],
  activeEffects: [],

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
      bagItems.push({ name: row.name, type: row.type, amount: row.amount });
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
        storedMaterials.push({ name: row.name, type: row.type as BagItem['type'], amount: row.amount });
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
        personalStoredMaterials.push({ name: row.name, type: row.type as BagItem['type'], amount: row.amount });
      }
    }

    const prefs = loadLocalPreferences(char.id!);
    const scriptRules = prefs?.scriptRules ?? DEFAULT_SCRIPT;
    const combatRules = prefs?.combatRules ?? DEFAULT_COMBAT_SCRIPT;
    const persistentRules = prefs?.persistentRules ?? DEFAULT_PERSISTENT_SCRIPT;
    const emergencyRetreat = prefs?.emergencyRetreat ?? DEFAULT_EMERGENCY_RETREAT;
    const quickSlots = prefs?.quickSlots ?? [null, null, null, null, null];
    const afterCombatHpThreshold = prefs?.afterCombatHpThreshold ?? 30;
    const afterCombatMpThreshold = prefs?.afterCombatMpThreshold ?? 20;

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
      phase: 'explore',
    });
    get().startRegen();
    get().startPersistentLoop();
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
      monsters: [],
      combatLogs: [],
      storedEquipment: [],
      personalStoredEquipment: [],
      personalStoredMaterials: [],
      activeEffects: [],
      scriptRules: DEFAULT_SCRIPT,
      combatRules: DEFAULT_COMBAT_SCRIPT,
      persistentRules: DEFAULT_PERSISTENT_SCRIPT,
      emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
      quickSlots: [null, null, null, null, null],
    });
    await get().loadCharacterList();
  },

  createCharacter: async (name, className, bonusAttrs) => {
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
      userId,
      name,
      className,
      level: 1,
      exp: 0,
      expToNext: getExpToNextLevel(1),
      hp: 30,
      maxHp: 30,
      mp: 10,
      maxMp: 10,
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
    };
    const id = await db.characters.add(char);
    char.id = id as number;

    // Give starter weapon based on class
    const starterWeapons: Record<ClassName, string> = {
      knight: '短劍', elf: '木弓', elementalist: '木製法杖', priest: '木製法杖', thief: '匕首',
    };
    const template = await db.equipmentTemplates.where('name').equals(starterWeapons[className]).first();
    let weapon: EquipmentInstance | null = null;
    if (template) {
      const dbRecord = {
        templateId: template.id!, slot: template.slot, quality: 0, enhancement: 0, affixes: [] as any[],
        ownerId: char.id!, equipped: true,
      };
      const instId = await db.equipmentInstances.add(dbRecord as any);
      weapon = resolveEquipment({
        id: instId as number, templateId: template.id!, name: template.name, type: template.type,
        slot: template.slot, isTwoHanded: template.isTwoHanded,
        quality: 0, enhancement: 0, affixes: [], ownerId: char.id!, equipped: true,
      });
    }

    // Give starter armor (皮甲)
    const armorTemplate = await db.equipmentTemplates.where('name').equals('皮甲').first();
    let armor: EquipmentInstance | null = null;
    if (armorTemplate) {
      const dbRecord = {
        templateId: armorTemplate.id!, slot: armorTemplate.slot, quality: 0, enhancement: 0, affixes: [] as any[],
        ownerId: char.id!, equipped: true,
      };
      const instId = await db.equipmentInstances.add(dbRecord as any);
      armor = resolveEquipment({
        id: instId as number, templateId: armorTemplate.id!, name: armorTemplate.name, type: armorTemplate.type,
        slot: armorTemplate.slot, isTwoHanded: armorTemplate.isTwoHanded,
        quality: 0, enhancement: 0, affixes: [], ownerId: char.id!, equipped: true,
      });
    }

    const equippedGear: EquippedGear = {};
    if (weapon) equippedGear.rightHand = weapon;
    if (armor) equippedGear.chest = armor;

    // Save initial bag items to DB
    await db.characterBag.bulkAdd([
      { characterId: char.id!, name: '紅色藥水', type: 'potion', amount: 10 },
    ]);

    set({
      character: char,
      equippedGear,
      inventory: [],
      skills: startingSkills,
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 10 }],
      phase: 'explore',
    });
    get().startRegen();
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

    // Only auto-search in auto mode
    if (get().searchMode !== 'auto') {
      set({ gameLoopId: null });
      return;
    }

    const id = window.setInterval(() => {
      const state = get();
      if (state.phase !== 'explore' || !state.character) return;

      // Auto-script: check HP/MP threshold (after combat / during explore)
      const effMaxHp = getEffectiveMaxHp(state.character, state.equippedGear);
      const effMaxMp = getEffectiveMaxMp(state.character, state.equippedGear);
      const hpPercent = (state.character.hp / effMaxHp) * 100;
      const mpPercent = effMaxMp > 0 ? (state.character.mp / effMaxMp) * 100 : 100;
      if (hpPercent <= state.afterCombatHpThreshold || mpPercent <= state.afterCombatMpThreshold) {
        // Wait for regen before exploring further
        return;
      }

      if (rollEncounter()) {
        get().stopExploring();
        spawnCombat(get, set);
      }
    }, 1000);
    set({ gameLoopId: id });
  },

  stopExploring: () => {
    const id = get().gameLoopId;
    if (id) clearInterval(id);
    set({ gameLoopId: null });
  },

  manualSearch: () => {
    const state = get();
    if (state.phase !== 'explore' || !state.character || state.isManualSearching) return;

    set({
      isManualSearching: true,
      combatLogs: addLog(state.combatLogs, { text: '搜索中...', type: 'system' }),
    });

    const id = window.setInterval(() => {
      const current = get();
      if (current.phase !== 'explore') {
        get().cancelManualSearch();
        return;
      }

      if (rollEncounter()) {
        get().cancelManualSearch();
        spawnCombat(get, set);
      }
    }, 1000);

    set({ manualSearchId: id });
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
      const inCombat = state.phase === 'combat';
      const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
      const regen = getHpRegen(state.character, inCombat, allGear);
      if (regen <= 0) return;
      const newHp = Math.min(effMaxHp, state.character.hp + regen);
      set({ character: { ...state.character, hp: newHp } });
    }, HP_REGEN_INTERVAL_MS);

    const mpId = window.setInterval(() => {
      const state = get();
      if (!state.character || state.character.hp <= 0) return;
      const effMaxMp = getEffectiveMaxMp(state.character, state.equippedGear);
      if (state.character.mp >= effMaxMp) return;
      const inCombat = state.phase === 'combat';
      const allGearMp = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
      const regen = getMpRegen(state.character, inCombat, allGearMp);
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
    if (isBagFull(state.bagItems, state.inventory)) {
      set({ combatLogs: addLog(state.combatLogs, { text: '背包已滿，無法卸除裝備', type: 'system' }) });
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

    const filteredEffects = state.activeEffects.filter(
      e => !(e.type === 'buff' && e.category === 'speed' && e.target === 'player')
    );

    const newBag = state.bagItems.map(i =>
      i.name === bagName ? { ...i, amount: i.amount - 1 } : i
    ).filter(i => i.amount > 0);

    set({
      activeEffects: [...filteredEffects, speedBuff],
      bagItems: newBag,
      combatLogs: addLog(state.combatLogs, { text: `使用${config.name}（攻速+33%）`, type: 'system' }),
    });
  },

  assignQuickSlot: (slotIdx, type) => {
    const slots = [...get().quickSlots];
    slots[slotIdx] = type;
    set({ quickSlots: slots });
    const char = get().character;
    if (char?.id) {
      saveLocalPreferences(char.id, get());
    }
  },

  useQuickSlot: (slotIdx) => {
    const state = get();
    const type = state.quickSlots[slotIdx];
    if (!type) return;
    get().usePotionByType(type);
  },

  useTownScroll: (scrollName) => {
    const state = get();
    if (!state.character) return;

    const scrollInfo = Object.values(TOWN_SCROLL_CONFIG).find(s => s.name === scrollName);
    if (!scrollInfo) return;

    const scrollItem = state.bagItems.find(b => b.name === scrollName && b.amount > 0);
    if (!scrollItem) return;

    if (state.phase === 'combat') {
      clearCombatTimers();
    }

    const newBag = consumeTownScroll(state.bagItems, scrollName);
    const char = { ...state.character };
    char.currentArea = scrollInfo.townId;
    char.currentRegion = scrollInfo.townId;
    char.currentFloor = null;
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

  selectTarget: (idx) => {
    set({ selectedTargetIdx: idx });
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
      const cooldownReduction = getSkillCooldownReduction(allGear);

      const ctx: PersistentScriptContext = {
        character: char,
        skills: state.skills,
        bagItems: state.bagItems,
        lastPotionUsedAt: state.lastPotionUsedAt,
        now,
        activeEffects: state.activeEffects,
        cooldownReduction,
      };

      const action = evaluatePersistentScript(state.persistentRules, ctx);
      if (!action) {
        const retreatCtx: EmergencyRetreatContext = {
          character: char,
          bagItems: state.bagItems,
          phase: state.phase,
        };
        const retreat = evaluateEmergencyRetreat(state.emergencyRetreat, retreatCtx);
        if (retreat) {
          if (retreat.action === 'flee_town') {
            let scroll = retreat.scrollTownId
              ? TOWN_SCROLL_CONFIG[retreat.scrollTownId] ?? null
              : findScrollInBag(state.bagItems);
            if (!scroll) return;
            const scrollItem = state.bagItems.find(b => b.name === scroll!.name);
            if (!scrollItem || scrollItem.amount <= 0) return;
            clearCombatTimers();
            const newBag = consumeTownScroll(state.bagItems, scroll.name);
            const newChar = { ...char };
            newChar.currentArea = scroll.townId;
            newChar.currentRegion = scroll.townId;
            newChar.currentFloor = null;
            const townZone = ZONES.find(z => z.regions.includes(scroll!.townId));
            if (townZone) newChar.currentZone = townZone.id;
            newChar.areaEnteredAt = Date.now();
            const logs = addLog(state.combatLogs, { text: `使用${scroll.name}，傳送至${scroll.townName}`, type: 'system' });
            set({ character: newChar, combatLogs: logs, phase: 'explore', bagItems: newBag });
          } else {
            clearCombatTimers();
            const newChar = { ...char, areaEnteredAt: Date.now() };
            const logs = addLog(state.combatLogs, { text: '血量過低，瞬移脫離戰鬥', type: 'system' });
            set({ character: newChar, combatLogs: logs, phase: 'explore' });
            useGameStore.getState().startExploring();
          }
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
            const currentEffects = get().activeEffects;
            const filteredEffects = currentEffects.filter(
              e => !(e.type === 'buff' && e.category === buffEffect.category && e.target === buffEffect.target)
            );
            set({ character: newChar, skills: newSkills, combatLogs: logs, activeEffects: [...filteredEffects, buffEffect] });
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

  discardBagItem: (name) => {
    const bag = get().bagItems;
    const existing = bag.find(b => b.name === name);
    if (!existing) return;
    if (existing.amount > 1) {
      set({ bagItems: bag.map(b => b.name === name ? { ...b, amount: b.amount - 1 } : b) });
    } else {
      set({ bagItems: bag.filter(b => b.name !== name) });
    }
    saveGame(get());
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
    } else if (getBagUsedSlots(newBag, state.inventory) < BAG_MAX_SLOTS) {
      newBag.push({ name: rewardItem, type: 'spellbook', amount: 1 });
    } else {
      return;
    }

    // Remove quest materials from bag
    newBag = newBag.filter(b => b.name !== QUEST_MATERIAL_NAME || b.amount <= 0);

    set({ character: updated, bagItems: newBag });
    saveGame(get());
  },

  saveState: () => {
    saveGame(get());
  },
}));

async function spawnCombat(get: () => GameState, set: (s: Partial<GameState>) => void) {
  const state = get();
  const char = state.character!;
  const pressure = calculatePressure(char.areaEnteredAt, Date.now());
  const count = rollEncounterCount(1, pressure.pressure);

  const region = getRegion(char.currentRegion);
  const hasFloors = region?.floors && region.floors.length > 0;
  const monsterAreaId = hasFloors && char.currentFloor != null
    ? `${char.currentRegion}-${char.currentFloor}f`
    : char.currentRegion;
  let areaMonsters = await db.monsterTemplates.where('area').equals(monsterAreaId).toArray();

  if (areaMonsters.length === 0) {
    console.error(`[spawnCombat] No monster templates found for area: ${monsterAreaId}`);
    return;
  }

  const spawned: MonsterInstance[] = [];
  const nonBossMonsters = areaMonsters.filter(m => !m.isBoss);
  let bossSpawned = false;
  for (let i = 0; i < count; i++) {
    const template = areaMonsters[Math.floor(Math.random() * areaMonsters.length)];
    if (template.isBoss && bossSpawned) {
      const fallback = nonBossMonsters.length > 0
        ? nonBossMonsters[Math.floor(Math.random() * nonBossMonsters.length)]
        : template;
      spawned.push({
        templateId: fallback.id!,
        name: fallback.name,
        level: fallback.level,
        currentHp: fallback.hp,
        maxHp: fallback.hp,
        attackMin: fallback.attackMin,
        attackMax: fallback.attackMax,
        defense: fallback.defense,
        exp: fallback.exp,
        race: fallback.race,
        size: fallback.size,
        element: fallback.element,
        isBoss: fallback.isBoss,
      });
    } else {
      if (template.isBoss) bossSpawned = true;
      spawned.push({
        templateId: template.id!,
        name: template.name,
        level: template.level,
        currentHp: template.hp,
        maxHp: template.hp,
        attackMin: template.attackMin,
        attackMax: template.attackMax,
        defense: template.defense,
        exp: template.exp,
        race: template.race,
        size: template.size,
        element: template.element,
        isBoss: template.isBoss,
      });
    }
  }

  const existingLogs = get().combatLogs;
  set({ monsters: spawned, selectedTargetIdx: 0, phase: 'combat', combatLogs: addLog(existingLogs, { text: `遭遇 ${spawned.map(m => m.name).join(', ')}！`, type: 'system' }) });
  runAutoCombat(get, set);
}

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
  char: CharacterState,
  logs: CombatLog[],
  allGear: EquipmentInstance[]
): { char: CharacterState; logs: CombatLog[] } {
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
        if (getBagUsedSlots(newBag, newEquipInv) >= BAG_MAX_SLOTS) {
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
        } else if (getBagUsedSlots(newBag, newEquipInv) >= BAG_MAX_SLOTS) {
          logs2.push({ text: `背包已滿，${item.name} 被丟棄`, type: 'system' });
        } else {
          newBag.push({ name: item.name, type: item.type, amount: item.amount });
          logs2.push({ text: `獲得 ${item.name}${item.amount > 1 ? ` ×${item.amount}` : ''}`, type: 'loot' });
        }
      }
    }

    // 任務進度：跑腿（擊殺數）
    char2 = updateErrandProgress(char2, char2.currentArea, 1);

    // 任務進度：收集（素材掉落）
    if (rollQuestMaterialDrop(char2, defeatedMonsterName)) {
      const matExisting = newBag.find(b => b.name === QUEST_MATERIAL_NAME && b.type === 'material');
      if (matExisting) {
        matExisting.amount += 1;
      } else if (getBagUsedSlots(newBag, newEquipInv) < BAG_MAX_SLOTS) {
        newBag.push({ name: QUEST_MATERIAL_NAME, type: 'material', amount: 1 });
      }
      char2 = updateCollectProgress(char2, 1);
      logs2.push({ text: `獲得 ${QUEST_MATERIAL_NAME}`, type: 'loot' });
    }

    newBag = newBag.filter(b => b.amount > 0);

    set({
      character: char2,
      combatLogs: logs2.slice(-MAX_LOGS),
      inventory: newEquipInv,
      bagItems: newBag,
    });
  });

  return { char, logs };
}

function runAutoCombat(get: () => GameState, set: (s: Partial<GameState>) => void) {
  // Player attack timer — dynamic interval based on attack_speed affix
  function schedulePlayerAttack() {
    const state = get();
    const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
    const interval = getPlayerAttackInterval(allGear, state.activeEffects);
    const playerTimer = window.setTimeout(playerAttackTick, interval);
    combatTimerIds.push(playerTimer);
  }

  function playerAttackTick() {
    const state = get();
    if (state.phase !== 'combat' || !state.character) {
      return;
    }

    let char = { ...state.character };
    const monsters = [...state.monsters];
    let logs = [...state.combatLogs];
    const weapon = state.equippedGear.rightHand ?? null;
    const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
    const skills = [...state.skills];
    const now = Date.now();

    // Find target
    let targetIdx = state.selectedTargetIdx;
    if (targetIdx >= monsters.length || monsters[targetIdx].currentHp <= 0) {
      targetIdx = monsters.findIndex(m => m.currentHp > 0);
    }
    if (targetIdx === -1) {
      clearCombatTimers();
      dropQueue.then(() => handleVictory(get, set, monsters));
      return;
    }

    const target = { ...monsters[targetIdx] };

    // Script engine decides: skill or normal attack
    const cooldownReduction = getSkillCooldownReduction(allGear);
    const combatCtx: CombatScriptContext = {
      character: char, monsters, skills, now, cooldownReduction,
    };
    const action = evaluateCombatScript(state.combatRules, combatCtx);

    let actionTaken = false;
    let aoeHandledTarget = false;
    if (action) {
      switch (action.type) {
        case 'skill': {
          const skillIdx = skills.findIndex(s => s.id === action.skillId);
          if (skillIdx >= 0) {
            const skill = skills[skillIdx];

            if (skill.requiredWeaponType && weapon?.type !== skill.requiredWeaponType) {
              break;
            }

            char.mp -= skill.mpCost;
            skills[skillIdx] = { ...skill, lastUsedAt: now };

            if (skill.hits && skill.hits > 0) {
              // Multi-hit physical skill (e.g. triple-shot): uses physical attack formula per hit
              const hasFireEnchant = hasActiveFireEnchant(state.activeEffects);
              for (let h = 0; h < skill.hits; h++) {
                if (target.currentHp <= 0) break;
                const result = calculatePhysicalSkillHit(char, weapon, target, allGear, hasFireEnchant, skill.name, state.activeEffects);
                if (result.hit) {
                  target.currentHp -= result.damage;
                }
                logs.push({ text: result.log.message, type: 'player' });
              }
              monsters[targetIdx] = target;
            } else if (skill.type === 'attack') {
              if (skill.target === 'aoe') {
                const alive = monsters.filter(m => m.currentHp > 0);
                const hitCount = Math.min(alive.length, Math.floor(Math.random() * ((skill.aoeMax ?? 3) - (skill.aoeMin ?? 2) + 1)) + (skill.aoeMin ?? 2));
                const shuffled = [...alive].sort(() => Math.random() - 0.5);
                const targets = shuffled.slice(0, hitCount);
                for (const m of targets) {
                  const mIdx = monsters.indexOf(m);
                  const result = calculateSkillAttack(char, skill.power, skill.element, m, allGear, skill.name);
                  monsters[mIdx] = { ...m, currentHp: m.currentHp - result.damage };
                  logs.push({ text: result.log.message, type: 'player' });
                  if (mIdx === targetIdx) {
                    aoeHandledTarget = true;
                  }
                }
              } else {
                const result = calculateSkillAttack(char, skill.power, skill.element, target, allGear, skill.name);
                target.currentHp -= result.damage;
                monsters[targetIdx] = target;
                logs.push({ text: result.log.message, type: 'player' });

                if (result.damage > 0) {
                  const templateDebuff = getSkillTemplate(skill.id)?.applyDebuff;
                  if (templateDebuff) {
                    let dotDmg = templateDebuff.dotDamage ?? 0;
                    if (templateDebuff.dotDamagePercent) {
                      dotDmg = Math.floor(calculateBasePhysicalDamage(char, weapon, allGear, state.activeEffects) * templateDebuff.dotDamagePercent);
                    }
                    const debuffEffect: ActiveEffect = {
                      id: `debuff-${templateDebuff.category}-${targetIdx}-${now}`,
                      sourceSkillId: skill.id,
                      sourceSkillName: skill.name,
                      category: templateDebuff.category,
                      type: 'debuff',
                      target: 'monster',
                      targetIdx,
                      dot: { damage: dotDmg, element: templateDebuff.dotElement, interval: templateDebuff.dotInterval, totalDuration: templateDebuff.dotDuration },
                      startTime: now,
                      duration: templateDebuff.dotDuration,
                      tags: templateDebuff.tags,
                      name: templateDebuff.name,
                      description: `每秒 ${dotDmg} 傷害`,
                    };
                    get().addEffect(debuffEffect);
                    logs.push({ text: `${skill.name}命中！目標${templateDebuff.name} ${templateDebuff.dotDuration / 1000}s（每秒 ${dotDmg}）`, type: 'player' });
                  }
                }
              }
            } else if (skill.type === 'heal' && skill.healAmount) {
              const bonuses = getAffixBonusesFromGear(allGear);
              const effMaxHp = getEffectiveMaxHp(char, state.equippedGear);
              const effectiveHeal = Math.floor(skill.healAmount * (1 + bonuses.heal_effect / 100));
              const healed = Math.min(effMaxHp - char.hp, effectiveHeal);
              char.hp += healed;
              logs.push({ text: `施放 ${skill.name} 回復 ${healed} HP`, type: 'player' });
            } else if (skill.type === 'buff') {
              const buffTemplate = getSkillTemplate(skill.id);
              logs.push({ text: `施放 ${skill.name}`, type: 'player' });
              if (buffTemplate?.cleanse ?? skill.cleanse) {
                const currentEffects = get().activeEffects;
                const cleansed = currentEffects.filter(e => !(e.type === 'debuff' && e.target === 'player'));
                set({ activeEffects: cleansed });
              } else if (buffTemplate?.buffDuration ?? skill.buffDuration) {
                const bDuration = buffTemplate?.buffDuration ?? skill.buffDuration!;
                const buffEffect: ActiveEffect = {
                  id: `buff-${skill.id}-${Date.now()}`,
                  sourceSkillId: skill.id,
                  sourceSkillName: skill.name,
                  category: buffTemplate?.buffCategory ?? skill.buffCategory ?? skill.id,
                  type: 'buff',
                  target: 'player',
                  modifiers: buffTemplate?.buffModifiers ?? skill.buffModifiers ?? [],
                  startTime: Date.now(),
                  duration: bDuration,
                  tags: [],
                  name: skill.name,
                  description: buffTemplate?.buffEffect ?? skill.buffEffect ?? '',
                };
                const currentEffects = get().activeEffects;
                const filteredEffects = currentEffects.filter(
                  e => !(e.type === 'buff' && e.category === buffEffect.category && e.target === buffEffect.target)
                );
                set({ activeEffects: [...filteredEffects, buffEffect] });
              }
            }
            actionTaken = true;
          }
          break;
        }
        case 'normal_attack': {
          const result = processCombatRound(char, target, weapon, allGear, state.activeEffects);
          if (result.playerHit) {
            target.currentHp -= result.playerDamage;
            const critText = result.isCritical ? '（爆擊！）' : '';
            logs.push({ text: `對 ${target.name} 造成 ${result.playerDamage} 傷害${critText}`, type: 'player' });

            const poisonBuff = get().activeEffects.find(
              e => e.type === 'buff' && e.target === 'player' && e.category === 'poison-enchant'
            );
            if (poisonBuff) {
              const envenomTemplate = getSkillTemplate('envenom');
              const debuff = envenomTemplate?.onHitDebuff;
              if (debuff) {
                let dotDmg = debuff.dotDamage ?? 0;
                if (debuff.dotDamagePercent) {
                  dotDmg = Math.floor(calculateBasePhysicalDamage(char, weapon, allGear, state.activeEffects) * debuff.dotDamagePercent);
                }
                const poisonEffect: ActiveEffect = {
                  id: `debuff-${debuff.category}-${targetIdx}-${now}`,
                  sourceSkillId: 'envenom',
                  sourceSkillName: '淬毒',
                  category: debuff.category,
                  type: 'debuff',
                  target: 'monster',
                  targetIdx,
                  dot: { damage: dotDmg, element: debuff.dotElement, interval: debuff.dotInterval, totalDuration: debuff.dotDuration },
                  startTime: now,
                  duration: debuff.dotDuration,
                  tags: debuff.tags,
                  name: debuff.name,
                  description: `每秒 ${dotDmg} 傷害`,
                };
                get().addEffect(poisonEffect);
                logs.push({ text: `淬毒觸發！目標${debuff.name} ${debuff.dotDuration / 1000}s（每秒 ${dotDmg}）`, type: 'player' });
              }
            }
          } else {
            logs.push({ text: `攻擊 ${target.name} 未命中`, type: 'player' });
          }
          actionTaken = true;
          break;
        }
        case 'wait':
          actionTaken = true;
          break;
      }
    }

    // No rule matched: character idles (does nothing this tick)
    if (!actionTaken) {
      // Do nothing — skip this tick
    }

    if (!aoeHandledTarget) {
      monsters[targetIdx] = target;
    }

    // 逐隻處理本 tick 死亡的怪物（普攻、技能、AOE 皆走此路徑）
    const deadIndices = monsters
      .map((m, idx) => (m.currentHp <= 0 && !m._processed) ? idx : -1)
      .filter(idx => idx !== -1);
    for (const deadIdx of deadIndices) {
      ({ char, logs } = processMonsterDeath(get, set, monsters, deadIdx, char, logs, allGear));
    }

    // Check if all dead — end combat
    if (!monsters.some(m => m.currentHp > 0)) {
      clearCombatTimers();
      set({ character: char, monsters, combatLogs: logs.slice(-MAX_LOGS), skills });
      dropQueue.then(() => handleVictory(get, set, monsters));
      return;
    }

    set({ character: char, monsters, combatLogs: logs.slice(-MAX_LOGS), skills });
    schedulePlayerAttack();
  }

  schedulePlayerAttack();

  // Monster attack timer — 1200ms (offset by 600ms so they don't sync)
  const monsterTimer = window.setTimeout(() => {
    const monsterInterval = window.setInterval(() => {
      const state = get();
      if (state.phase !== 'combat' || !state.character) {
        clearInterval(monsterInterval);
        return;
      }

      let char = { ...state.character };
      const monsters = [...state.monsters];
      const logs = [...state.combatLogs];
      const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];

      // All alive monsters attack
      const aliveMonsters = monsters.filter(m => m.currentHp > 0);
      if (aliveMonsters.length === 0) return;

      // Pick one monster to attack this tick (round-robin feel)
      const attacker = aliveMonsters[Math.floor(Math.random() * aliveMonsters.length)];
      const monsterAtk = calculateMonsterAttack(attacker, char, allGear, state.activeEffects);
      if (monsterAtk.dodged) {
        logs.push({ text: `閃避了 ${attacker.name} 的攻擊`, type: 'monster' });
      } else if (monsterAtk.hit) {
        char.hp -= monsterAtk.damage;
        logs.push({ text: `${attacker.name} 造成 ${monsterAtk.damage} 傷害`, type: 'monster' });
      }

      // Player dead
      if (char.hp <= 0) {
        char.hp = 0;
        clearCombatTimers();
        const nearestTown = getNearestTown(char.currentRegion);
        char.hp = Math.floor(char.maxHp * 0.5);
        char.currentArea = nearestTown.id;
        char.currentRegion = nearestTown.id;
        char.currentFloor = null;
        char.currentZone = nearestTown.zoneId;
        char.areaEnteredAt = Date.now();
        logs.push({ text: `你倒下了...傳送至${nearestTown.name}`, type: 'system' });
        set({ character: char, monsters, combatLogs: logs, phase: 'explore' });
        saveGame(useGameStore.getState());
        return;
      }

      set({ character: char, combatLogs: logs.slice(-MAX_LOGS) });
    }, 1200);
    combatTimerIds.push(monsterInterval);
  }, 600);
  combatTimerIds.push(monsterTimer as unknown as number);

  // DOT tick timer — 1000ms，結算 DOT 傷害並處理怪物死亡/掉落
  const dotTimer = window.setInterval(() => {
    const state = get();
    if (state.phase !== 'combat' || !state.character) {
      clearInterval(dotTimer);
      return;
    }

    const now = Date.now();
    const monsters = [...state.monsters];
    let logs = [...state.combatLogs];
    let char = { ...state.character };
    const allGear = Object.values(state.equippedGear).filter(Boolean) as EquipmentInstance[];
    let changed = false;

    for (const effect of state.activeEffects) {
      if (effect.type !== 'debuff' || effect.target !== 'monster' || !effect.dot) continue;
      if (now > effect.startTime + effect.duration) continue;

      const idx = effect.targetIdx;
      if (idx == null || idx >= monsters.length) continue;
      if (monsters[idx].currentHp <= 0) continue;

      monsters[idx] = { ...monsters[idx], currentHp: monsters[idx].currentHp - effect.dot.damage };
      logs.push({ text: `${effect.name} 對 ${monsters[idx].name} 造成 ${effect.dot.damage} 傷害`, type: 'dot' });
      changed = true;
    }

    if (changed) {
      // DOT 致死判定：逐隻處理死亡怪物的經驗/掉落/任務進度
      const deadIndices = monsters
        .map((m, idx) => (m.currentHp <= 0 && !m._processed) ? idx : -1)
        .filter(idx => idx !== -1);
      for (const deadIdx of deadIndices) {
        ({ char, logs } = processMonsterDeath(get, set, monsters, deadIdx, char, logs, allGear));
      }

      // 全部怪物死亡 → 結束戰鬥
      if (!monsters.some(m => m.currentHp > 0)) {
        clearCombatTimers();
        set({ character: char, monsters, combatLogs: logs.slice(-MAX_LOGS) });
        dropQueue.then(() => handleVictory(get, set, monsters));
        return;
      }

      set({ character: char, monsters, combatLogs: logs.slice(-MAX_LOGS) });
    }
  }, 1000);
  combatTimerIds.push(dotTimer);
}

let combatTimerIds: number[] = [];
let dropQueue: Promise<void> = Promise.resolve();

function clearCombatTimers() {
  for (const id of combatTimerIds) {
    clearInterval(id);
    clearTimeout(id);
  }
  combatTimerIds = [];
}

async function handleVictory(get: () => GameState, set: (s: Partial<GameState>) => void, _monsters: MonsterInstance[]) {
  const state = get();

  await saveGame(state);

  set({
    lastDropResult: null,
    phase: 'explore',
  });

  // Resume exploring
  useGameStore.getState().startExploring();
}

async function saveGame(state: GameState) {
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
  });

  // Save bag items (all items including potions)
  await db.characterBag.where('characterId').equals(char.id).delete();
  const bagEntries: CharacterBagEntry[] = [];
  for (const item of state.bagItems) {
    if (item.amount > 0) {
      bagEntries.push({ characterId: char.id, name: item.name, type: item.type, amount: item.amount });
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
        warehouseEntries.push({ userId, name: item.name, type: item.type, amount: item.amount, storageType: 'shared' });
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
        personalEntries.push({ userId, name: item.name, type: item.type, amount: item.amount, storageType: 'personal', characterId: char.id });
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
  };
  localStorage.setItem(key, JSON.stringify(data));
}

interface LoadedPreferences {
  scriptRules: ScriptRule[];
  combatRules: CombatRule[];
  persistentRules: PersistentRule[];
  emergencyRetreat: EmergencyRetreat;
  quickSlots: (PotionType | null)[];
  afterCombatHpThreshold: number;
  afterCombatMpThreshold: number;
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
        emergencyRetreat: data.emergencyRetreat ?? DEFAULT_EMERGENCY_RETREAT,
        quickSlots: data.quickSlots ?? [null, null, null, null, null],
        afterCombatHpThreshold: data.afterCombatHpThreshold ?? 30,
        afterCombatMpThreshold: data.afterCombatMpThreshold ?? 20,
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
        quickSlots: data.quickSlots ?? [null, null, null, null, null],
        afterCombatHpThreshold: data.afterCombatHpThreshold ?? 0,
        afterCombatMpThreshold: data.afterCombatMpThreshold ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}
