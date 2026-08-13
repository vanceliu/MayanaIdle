import { db } from '../db/database';
import { normalizeAppearance } from '../models/appearance';
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { BagItem } from '../models/bagItem';
import type { TalentSlot, TalentAffixInstance } from '../models/talent';
import type { Mail } from '../models/mailbox';
import { makeBagItem } from '../models/bagItem';
import type { WarehouseEntry } from '../db/database';
import { instantiateFromTemplate } from '../models/skillTemplate';
import { CURRENT_DATA_VERSION } from '../config';
import { ensureCharacterAuthToken } from './authToken';

const ENCRYPTION_PASSPHRASE = 'MayanaIdle-v1-8f3k2m9x';
const SALT = new Uint8Array([77, 97, 121, 97, 110, 97, 73, 100, 108, 101, 83, 97, 108, 116, 50, 48]);

interface CharacterExportData {
  /** v3 起帶天賦與信箱。舊檔（v2）匯入時這三項為 undefined，視為空 */
  version: 2 | 3;
  dataVersion: number;
  exportedAt: number;
  character: Character;
  equipmentInstances: EquipmentInstance[];
  bagItems: BagItem[];
  personalWarehouseItems: BagItem[];
  /** 天賦格與鑲材（`51-auto-talent.md`），匯出必須帶走 */
  talentSlots?: TalentSlot[];
  talentAffixes?: TalentAffixInstance[];
  /** 未領取的信同樣是角色資產（`52-mailbox.md`） */
  mailbox?: Mail[];
  localPreferences: Record<string, unknown> | null;
}

async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** 與 `decryptExport` 對稱。export 出來是為了讓測試能組出舊格式的匯出檔。 */
export async function encryptExport(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * 解開匯出檔。金鑰由寫死的通關語推導（見上），所以這**不是**保密機制，
 * 只是避免玩家直接用文字編輯器改數值；匯出成 export 是為了讓測試能檢查檔案內容。
 */
export async function decryptExport(encoded: string): Promise<string> {
  const key = await deriveKey();
  const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

export async function exportCharacterData(characterId: number): Promise<string> {
  // 密鑰必須在**讀取角色之前**補發：舊角色若從未上傳過統計就還沒有密鑰，
  // 匯出檔少了它，還原到另一台裝置後那台會自己產一把不同的，
  // 兩台就再也不能同時更新同一筆排行榜資料（§ 37.4.3）。
  await ensureCharacterAuthToken(characterId);

  const character = await db.characters.get(characterId);
  if (!character) throw new Error('角色不存在');

  const equipmentInstances = await db.equipmentInstances
    .where('ownerId')
    .equals(characterId)
    .filter(item => item.storageType !== 'shared')
    .toArray();

  const bagRows = await db.characterBag
    .where('characterId')
    .equals(characterId)
    .toArray();
  const bagItems: BagItem[] = bagRows
    .map(r => makeBagItem(r.itemTemplateId!, r.amount))
    .filter((b): b is BagItem => b !== null);

  const personalWarehouseRows = await db.warehouses
    .where('characterId')
    .equals(characterId)
    .filter(row => row.storageType === 'personal')
    .toArray();
  const personalWarehouseItems: BagItem[] = personalWarehouseRows
    // 個人倉庫沒有金幣（金幣只存在帳號層級的 warehouseGold，見 § 18.7）
    .filter(r => r.type !== 'equipment')
    .map(r => makeBagItem(r.itemTemplateId!, r.amount))
    .filter((b): b is BagItem => b !== null);

  const talentSlots = await db.talentSlots.where('characterId').equals(characterId).toArray();
  const talentAffixes = await db.talentAffixes.where('characterId').equals(characterId).toArray();
  const mailbox = await db.mailbox.where('characterId').equals(characterId).toArray();

  const prefsRaw = localStorage.getItem(`mayana_prefs_${characterId}`);
  const localPreferences = prefsRaw ? JSON.parse(prefsRaw) : null;

  const data: CharacterExportData = {
    version: 3,
    dataVersion: character.dataVersion ?? 1,
    exportedAt: Date.now(),
    character,
    equipmentInstances,
    bagItems,
    personalWarehouseItems,
    talentSlots,
    talentAffixes,
    mailbox,
    localPreferences,
  };

  const json = JSON.stringify(data);
  return encryptExport(json);
}

export function downloadExport(encrypted: string, characterName: string) {
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mayana-${characterName}-${new Date().toISOString().slice(0, 10)}.dat`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importCharacterData(
  encrypted: string,
  currentCharacterId: number
): Promise<void> {
  let json: string;
  try {
    json = await decryptExport(encrypted.trim());
  } catch {
    throw new Error('檔案解密失敗，可能已被竄改');
  }

  const data = JSON.parse(json) as Omit<CharacterExportData, 'version'> & { version: number };

  if (data.version !== 1 && data.version !== 2 && data.version !== 3) {
    throw new Error('不支援的匯出版本');
  }
  if (!data.dataVersion || data.dataVersion < CURRENT_DATA_VERSION) {
    throw new Error('匯入資料版本過舊，無法匯入。請使用新版角色匯出檔案。');
  }
  if (!data.character || !data.equipmentInstances) {
    throw new Error('檔案格式錯誤');
  }

  const existing = await db.characters.get(currentCharacterId);
  if (!existing) throw new Error('當前角色不存在');

  const importChar = data.character;
  importChar.id = currentCharacterId;
  importChar.userId = existing.userId;

  // 匯入＝**還原完整身分**（§ 19.9）：name / uuid / authToken 都跟著檔案走。
  // 名稱不再唯一、/api/stats 是 upsert，所以榜上的名稱會跟著下次上傳更新，
  // 本機與排行榜不會分岔。舊角色沒有 authToken 時保留該格原本的（可能也沒有），
  // 首次上傳時再以 TOFU 補發。
  //
  // 副作用：同一份檔案在兩台裝置還原後共用同一筆排行榜紀錄，
  // 統計上傳互相覆蓋。這是備份／還原，不是多裝置同步。

  if (importChar.skills) {
    importChar.skills = importChar.skills
      .map(s => instantiateFromTemplate(s.id, 0))
      .filter(Boolean) as typeof importChar.skills;
  }

  await db.characters.update(currentCharacterId, {
    name: importChar.name,
    // 外觀一定要列在這裡。匯出是整列打包會自動帶走，漏了這行不會報錯，
    // 要到「匯出→匯入→開角色」才發現外觀沒了（`18-data-schema.md` § 18.7）。
    // 舊匯出檔沒有這個欄位，normalizeAppearance 會退回預設而不是拋錯。
    appearance: normalizeAppearance(importChar.appearance),
    ...(importChar.uuid ? { uuid: importChar.uuid } : {}),
    ...(importChar.authToken ? { authToken: importChar.authToken } : {}),
    className: importChar.className,
    level: importChar.level,
    exp: importChar.exp,
    expToNext: importChar.expToNext,
    hp: importChar.hp,
    maxHp: importChar.maxHp,
    mp: importChar.mp,
    maxMp: importChar.maxMp,
    baseAttributes: importChar.baseAttributes,
    bonusAttributes: importChar.bonusAttributes,
    unspentAttributePoints: importChar.unspentAttributePoints,
    gold: importChar.gold,
    currentArea: importChar.currentArea,
    currentZone: importChar.currentZone,
    currentRegion: importChar.currentRegion,
    currentFloor: importChar.currentFloor,
    skills: importChar.skills,
    quests: importChar.quests ?? [],
    areaEnteredAt: Date.now(),
  });

  // 共用倉庫裝備的 ownerId 是 userId，與 characterId 會撞號（§ 19.7）
  await db.equipmentInstances.where('ownerId').equals(currentCharacterId)
    .filter(item => item.storageType !== 'shared')
    .delete();
  if (data.equipmentInstances.length > 0) {
    /*
     * 模板一律以 **id** 對應（`99-ai-constraints.md` § 99.1 第 3 條）——
     * seed 的 template id 是固定的，跨環境不會變。
     * 名稱只在 id 查不到時當退路（改名前匯出的舊檔）。
     */
    const allTemplates = await db.equipmentTemplates.toArray();
    const templateIds = new Set(allTemplates.map(t => t.id).filter((id): id is number => id != null));
    const templateNameToId = new Map<string, number>();
    for (const t of allTemplates) {
      if (t.id != null) templateNameToId.set(t.name, t.id);
    }

    const instances = data.equipmentInstances
      .filter(ei => ei.storageType !== 'shared')
      .map(ei => {
        const resolvedTemplateId = templateIds.has(ei.templateId)
          ? ei.templateId
          : templateNameToId.get(ei.name) ?? ei.templateId;
        return {
          ...ei,
          id: undefined,
          ownerId: currentCharacterId,
          templateId: resolvedTemplateId,
        };
      });
    await db.equipmentInstances.bulkAdd(instances);
  }

  await db.characterBag.where('characterId').equals(currentCharacterId).delete();
  if (data.bagItems.length > 0) {
    // Build name→id map for item template remapping
    const bagEntries = data.bagItems.map(item => ({
      characterId: currentCharacterId,
      name: item.name,
      type: item.type,
      itemTemplateId: item.itemId,
      amount: item.amount,
    }));
    await db.characterBag.bulkAdd(bagEntries);
  }

  // Restore personal warehouse materials (version 2+)
  if (data.version >= 2 && data.personalWarehouseItems && data.personalWarehouseItems.length > 0) {
    await db.warehouses
      .where('characterId').equals(currentCharacterId)
      .filter(row => row.storageType === 'personal')
      .delete();

    const personalEntries: WarehouseEntry[] = data.personalWarehouseItems.map(item => ({
      userId: existing.userId,
      name: item.name,
      type: item.type,
      itemTemplateId: item.itemId,
      amount: item.amount,
      storageType: 'personal' as const,
      characterId: currentCharacterId,
    }));
    await db.warehouses.bulkAdd(personalEntries);
  }

  /*
   * 天賦與信箱（v3 起）。**一律先清掉這一格原本的**，即使匯入檔沒帶 ——
   * 不清的話被覆寫角色的天賦格、鑲材、未領信件會原封不動留給匯入進來的角色。
   * 舊檔（v2）匯入後天賦是空的，載入角色時由 `grantStartingIfEmpty` 補起始配置。
   */
  await db.talentSlots.where('characterId').equals(currentCharacterId).delete();
  await db.talentAffixes.where('characterId').equals(currentCharacterId).delete();
  await db.mailbox.where('characterId').equals(currentCharacterId).delete();

  if (data.talentSlots?.length || data.talentAffixes?.length) {
    // 天賦格 id 會重新配發，鑲材的 slotId 要跟著對應過去
    const slotIdMap = new Map<number, number>();
    for (const slot of data.talentSlots ?? []) {
      const oldId = slot.id;
      const newId = await db.talentSlots.add({ ...slot, id: undefined, characterId: currentCharacterId });
      if (oldId != null) slotIdMap.set(oldId, newId as number);
    }
    for (const affix of data.talentAffixes ?? []) {
      const slotId = affix.slotId != null ? slotIdMap.get(affix.slotId) ?? null : null;
      await db.talentAffixes.add({
        ...affix, id: undefined, characterId: currentCharacterId,
        slotId, slotIndex: slotId === null ? null : affix.slotIndex,
      });
    }
  }
  if (data.mailbox?.length) {
    await db.mailbox.bulkAdd(
      data.mailbox.map(m => ({ ...m, id: undefined, characterId: currentCharacterId })),
    );
  }

  if (data.localPreferences) {
    localStorage.setItem(
      `mayana_prefs_${currentCharacterId}`,
      JSON.stringify(data.localPreferences)
    );
  }
}
