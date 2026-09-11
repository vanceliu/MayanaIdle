import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, INN_PRICES } from '../gameStore';
import { bagItemById } from '../../testing/bagFixtures';
import { ACTION_ALLOWLIST } from '../../net/protocol';
import { TRAINING_GROUND_REGION_ID } from '../../models/trainingGround';
import { SPELLBOOK_FRAGMENT_ID, SPELLBOOK_RECIPES, LEARN_PRICES } from '../../models/magicAcademy';
import type { Character } from '../../models/character';

/**
 * 城鎮設施的動作（旅館、職業工會、魔法學院、試驗場）。
 *
 * 這些判定一定要在 store：線上模式的角色狀態由 server 推回來，
 * 元件自己 `setState` 的結果會被蓋掉 —— 症狀是「血補滿了又掉回來、錢沒扣、書沒消耗」。
 * 因此每一支都必須在 RPC 白名單裡，才會被轉送到 server 執行。
 */

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 1, userId: 1, name: '測試', className: 'knight', level: 40,
    exp: 0, expToNext: 100, hp: 50, maxHp: 200, mp: 10, maxMp: 100,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 1000,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
    ...overrides,
  } as Character;
}

function setup(char: Partial<Character> = {}, extra: Record<string, unknown> = {}) {
  useGameStore.setState({
    character: character(char),
    equippedGear: {},
    inventory: [],
    bagItems: [],
    skills: [],
    activeEffects: [],
    ...extra,
  } as never);
}

beforeEach(() => {
  resetTestDb();
  localStorage.clear();
});

describe('RPC 白名單', () => {
  it('城鎮設施的動作都在白名單裡（不在就等於還是本機自己算）', () => {
    for (const action of [
      'restAtInn', 'learnClassSkill', 'learnBasicMagic', 'craftSpellbook',
      'restoreInTrainingGround', 'setAfterCombatThreshold',
    ]) {
      expect(ACTION_ALLOWLIST.game.has(action), action).toBe(true);
    }
  });
});

describe('旅館休息（`13-town.md` § 13.7）', () => {
  it('完全休息：補滿 HP／MP、扣款、解除角色 debuff', () => {
    setup({ hp: 50, mp: 10, gold: 1000 }, {
      activeEffects: [
        { type: 'debuff', target: 'player', name: '中毒', expiresAt: 9e9 },
        { type: 'buff', target: 'player', name: '祝福', expiresAt: 9e9 },
        { type: 'debuff', target: 'monster', name: '暈眩', expiresAt: 9e9 },
      ],
    });

    expect(useGameStore.getState().restAtInn('full')).toBe(true);

    const state = useGameStore.getState();
    expect(state.character!.hp).toBe(state.character!.maxHp);
    expect(state.character!.mp).toBe(state.character!.maxMp);
    expect(state.character!.gold).toBe(1000 - INN_PRICES.full);
    // 只解角色身上的 debuff，buff 與怪物的 debuff 不動
    expect(state.activeEffects.map(e => e.name)).toEqual(['祝福', '暈眩']);
  });

  it('只補 HP／只補 MP 各自扣各自的錢，另一項不動', () => {
    setup({ hp: 50, mp: 10, gold: 1000 });
    expect(useGameStore.getState().restAtInn('hp')).toBe(true);
    let state = useGameStore.getState();
    expect(state.character!.hp).toBe(200);
    expect(state.character!.mp).toBe(10);
    expect(state.character!.gold).toBe(1000 - INN_PRICES.hpOnly);

    expect(useGameStore.getState().restAtInn('mp')).toBe(true);
    state = useGameStore.getState();
    expect(state.character!.mp).toBe(100);
    expect(state.character!.gold).toBe(1000 - INN_PRICES.hpOnly - INN_PRICES.mpOnly);
  });

  it('金幣不足不扣錢也不補血', () => {
    setup({ hp: 50, gold: INN_PRICES.full - 1 });
    expect(useGameStore.getState().restAtInn('full')).toBe(false);
    expect(useGameStore.getState().character!.hp).toBe(50);
    expect(useGameStore.getState().character!.gold).toBe(INN_PRICES.full - 1);
  });

  it('已經全滿就不收錢', () => {
    setup({ hp: 200, mp: 100, gold: 1000 });
    expect(useGameStore.getState().restAtInn('full')).toBe(false);
    expect(useGameStore.getState().character!.gold).toBe(1000);
  });
});

describe('職業技能書（`13-town.md` § 13.9）', () => {
  // 盾擊：騎士 Lv.10，技能書 id 102
  const BOOK = 102;

  it('學會之後書要消耗掉', () => {
    setup({ level: 10 }, { bagItems: [bagItemById(BOOK, 1)] });

    expect(useGameStore.getState().learnClassSkill('shield-bash')).toBe(true);

    const state = useGameStore.getState();
    expect(state.skills.map(s => s.id)).toEqual(['shield-bash']);
    expect(state.character!.skills.map(s => s.id)).toEqual(['shield-bash']);
    expect(state.bagItems.find(i => i.itemId === BOOK)).toBeUndefined();
  });

  it('沒有書、等級不夠、已經學過都學不了，書也不會被吃掉', () => {
    setup({ level: 10 }, { bagItems: [] });
    expect(useGameStore.getState().learnClassSkill('shield-bash')).toBe(false);

    setup({ level: 9 }, { bagItems: [bagItemById(BOOK, 1)] });
    expect(useGameStore.getState().learnClassSkill('shield-bash')).toBe(false);
    expect(useGameStore.getState().bagItems[0].amount).toBe(1);

    setup({ level: 10 }, { bagItems: [bagItemById(BOOK, 2)] });
    useGameStore.getState().learnClassSkill('shield-bash');
    expect(useGameStore.getState().learnClassSkill('shield-bash')).toBe(false);
    expect(useGameStore.getState().bagItems[0].amount).toBe(1);
  });

  it('別的職業的技能書學不起來', () => {
    setup({ level: 40, className: 'thief' }, { bagItems: [bagItemById(BOOK, 1)] });
    expect(useGameStore.getState().learnClassSkill('shield-bash')).toBe(false);
  });
});

describe('魔法學院（`13-town.md` § 13.6）', () => {
  // 騎士要 Lv.50 才學得起 1 級基礎魔法（`skillRestrictions.ts`）
  it('Lv1~3 用金幣學，錢要扣', () => {
    setup({ level: 50, gold: 1000 });
    expect(useGameStore.getState().learnBasicMagic('wind-blade')).toBe(true);

    const state = useGameStore.getState();
    expect(state.skills.map(s => s.id)).toEqual(['wind-blade']);
    expect(state.character!.gold).toBe(1000 - LEARN_PRICES[1]);
  });

  it('金幣不足學不了', () => {
    setup({ level: 50, gold: LEARN_PRICES[1] - 1 });
    expect(useGameStore.getState().learnBasicMagic('wind-blade')).toBe(false);
    expect(useGameStore.getState().skills).toEqual([]);
  });

  it('同一招不能學兩次', () => {
    setup({ level: 50, gold: 1000 });
    useGameStore.getState().learnBasicMagic('wind-blade');
    expect(useGameStore.getState().learnBasicMagic('wind-blade')).toBe(false);
    expect(useGameStore.getState().character!.gold).toBe(1000 - LEARN_PRICES[1]);
  });

  it('等級不夠就學不起來（騎士 Lv.49 學不到 1 級魔法）', () => {
    setup({ level: 49, gold: 1000 });
    expect(useGameStore.getState().learnBasicMagic('wind-blade')).toBe(false);
    expect(useGameStore.getState().character!.gold).toBe(1000);
  });

  it('製作魔法書：碎片與素材照配方扣，成品進背包', () => {
    const recipe = SPELLBOOK_RECIPES[0];
    setup({}, {
      bagItems: [
        bagItemById(SPELLBOOK_FRAGMENT_ID, recipe.fragments + 2),
        bagItemById(recipe.materialItemId, recipe.materialAmount),
      ],
    });

    expect(useGameStore.getState().craftSpellbook(recipe.bookItemId)).toBe(true);

    const bag = useGameStore.getState().bagItems;
    expect(bag.find(i => i.itemId === SPELLBOOK_FRAGMENT_ID)?.amount).toBe(2);
    expect(bag.find(i => i.itemId === recipe.materialItemId)).toBeUndefined();
    expect(bag.find(i => i.itemId === recipe.bookItemId)?.amount).toBe(1);
  });

  it('材料不夠就整個不做，也不會先扣碎片', () => {
    const recipe = SPELLBOOK_RECIPES[0];
    setup({}, { bagItems: [bagItemById(SPELLBOOK_FRAGMENT_ID, recipe.fragments)] });

    expect(useGameStore.getState().craftSpellbook(recipe.bookItemId)).toBe(false);
    expect(useGameStore.getState().bagItems[0].amount).toBe(recipe.fragments);
  });
});

describe('試驗場補滿（`50-training-ground.md` § 50.5.3）', () => {
  it('在試驗場內免費補滿，不扣錢', () => {
    setup({ hp: 10, mp: 5, gold: 500, currentRegion: TRAINING_GROUND_REGION_ID });

    expect(useGameStore.getState().restoreInTrainingGround()).toBe(true);

    const state = useGameStore.getState();
    expect(state.character!.hp).toBe(200);
    expect(state.character!.mp).toBe(100);
    expect(state.character!.gold).toBe(500);
  });

  it('不在試驗場就不給補 —— 否則它就是免費的旅館', () => {
    setup({ hp: 10, currentRegion: 'neutral-town' });
    expect(useGameStore.getState().restoreInTrainingGround()).toBe(false);
    expect(useGameStore.getState().character!.hp).toBe(10);
  });
});

describe('戰鬥後門檻', () => {
  it('寫進 store 並夾在 0~100', () => {
    setup();
    useGameStore.getState().setAfterCombatThreshold('afterCombatHpThreshold', 55);
    expect(useGameStore.getState().afterCombatHpThreshold).toBe(55);

    useGameStore.getState().setAfterCombatThreshold('afterCombatHpThreshold', 140);
    expect(useGameStore.getState().afterCombatHpThreshold).toBe(100);

    useGameStore.getState().setAfterCombatThreshold('afterCombatMpThreshold', -20);
    expect(useGameStore.getState().afterCombatMpThreshold).toBe(0);
  });
});
