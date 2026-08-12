import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import {
  claimAll,
  claimMail,
  deleteClaimedMail,
  expectedTalentSlotGrants,
  listMail,
  purgeClaimedMail,
  purgeClaimedMailOnVersionChange,
  syncTalentSlotGrants,
  syncStartingAffixBackfill,
  unclaimedCount,
} from '../mailbox';
import { talentSlotGrantKey } from '../../models/mailbox';
import { isSlotInstalled } from '../../models/talent';

const CHAR = 1;

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('系統信箱（`52-mailbox.md`）', () => {
  beforeEach(async () => {
    await db.mailbox.clear();
    await db.talentSlots.clear();
    await db.talentAffixes.clear();
    localStorageMock.clear();
  });

  describe('天賦格發放（§ 52.2）', () => {
    it('每 5 級一封', () => {
      expect(expectedTalentSlotGrants(4)).toBe(0);
      expect(expectedTalentSlotGrants(5)).toBe(1);
      expect(expectedTalentSlotGrants(9)).toBe(1);
      expect(expectedTalentSlotGrants(65)).toBe(13);
    });

    it('一次連升多級會把中間漏掉的一起補上', async () => {
      // 用累計數而不是升級事件，所以 Lv.1 → Lv.17 一次補 3 封
      const sent = await syncTalentSlotGrants(CHAR, 17);
      expect(sent).toBe(3);
      const mails = await listMail(CHAR);
      expect(mails.map(m => m.sourceKey)).toEqual(
        expect.arrayContaining([talentSlotGrantKey(1), talentSlotGrantKey(2), talentSlotGrantKey(3)]),
      );
    });

    it('重複呼叫不重發（sourceKey 對 characterId 唯一）', async () => {
      await syncTalentSlotGrants(CHAR, 20);
      const again = await syncTalentSlotGrants(CHAR, 20);
      expect(again).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(4);
    });

    it('等級不到 5 不發', async () => {
      expect(await syncTalentSlotGrants(CHAR, 4)).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(0);
    });
  });

  describe('領取（§ 52.4）', () => {
    it('領取後產生一個未安裝的 T1 天賦格', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      const [mail] = await listMail(CHAR);

      expect(await claimMail(mail.id!)).toBe(true);

      const slots = await db.talentSlots.where('characterId').equals(CHAR).toArray();
      expect(slots).toHaveLength(1);
      expect(slots[0].tier).toBe(1);
      // 領取後是未安裝，玩家自己裝（§ 51.3.4）
      expect(isSlotInstalled(slots[0])).toBe(false);
    });

    it('同一封不可領兩次', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      const [mail] = await listMail(CHAR);
      expect(await claimMail(mail.id!)).toBe(true);
      expect(await claimMail(mail.id!)).toBe(false);
      expect(await db.talentSlots.count()).toBe(1);
    });

    it('全部領取', async () => {
      await syncTalentSlotGrants(CHAR, 20);
      expect(await claimAll(CHAR)).toBe(4);
      expect(await db.talentSlots.count()).toBe(4);
      expect(unclaimedCount(await listMail(CHAR))).toBe(0);
    });
  });

  describe('列表排序（§ 52.5）', () => {
    it('未領取排在已領取前面', async () => {
      await syncTalentSlotGrants(CHAR, 10);
      const mails = await listMail(CHAR);
      await claimMail(mails[0].id!);

      const after = await listMail(CHAR);
      expect(after[0].claimedAt).toBeNull();
      expect(after[1].claimedAt).not.toBeNull();
    });
  });

  describe('換版清理（§ 52.7.1）', () => {
    it('只刪已領取的，未領取的一律保留', async () => {
      await syncTalentSlotGrants(CHAR, 20); // 4 封
      const mails = await listMail(CHAR);
      await claimMail(mails[0].id!);
      await claimMail(mails[1].id!);

      const purged = await purgeClaimedMail(CHAR);

      expect(purged).toBe(2);
      const left = await listMail(CHAR);
      expect(left).toHaveLength(2);
      // 未領取的還在 —— 刪掉等於沒收玩家的天賦格
      expect(left.every(m => m.claimedAt === null)).toBe(true);
    });

    it('已領取的天賦格不會因為清理而消失', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      const [mail] = await listMail(CHAR);
      await claimMail(mail.id!);

      await purgeClaimedMail(CHAR);

      // 信刪了，但格子已經在玩家手上
      expect(await db.talentSlots.count()).toBe(1);
    });

    it('版本沒變就不清', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      await claimAll(CHAR);

      expect(await purgeClaimedMailOnVersionChange(CHAR, 'v1.0.0')).toBe(true);
      expect(await purgeClaimedMailOnVersionChange(CHAR, 'v1.0.0')).toBe(false);
    });

    it('版本變了才清', async () => {
      await purgeClaimedMailOnVersionChange(CHAR, 'v1.0.0');
      await syncTalentSlotGrants(CHAR, 10);
      await claimAll(CHAR);

      expect(await purgeClaimedMailOnVersionChange(CHAR, 'v1.1.0')).toBe(true);
      expect(await listMail(CHAR)).toHaveLength(0);
    });
  });

  /*
   * 起始配置改版（戰鬥從 1 條施放技能改成 3 條）的補發。
   * 改版前建的角色少拿兩份，走信箱補 —— 靜悄悄多出兩份鑲材只會像 bug。
   */
  describe('起始鑲材補發（§ 52.5）', () => {
    /** 改版前就存在的角色：已經有天賦格 */
    async function existingCharacter() {
      await db.talentSlots.add({
        characterId: CHAR, tier: 1, assignedType: null, templateId: null, order: null, enabled: true,
      });
    }

    it('舊角色補一封，內含 2 份 T1 施放指定技能', async () => {
      await existingCharacter();
      expect(await syncStartingAffixBackfill(CHAR)).toBe(true);

      const [mail] = await listMail(CHAR);
      expect(mail.items).toHaveLength(2);
      expect(mail.items.every(i => i.type === 'talent_affix' && i.affixDefId === 2003)).toBe(true);
    });

    it('重複呼叫不重發', async () => {
      await existingCharacter();
      await syncStartingAffixBackfill(CHAR);
      expect(await syncStartingAffixBackfill(CHAR)).toBe(false);
      expect(await listMail(CHAR)).toHaveLength(1);
    });

    // 新角色的起始配置已經給滿，再補就變成多兩份
    it('全新角色不補', async () => {
      expect(await syncStartingAffixBackfill(CHAR)).toBe(false);
      expect(await listMail(CHAR)).toHaveLength(0);
    });

    it('領取後鑲材進背包，且是未鑲入、未綁定的', async () => {
      await existingCharacter();
      await syncStartingAffixBackfill(CHAR);
      const [mail] = await listMail(CHAR);

      expect(await claimMail(mail.id!)).toBe(true);
      const affixes = await db.talentAffixes.where('characterId').equals(CHAR).toArray();
      expect(affixes).toHaveLength(2);
      expect(affixes.every(a => a.slotId === null && a.boundParam === null)).toBe(true);
    });
  });

  /* § 52.4：已領取的可以自己刪，不必等換版清理 */
  describe('手動刪除（§ 52.4）', () => {
    async function oneMail() {
      await syncTalentSlotGrants(CHAR, 5);
      return (await listMail(CHAR))[0];
    }

    it('已領取的刪得掉', async () => {
      const mail = await oneMail();
      await claimMail(mail.id!);
      expect(await deleteClaimedMail(mail.id!)).toBe(true);
      expect(await listMail(CHAR)).toHaveLength(0);
    });

    // 刪未領取的等於把還沒拿的東西丟了，而且玩家不會知道自己丟了什麼
    it('未領取的刪不掉', async () => {
      const mail = await oneMail();
      expect(await deleteClaimedMail(mail.id!)).toBe(false);
      expect(await listMail(CHAR)).toHaveLength(1);
    });

    it('清除已領取只掃已領取的那些', async () => {
      await syncTalentSlotGrants(CHAR, 10);
      const mails = await listMail(CHAR);
      await claimMail(mails[0].id!);

      expect(await purgeClaimedMail(CHAR)).toBe(1);
      const left = await listMail(CHAR);
      expect(left).toHaveLength(1);
      expect(left[0].claimedAt).toBeNull();
    });
  });
});