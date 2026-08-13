import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import {
  useTalentStore,
  canPlaceRule,
  uninstalledSlots,
  availableSlots,
} from '../talentStore';
import {
  STARTING_SLOT_COUNT,
  emptyConditions,
  isSlotInstalled,
  type TalentSlot,
  type TalentSlotTier,
  type TalentType,
} from '../../models/talent';
import { STARTING_LAYOUT } from '../../db/seed/talentSeeds';

const CHAR = 1;

async function addSlot(
  tier: TalentSlotTier,
  installed: boolean | TalentType = false,
  templateId = 'default',
): Promise<number> {
  const type = installed === false ? null : (installed === true ? 'combat' : installed);
  return await db.talentSlots.add({
    characterId: CHAR,
    tier,
    assignedType: type,
    templateId: type === null ? null : templateId,
    order: type === null ? null : 0,
    enabled: true,
    conditions: emptyConditions(tier),
    action: null,
  }) as number;
}

const load = () => useTalentStore.getState().load(CHAR);
const slotById = (id: number) => useTalentStore.getState().slots.find(s => s.id === id)!;

describe('talentStore（`51-auto-talent.md`）', () => {
  beforeEach(async () => {
    await db.talentSlots.clear();
    useTalentStore.setState({ characterId: null, slots: [] });
  });

  describe('起始配置（§ 51.3.3、§ 51.7）', () => {
    it('給 5 個 T1 格，且全部直接安裝好', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { slots } = useTalentStore.getState();

      expect(slots).toHaveLength(STARTING_SLOT_COUNT);
      expect(slots.every(s => s.tier === 1)).toBe(true);
      expect(slots.every(isSlotInstalled)).toBe(true);
    });

    it('預設配置用滿 5 格：戰鬥 4、常駐 1', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const { slots } = useTalentStore.getState();

      expect(slots.filter(s => s.assignedType === 'combat')).toHaveLength(4);
      expect(slots.filter(s => s.assignedType === 'persistent')).toHaveLength(1);
    });

    /* 普通攻擊排最後：規則由上往下取第一個成立者，排前面就沒人放技能了 */
    it('戰鬥起始有 3 條施放技能，普通攻擊排在最後保底', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const combat = useTalentStore.getState().slots
        .filter(s => s.assignedType === 'combat')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      expect(combat.filter(s => s.action?.ruleId === 'skill')).toHaveLength(3);
      expect(combat[combat.length - 1].action?.ruleId).toBe('normal_attack');
    });

    /* 創角時有三個職業一招都沒有，硬綁一個技能會指向沒學會的招（§ 51.7） */
    it('起始的施放技能未選定技能', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const skills = useTalentStore.getState().slots.filter(s => s.action?.ruleId === 'skill');

      expect(skills).toHaveLength(3);
      expect(skills.every(s => s.action?.params === null)).toBe(true);
    });

    it('常駐那一格帶著 HP 低於 30% → 使用紅藥', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      const persistent = useTalentStore.getState().slots.find(s => s.assignedType === 'persistent')!;

      expect(persistent.conditions[0]).toEqual({ ruleId: 'hp_below', params: { value: 30 } });
      expect(persistent.action).toEqual({ ruleId: 'potion', params: { potionType: 'red' } });
    });

    it('起始配置的筆數與 seed 對得起來', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      expect(useTalentStore.getState().slots).toHaveLength(STARTING_LAYOUT.length);
    });

    it('重複呼叫不重發', async () => {
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      await useTalentStore.getState().grantStartingIfEmpty(CHAR);
      expect(useTalentStore.getState().slots).toHaveLength(STARTING_SLOT_COUNT);
    });
  });

  /* 條件與動作不是實體，同一個可以出現在任意多格（§ 51.5.1） */
  describe('可無限重複使用（§ 51.5.1）', () => {
    it('同一個條件可以同時放在兩個天賦格', async () => {
      const a = await addSlot(1, true);
      const b = await addSlot(1, true);
      await load();

      await useTalentStore.getState().setEntry(a, 0, 'hp_below');
      await useTalentStore.getState().setEntry(b, 0, 'hp_below');

      expect(slotById(a).conditions[0]?.ruleId).toBe('hp_below');
      expect(slotById(b).conditions[0]?.ruleId).toBe('hp_below');
    });

    it('放到別格不會清掉原本那格', async () => {
      const a = await addSlot(1, true);
      const b = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(a, null, 'normal_attack');

      await useTalentStore.getState().setEntry(b, null, 'normal_attack');

      expect(slotById(a).action?.ruleId).toBe('normal_attack');
    });

    it('各格的參數互不影響', async () => {
      const a = await addSlot(1, true);
      const b = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(a, 0, 'hp_below');
      await useTalentStore.getState().setEntry(b, 0, 'hp_below');

      await useTalentStore.getState().setEntryParams(a, 0, { value: 70 });

      expect(slotById(a).conditions[0]?.params).toEqual({ value: 70 });
      expect(slotById(b).conditions[0]?.params).toEqual({ value: 30 });
    });

    it('設定同一個槽位會覆蓋，不是疊上去', async () => {
      const id = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(id, null, 'normal_attack');

      await useTalentStore.getState().setEntry(id, null, 'wait');

      expect(slotById(id).action?.ruleId).toBe('wait');
    });

    it('傳 null 就是清空', async () => {
      const id = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(id, null, 'normal_attack');

      await useTalentStore.getState().setEntry(id, null, null);

      expect(slotById(id).action).toBeNull();
    });
  });

  describe('放置檢查（§ 51.2.1、§ 51.4.3.2）', () => {
    function slot(type: TalentType | null, tier: TalentSlotTier = 1): TalentSlot {
      return {
        id: 1, characterId: CHAR, tier,
        assignedType: type,
        templateId: type === null ? null : 'default',
        order: type === null ? null : 0,
        enabled: true,
        conditions: emptyConditions(tier),
        action: null,
      };
    }

    it('戰鬥專屬的放不進常駐格', () => {
      expect(canPlaceRule('monster_hp_below', slot('persistent'), 0)).toBe(false);
      expect(canPlaceRule('monster_hp_below', slot('combat'), 0)).toBe(true);
    });

    it('共用的兩種格子都放得進去', () => {
      expect(canPlaceRule('hp_below', slot('combat'), 0)).toBe(true);
      expect(canPlaceRule('hp_below', slot('persistent'), 0)).toBe(true);
    });

    it('條件放不進動作槽，動作放不進條件槽', () => {
      expect(canPlaceRule('hp_below', slot('combat'), null)).toBe(false);
      expect(canPlaceRule('normal_attack', slot('combat'), 0)).toBe(false);
    });

    it('條件槽 index 不可超過天賦格 tier', () => {
      expect(canPlaceRule('hp_below', slot('combat', 2), 1)).toBe(true);
      expect(canPlaceRule('hp_below', slot('combat', 2), 2)).toBe(false);
    });

    /* 沒接上引擎的選得上去卻永遠不觸發，玩家只會覺得規則寫錯了 */
    it('blocked 的不可放入', () => {
      expect(canPlaceRule('target_casting', slot('combat'), 0)).toBe(false);
    });

    it('不存在的 ruleId 不可放入', () => {
      expect(canPlaceRule('nonsense', slot('combat'), 0)).toBe(false);
    });

    it('未安裝的天賦格放不了東西', () => {
      expect(canPlaceRule('hp_below', slot(null), 0)).toBe(false);
    });

    it('store 也擋得住 —— 不是只有 UI 在檢查', async () => {
      const id = await addSlot(1, 'persistent');
      await load();

      await useTalentStore.getState().setEntry(id, 0, 'monster_hp_below');

      expect(slotById(id).conditions[0]).toBeNull();
    });
  });

  describe('安裝與拆下（§ 51.3.4）', () => {
    /* 條件與動作不是實體，沒有東西要退回背包 —— 設定原樣留在格上 */
    it('拆下天賦格時設定原樣保留，裝回同類型即復原', async () => {
      const id = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(id, null, 'normal_attack');
      await useTalentStore.getState().setEntry(id, 0, 'hp_below');

      await useTalentStore.getState().uninstallSlot(id);
      expect(isSlotInstalled(slotById(id))).toBe(false);
      expect(slotById(id).action?.ruleId).toBe('normal_attack');

      await useTalentStore.getState().installSlot(id, 'combat', 'default');
      expect(slotById(id).action?.ruleId).toBe('normal_attack');
      expect(slotById(id).conditions[0]?.ruleId).toBe('hp_below');
    });

    it('換到讀不懂這個動作的類型時，該槽位清空', async () => {
      const id = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(id, null, 'normal_attack');

      await useTalentStore.getState().installSlot(id, 'supply', 'default');

      expect(slotById(id).action).toBeNull();
    });

    it('適用新類型的設定跟著走', async () => {
      const id = await addSlot(1, true);
      await load();
      await useTalentStore.getState().setEntry(id, 0, 'hp_below');

      await useTalentStore.getState().installSlot(id, 'persistent', 'default');

      expect(slotById(id).conditions[0]?.ruleId).toBe('hp_below');
    });
  });

  describe('天賦格合成（§ 51.5.2：必定成功）', () => {
    it('T1 ×2 → T2 ×1', async () => {
      await addSlot(1);
      await addSlot(1);
      await load();

      const produced = await useTalentStore.getState().fuseSlots(1);

      expect(produced?.tier).toBe(2);
      const { slots } = useTalentStore.getState();
      expect(slots).toHaveLength(1);
      expect(slots[0].tier).toBe(2);
      expect(slots[0].conditions).toHaveLength(2);
    });

    it('已安裝的格子不能拿去合成', async () => {
      await addSlot(1, true);
      await addSlot(1);
      await load();

      expect(await useTalentStore.getState().fuseSlots(1)).toBeNull();
      expect(useTalentStore.getState().slots).toHaveLength(2);
    });

    it('T4 是上限，不再合成', async () => {
      await addSlot(4);
      await addSlot(4);
      await load();

      expect(await useTalentStore.getState().fuseSlots(4)).toBeNull();
    });

    it('份數不足擋下', async () => {
      await addSlot(2);
      await load();

      expect(await useTalentStore.getState().fuseSlots(2)).toBeNull();
    });
  });

  describe('設定槽位時塞預設參數（§ 51.4.1）', () => {
    /* 沒有預設值的話規則是「HP 低於 ??」，判定拿不到門檻 */
    it('數值型會補上預設值', async () => {
      const id = await addSlot(1, true);
      await load();

      await useTalentStore.getState().setEntry(id, 0, 'hp_below');

      expect(slotById(id).conditions[0]?.params).toEqual({ value: 30 });
    });

    it('沒有參數的不會被塞空物件以外的東西', async () => {
      const id = await addSlot(1, true);
      await load();

      await useTalentStore.getState().setEntry(id, null, 'normal_attack');

      expect(slotById(id).action?.params).toBeNull();
    });

    it('技能欄位不給預設 —— 那要看角色學了什麼', async () => {
      const id = await addSlot(1, true);
      await load();

      await useTalentStore.getState().setEntry(id, null, 'skill');

      expect(slotById(id).action?.params).toEqual({});
    });
  });

  describe('重排與啟用停用（§ 51.3.1）', () => {
    let ids: number[];

    beforeEach(async () => {
      ids = [];
      for (let i = 0; i < 3; i++) {
        const id = await db.talentSlots.add({
          characterId: CHAR, tier: 1, assignedType: 'combat', templateId: 'default',
          order: i, enabled: true, conditions: [null], action: null,
        }) as number;
        ids.push(id);
      }
      await load();
    });

    const orderOf = () => useTalentStore.getState().slots
      .filter(s => s.assignedType === 'combat')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(s => s.id);

    it('往前搬 —— 順序決定判定優先權，補刀要排在普攻前面才有用', async () => {
      await useTalentStore.getState().reorderSlot(ids[2], 0);
      expect(orderOf()).toEqual([ids[2], ids[0], ids[1]]);
    });

    it('往後搬到最尾端', async () => {
      await useTalentStore.getState().reorderSlot(ids[0], 2);
      expect(orderOf()).toEqual([ids[1], ids[2], ids[0]]);
    });

    it('order 重排後是連續的 0,1,2 —— 留洞會讓下次插入落錯位置', async () => {
      await useTalentStore.getState().reorderSlot(ids[2], 0);
      const orders = useTalentStore.getState().slots.map(s => s.order).sort();
      expect(orders).toEqual([0, 1, 2]);
    });

    it('只重排同類型同配置的 —— 不會把常駐的順序也一起洗掉', async () => {
      const p = await addSlot(1, 'persistent');
      await load();

      await useTalentStore.getState().reorderSlot(ids[2], 0);

      expect(slotById(p).order).toBe(0);
    });

    it('未安裝的天賦格不能重排', async () => {
      const spare = await addSlot(1);
      await load();

      await useTalentStore.getState().reorderSlot(spare, 0);

      expect(slotById(spare).order).toBeNull();
    });

    it('啟用／停用可來回切', async () => {
      await useTalentStore.getState().toggleSlot(ids[0]);
      expect(slotById(ids[0]).enabled).toBe(false);
      await useTalentStore.getState().toggleSlot(ids[0]);
      expect(slotById(ids[0]).enabled).toBe(true);
    });
  });

  describe('天賦配置之間的換裝（§ 51.3.2）', () => {
    it('別份配置佔用的天賦格，在這一頁算可動用；本頁用掉的不算', async () => {
      const here = await addSlot(1, 'combat', 'default');
      const there = await addSlot(1, 'combat', 'other');
      const spare = await addSlot(1);
      await load();

      const ids = availableSlots(useTalentStore.getState().slots, 'default').map(s => s.id);

      expect(ids).toContain(there);
      expect(ids).toContain(spare);
      expect(ids).not.toContain(here);
    });

    /* 全新的排前面：手上有閒置格時不該去動別份配置 */
    it('全新的排在別份配置佔用的前面', async () => {
      await addSlot(1, 'combat', 'other');
      const spare = await addSlot(1);
      await load();

      const ids = availableSlots(useTalentStore.getState().slots, 'default').map(s => s.id);

      expect(ids[0]).toBe(spare);
    });

    it('把別份配置的天賦格裝過來＝搬家，設定跟著走', async () => {
      const there = await addSlot(1, 'combat', 'other');
      await load();
      await useTalentStore.getState().setEntry(there, null, 'normal_attack');

      await useTalentStore.getState().installSlot(there, 'combat', 'default');

      expect(slotById(there).templateId).toBe('default');
      expect(slotById(there).action?.ruleId).toBe('normal_attack');
    });

    it('合成只吃完全沒安裝的，不會去拆別份配置', async () => {
      await addSlot(1, 'combat', 'other');
      await addSlot(1, 'combat', 'other');
      await load();

      expect(uninstalledSlots(useTalentStore.getState().slots)).toHaveLength(0);
      expect(await useTalentStore.getState().fuseSlots(1)).toBeNull();
    });
  });

  it('reset 清空持有資料', async () => {
    await addSlot(1);
    await load();

    useTalentStore.getState().reset();

    expect(useTalentStore.getState().slots).toEqual([]);
    expect(useTalentStore.getState().characterId).toBeNull();
  });
});

describe('舊角色遷移（`51-auto-talent.md` § 51.9）', () => {
  beforeEach(async () => {
    await db.talentSlots.clear();
    useTalentStore.setState({ characterId: null, slots: [] });
  });

  it('沒有天賦資料的舊角色，載入時直接拿到預設配置', async () => {
    await useTalentStore.getState().load(CHAR);
    expect(useTalentStore.getState().slots).toEqual([]);

    await useTalentStore.getState().grantStartingIfEmpty(CHAR);

    expect(useTalentStore.getState().slots).toHaveLength(STARTING_SLOT_COUNT);
  });

  it('已經有天賦資料的角色不會被重置', async () => {
    await db.talentSlots.add({
      characterId: CHAR, tier: 3, assignedType: null, templateId: null, order: null,
      enabled: true, conditions: emptyConditions(3), action: null,
    });

    await useTalentStore.getState().grantStartingIfEmpty(CHAR);

    // 早退時不重載 store，所以直接看 DB：原本那一格還在，沒被起始配置蓋掉
    const rows = await db.talentSlots.where('characterId').equals(CHAR).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe(3);
  });
});
