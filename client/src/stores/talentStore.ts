/**
 * 自動天賦的持有與配置（`51-auto-talent.md`）。
 *
 * **只管「有什麼、鑲在哪」，不管判定。** 判定在 `systems/scriptRunner.ts` 與
 * `systems/villageScriptRunner.ts`，它們只看天賦格鑲了什麼，不查持有清單 ——
 * 混在一起會讓每個判定 tick 都要掃鑲材表（`16-tech-frontend-architecture.md` § 32.18）。
 */
import { create } from 'zustand';
import { db } from '../db/database';
import {
  AFFIX_FUSE_SUCCESS_RATE,
  EXCHANGE_INPUT_COUNT,
  FUSE_INPUT_COUNT,
  STARTING_SLOT_COUNT,
  TALENT_POOL_TIER_CAP,
  conditionSlotCount,
  isSlotInstalled,
  type TalentAffixDef,
  type TalentAffixInstance,
  type TalentAffixKind,
  type TalentSlot,
  type TalentSlotTier,
  type TalentTier,
  type TalentType,
} from '../models/talent';
import { STARTING_LAYOUT, STARTING_SLOT_TYPES, TALENT_AFFIX_DEFS, getTalentAffixDef } from '../db/seed/talentSeeds';
import { defaultParams } from '../models/talentParams';
import { buildCombatRules, buildPersistentRules, buildVillageRules } from '../systems/talentRules';
import type { CombatRule, PersistentRule } from '../models/scriptEngine';
import type { VillageRule } from '../models/villageScript';

/** 可注入的亂數，讓合成機率測得起來 */
export type Rng = () => number;
const defaultRng: Rng = () => Math.random();

export interface FuseAffixResult {
  success: boolean;
  /** 成功時的產物；失敗為 null */
  produced: TalentAffixInstance | null;
}

export interface TalentState {
  characterId: number | null;
  slots: TalentSlot[];
  affixes: TalentAffixInstance[];

  load: (characterId: number) => Promise<void>;
  grantStartingIfEmpty: (characterId: number) => Promise<void>;

  installSlot: (slotId: number, type: TalentType, templateId: string) => Promise<void>;
  uninstallSlot: (slotId: number) => Promise<void>;

  equipAffix: (affixId: number, slotId: number, slotIndex: number | null) => Promise<void>;
  setAffixParams: (affixId: number, params: Record<string, unknown>) => Promise<void>;
  reorderSlot: (slotId: number, toOrder: number) => Promise<void>;
  toggleSlot: (slotId: number) => Promise<void>;
  unequipAffix: (affixId: number) => Promise<void>;
  bindAffix: (affixId: number, boundParam: string) => Promise<void>;

  reset: () => void;

  fuseSlots: (tier: TalentSlotTier) => Promise<TalentSlot | null>;
  fuseAffixes: (affixIds: number[], rng?: Rng) => Promise<FuseAffixResult | null>;
  exchangeAffixes: (affixIds: number[], targetDefinitionId: number) => Promise<TalentAffixInstance | null>;
  downgradeAffix: (affixId: number, targetDefinitionId: number) => Promise<TalentAffixInstance | null>;
}

/** 完全沒安裝在任何天賦配置裡的天賦格。合成只能吃這一種 */
export function uninstalledSlots(slots: TalentSlot[]): TalentSlot[] {
  return slots.filter(s => !isSlotInstalled(s));
}

/** 完全沒鑲在任何天賦格裡的鑲材。合成只能吃這一種 */
export function unequippedAffixes(affixes: TalentAffixInstance[]): TalentAffixInstance[] {
  return affixes.filter(a => a.slotId === null);
}

/**
 * 這份天賦配置可動用的天賦格（§ 51.3.2）：沒安裝的 ＋ 擺在別份配置裡的。
 * 全新的排在前面。
 */
export function availableSlots(slots: TalentSlot[], templateId: string): TalentSlot[] {
  const free = slots.filter(s => !isSlotInstalled(s));
  const elsewhere = slots.filter(s => isSlotInstalled(s) && s.templateId !== templateId);
  return [...free, ...elsewhere];
}

/** 同上，鑲材版：沒鑲入的、以及鑲在別份配置的格子裡的 */
export function availableAffixes(
  affixes: TalentAffixInstance[],
  slots: TalentSlot[],
  templateId: string,
): TalentAffixInstance[] {
  const here = new Set(
    slots.filter(s => s.templateId === templateId).map(s => s.id),
  );
  return affixes.filter(a => a.slotId === null || !here.has(a.slotId));
}

/**
 * 鑲材能不能鑲進這個天賦格。
 *
 * 三道檢查缺一不可：類型（§ 51.2.1 的 `appliesTo`）、種類（條件槽只收條件）、
 * 以及 `blocked`（怪物側機制沒開的鑲材根本不該出現，§ 51.4.4）。
 */
export function canEquipAffix(
  affix: TalentAffixInstance,
  slot: TalentSlot,
  slotIndex: number | null,
): boolean {
  const def = getTalentAffixDef(affix.definitionId);
  if (!def || def.blocked) return false;
  if (!isSlotInstalled(slot)) return false;
  if (!def.appliesTo.includes(slot.assignedType!)) return false;

  const wantKind: TalentAffixKind = slotIndex === null ? 'action' : 'condition';
  if (def.kind !== wantKind) return false;
  if (slotIndex !== null && slotIndex >= conditionSlotCount(slot.tier)) return false;
  return true;
}

/**
 * 產物候選：同種類、T+1、且**適用類型與投入的兩份有交集**（§ 51.5.2）。
 * 用交集而不是「集合完全相等」—— 相等的話共用鑲材幾乎合不出東西。
 */
function fuseCandidates(d0: TalentAffixDef, d1: TalentAffixDef): TalentAffixDef[] {
  const shared = d0.appliesTo.filter(t => d1.appliesTo.includes(t));
  const targetTier = d0.tier + 1;
  return TALENT_AFFIX_DEFS.filter(
    d => !d.blocked
      && d.tier === targetTier
      && d.kind === d0.kind
      && d.appliesTo.some(t => shared.includes(t)),
  );
}

/** 該類型該種類的合成上限（§ 51.4.3）。共用鑲材走戰鬥池 */
function fuseCapFor(def: { appliesTo: TalentType[]; kind: TalentAffixKind }): TalentTier {
  return def.appliesTo
    .map(t => TALENT_POOL_TIER_CAP[t][def.kind])
    .reduce((a, b) => (a > b ? a : b));
}

/** 這幾份鑲材能不能合成（§ 51.5.2）。UI 與 store 共用這一支 */
export function canFuseAffixes(inputs: (TalentAffixInstance | undefined)[]): boolean {
  if (inputs.length !== FUSE_INPUT_COUNT) return false;
  if (inputs.some(a => !a || a.slotId !== null)) return false;

  const defs = inputs.map(a => getTalentAffixDef(a!.definitionId));
  if (defs.some(d => !d)) return false;
  const [d0, d1] = defs as TalentAffixDef[];

  // 同 tier、同種類、且**共用至少一個適用類型**（§ 51.5.2）
  if (d0.tier !== d1.tier || d0.kind !== d1.kind) return false;
  const shared = d0.appliesTo.filter(t => d1.appliesTo.includes(t));
  if (shared.length === 0) return false;
  if (d0.tier >= fuseCapFor(d0)) return false;
  // 產不出東西就不算合得成
  return fuseCandidates(d0, d1).length > 0;
}

/**
 * 投入的每一份都適用的類型（§ 51.5.3）。空陣列 ＝ 湊不成一組。
 * 與合成一樣取交集而非要求集合相等，否則共用鑲材幾乎換不動。
 */
function sharedTypes(defs: TalentAffixDef[]): TalentType[] {
  return defs.reduce<TalentType[]>(
    (acc, d) => acc.filter(t => d.appliesTo.includes(t)),
    [...defs[0].appliesTo],
  );
}

/** 投入的鑲材全部存在、都沒鑲入、同種類，且有共用的適用類型 */
function inputDefs(inputs: (TalentAffixInstance | undefined)[]): TalentAffixDef[] | null {
  if (inputs.some(a => !a || a.slotId !== null)) return null;
  const defs = inputs.map(a => getTalentAffixDef(a!.definitionId));
  if (defs.some(d => !d)) return null;
  return defs as TalentAffixDef[];
}

/** 產出可不可以是這一筆定義：同種類、指定 tier、適用類型與投入有交集 */
function canProduce(target: TalentAffixDef, defs: TalentAffixDef[], tier: TalentTier): boolean {
  if (target.blocked) return false;
  if (target.tier !== tier) return false;
  if (target.kind !== defs[0].kind) return false;
  const shared = sharedTypes(defs);
  return shared.length > 0 && target.appliesTo.some(t => shared.includes(t));
}

/**
 * 定向兌換能不能成立（§ 51.5.3）：同類型同種類同 tier ×3 → 指定同 tier ×1。
 * UI 與 store 共用這一支。
 */
export function canExchangeAffixes(
  inputs: (TalentAffixInstance | undefined)[],
  targetDefinitionId: number,
): boolean {
  if (inputs.length !== EXCHANGE_INPUT_COUNT) return false;
  const ids = inputs.map(a => a?.id);
  if (new Set(ids).size !== ids.length) return false;

  const defs = inputDefs(inputs);
  if (!defs) return false;
  if (defs.some(d => d.tier !== defs[0].tier || d.kind !== defs[0].kind)) return false;

  const target = getTalentAffixDef(targetDefinitionId);
  if (!target) return false;
  return canProduce(target, defs, defs[0].tier);
}

/**
 * 降階能不能成立（§ 51.5.3）：較高 tier ×1 → 指定較低 tier ×1。
 * **不必逐階**，T6 可一步換 T1；產出比投入低，不受各池上限限制。
 */
export function canDowngradeAffix(
  input: TalentAffixInstance | undefined,
  targetDefinitionId: number,
): boolean {
  const defs = inputDefs([input]);
  if (!defs) return false;

  const target = getTalentAffixDef(targetDefinitionId);
  if (!target || target.tier >= defs[0].tier) return false;
  return canProduce(target, defs, target.tier);
}

export const useTalentStore = create<TalentState>((set, get) => ({
  characterId: null,
  slots: [],
  affixes: [],

  load: async characterId => {
    const [slots, affixes] = await Promise.all([
      db.talentSlots.where('characterId').equals(characterId).toArray(),
      db.talentAffixes.where('characterId').equals(characterId).toArray(),
    ]);
    set({ characterId, slots, affixes });
  },

  /**
   * 創角配置（§ 51.3.3.1、§ 51.7）：5 個 T1 格 ＋ 6 份鑲材，直接安裝好。
   * 已經有資料就不重發。
   */
  grantStartingIfEmpty: async characterId => {
    const existing = await db.talentSlots.where('characterId').equals(characterId).count();
    if (existing > 0) return;

    /* 鑲材必須鑲進天賦格，不能只丟背包 —— 判定讀的是天賦格 */
    await db.transaction('rw', db.talentSlots, db.talentAffixes, async () => {
      const slotIds: number[] = [];
      for (let i = 0; i < STARTING_SLOT_COUNT; i++) {
        const id = await db.talentSlots.add({
          characterId,
          tier: 1 as TalentSlotTier,
          // 格 3 是常駐（喝藥），其餘給戰鬥
          assignedType: STARTING_SLOT_TYPES[i] as TalentType,
          templateId: 'default',
          order: i,
          enabled: true,
        }) as number;
        slotIds.push(id);
      }

      for (const p of STARTING_LAYOUT) {
        await db.talentAffixes.add({
          characterId,
          definitionId: p.definitionId,
          boundParam: null,
          params: p.params,
          slotId: slotIds[p.slotIndex],
          slotIndex: p.conditionIndex,
        });
      }
    });
    await get().load(characterId);
  },

  /**
   * 安裝天賦格到某個類型。來源含別份配置裡的格子（等於搬家）。
   * 鑲材跟著走，不適用新類型的退回背包。
   */
  reset: () => set({ characterId: null, slots: [], affixes: [] }),

  installSlot: async (slotId, type, templateId) => {
    const { slots, affixes, characterId } = get();
    if (characterId === null) return;
    const sameType = slots.filter(s => s.assignedType === type && s.templateId === templateId);
    const nextOrder = sameType.reduce((max, s) => Math.max(max, s.order ?? -1), -1) + 1;
    const dropped = affixes
      .filter(a => a.slotId === slotId)
      .filter(a => !getTalentAffixDef(a.definitionId)?.appliesTo.includes(type))
      .map(a => a.id!);
    await db.transaction('rw', db.talentSlots, db.talentAffixes, async () => {
      if (dropped.length > 0) {
        await db.talentAffixes.where('id').anyOf(dropped)
          .modify({ slotId: null, slotIndex: null });
      }
      await db.talentSlots.update(slotId, { assignedType: type, templateId, order: nextOrder });
    });
    await get().load(characterId);
  },

  /** 拆下天賦格 → 回背包。已鑲的鑲材一併退回（§ 51.3.4） */
  uninstallSlot: async slotId => {
    const { characterId } = get();
    if (characterId === null) return;
    await db.transaction('rw', db.talentSlots, db.talentAffixes, async () => {
      await db.talentAffixes.where('slotId').equals(slotId)
        .modify({ slotId: null, slotIndex: null });
      await db.talentSlots.update(slotId, { assignedType: null, templateId: null, order: null });
    });
    await get().load(characterId);
  },

  /**
   * 鑲入。**一實體一格**（§ 51.5.1）：先清掉這份鑲材原本的位置，
   * 再把目標槽位原本那份退回背包。
   */
  equipAffix: async (affixId, slotId, slotIndex) => {
    const { characterId, affixes, slots } = get();
    if (characterId === null) return;
    const affix = affixes.find(a => a.id === affixId);
    const slot = slots.find(s => s.id === slotId);
    if (!affix || !slot || !canEquipAffix(affix, slot, slotIndex)) return;

    const occupant = affixes.find(
      a => a.slotId === slotId && a.slotIndex === slotIndex && a.id !== affixId,
    );
    /* 第一次鑲入時塞預設參數（`models/talentParams.ts`） */
    const def = getTalentAffixDef(affix.definitionId);
    const seeded = affix.params ?? (def ? defaultParams(def.ruleId) : null);

    await db.transaction('rw', db.talentAffixes, async () => {
      if (occupant) {
        await db.talentAffixes.update(occupant.id!, { slotId: null, slotIndex: null });
      }
      await db.talentAffixes.update(affixId, { slotId, slotIndex, params: seeded });
    });
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

  setAffixParams: async (affixId, params) => {
    const { characterId } = get();
    if (characterId === null) return;
    await db.talentAffixes.update(affixId, { params });
    await get().load(characterId);
  },

  unequipAffix: async affixId => {
    const { characterId } = get();
    if (characterId === null) return;
    await db.talentAffixes.update(affixId, { slotId: null, slotIndex: null });
    await get().load(characterId);
  },

  /** 綁定指定型／池型的參數。只能綁一次（§ 51.4.1） */
  bindAffix: async (affixId, boundParam) => {
    const { characterId, affixes } = get();
    if (characterId === null) return;
    const affix = affixes.find(a => a.id === affixId);
    if (!affix || affix.boundParam !== null) return;
    await db.talentAffixes.update(affixId, { boundParam });
    await get().load(characterId);
  },

  /**
   * 天賦格合成：同 tier ×2 → T+1 ×1，**必定成功**（§ 51.5.2）。
   * 純換算、產物確定，不查成功率表。
   */
  fuseSlots: async tier => {
    const { characterId, slots } = get();
    if (characterId === null || tier >= 4) return null;
    const pool = uninstalledSlots(slots).filter(s => s.tier === tier);
    if (pool.length < FUSE_INPUT_COUNT) return null;

    const consumed = pool.slice(0, FUSE_INPUT_COUNT);
    const produced: TalentSlot = {
      characterId,
      tier: (tier + 1) as TalentSlotTier,
      assignedType: null,
      templateId: null,
      order: null,
      enabled: true,
    };
    await db.transaction('rw', db.talentSlots, async () => {
      await db.talentSlots.bulkDelete(consumed.map(s => s.id!));
      await db.talentSlots.add(produced);
    });
    await get().load(characterId);
    return produced;
  },

  /**
   * 鑲材合成：同 tier 同類型同種類 ×2 → 隨機 T+1 ×1。
   *
   * **有失敗率**（§ 51.5.2），失敗時**退回投入的其中 1 份**（淨損 1 份），不歸零。
   */
  fuseAffixes: async (affixIds, rng = defaultRng) => {
    const { characterId, affixes } = get();
    if (characterId === null || affixIds.length !== FUSE_INPUT_COUNT) return null;

    const inputs = affixIds.map(id => affixes.find(a => a.id === id));
    if (!canFuseAffixes(inputs)) return null;

    const d0 = getTalentAffixDef(inputs[0]!.definitionId)!;
    const targetTier = (d0.tier + 1) as Exclude<TalentTier, 1>;
    const success = rng() * 100 < AFFIX_FUSE_SUCCESS_RATE[targetTier];

    // 失敗只消耗 1 份：投入 2 份、退回 1 份
    const consumeCount = success ? FUSE_INPUT_COUNT : FUSE_INPUT_COUNT - 1;
    const consumed = inputs.slice(0, consumeCount).map(a => a!.id!);

    let produced: TalentAffixInstance | null = null;
    if (success) {
      const candidates = fuseCandidates(d0, getTalentAffixDef(inputs[1]!.definitionId)!);
      if (candidates.length === 0) return null;
      const picked = candidates[Math.floor(rng() * candidates.length)];
      produced = {
        characterId,
        definitionId: picked.id,
        boundParam: null,
        params: null,
        slotId: null,
        slotIndex: null,
      };
    }

    await db.transaction('rw', db.talentAffixes, async () => {
      await db.talentAffixes.bulkDelete(consumed);
      if (produced) await db.talentAffixes.add(produced);
    });
    await get().load(characterId);
    return { success, produced };
  },

  /**
   * 定向兌換：同類型同種類同 tier ×3 → **玩家指定**的同 tier ×1（§ 51.5.3）。
   * 必定成功、不收金幣。
   */
  exchangeAffixes: async (affixIds, targetDefinitionId) => {
    const { characterId, affixes } = get();
    if (characterId === null || affixIds.length !== EXCHANGE_INPUT_COUNT) return null;

    const inputs = affixIds.map(id => affixes.find(a => a.id === id));
    if (!canExchangeAffixes(inputs, targetDefinitionId)) return null;

    return consumeAndProduce(
      characterId,
      inputs.map(a => a!.id!),
      targetDefinitionId,
      get().load,
    );
  },

  /**
   * 降階：較高 tier ×1 → **玩家指定**的較低 tier ×1（§ 51.5.3）。
   * 不必逐階，必定成功、不收金幣。
   */
  downgradeAffix: async (affixId, targetDefinitionId) => {
    const { characterId, affixes } = get();
    if (characterId === null) return null;

    const input = affixes.find(a => a.id === affixId);
    if (!canDowngradeAffix(input, targetDefinitionId)) return null;

    return consumeAndProduce(characterId, [input!.id!], targetDefinitionId, get().load);
  },
}));

/** 兌換與降階的共同結算：吃掉投入、產出未綁定的指定鑲材（§ 51.5.3） */
async function consumeAndProduce(
  characterId: number,
  consumed: number[],
  targetDefinitionId: number,
  reload: (characterId: number) => Promise<void>,
): Promise<TalentAffixInstance> {
  const produced: TalentAffixInstance = {
    characterId,
    definitionId: targetDefinitionId,
    boundParam: null,
    params: null,
    slotId: null,
    slotIndex: null,
  };

  await db.transaction('rw', db.talentAffixes, async () => {
    await db.talentAffixes.bulkDelete(consumed);
    await db.talentAffixes.add(produced);
  });
  await reload(characterId);
  return produced;
}

/**
 * 判定用的規則（`systems/talentRules.ts`）。
 *
 * 這三個是 runner 的唯一入口 —— 讀天賦格組出既有的規則形狀，
 * **不查持有清單**（`16-tech-frontend-architecture.md` § 32.18）。
 */
export function talentCombatRules(templateId: string): CombatRule[] {
  const { slots, affixes } = useTalentStore.getState();
  return buildCombatRules(slots, affixes, templateId);
}

export function talentPersistentRules(templateId: string): PersistentRule[] {
  const { slots, affixes } = useTalentStore.getState();
  return buildPersistentRules(slots, affixes, templateId);
}

export function talentVillageRules(templateId: string): VillageRule[] {
  const { slots, affixes } = useTalentStore.getState();
  return buildVillageRules(slots, affixes, templateId);
}
