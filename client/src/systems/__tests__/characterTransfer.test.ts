import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { CURRENT_DATA_VERSION } from '../../config';
import { exportCharacterData, importCharacterData, decryptExport, encryptExport } from '../characterTransfer';
import { createDefaultAppearance, normalizeAppearance } from '../../models/appearance';

/**
 * 角色匯出／匯入。
 *
 * 匯入＝**還原完整身分**（§ 19.9）：name／uuid／authToken 都跟著檔案走。
 * 名稱不再唯一、`/api/stats` 是 upsert，所以榜上的名稱會跟著下次上傳更新。
 */

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'uuid-source', userId: 1, name: '來源角色', className: 'knight',
    level: 30, exp: 100, expToNext: 500, hp: 200, maxHp: 200, mp: 50, maxMp: 50,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 999,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
    dataVersion: CURRENT_DATA_VERSION,
    ...overrides,
  } as unknown as Parameters<typeof db.characters.add>[0];
}

describe('角色匯出／匯入', () => {
  beforeEach(async () => {
    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('匯出檔含 authToken —— 它就是該角色的身分，還原時要一起帶走', async () => {
    const charId = await db.characters.add(makeCharacter({ authToken: 'tok-source' })) as number;

    const payload = JSON.parse(await decryptExport(await exportCharacterData(charId)));

    expect(payload.character.name).toBe('來源角色');
    expect(payload.character.authToken).toBe('tok-source');
    expect(payload.character.uuid).toBe('uuid-source');
  });

  it('匯入還原完整身分：name／uuid／authToken 都跟著檔案走', async () => {
    const sourceId = await db.characters.add(makeCharacter({ authToken: 'tok-source' })) as number;
    const encrypted = await exportCharacterData(sourceId);

    const targetId = await db.characters.add(makeCharacter({
      uuid: 'uuid-target', name: '目標角色', gold: 0, level: 1, authToken: 'tok-target',
    })) as number;
    await importCharacterData(encrypted, targetId);

    const target = (await db.characters.get(targetId))!;
    expect(target.uuid).toBe('uuid-source');
    expect(target.authToken).toBe('tok-source');
    expect(target.name).toBe('來源角色');
    expect(target.gold).toBe(999);
    expect(target.level).toBe(30);
  });

  it('從未上傳過的舊角色，匯出時就地補發密鑰（否則兩台裝置會各自綁定）', async () => {
    const charId = await db.characters.add(makeCharacter({ authToken: undefined })) as number;

    const payload = JSON.parse(await decryptExport(await exportCharacterData(charId)));

    // 檔案裡有密鑰
    expect(payload.character.authToken).toBeTruthy();
    // 本機也留著同一把 —— 兩邊必須一致，否則原機器上傳後新機器就被鎖死
    expect((await db.characters.get(charId))!.authToken).toBe(payload.character.authToken);
  });

  it('已有密鑰的角色匯出時不會被換掉', async () => {
    const charId = await db.characters.add(makeCharacter({ authToken: 'tok-existing' })) as number;

    const payload = JSON.parse(await decryptExport(await exportCharacterData(charId)));

    expect(payload.character.authToken).toBe('tok-existing');
    expect((await db.characters.get(charId))!.authToken).toBe('tok-existing');
  });

  it('此機制上線前的舊匯出檔沒有 authToken，匯入時保留該格原本的而不是清成 undefined', async () => {
    // 密鑰欄位是後來才加的，舊檔案裡不會有；直接改寫 payload 模擬
    const sourceId = await db.characters.add(makeCharacter({ authToken: 'tok-source' })) as number;
    const payload = JSON.parse(await decryptExport(await exportCharacterData(sourceId)));
    delete payload.character.authToken;
    const legacyFile = await encryptExport(JSON.stringify(payload));

    const targetId = await db.characters.add(makeCharacter({
      uuid: 'uuid-target', name: '目標角色', authToken: 'tok-target',
    })) as number;
    await importCharacterData(legacyFile, targetId);

    const target = (await db.characters.get(targetId))!;
    expect(target.authToken).toBe('tok-target');
    expect(target.name).toBe('來源角色');   // 其餘欄位照常還原
  });

  it('資料版本過舊的匯出檔一律拒絕', async () => {
    const charId = await db.characters.add(makeCharacter({
      dataVersion: CURRENT_DATA_VERSION - 1,
    })) as number;
    const encrypted = await exportCharacterData(charId);
    const targetId = await db.characters.add(makeCharacter({ uuid: 'uuid-target' })) as number;

    await expect(importCharacterData(encrypted, targetId)).rejects.toThrow('資料版本過舊');
  });

  /**
   * 外觀（`18-data-schema.md` § 18.7）。
   *
   * 匯出是整列打包會自動帶走，所以「匯出→看檔案」一定會過；
   * 匯入卻是逐欄位 `db.characters.update({...})`，漏列就靜默消失。
   * 所以這裡一律測到「匯入之後讀回來」為止，不只驗匯出檔。
   */
  describe('外觀', () => {
    const CUSTOM = {
      ...createDefaultAppearance(),
      hair: 'twinlong' as const,
      skin: '#7c4f2c',
      hairColor: '#c9a227',
      eyeColor: '#e3c765',
      lash: { on: 1 as const, len: 20, curl: 14, w: 55 },
      tune: { twinlong: { front: 40, peak: 50 } },
    };

    it('匯出檔帶著外觀', async () => {
      const charId = await db.characters.add(makeCharacter({ appearance: CUSTOM })) as number;
      const payload = JSON.parse(await decryptExport(await exportCharacterData(charId)));
      expect(payload.character.appearance).toEqual(CUSTOM);
    });

    it('匯入之後外觀還在 —— 這行漏掉不會報錯，只會靜默消失', async () => {
      const sourceId = await db.characters.add(makeCharacter({ appearance: CUSTOM })) as number;
      const encrypted = await exportCharacterData(sourceId);

      const targetId = await db.characters.add(makeCharacter({
        uuid: 'uuid-target', name: '目標角色', appearance: createDefaultAppearance(),
      })) as number;
      await importCharacterData(encrypted, targetId);

      expect((await db.characters.get(targetId))!.appearance).toEqual(CUSTOM);
    });

    it('沒有外觀的舊匯出檔退回預設，不拒絕匯入', async () => {
      const sourceId = await db.characters.add(makeCharacter()) as number;
      const raw = JSON.parse(await decryptExport(await exportCharacterData(sourceId)));
      delete raw.character.appearance;
      const encrypted = await encryptExport(JSON.stringify(raw));

      const targetId = await db.characters.add(makeCharacter({
        uuid: 'uuid-target', name: '目標角色', appearance: CUSTOM,
      })) as number;
      await importCharacterData(encrypted, targetId);

      expect((await db.characters.get(targetId))!.appearance).toEqual(createDefaultAppearance());
    });

    it('壞掉的外觀被收成合法值而不是讓整次匯入失敗', async () => {
      const sourceId = await db.characters.add(makeCharacter()) as number;
      const raw = JSON.parse(await decryptExport(await exportCharacterData(sourceId)));
      raw.character.appearance = { hair: 'afro', skin: 'red', lash: { on: 1, len: 9999 } };
      const encrypted = await encryptExport(JSON.stringify(raw));

      const targetId = await db.characters.add(makeCharacter({ uuid: 'uuid-target' })) as number;
      await importCharacterData(encrypted, targetId);

      const appearance = (await db.characters.get(targetId))!.appearance!;
      expect(normalizeAppearance(appearance)).toEqual(appearance);
      expect(appearance.hair).toBe(createDefaultAppearance().hair);
      expect(appearance.lash.len).toBe(34);
    });
  });

});
