import { db, type LegacyArchiveEntry } from '../db/database';
import { resolveEquipment } from './templateSync';
import { formatAffixDisplay } from '../models/affix';
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';

/**
 * 遺產封存（§ 45）
 *
 * 被 `CURRENT_DATA_VERSION` 淘汰的角色，在刪除前把完整狀態轉成**純文字快照**。
 * 快照與遊玩中的型別脫鉤：日後改 `Character`、`EquipmentInstance` 都不會弄壞舊紀錄，
 * 代價是讀取時必須容忍缺欄位（遺產頁對缺少的欄位顯示 `—`，見 § 45.3）。
 */

/** 快照格式版本。變更 payload 結構時 +1，讀取端依此決定如何解析 */
export const SNAPSHOT_VERSION = 1;

export interface LegacyItemStack {
  name: string;
  type: string;
  amount: number;
}

export interface LegacyEquipment {
  name: string;
  type?: string;
  slot?: string;
  quality?: number;
  enhancement?: number;
  element?: string;
  isTwoHanded?: boolean;
  affixes: { type?: string; tier?: number; value?: number; display?: string }[];
}

export interface LegacyCharacterPayload {
  snapshotVersion: number;
  character: {
    name: string;
    uuid?: string;
    className: string;
    level: number;
    exp: number;
    gold: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    baseAttributes: Record<string, number>;
    bonusAttributes: Record<string, number>;
    unspentAttributePoints: number;
    currentRegion: string;
    createdAt: number;
  };
  /** 已學習技能（§ 45.2 明列必須包含） */
  skills: { id?: string; name?: string; level?: number }[];
  quests: unknown[];
  equipped: LegacyEquipment[];
  inventory: LegacyEquipment[];
  bagItems: LegacyItemStack[];
  personalStorageItems: LegacyItemStack[];
  personalWarehouseEquipment: LegacyEquipment[];
  statistics: Record<string, number> | null;
  contribution: number | null;
}

export interface LegacySharedWarehousePayload {
  snapshotVersion: number;
  items: LegacyItemStack[];
  gold: number;
  equipment: LegacyEquipment[];
}

function toLegacyEquipment(instance: EquipmentInstance): LegacyEquipment {
  // 先套模板解析，讓快照帶著當時的名稱與部位，日後模板改動也不影響已封存紀錄
  const resolved = resolveEquipment(instance);
  const quality = resolved.quality ?? 0;
  return {
    name: resolved.name ?? '未知裝備',
    type: resolved.type,
    slot: resolved.slot,
    quality: resolved.quality,
    enhancement: resolved.enhancement,
    element: resolved.element,
    isTwoHanded: resolved.isTwoHanded,
    affixes: (resolved.affixes ?? []).map(affix => ({
      type: affix.type,
      tier: affix.tier,
      value: affix.value,
      // 顯示文字在封存當下算好寫死：日後 AFFIX_DEFINITIONS 改名或刪詞綴，
      // 舊遺產仍顯示封存當時的正確名稱（§ 45.1 快照與型別脫鉤）
      display: formatAffixDisplay(affix, quality),
    })),
  };
}

/** 統計與貢獻度存在 localStorage 的 `mayana_prefs_<id>`，不在 IndexedDB 內 */
function readPreferences(characterId: number): { statistics: Record<string, number> | null; contribution: number | null } {
  try {
    const raw = localStorage.getItem(`mayana_prefs_${characterId}`);
    if (!raw) return { statistics: null, contribution: null };
    const parsed = JSON.parse(raw) as {
      statistics?: Record<string, number>;
      guildProgress?: { points?: number };
    };
    return {
      statistics: parsed.statistics ?? null,
      contribution: parsed.guildProgress?.points ?? null,
    };
  } catch {
    return { statistics: null, contribution: null };
  }
}

/** 產生單一角色的完整快照（不寫入 DB） */
export async function buildCharacterArchive(char: Character): Promise<LegacyArchiveEntry> {
  const characterId = char.id!;
  const instances = await db.equipmentInstances.where('ownerId').equals(characterId).toArray();

  const equipped: LegacyEquipment[] = [];
  const inventory: LegacyEquipment[] = [];
  const personalWarehouseEquipment: LegacyEquipment[] = [];
  for (const instance of instances) {
    const item = toLegacyEquipment(instance);
    if (instance.equipped) equipped.push(item);
    else if (instance.inStorage) personalWarehouseEquipment.push(item);
    else inventory.push(item);
  }

  const bagRows = await db.characterBag.where('characterId').equals(characterId).toArray();
  const storageRows = await db.characterStorage.where('characterId').equals(characterId).toArray();
  const personalWarehouseRows = await db.warehouses.where('characterId').equals(characterId).toArray();

  const { statistics, contribution } = readPreferences(characterId);

  const payload: LegacyCharacterPayload = {
    snapshotVersion: SNAPSHOT_VERSION,
    character: {
      name: char.name,
      uuid: char.uuid,
      className: char.className,
      level: char.level,
      exp: char.exp,
      gold: char.gold,
      hp: char.hp,
      maxHp: char.maxHp,
      mp: char.mp,
      maxMp: char.maxMp,
      baseAttributes: { ...char.baseAttributes },
      bonusAttributes: { ...char.bonusAttributes },
      unspentAttributePoints: char.unspentAttributePoints,
      currentRegion: char.currentRegion,
      createdAt: char.createdAt,
    },
    skills: (char.skills ?? []).map(skill => ({
      id: (skill as { id?: string }).id,
      name: (skill as { name?: string }).name,
      level: (skill as { level?: number }).level,
    })),
    quests: char.quests ?? [],
    equipped,
    inventory,
    bagItems: bagRows.map(row => ({ name: row.name, type: row.type, amount: row.amount })),
    personalStorageItems: storageRows.map(row => ({ name: row.name, type: row.type, amount: row.amount })),
    personalWarehouseEquipment: [
      ...personalWarehouseEquipment,
      ...personalWarehouseRows
        .filter(row => row.type === 'equipment')
        .map(row => ({ name: row.name, affixes: [] as LegacyEquipment['affixes'] })),
    ],
    statistics,
    contribution,
  };

  return {
    userId: char.userId,
    type: 'character',
    label: char.name,
    className: char.className,
    level: char.level,
    dataVersion: char.dataVersion ?? 0,
    archivedAt: Date.now(),
    payload: JSON.stringify(payload),
  };
}

/** 產生共用倉庫快照（帳號層級，不屬於任何角色） */
export async function buildSharedWarehouseArchive(
  userId: number,
  dataVersion: number,
): Promise<LegacyArchiveEntry | null> {
  const rows = await db.warehouses
    .where('userId').equals(userId)
    .filter(row => row.storageType === 'shared')
    .toArray();
  const equipmentInstances = await db.equipmentInstances
    .where('ownerId').equals(userId)
    .filter(item => item.inStorage === true && item.storageType === 'shared')
    .toArray();
  // 金幣自 v16 起在獨立表（§ 18.7）
  const gold = (await db.warehouseGold.get(userId))?.amount ?? 0;

  if (rows.length === 0 && equipmentInstances.length === 0 && gold === 0) return null;

  const payload: LegacySharedWarehousePayload = {
    snapshotVersion: SNAPSHOT_VERSION,
    items: rows
      .filter(row => row.type !== 'equipment')
      .map(row => ({ name: row.name, type: row.type, amount: row.amount })),
    gold,
    equipment: equipmentInstances.map(toLegacyEquipment),
  };

  return {
    userId,
    type: 'sharedWarehouse',
    label: '共用倉庫',
    dataVersion,
    archivedAt: Date.now(),
    payload: JSON.stringify(payload),
  };
}

export async function listArchives(userId: number): Promise<LegacyArchiveEntry[]> {
  const rows = await db.legacyArchives.where('userId').equals(userId).toArray();
  return rows.sort((a, b) => b.archivedAt - a.archivedAt);
}

export async function deleteArchive(id: number): Promise<void> {
  await db.legacyArchives.delete(id);
}

/** 解析 payload；格式不符時回傳 null，由呼叫端顯示為無法讀取而不是整頁壞掉 */
export function parseCharacterPayload(entry: LegacyArchiveEntry): LegacyCharacterPayload | null {
  try {
    const parsed = JSON.parse(entry.payload) as LegacyCharacterPayload;
    return parsed?.character ? parsed : null;
  } catch {
    return null;
  }
}

export function parseSharedWarehousePayload(entry: LegacyArchiveEntry): LegacySharedWarehousePayload | null {
  try {
    const parsed = JSON.parse(entry.payload) as LegacySharedWarehousePayload;
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch {
    return null;
  }
}
