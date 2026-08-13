/**
 * 自動天賦的持有與配置（`51-auto-talent.md`）。
 *
 * **只管「有幾格、格上設了什麼」，不管判定。** 判定在 `systems/scriptRunner.ts` 與
 * `systems/villageScriptRunner.ts`，它們只看天賦格設了什麼，不查持有清單
 * （`16-tech-frontend-architecture.md` § 32.18）。
 *
 * 條件與動作**沒有 store** —— 它們是 seed 常數，全部內建（§ 51.4.1）。
 */
import { create } from 'zustand';
import { db } from '../db/database';
import {
  FUSE_INPUT_COUNT,
  STARTING_SLOT_COUNT,
  conditionSlotCount,
  emptyConditions,
  isSlotInstalled,
  type TalentSlot,
  type TalentSlotEntry,
  type TalentSlotTier,
  type TalentType,
} from '../models/talent';
import { STARTING_LAYOUT, getTalentRuleDef } from '../db/seed/talentSeeds';
import { defaultParams } from '../models/talentParams';
import { buildCombatRules, buildPersistentRules, buildVillageRules } from '../systems/talentRules';
import type { CombatRule, PersistentRule } from '../models/scriptEngine';
import type { VillageRule } from '../models/villageScript';

export interface TalentState {
  characterId: number | null;
  slots: TalentSlot[];

  load: (characterId: number) => Promise<void>;
  grantStartingIfEmpty: (characterId: number) => Promise<void>;
  reset: () => void;

  installSlot: (slotId: number, type: TalentType, templateId: string) => Promise<void>;
  uninstallSlot: (slotId: number) => Promise<void>;
  reorderSlot: (slotId: number, toOrder: number) => Promise<void>;
  toggleSlot: (slotId: number) => Promise<void>;

  /** 設定或清空一個槽位。`slotIndex` 為 null ＝ 動作槽；`ruleId` 為 null ＝ 清空 */
  setEntry: (slotId: number, slotIndex: number | null, ruleId: string | null) => Promise<void>;
  setEntryParams: (slotId: number, slotIndex: number | null, params: Record<string, unknown>) => Promise<void>;

  fuseSlots: (tier: TalentSlotTier) => Promise<TalentSlot | null>;
}

/** 完全沒安裝在任何天賦配置裡的天賦格。合成只能吃這一種（§ 51.5.2） */
export function uninstalledSlots(slots: TalentSlot[]): TalentSlot[] {
  return slots.filter(s => !isSlotInstalled(s));
}

/**
 * 這份天賦配置可動用的天賦格（§ 51.3.2）：沒安裝的 ＋ 擺在別份配置裡的。
 * 全新的排在前面 —— 手上有閒置格時不該去動別份配置。
 */
export function availableSlots(slots: TalentSlot[], templateId: string): TalentSlot[] {
  const free = slots.filter(s => !isSlotInstalled(s));
  const elsewhere = slots.filter(s => isSlotInstalled(s) && s.templateId !== templateId);
  return [...free, ...elsewhere];
}

/**
 * 這個條件／動作能不能放進這個槽位。
 *
 * 四道檢查缺一不可：定義存在、沒被 `blocked`（§ 51.4.3.2）、
 * 適用該類型（§ 51.2.1）、種類對得上（條件槽只收條件）。
 */
export function canPlaceRule(
  ruleId: string,
  slot: TalentSlot,
  slotIndex: number | null,
): boolean {
  const def = getTalentRuleDef(ruleId);
  if (!def || def.blocked) return false;
  if (!isSlotInstalled(slot)) return false;
  if (!def.appliesTo.includes(slot.assignedType!)) return false;

  const wantKind = slotIndex === null ? 'action' : 'condition';
  if (def.kind !== wantKind) return false;
  if (slotIndex !== null && (slotIndex < 0 || slotIndex >= conditionSlotCount(slot.tier))) return false;
  return true;
}

/** 換類型時留不下來的槽位一律清空（§ 51.3.2） */
function keepApplicable(slot: TalentSlot, type: TalentType): Pick<TalentSlot, 'conditions' | 'action'> {
  const applies = (e: TalentSlotEntry | null) =>
    e !== null && (getTalentRuleDef(e.ruleId)?.appliesTo.includes(type) ?? false);
  return {
    conditions: slot.conditions.map(c => (applies(c) ? c : null)),
    action: applies(slot.action) ? slot.action : null,
  };
}

/** 寫回單一槽位後的完整欄位 */
function withEntry(
  slot: TalentSlot,
  slotIndex: number | null,
  entry: TalentSlotEntry | null,
): Pick<TalentSlot, 'conditions' | 'action'> {
  if (slotIndex === null) return { conditions: slot.conditions, action: entry };
  const conditions = [...slot.conditions];
  // 舊存檔的陣列可能短於 tier（§ 51.9），補齊再寫
  while (conditions.length < conditionSlotCount(slot.tier)) conditions.push(null);
  conditions[slotIndex] = entry;
  return { conditions, action: slot.action };
}

export const useTalentStore = create<TalentState>((set, get) => ({
  characterId: null,
  slots: [],

  load: async characterId => {
    const slots = await db.talentSlots.where('characterId').equals(characterId).toArray();
    set({ characterId, slots });
  },

  /**
   * 創角配置（§ 51.3.3、§ 51.7）：5 個 T1 格，直接安裝好並設定內容。
   * 已經有資料就不重發。
   */
  grantStartingIfEmpty: async characterId => {
    const existing = await db.talentSlots.where('characterId').equals(characterId).count();
    if (existing > 0) return;

    await db.transaction('rw', db.talentSlots, async () => {
      for (let i = 0; i < STARTING_SLOT_COUNT; i++) {
        const layout = STARTING_LAYOUT[i];
        await db.talentSlots.add({
          characterId,
          tier: 1,
          assignedType: layout.type,
          templateId: 'default',
          order: i,
          enabled: true,
          conditions: layout.conditions,
          action: layout.action,
        });
      }
    });
    await get().load(characterId);
  },

  reset: () => set({ characterId: null, slots: [] }),

  /**
   * 安裝天賦格到某個類型。來源含別份配置裡的格子（等於搬家，§ 51.3.2）。
   * 設定跟著走，不適用新類型的槽位清空。
   */
  installSlot: async (slotId, type, templateId) => {
    const { slots, characterId } = get();
    if (characterId === null) return;
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;

    const sameType = slots.filter(s => s.assignedType === type && s.templateId === templateId);
    const nextOrder = sameType.reduce((max, s) => Math.max(max, s.order ?? -1), -1) + 1;

    await db.talentSlots.update(slotId, {
      assignedType: type,
      templateId,
      order: nextOrder,
      ...keepApplicable(slot, type),
    });
    await get().load(characterId);
  },

  /**
   * 拆下天賦格 → 回背包。**設定原樣保留**（§ 51.3.4）：
   * 條件與動作不是實體，沒有東西需要退回，重新安裝到同類型即復原。
   */
  uninstallSlot: async slotId => {
    const { characterId } = get();
    if (characterId === null) return;
    await db.talentSlots.update(slotId, { assignedType: null, templateId: null, order: null });
    await get().load(characterId);
  },

  /** 重排天賦格（§ 51.3.1）。順序決定判定優先權 */
  reorderSlot: async (slotId, toOrder) => {
    const { characterId, slots } = get();
    if (characterId === null) return;
    const moving = slots.find(s => s.id === slotId);
    if (!moving || !isSlotInstalled(moving)) return;

    const siblings = slots
      .filter(s => s.assignedType === moving.assignedType && s.templateId === moving.templateId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const without = siblings.filter(s => s.id !== slotId);
    const clamped = Math.max(0, Math.min(toOrder, without.length));
    without.splice(clamped, 0, moving);

    await db.transaction('rw', db.talentSlots, async () => {
      for (let i = 0; i < without.length; i++) {
        await db.talentSlots.update(without[i].id!, { order: i });
      }
    });
    await get().load(characterId);
  },

  /** 停用的天賦格照樣組進規則，但帶 `enabled: false`，由 evaluator 跳過 */
  toggleSlot: async slotId => {
    const { characterId, slots } = get();
    if (characterId === null) return;
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    await db.talentSlots.update(slotId, { enabled: !slot.enabled });
    await get().load(characterId);
  },

  /**
   * 設定槽位。同一個 `ruleId` 可出現在任意多個天賦格（§ 51.5.1），
   * 所以這裡不必去別處清位置 —— 沒有「一實體一格」要維護。
   */
  setEntry: async (slotId, slotIndex, ruleId) => {
    const { characterId, slots } = get();
    if (characterId === null) return;
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;

    let entry: TalentSlotEntry | null = null;
    if (ruleId !== null) {
      if (!canPlaceRule(ruleId, slot, slotIndex)) return;
      entry = { ruleId, params: defaultParams(ruleId) };
    }
    await db.talentSlots.update(slotId, withEntry(slot, slotIndex, entry));
    await get().load(characterId);
  },

  setEntryParams: async (slotId, slotIndex, params) => {
    const { characterId, slots } = get();
    if (characterId === null) return;
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    const current = slotIndex === null ? slot.action : slot.conditions[slotIndex] ?? null;
    if (!current) return;
    await db.talentSlots.update(slotId, withEntry(slot, slotIndex, { ...current, params }));
    await get().load(characterId);
  },

  /**
   * 天賦格合成：同 tier ×2 → T+1 ×1，**必定成功**（§ 51.5.2）。
   * 純換算、產物確定，沒有成功率表 —— 這是系統唯一的合成。
   */
  fuseSlots: async tier => {
    const { characterId, slots } = get();
    if (characterId === null || tier >= 4) return null;
    const pool = uninstalledSlots(slots).filter(s => s.tier === tier);
    if (pool.length < FUSE_INPUT_COUNT) return null;

    const consumed = pool.slice(0, FUSE_INPUT_COUNT);
    const nextTier = (tier + 1) as TalentSlotTier;
    const produced: TalentSlot = {
      characterId,
      tier: nextTier,
      assignedType: null,
      templateId: null,
      order: null,
      enabled: true,
      conditions: emptyConditions(nextTier),
      action: null,
    };
    await db.transaction('rw', db.talentSlots, async () => {
      await db.talentSlots.bulkDelete(consumed.map(s => s.id!));
      await db.talentSlots.add(produced);
    });
    await get().load(characterId);
    return produced;
  },
}));

/**
 * 判定用的規則（`systems/talentRules.ts`）。
 *
 * 這三個是 runner 的唯一入口 —— 讀天賦格組出既有的規則形狀，
 * **不查持有清單**（`16-tech-frontend-architecture.md` § 32.18）。
 */
export function talentCombatRules(templateId: string): CombatRule[] {
  return buildCombatRules(useTalentStore.getState().slots, templateId);
}

export function talentPersistentRules(templateId: string): PersistentRule[] {
  return buildPersistentRules(useTalentStore.getState().slots, templateId);
}

export function talentVillageRules(templateId: string): VillageRule[] {
  return buildVillageRules(useTalentStore.getState().slots, templateId);
}
