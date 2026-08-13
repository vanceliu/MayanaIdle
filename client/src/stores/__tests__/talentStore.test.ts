import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import {
  useTalentStore,
  canEquipAffix,
  uninstalledSlots,
  unequippedAffixes,
  availableSlots,
  availableAffixes,
  canFuseAffixes,
} from '../talentStore';
import { STARTING_SLOT_COUNT, isSlotInstalled, type TalentSlot } from '../../models/talent';
import { STARTING_LAYOUT } from '../../db/seed/talentSeeds';

const CHAR = 1;

async function addSlot(tier: 1 | 2 | 3 | 4, installed = false): Promise<number> {
  return await db.talentSlots.add({
    characterId: CHAR,
    tier,
    assignedType: installed ? 'combat' : null,
    templateId: installed ? 'default' : null,
    order: installed ? 0 : null,
    enabled: true,
  }) as number;
}

async function addAffix(definitionId: number): Promise<number> {
  return await db.talentAffixes.add({
    characterId: CHAR, definitionId, boundParam: null, params: null, slotId: null, slotIndex: null,
  }) as number;
}

describe('talentStore（`51-auto-talent.md`）', () => {
  beforeEach(async () => {
    await db.talentSlots.clear();
    await db.talentAffixes.clear();
    useTalentStore.setState({ characterId: null, slots: [], affixes: [] });
  });

  describe('起始配置（§ 51.3.3.1、§ 51.7）', () => {
    it('給 5 個 T1 格與 4 份鑲材，且格子直接安裝好', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { slots, affixes } = useTalentStore.getState();

      expect(slots).toHaveLength(STARTING_SLOT_COUNT);
      expect(slots.every(s => s.tier === 1)).toBe(true);
      // 創角的 5 個是 § 51.3.4 的唯一例外：直接安裝，不必玩家自己裝
      expect(slots.every(isSlotInstalled)).toBe(true);
      expect(affixes).toHaveLength(STARTING_LAYOUT.length);
    });

    it('起始鑲材已經鑲進天賦格，不是丟在背包（§ 51.7 的預設配置）', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { affixes } = useTalentStore.getState();
      // 判定讀的是天賦格；留在背包等於新角色完全不會出手
      expect(unequippedAffixes(affixes)).toHaveLength(0);
    });

    it('預設配置用滿 5 格', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { slots, affixes } = useTalentStore.getState();
      expect(new Set(affixes.map(a => a.slotId)).size).toBe(slots.length);
    });

    /*
     * 只給一條施放技能的話，學了第二、第三個技能也放不出來，
     * 要等刷到鑲材才排得進去 —— 開局的可玩範圍不該卡在掉落上（§ 51.7）。
     */
    it('戰鬥起始有 3 條施放技能，普通攻擊排在最後保底', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { slots, affixes } = useTalentStore.getState();

      const skillCount = affixes.filter(a => a.definitionId === 2003).length;
      expect(skillCount).toBe(3);

      const orderOf = (definitionId: number) => {
        const slotId = affixes.find(a => a.definitionId === definitionId)!.slotId;
        return slots.find(s => s.id === slotId)!.order!;
      };
      const combat = slots.filter(s => s.assignedType === 'combat');
      expect(orderOf(2001)).toBe(Math.max(...combat.map(s => s.order!)));
    });

    it('起始的指定型鑲材是未綁定的（三職業創角時沒有技能可綁）', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { affixes } = useTalentStore.getState();
      expect(affixes.every(a => a.boundParam === null)).toBe(true);
    });

    it('重複呼叫不重發', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      expect(useTalentStore.getState().slots).toHaveLength(STARTING_SLOT_COUNT);
    });
  });

  describe('一實體一格（§ 51.5.1）', () => {
    it('鑲到別格時，原本的位置會被清掉', async () => {
      const slotA = await addSlot(1, true);
      const slotB = await addSlot(1, true);
      const affix = await addAffix(1001); // HP 低於（共用條件 T1）
      await useTalentStore.getState().load(CHAR);

      await useTalentStore.getState().equipAffix(affix, slotA, 0);
      expect(useTalentStore.getState().affixes[0].slotId).toBe(slotA);

      await useTalentStore.getState().equipAffix(affix, slotB, 0);
      const after = useTalentStore.getState().affixes[0];
      expect(after.slotId).toBe(slotB);
      expect(useTalentStore.getState().affixes.filter(a => a.slotId === slotA)).toHaveLength(0);
    });

    it('鑲進已被佔用的槽位時，原本那份退回背包', async () => {
      const slot = await addSlot(1, true);
      const first = await addAffix(1001);
      const second = await addAffix(1002);
      await useTalentStore.getState().load(CHAR);

      await useTalentStore.getState().equipAffix(first, slot, 0);
      await useTalentStore.getState().equipAffix(second, slot, 0);

      const { affixes } = useTalentStore.getState();
      expect(affixes.find(a => a.id === first)!.slotId).toBeNull();
      expect(affixes.find(a => a.id === second)!.slotId).toBe(slot);
    });
  });

  describe('鑲入檢查（§ 51.2.1、§ 51.4.4）', () => {
    it('戰鬥專屬鑲材鑲不進常駐格', async () => {
      const slot: TalentSlot = {
        id: 1, characterId: CHAR, tier: 1,
        assignedType: 'persistent', templateId: 'default', order: 0, enabled: true,
      };
      // 1101 = 目標 HP 低於，戰鬥專屬
      const affix = { id: 1, characterId: CHAR, definitionId: 1101, boundParam: null, params: null, slotId: null, slotIndex: null };
      expect(canEquipAffix(affix, slot, 0)).toBe(false);
    });

    it('條件鑲材鑲不進實作槽，實作鑲材鑲不進條件槽', async () => {
      const slot: TalentSlot = {
        id: 1, characterId: CHAR, tier: 1,
        assignedType: 'combat', templateId: 'default', order: 0, enabled: true,
      };
      const cond = { id: 1, characterId: CHAR, definitionId: 1001, boundParam: null, params: null, slotId: null, slotIndex: null };
      const act = { id: 2, characterId: CHAR, definitionId: 2001, boundParam: null, params: null, slotId: null, slotIndex: null };
      expect(canEquipAffix(cond, slot, null)).toBe(false);
      expect(canEquipAffix(act, slot, 0)).toBe(false);
      expect(canEquipAffix(cond, slot, 0)).toBe(true);
      expect(canEquipAffix(act, slot, null)).toBe(true);
    });

    it('條件槽 index 不可超過天賦格 tier', async () => {
      const slot: TalentSlot = {
        id: 1, characterId: CHAR, tier: 2,
        assignedType: 'combat', templateId: 'default', order: 0, enabled: true,
      };
      const cond = { id: 1, characterId: CHAR, definitionId: 1001, boundParam: null, params: null, slotId: null, slotIndex: null };
      expect(canEquipAffix(cond, slot, 1)).toBe(true);
      expect(canEquipAffix(cond, slot, 2)).toBe(false);
    });

    it('§ 51.4.4 擋住的鑲材不可鑲入（怪物側機制未做）', async () => {
      const slot: TalentSlot = {
        id: 1, characterId: CHAR, tier: 1,
        assignedType: 'combat', templateId: 'default', order: 0, enabled: true,
      };
      // 1118 = 目標正在詠唱，blocked
      const blocked = { id: 1, characterId: CHAR, definitionId: 1118, boundParam: null, params: null, slotId: null, slotIndex: null };
      expect(canEquipAffix(blocked, slot, 0)).toBe(false);
    });

    it('未安裝的天賦格鑲不了東西', async () => {
      const slot: TalentSlot = {
        id: 1, characterId: CHAR, tier: 1,
        assignedType: null, templateId: null, order: null, enabled: true,
      };
      const cond = { id: 1, characterId: CHAR, definitionId: 1001, boundParam: null, params: null, slotId: null, slotIndex: null };
      expect(canEquipAffix(cond, slot, 0)).toBe(false);
    });
  });

  describe('安裝與拆下（§ 51.3.4）', () => {
    it('拆下天賦格時鑲材一併退回背包，不隨格子消失', async () => {
      const slot = await addSlot(1, true);
      const affix = await addAffix(1001);
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(affix, slot, 0);

      await useTalentStore.getState().uninstallSlot(slot);

      const { slots, affixes } = useTalentStore.getState();
      expect(isSlotInstalled(slots[0])).toBe(false);
      expect(affixes[0].slotId).toBeNull();
      // 鑲材還在，只是回到背包
      expect(unequippedAffixes(affixes)).toHaveLength(1);
    });

    /*
     * 「改指派類型」的 UI 拿掉了：拆下 → 換分頁 → 安裝才是自然流程，
     * 一個下拉直接把整列搬到別的類型很怪，而且列上多一顆選單資訊太雜。
     * 拆下本來就會把鑲材全部退回背包，原本 `reassignSlot` 要處理的
     * 「不適用的鑲材怎麼辦」在新流程下不存在。
     */
  });

  describe('天賦格合成（§ 51.5.2：必定成功）', () => {
    it('T1 ×2 → T2 ×1', async () => {
      await addSlot(1);
      await addSlot(1);
      await useTalentStore.getState().load(CHAR);

      const produced = await useTalentStore.getState().fuseSlots(1);

      expect(produced?.tier).toBe(2);
      const { slots } = useTalentStore.getState();
      expect(slots).toHaveLength(1);
      expect(slots[0].tier).toBe(2);
      // 產出的是未安裝狀態
      expect(isSlotInstalled(slots[0])).toBe(false);
    });

    it('已安裝的格子不能拿去合成', async () => {
      await addSlot(1, true);
      await addSlot(1, true);
      await useTalentStore.getState().load(CHAR);

      expect(await useTalentStore.getState().fuseSlots(1)).toBeNull();
      expect(uninstalledSlots(useTalentStore.getState().slots)).toHaveLength(0);
    });

    it('T4 是上限，不再合成', async () => {
      await addSlot(4);
      await addSlot(4);
      await useTalentStore.getState().load(CHAR);
      expect(await useTalentStore.getState().fuseSlots(4)).toBeNull();
    });
  });

  describe('鑲材合成（§ 51.5.2：有失敗率）', () => {
    it('成功時投入 2 份、產出 1 份 T+1', async () => {
      await addAffix(1001);
      await addAffix(1002);
      await useTalentStore.getState().load(CHAR);

      // rng 恆回 0 → 必定成功（0 < 50%）
      const result = await useTalentStore.getState().fuseAffixes(
        useTalentStore.getState().affixes.map(a => a.id!),
        () => 0,
      );

      expect(result?.success).toBe(true);
      const { affixes } = useTalentStore.getState();
      expect(affixes).toHaveLength(1);
      expect(affixes[0].definitionId).not.toBe(1001);
    });

    it('失敗時退回其中 1 份，淨損 1 份、不歸零', async () => {
      await addAffix(1001);
      await addAffix(1002);
      await useTalentStore.getState().load(CHAR);

      // rng 恆回 0.99 → 必定失敗（99 > 50%）
      const result = await useTalentStore.getState().fuseAffixes(
        useTalentStore.getState().affixes.map(a => a.id!),
        () => 0.99,
      );

      expect(result?.success).toBe(false);
      expect(useTalentStore.getState().affixes).toHaveLength(1);
    });

    it('已鑲入的鑲材不能拿去合成', async () => {
      const slot = await addSlot(1, true);
      const a = await addAffix(1001);
      await addAffix(1002);
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(a, slot, 0);

      const ids = useTalentStore.getState().affixes.map(x => x.id!);
      expect(await useTalentStore.getState().fuseAffixes(ids, () => 0)).toBeNull();
    });

    it('不同 tier／不同種類不能合成', async () => {
      await addAffix(1001); // 條件 T1
      await addAffix(2001); // 實作 T1
      await useTalentStore.getState().load(CHAR);
      const ids = useTalentStore.getState().affixes.map(x => x.id!);
      expect(await useTalentStore.getState().fuseAffixes(ids, () => 0)).toBeNull();
    });

    it('到達該池上限就不再合成（常駐專屬止於 T3）', async () => {
      // 1201/1202 = 常駐專屬條件 T3，上限 T3
      await addAffix(1201);
      await addAffix(1202);
      await useTalentStore.getState().load(CHAR);
      const ids = useTalentStore.getState().affixes.map(x => x.id!);
      expect(await useTalentStore.getState().fuseAffixes(ids, () => 0)).toBeNull();
    });
  });

  describe('定向兌換（§ 51.5.3：同 tier ×3 → 指定同 tier ×1）', () => {
    it('投入 3 份、產出指定的那一份，必定成功', async () => {
      // 1001~1003 皆為共用條件 T1
      await addAffix(1001);
      await addAffix(1002);
      await addAffix(1003);
      await useTalentStore.getState().load(CHAR);

      const ids = useTalentStore.getState().affixes.map(a => a.id!);
      const produced = await useTalentStore.getState().exchangeAffixes(ids, 1005);

      expect(produced?.definitionId).toBe(1005);
      const { affixes } = useTalentStore.getState();
      expect(affixes).toHaveLength(1);
      expect(affixes[0].definitionId).toBe(1005);
      // 產物未綁定，首次鑲入時才選定（§ 51.4.1）
      expect(affixes[0].boundParam).toBeNull();
    });

    it('份數不足擋下', async () => {
      await addAffix(1001);
      await addAffix(1002);
      await useTalentStore.getState().load(CHAR);
      const ids = useTalentStore.getState().affixes.map(a => a.id!);
      expect(await useTalentStore.getState().exchangeAffixes(ids, 1005)).toBeNull();
    });

    it('產出不可跨 tier 或跨種類', async () => {
      await addAffix(1001);
      await addAffix(1002);
      await addAffix(1003);
      await useTalentStore.getState().load(CHAR);
      const ids = useTalentStore.getState().affixes.map(a => a.id!);

      expect(await useTalentStore.getState().exchangeAffixes(ids, 1006)).toBeNull(); // T2 條件
      expect(await useTalentStore.getState().exchangeAffixes(ids, 2001)).toBeNull(); // T1 實作
      expect(useTalentStore.getState().affixes).toHaveLength(3);
    });

    it('已鑲入的不能拿去兌換', async () => {
      const slot = await addSlot(1, true);
      const a = await addAffix(1001);
      await addAffix(1002);
      await addAffix(1003);
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(a, slot, 0);

      const ids = useTalentStore.getState().affixes.map(x => x.id!);
      expect(await useTalentStore.getState().exchangeAffixes(ids, 1005)).toBeNull();
    });

    it('適用類型沒有交集就換不成', async () => {
      // 1101 戰鬥專屬條件 T1、1301 補給條件 T1
      await addAffix(1001);
      await addAffix(1101);
      await addAffix(1301);
      await useTalentStore.getState().load(CHAR);
      const ids = useTalentStore.getState().affixes.map(a => a.id!);
      expect(await useTalentStore.getState().exchangeAffixes(ids, 1005)).toBeNull();
    });
  });

  describe('降階（§ 51.5.3：高階 ×1 → 指定低階 ×1）', () => {
    it('不必逐階，T3 可一步換成指定的 T1', async () => {
      const id = await addAffix(1010); // 共用條件 T3
      await useTalentStore.getState().load(CHAR);

      const produced = await useTalentStore.getState().downgradeAffix(id, 1001);

      expect(produced?.definitionId).toBe(1001);
      const { affixes } = useTalentStore.getState();
      expect(affixes).toHaveLength(1);
      expect(affixes[0].definitionId).toBe(1001);
    });

    it('不可平階或升階', async () => {
      const id = await addAffix(1006); // 共用條件 T2
      await useTalentStore.getState().load(CHAR);

      expect(await useTalentStore.getState().downgradeAffix(id, 1007)).toBeNull(); // 同為 T2
      expect(await useTalentStore.getState().downgradeAffix(id, 1010)).toBeNull(); // T3
      expect(useTalentStore.getState().affixes).toHaveLength(1);
    });

    it('T1 沒有更低階可換', async () => {
      const id = await addAffix(1001);
      await useTalentStore.getState().load(CHAR);
      expect(await useTalentStore.getState().downgradeAffix(id, 1002)).toBeNull();
    });

    it('已鑲入的不能拿去降階', async () => {
      const slot = await addSlot(1, true);
      const id = await addAffix(1010);
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(id, slot, 0);

      expect(await useTalentStore.getState().downgradeAffix(id, 1001)).toBeNull();
    });
  });

  describe('綁定（§ 51.4.1）', () => {
    it('未綁定的可以綁一次，綁過就不可更改', async () => {
      const id = await addAffix(2003); // 施放指定攻擊技能，指定型
      await useTalentStore.getState().load(CHAR);

      await useTalentStore.getState().bindAffix(id, 'wind-blade');
      expect(useTalentStore.getState().affixes[0].boundParam).toBe('wind-blade');

      await useTalentStore.getState().bindAffix(id, 'fireball');
      expect(useTalentStore.getState().affixes[0].boundParam).toBe('wind-blade');
    });
  });
});

describe('舊角色遷移（`51-auto-talent.md` § 51.9）', () => {
  // 這個 describe 在主 describe 之外，要自己清 —— 不清會撿到上一個測試的資料
  beforeEach(async () => {
    await db.talentSlots.clear();
    await db.talentAffixes.clear();
    useTalentStore.setState({ characterId: null, slots: [], affixes: [] });
  });

  it('沒有天賦資料的舊角色，載入時直接拿到預設配置', async () => {
    // 舊角色 ＝ 完全沒有天賦格與鑲材
    expect(await db.talentSlots.where('characterId').equals(CHAR).count()).toBe(0);

    await useTalentStore.getState().grantStartingIfEmpty(CHAR);

    const { slots, affixes } = useTalentStore.getState();
    expect(slots).toHaveLength(STARTING_SLOT_COUNT);
    expect(affixes).toHaveLength(STARTING_LAYOUT.length);
    // 直接可用：格子裝好、鑲材鑲好，不必玩家做任何事
    expect(slots.every(isSlotInstalled)).toBe(true);
    expect(unequippedAffixes(affixes)).toHaveLength(0);
  });

  it('已經有天賦資料的角色不會被重置', async () => {
    await addSlot(3, true);
    await useTalentStore.getState().load(CHAR);

    await useTalentStore.getState().grantStartingIfEmpty(CHAR);

    const { slots } = useTalentStore.getState();
    expect(slots).toHaveLength(1);
    expect(slots[0].tier).toBe(3);
  });
});

describe('鑲入時塞預設參數（`51-auto-talent.md` § 51.4.1）', () => {
  beforeEach(async () => {
    await db.talentSlots.clear();
    await db.talentAffixes.clear();
    useTalentStore.setState({ characterId: null, slots: [], affixes: [] });
  });

  it('第一次鑲入會補上預設值 —— 否則規則是「HP 低於 ??」，判定拿不到門檻', async () => {
    const slot = await addSlot(1, true);
    const affix = await addAffix(1001); // HP 低於
    await useTalentStore.getState().load(CHAR);

    await useTalentStore.getState().equipAffix(affix, slot, 0);

    expect(useTalentStore.getState().affixes[0].params).toEqual({ value: 30 });
  });

  it('已經有參數的不會被覆寫', async () => {
    const slot = await addSlot(1, true);
    const affix = await addAffix(1001);
    await useTalentStore.getState().load(CHAR);
    await useTalentStore.getState().equipAffix(affix, slot, 0);
    await useTalentStore.getState().setAffixParams(affix, { value: 55 });

    // 卸下再鑲回去，玩家設的 55 要留著
    await useTalentStore.getState().unequipAffix(affix);
    await useTalentStore.getState().equipAffix(affix, slot, 0);

    expect(useTalentStore.getState().affixes[0].params).toEqual({ value: 55 });
  });

  it('沒有參數的鑲材不會被塞空物件', async () => {
    const slot = await addSlot(1, true);
    const affix = await addAffix(2001); // 普通攻擊
    await useTalentStore.getState().load(CHAR);

    await useTalentStore.getState().equipAffix(affix, slot, null);

    expect(useTalentStore.getState().affixes[0].params).toBeNull();
  });
});

describe('重排與啟用停用（`51-auto-talent.md` § 51.3.1）', () => {
  beforeEach(async () => {
    await db.talentSlots.clear();
    await db.talentAffixes.clear();
    useTalentStore.setState({ characterId: null, slots: [], affixes: [] });
  });

  async function threeRows(): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await db.talentSlots.add({
        characterId: CHAR, tier: 1, assignedType: 'combat',
        templateId: 'default', order: i, enabled: true,
      }) as number);
    }
    await useTalentStore.getState().load(CHAR);
    return ids;
  }

  function orderOf(): number[] {
    return useTalentStore.getState().slots
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(s => s.id!);
  }

  it('往前搬 —— 順序決定判定優先權，補刀要排在普攻前面才有用', async () => {
    const [a, b, c] = await threeRows();
    await useTalentStore.getState().reorderSlot(c, 0);
    expect(orderOf()).toEqual([c, a, b]);
  });

  it('往後搬到最尾端', async () => {
    const [a, b, c] = await threeRows();
    await useTalentStore.getState().reorderSlot(a, 2);
    expect(orderOf()).toEqual([b, c, a]);
  });

  it('order 重排後是連續的 0,1,2 —— 留洞會讓下次插入落錯位置', async () => {
    const [, , c] = await threeRows();
    await useTalentStore.getState().reorderSlot(c, 1);
    const orders = useTalentStore.getState().slots.map(s => s.order).sort();
    expect(orders).toEqual([0, 1, 2]);
  });

  it('只重排同類型同配置的 —— 不會把常駐的順序也一起洗掉', async () => {
    const [a] = await threeRows();
    const other = await db.talentSlots.add({
      characterId: CHAR, tier: 1, assignedType: 'persistent',
      templateId: 'default', order: 0, enabled: true,
    }) as number;
    await useTalentStore.getState().load(CHAR);

    await useTalentStore.getState().reorderSlot(a, 2);

    const persistent = useTalentStore.getState().slots.find(s => s.id === other)!;
    expect(persistent.order).toBe(0);
  });

  it('未安裝的天賦格不能重排', async () => {
    const spare = await addSlot(1);
    await useTalentStore.getState().load(CHAR);
    await useTalentStore.getState().reorderSlot(spare, 0);
    expect(useTalentStore.getState().slots[0].order).toBeNull();
  });

  it('啟用／停用可來回切', async () => {
    const [a] = await threeRows();
    await useTalentStore.getState().toggleSlot(a);
    expect(useTalentStore.getState().slots.find(s => s.id === a)!.enabled).toBe(false);
    await useTalentStore.getState().toggleSlot(a);
    expect(useTalentStore.getState().slots.find(s => s.id === a)!.enabled).toBe(true);
  });

  /*
   * 天賦配置＝換裝（§ 51.3.2）：天賦格與鑲材是實體，`templateId` 只有一個值，
   * 所以「別份配置正在用」與「全新的」對這一頁而言同樣是可動用的庫存。
   */
  describe('天賦配置之間的換裝', () => {
    beforeEach(async () => {
      await db.talentSlots.clear();
      await db.talentAffixes.clear();
      useTalentStore.setState({ slots: [], affixes: [], characterId: null });
    });

    it('別份配置佔用的天賦格，在這一頁算可動用；本頁用掉的不算', async () => {
      const mine = await addSlot(1, true);        // default／combat
      const spare = await addSlot(1);
      await useTalentStore.getState().load(CHAR);
      const { slots } = useTalentStore.getState();

      expect(availableSlots(slots, 'default').map(s => s.id)).toEqual([spare]);
      expect(availableSlots(slots, 'alt').map(s => s.id)).toEqual([spare, mine]);
      // 合成仍然只吃完全沒安裝的，不可以去拆別份配置
      expect(uninstalledSlots(slots).map(s => s.id)).toEqual([spare]);
    });

    it('鑲在別份配置格子裡的鑲材，在這一頁算可動用', async () => {
      const slotId = await addSlot(1, true);
      const affixId = await addAffix(1001);
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(affixId, slotId, 0);
      const { slots, affixes } = useTalentStore.getState();

      expect(availableAffixes(affixes, slots, 'default')).toEqual([]);
      expect(availableAffixes(affixes, slots, 'alt').map(a => a.id)).toEqual([affixId]);
      expect(unequippedAffixes(affixes)).toEqual([]);
    });

    it('把別份配置的天賦格裝過來＝搬家，適用的鑲材跟著走', async () => {
      const slotId = await addSlot(1, true);
      const affixId = await addAffix(1001);       // 戰鬥／常駐共用
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(affixId, slotId, 0);

      await useTalentStore.getState().installSlot(slotId, 'persistent', 'alt');
      const { slots, affixes } = useTalentStore.getState();

      const moved = slots.find(s => s.id === slotId)!;
      expect(moved.assignedType).toBe('persistent');
      expect(moved.templateId).toBe('alt');
      expect(affixes.find(a => a.id === affixId)!.slotId).toBe(slotId);
      // 原本那一頁看不到它了
      expect(slots.filter(s => s.templateId === 'default')).toEqual([]);
    });

    it('搬到讀不懂這份鑲材的類型時，該鑲材退回背包', async () => {
      const slotId = await addSlot(1, true);
      const affixId = await addAffix(1001);       // 補給不適用
      await useTalentStore.getState().load(CHAR);
      await useTalentStore.getState().equipAffix(affixId, slotId, 0);

      await useTalentStore.getState().installSlot(slotId, 'supply', 'alt');
      const { affixes } = useTalentStore.getState();

      expect(affixes.find(a => a.id === affixId)!.slotId).toBeNull();
      expect(unequippedAffixes(affixes).map(a => a.id)).toEqual([affixId]);
    });
  });

  /*
   * 合成規則只有這一支（§ 51.5.2），合成台的預覽與可選狀態都讀它 ——
   * 畫面自己算一套就會出現「秀著能合、按下去被擋掉」。
   */
  describe('canFuseAffixes', () => {
    beforeEach(async () => {
      await db.talentAffixes.clear();
      useTalentStore.setState({ slots: [], affixes: [], characterId: null });
    });

    async function two(defA: number, defB: number) {
      await addAffix(defA);
      await addAffix(defB);
      await useTalentStore.getState().load(CHAR);
      return useTalentStore.getState().affixes;
    }

    it('同 tier、同種類、同適用類型才合得成', async () => {
      expect(canFuseAffixes(await two(1001, 1002))).toBe(true);   // 皆 T1 條件、戰鬥∪常駐
    });

    it('tier 不同不能合成', async () => {
      expect(canFuseAffixes(await two(1001, 1006))).toBe(false);  // T1 vs T2
    });

    it('種類不同不能合成', async () => {
      const [cond] = await two(1001, 1002);
      const actionId = await addAffix(2001);
      await useTalentStore.getState().load(CHAR);
      const action = useTalentStore.getState().affixes.find(a => a.id === actionId);
      expect(canFuseAffixes([cond, action])).toBe(false);
    });

    it('已鑲入的不能拿去合成', async () => {
      const slotId = await addSlot(1, true);
      const affixes = await two(1001, 1002);
      await useTalentStore.getState().equipAffix(affixes[0].id!, slotId, 0);
      const after = useTalentStore.getState().affixes;
      expect(canFuseAffixes(after)).toBe(false);
    });

    it('數量不是 2 份就不能合成', async () => {
      const affixes = await two(1001, 1002);
      expect(canFuseAffixes([affixes[0]])).toBe(false);
      expect(canFuseAffixes([...affixes, affixes[0]])).toBe(false);
    });
  });

  it('reset 清空持有資料', async () => {
    await useTalentStore.getState().grantStartingIfEmpty(CHAR);
    expect(useTalentStore.getState().slots.length).toBeGreaterThan(0);

    useTalentStore.getState().reset();
    const { characterId, slots, affixes } = useTalentStore.getState();
    expect(characterId).toBeNull();
    expect(slots).toEqual([]);
    expect(affixes).toEqual([]);
  });
});