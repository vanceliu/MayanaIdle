import { db } from '../db/database';
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { BagItem } from '../stores/gameStore';

const ENCRYPTION_PASSPHRASE = 'MayanaIdle-v1-8f3k2m9x';
const SALT = new Uint8Array([77, 97, 121, 97, 110, 97, 73, 100, 108, 101, 83, 97, 108, 116, 50, 48]);

interface CharacterExportData {
  version: 1;
  exportedAt: number;
  character: Character;
  equipmentInstances: EquipmentInstance[];
  bagItems: BagItem[];
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

async function encrypt(plaintext: string): Promise<string> {
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

async function decrypt(encoded: string): Promise<string> {
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
  const character = await db.characters.get(characterId);
  if (!character) throw new Error('角色不存在');

  const equipmentInstances = await db.equipmentInstances
    .where('ownerId')
    .equals(characterId)
    .toArray();

  const bagRows = await db.characterBag
    .where('characterId')
    .equals(characterId)
    .toArray();
  const bagItems: BagItem[] = bagRows.map(r => ({
    name: r.name,
    type: r.type,
    amount: r.amount,
  }));

  const prefsRaw = localStorage.getItem(`mayana_prefs_${characterId}`);
  const localPreferences = prefsRaw ? JSON.parse(prefsRaw) : null;

  const data: CharacterExportData = {
    version: 1,
    exportedAt: Date.now(),
    character,
    equipmentInstances,
    bagItems,
    localPreferences,
  };

  const json = JSON.stringify(data);
  return encrypt(json);
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
    json = await decrypt(encrypted.trim());
  } catch {
    throw new Error('檔案解密失敗，可能已被竄改');
  }

  const data: CharacterExportData = JSON.parse(json);

  if (data.version !== 1) {
    throw new Error('不支援的匯出版本');
  }
  if (!data.character || !data.equipmentInstances) {
    throw new Error('檔案格式錯誤');
  }

  const existing = await db.characters.get(currentCharacterId);
  if (!existing) throw new Error('當前角色不存在');

  const importChar = data.character;
  importChar.id = currentCharacterId;
  importChar.userId = existing.userId;

  await db.characters.update(currentCharacterId, {
    name: importChar.name,
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

  await db.equipmentInstances.where('ownerId').equals(currentCharacterId).delete();
  if (data.equipmentInstances.length > 0) {
    const instances = data.equipmentInstances.map(ei => ({
      ...ei,
      id: undefined,
      ownerId: currentCharacterId,
    }));
    await db.equipmentInstances.bulkAdd(instances);
  }

  await db.characterBag.where('characterId').equals(currentCharacterId).delete();
  if (data.bagItems.length > 0) {
    const bagEntries = data.bagItems.map(item => ({
      characterId: currentCharacterId,
      name: item.name,
      type: item.type,
      amount: item.amount,
    }));
    await db.characterBag.bulkAdd(bagEntries);
  }

  if (data.localPreferences) {
    localStorage.setItem(
      `mayana_prefs_${currentCharacterId}`,
      JSON.stringify(data.localPreferences)
    );
  }
}
