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

  fuseSlots: (tier: TalentSlotTier) => Promise<TalentSlot | null>;
  fuseAffixes: (affixIds: number[], rng?: Rng) => Promise<FuseAffixResult | null>;
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
 * 這個天賦配置**現在可以動用**的天賦格。
 *
 * 天賦配置是換裝，不是複製：天賦格是實體，`templateId` 是單一值
 * （`18-data-schema.md`），同一個格子不可能同時在兩份配置裡跑。
 * 所以「沒被這份配置用到」的格子——不管是全新的、還是擺在別份配置裡的——
 * 一律回到背包供這裡取用；裝進來就等於從那一份搬過來。
 *
 * 全新的排在前面：手上有閒置格時不該去拆別份配置。
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

/** 這個格子現在擺在哪份配置裡（沒安裝則為 null）——背包詳情要講清楚會從哪搬走 */
export function slotHomeTemplate(slot: TalentSlot): string | null {
  return isSlotInstalled(slot) ? slot.templateId : null;
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

/** 該類型該種類的合成上限（§ 51.4.3）。共用鑲材走戰鬥池 */
function fuseCapFor(def: { appliesTo: TalentType[]; kind: TalentAffixKind }): TalentTier {
  return def.appliesTo
    .map(t => TALENT_POOL_TIER_CAP[t][def.kind])
    .reduce((a, b) => (a > b ? a : b));
}

/**
 * 這幾份鑲材能不能合成（§ 51.5.2）。
 *
 * **UI 與 store 共用這一支**：畫面自己算一套的話，就會出現像 T1＋T2
 * 那樣預覽秀著「T2、成功率 50%」、按下去卻被 store 擋掉的假訊息。
 */
export function canFuseAffixes(inputs: (TalentAffixInstance | undefined)[]): boolean {
  if (inputs.length !== FUSE_INPUT_COUNT) return false;
  if (inputs.some(a => !a || a.slotId !== null)) return false;

  const defs = inputs.map(a => getTalentAffixDef(a!.definitionId));
  if (defs.some(d => !d)) return false;
  const [d0, d1] = defs as TalentAffixDef[];

  // 同 tier、同種類、同適用類型，且未達該池上限
  if (d0.tier !== d1.tier || d0.kind !== d1.kind) return false;
  if (d0.appliesTo.join() !== d1.appliesTo.join()) return false;
  return d0.tier < fuseCapFor(d0);
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
   * 創角配置（§ 51.3.3.1、§ 51.7）：5 個 T1 格 ＋ 4 份鑲材。
   *
   * **創角的 5 個直接安裝好**，是 § 51.3.4 的唯一例外 ——
   * 否則新角色開局要先開信箱與背包才動得了。
   * 已經有資料就不重發，這個函式在每次載入角色時呼叫都安全。
   */
  grantStartingIfEmpty: async characterId => {
    const existing = await db.talentSlots.where('characterId').equals(characterId).count();
    if (existing > 0) return;

    /**
     * § 51.7 的預設配置：5 個 T1 格，其中 3 格鑲好、2 格空著（清單見 `STARTING_LAYOUT`）。
     *
     * **鑲材必須鑲進去，不能只丟背包** —— 判定讀的是天賦格，
     * 起始鑲材留在背包等於新角色完全不會出手。
     */
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
   * 安裝天賦格到某個類型。
   *
   * 來源可以是背包裡的閒置格，也可以是**別份天賦配置**裡的格子——後者等於搬家
   * （`availableSlots`）。搬家時已鑲的鑲材跟著走，但**不適用新類型的會退回背包**：
   * 例如常駐的格子搬到補給，補給讀不懂的鑲材留在上面只會變成看不見的死設定。
   */
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

  /**
   * 拆下天賦格 → 回背包。
   *
   * **已鑲的鑲材一併退回背包**（§ 51.3.4），不隨天賦格消失 ——
   * 鑲材是玩家刷來的實體，拆個格子就把它吃掉沒有道理。
   */
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
    /*
     * 第一次鑲入時塞預設參數（`models/talentParams.ts`）。
     * 不塞的話規則會是「HP 低於 ??」—— 判定拿不到門檻，等於鑲了也不會觸發。
     */
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

  /**
   * 重排天賦格（§ 51.3.1）。順序決定判定優先權 ——
   * 由上往下取第一個成立者，所以「補刀」擺在「普攻」前面才有意義。
   */
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

  /**
   * 綁定指定型／池型的參數。**只能綁一次**（§ 51.4.1）——
   * 起始發放的是未綁定的，首次鑲入時由玩家選定，之後與掉落品一樣不可更改。
   */
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
      const candidates = TALENT_AFFIX_DEFS.filter(
        d => !d.blocked
          && d.tier === targetTier
          && d.kind === d0.kind
          && d.appliesTo.join() === d0.appliesTo.join(),
      );
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
}));

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
