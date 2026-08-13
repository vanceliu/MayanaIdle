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
  syncCompensations,
  unclaimedCount,
} from '../mailbox';
import { COMPENSATIONS, type Compensation } from '../../db/seed/compensations';
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
    await db.characters.clear();
    await db.characters.add({ id: CHAR, createdAt: 1000 } as never);
    COMPENSATIONS.length = 0;
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

    // 未領取的信不可刪除
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

  /*
   * 防重複發放看的是角色身上的發放計數，不是信箱（§ 52.2.4）。
   *
   * 以前用「信箱裡有沒有這個 sourceKey」判斷發過沒有，
   * 但信可以被刪 —— 刪完證據就消失，下次載入整批重發，
   * 玩家每次改版都多領一批天賦格。
   */
  describe('發放計數（§ 52.2.4）', () => {
    it('換版清理刪掉已領取的信之後，不會重新發放', async () => {
      await syncTalentSlotGrants(CHAR, 15);
      expect(await claimAll(CHAR)).toBe(3);
      expect(await db.talentSlots.count()).toBe(3);

      await purgeClaimedMailOnVersionChange(CHAR, 'v1.0.0');
      expect(await listMail(CHAR)).toHaveLength(0);

      expect(await syncTalentSlotGrants(CHAR, 15)).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(0);
      expect(await db.talentSlots.count()).toBe(3);
    });

    it('手動刪除已領取的信之後，也不會重新發放', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      const [mail] = await listMail(CHAR);
      await claimMail(mail.id!);
      await deleteClaimedMail(mail.id!);

      expect(await syncTalentSlotGrants(CHAR, 5)).toBe(0);
    });

    it('計數記在角色上，等級再升會接著發下一封', async () => {
      await syncTalentSlotGrants(CHAR, 5);
      await purgeClaimedMail(CHAR);
      await db.mailbox.clear();

      expect(await syncTalentSlotGrants(CHAR, 10)).toBe(1);
      const [mail] = await listMail(CHAR);
      expect(mail.title).toContain('Lv.10');
    });

    it('計數記的是發放，不是領取 —— 沒領也不會重發', async () => {
      await syncTalentSlotGrants(CHAR, 10);
      expect(await syncTalentSlotGrants(CHAR, 10)).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(2);
    });
  });

  /*
   * 補償的版本範圍由條目自己宣告（§ 52.2.4），
   * 「發過沒有」看角色身上的處理指標（§ 52.2.4.2）—— 信刪掉也不影響。
   */
  describe('補償（§ 52.2.4）', () => {
    const V = 'v1.0.0';

    function comp(over: Partial<Compensation> = {}): Compensation {
      return {
        id: 'fix-something',
        version: V,
        publishedAt: 5000,
        title: '補償',
        items: [{ type: 'talent_slot', slotTier: 1 }],
        ...over,
      };
    }

    it('版本相符就發', async () => {
      COMPENSATIONS.push(comp());
      expect(await syncCompensations(CHAR, V)).toBe(1);
      expect((await listMail(CHAR))[0].title).toBe('補償');
    });

    // 這是整個機制的重點：不必刪程式碼也不會重發
    it('版本更新後，上一版的補償不再發放', async () => {
      COMPENSATIONS.push(comp());
      expect(await syncCompensations(CHAR, 'v1.1.0')).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(0);
    });

    it('all-versions 的補償跨版本都會發', async () => {
      COMPENSATIONS.push(comp({ scope: 'all-versions' }));
      expect(await syncCompensations(CHAR, 'v9.9.9')).toBe(1);
    });

    it('until 的補償只發到指定版本之前', async () => {
      COMPENSATIONS.push(comp({ scope: 'until', untilVersion: '1.5.0' }));
      expect(await syncCompensations(CHAR, 'v1.4.0')).toBe(1);
    });

    it('until 的補償到了指定版本就不發', async () => {
      COMPENSATIONS.push(comp({ scope: 'until', untilVersion: '1.5.0' }));
      expect(await syncCompensations(CHAR, 'v1.5.0')).toBe(0);
    });

    // 1.10.0 要大於 1.9.0，用字串比會反過來
    it('版本比大小是數字比，不是字串比', async () => {
      COMPENSATIONS.push(comp({ scope: 'until', untilVersion: '1.10.0' }));
      expect(await syncCompensations(CHAR, 'v1.9.0')).toBe(1);
    });

    it('同一版重複載入不重發', async () => {
      COMPENSATIONS.push(comp());
      expect(await syncCompensations(CHAR, V)).toBe(1);
      expect(await syncCompensations(CHAR, V)).toBe(0);
      expect(await listMail(CHAR)).toHaveLength(1);
    });

    // 沒遇過那個問題的角色不該收到補償
    it('發布之後才建立的角色不領', async () => {
      COMPENSATIONS.push(comp({ publishedAt: 500 }));
      expect(await syncCompensations(CHAR, V)).toBe(0);
    });

    it('信被刪掉也不會重發', async () => {
      COMPENSATIONS.push(comp());
      await syncCompensations(CHAR, V);
      await claimAll(CHAR);
      await purgeClaimedMail(CHAR);

      expect(await syncCompensations(CHAR, V)).toBe(0);
    });

    it('寄送紀錄記在角色身上，key → true', async () => {
      COMPENSATIONS.push(comp());
      await syncCompensations(CHAR, V);
      expect((await db.characters.get(CHAR))!.sentMailKeys).toEqual({ 'fix-something': true });
    });

    // key 才是身分，所以之後新增的補償照發，清單順序不影響
    it('已寄過的不重發，沒寄過的補上去', async () => {
      COMPENSATIONS.push(comp());
      await syncCompensations(CHAR, V);

      COMPENSATIONS.push(comp({ id: 'fix-another', title: '第二筆' }));
      expect(await syncCompensations(CHAR, V)).toBe(1);
      expect((await listMail(CHAR)).map(m => m.sourceKey).sort())
        .toEqual(['fix-another', 'fix-something']);
    });

    // 版本不符時不記，之後若改成 all-versions 或降版仍補得到
    it('因版本不符沒寄的，不會被記成寄過', async () => {
      COMPENSATIONS.push(comp());
      expect(await syncCompensations(CHAR, 'v2.0.0')).toBe(0);
      expect((await db.characters.get(CHAR))!.sentMailKeys ?? {}).toEqual({});
    });
  });

  /* 條件與動作一律內建，信箱沒有鑲材型別（§ 52.3、§ 51.4.1） */
  it('不認得的項目型別不會發出東西，也不會讓領取失敗', async () => {
    await db.mailbox.add({
      characterId: CHAR,
      sourceKey: 'unknown-grant',
      title: '未知項目',
      items: [{ type: 'talent_affix' } as never],
      createdAt: 1,
      claimedAt: null,
    });
    const [mail] = await listMail(CHAR);
    expect(await claimMail(mail.id!)).toBe(true);

    expect(await db.talentSlots.where('characterId').equals(CHAR).count()).toBe(0);
  });

  /* 唯一約束是第二道防線：第一道（發放計數）漏了也不會寫進兩封一樣的信 */
  it('同一個角色的同一個 sourceKey 只進得了一封', async () => {
    const mail = {
      characterId: CHAR, sourceKey: 'dup', title: 't', items: [], createdAt: 1, claimedAt: null,
    };
    await db.mailbox.add(mail);
    await expect(db.mailbox.add({ ...mail })).rejects.toThrow();
  });

  it('不同角色可以有同一個 sourceKey', async () => {
    const mail = { sourceKey: 'same', title: 't', items: [], createdAt: 1, claimedAt: null };
    await db.mailbox.add({ ...mail, characterId: CHAR });
    await db.mailbox.add({ ...mail, characterId: CHAR + 1 });
    expect(await db.mailbox.count()).toBe(2);
  });
});