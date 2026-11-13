/**
 * 增益藥水（`30-items.md` § 30.4a）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetTestDb, db } from '../../testing/testDb';
import { useGameStore, talentInitReady } from '../gameStore';
import { makeBagItem } from '../../models/bagItem';
import { BUFF_POTION_CONFIG, BUFF_POTION_DURATION_MS, BUFF_POTION_ITEM_IDS, type BuffPotionType } from '../../models/buffPotion';
import { resolveQuickSlotAction } from '../../models/quickSlot';
import { getHpRegen, getMpRegen } from '../../systems/regen';
import { getCombatBonuses, getSkillSideValue } from '../../systems/combat';
import { getGeneralStorePrice } from '../../systems/shop';
import { rollBossDrops } from '../../systems/drops';
import { getItemById } from '../../models/items';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const TYPES = Object.keys(BUFF_POTION_CONFIG) as BuffPotionType[];

function stock(amount = 3) {
  useGameStore.setState({
    bagItems: BUFF_POTION_ITEM_IDS.map(id => makeBagItem(id, amount)!),
    activeEffects: [],
    combatLogs: [],
  });
}

const potionBuffs = () => useGameStore.getState().activeEffects
  .filter(e => TYPES.some(t => BUFF_POTION_CONFIG[t].category === e.category));

describe('增益藥水', () => {
  beforeEach(async () => {
    resetTestDb();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('Potion', 'elementalist', { STR: 0, AGI: 0, VIT: 2, SPI: 2, INT: 0, CHA: 0 });
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    await talentInitReady();
    stock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('使用後扣一瓶、施加 300 秒 buff', () => {
    useGameStore.getState().useBuffPotion('crit');
    const buff = potionBuffs()[0];
    expect(buff.category).toBe('crit-potion');
    expect(buff.duration).toBe(BUFF_POTION_DURATION_MS);
    expect(buff.modifiers).toEqual([{ stat: 'crit_rate', value: 10, isPercent: true }]);
    const left = useGameStore.getState().bagItems.find(b => b.itemId === BUFF_POTION_CONFIG.crit.itemId)!.amount;
    expect(left).toBe(2);
  });

  it('四種可同時生效；同種再喝只留一個並刷新時間', () => {
    for (const t of TYPES) useGameStore.getState().useBuffPotion(t);
    expect(potionBuffs()).toHaveLength(4);
    const first = potionBuffs().find(e => e.category === 'hp-regen-potion')!;
    vi.spyOn(Date, 'now').mockReturnValue(first.startTime + 60_000);
    useGameStore.getState().useBuffPotion('hp-regen');
    const hp = potionBuffs().filter(e => e.category === 'hp-regen-potion');
    expect(hp).toHaveLength(1);
    expect(hp[0].startTime).toBeGreaterThan(first.startTime);
    expect(potionBuffs()).toHaveLength(4);
  });

  it('背包沒有就不能用', () => {
    useGameStore.setState({ bagItems: [] });
    useGameStore.getState().useBuffPotion('focus');
    expect(potionBuffs()).toHaveLength(0);
  });

  it('使用後存檔扣量', async () => {
    const id = useGameStore.getState().character!.id!;
    useGameStore.getState().useBuffPotion('mp-regen');
    await useGameStore.getState().flushSaveNow();
    const rows = await db.characterBag.where('characterId').equals(id).toArray();
    expect(rows.find(r => r.itemTemplateId === BUFF_POTION_CONFIG['mp-regen'].itemId)?.amount).toBe(2);
  });

  it('回血／回魔 +15，戰鬥中隨總量減半', () => {
    const char = useGameStore.getState().character!;
    const baseHp = getHpRegen(char, false, [], []);
    const baseMp = getMpRegen(char, false, [], []);
    useGameStore.getState().useBuffPotion('hp-regen');
    useGameStore.getState().useBuffPotion('mp-regen');
    const effects = useGameStore.getState().activeEffects;
    expect(getHpRegen(char, false, [], effects)).toBe(baseHp + 15);
    expect(getMpRegen(char, false, [], effects)).toBe(baseMp + 15);
    expect(getHpRegen(char, true, [], effects)).toBe(Math.max(1, Math.floor((baseHp + 15) / 2)));
  });

  it('爆擊率 +10%，魔攻 +8', () => {
    const char = useGameStore.getState().character!;
    const baseCrit = getCombatBonuses([], []).crit_rate;
    const baseSkill = getSkillSideValue(char, 100, [], []);
    useGameStore.getState().useBuffPotion('crit');
    useGameStore.getState().useBuffPotion('focus');
    const effects = useGameStore.getState().activeEffects;
    expect(getCombatBonuses([], effects).crit_rate).toBe(baseCrit + 10);
    expect(getSkillSideValue(char, 100, [], effects) - baseSkill).toBe(Math.floor(100 * (1 + 8 * 2.5 / 100)) - 100);
  });
});

describe('增益藥水的取得與快捷鍵', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('道具定義：5,000G、重量 5', () => {
    for (const id of BUFF_POTION_ITEM_IDS) {
      const def = getItemById(id)!;
      expect(def.buyPrice, def.name).toBe(5000);
      expect(def.weight, def.name).toBe(5);
    }
  });

  it('各城雜貨店都賣', () => {
    for (const town of Object.keys(TOWN_SCROLL_CONFIG)) {
      for (const id of BUFF_POTION_ITEM_IDS) expect(getGeneralStorePrice(town, id)).toBe(5000);
    }
  });

  it('可放快捷鍵', () => {
    for (const t of TYPES) {
      expect(resolveQuickSlotAction({ kind: 'bagItem', itemId: BUFF_POTION_CONFIG[t].itemId }))
        .toEqual({ type: 'buffPotion', buffType: t });
    }
  });

  it('所有 Boss 共通掉落，每種各自判定 3%', async () => {
    resetTestDb();
    await db.bossDropTables.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0.029);
    const hit = await rollBossDrops('任一 Boss', 1, 10);
    expect(hit.items.filter(i => BUFF_POTION_ITEM_IDS.includes(i.itemTemplateId!)).map(i => i.itemTemplateId))
      .toEqual([...BUFF_POTION_ITEM_IDS]);

    vi.spyOn(Math, 'random').mockReturnValue(0.03);
    const miss = await rollBossDrops('任一 Boss', 1, 10);
    expect(miss.items.some(i => BUFF_POTION_ITEM_IDS.includes(i.itemTemplateId!))).toBe(false);
  });
});
