// @vitest-environment jsdom
/**
 * 印記兌換（`46-sigil.md` § 46.13、`13-town.md` § 13.13.2）——
 * 判定函式、store 扣除與加入、不受理不扣、兌換分頁操作。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useGameStore } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { bagItemById } from '../../testing/bagFixtures';
import { getBagItemAmount } from '../../models/bagItem';
import {
  SIGIL_DEFINITIONS,
  SIGIL_EXCHANGE_FEE_COUNT,
  SIGIL_EXCHANGE_FEE_TYPES,
  SIGIL_EXCHANGE_INPUT_COUNT,
  SIGIL_EXCHANGE_TYPES,
  checkSigilExchange,
  getSigilDefinition,
  type SigilType,
} from '../../models/sigil';
import { SigilMaster } from '../../components/town/SigilMaster';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

const id = (type: SigilType) => getSigilDefinition(type).itemId;
const amount = (type: SigilType) => getBagItemAmount(useGameStore.getState().bagItems, id(type));

function heldAll(n: number): Record<SigilType, number> {
  return Object.fromEntries(SIGIL_DEFINITIONS.map(d => [d.type, n])) as Record<SigilType, number>;
}

const character = () => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 1234, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
}) as never;

function setup(bag: [SigilType, number][]) {
  useGameStore.setState({
    character: character(),
    inventory: [],
    equippedGear: {},
    bagItems: bag.map(([type, n]) => bagItemById(id(type), n)),
  });
}

beforeEach(() => {
  resetTestDb();
});

describe('§ 46.13 兌換範圍', () => {
  it('可兌換六種，精鍊與工藝只當手續費', () => {
    expect([...SIGIL_EXCHANGE_TYPES].sort()).toEqual(['add', 'chaos', 'enhance', 'recarve', 'seal', 'sting']);
    expect([...SIGIL_EXCHANGE_FEE_TYPES].sort()).toEqual(['polish', 'temper']);
    expect(SIGIL_EXCHANGE_INPUT_COUNT).toBe(5);
    expect(SIGIL_EXCHANGE_FEE_COUNT).toBe(50);
  });
});

describe('checkSigilExchange', () => {
  const fee = { temper: 30, polish: 20 };

  it('混搭材料、含目標同種、手續費混合：受理並回傳合併的消耗', () => {
    const check = checkSigilExchange('chaos', { chaos: 1, sting: 2, seal: 2 }, fee, heldAll(99));
    expect(check).toEqual({ ok: true, target: 'chaos', cost: { chaos: 1, sting: 2, seal: 2, temper: 30, polish: 20 } });
  });

  it('單一種手續費湊滿 50 也受理', () => {
    expect(checkSigilExchange('enhance', { seal: 5 }, { polish: 50 }, heldAll(99)).ok).toBe(true);
  });

  it.each([
    ['目標為精鍊', 'temper', { seal: 5 }, fee, '不能兌換這種印記'],
    ['目標為工藝', 'polish', { seal: 5 }, fee, '不能兌換這種印記'],
    ['材料含精鍊', 'chaos', { seal: 4, temper: 1 }, fee, '材料不正確'],
    ['手續費含稀有印記', 'chaos', { seal: 5 }, { temper: 49, sting: 1 }, '手續費不正確'],
    ['材料 4 個', 'chaos', { seal: 4 }, fee, '材料需剛好 5 個（目前 4）'],
    ['材料 6 個', 'chaos', { seal: 6 }, fee, '材料需剛好 5 個（目前 6）'],
    ['手續費 49 個', 'chaos', { seal: 5 }, { temper: 49 }, '手續費需剛好 50 個（目前 49）'],
  ])('%s：不受理', (_label, target, inputs, feeArg, reason) => {
    expect(checkSigilExchange(target, inputs, feeArg, heldAll(99))).toEqual({ ok: false, reason });
  });

  it('持有不足：寫出是哪一種', () => {
    const held = { ...heldAll(99), seal: 4 };
    expect(checkSigilExchange('chaos', { seal: 5 }, fee, held)).toEqual({ ok: false, reason: '封印印記不足' });
  });
});

describe('exchangeSigils（store）', () => {
  it('扣材料與手續費、加 1 個目標', async () => {
    setup([['seal', 3], ['sting', 2], ['temper', 40], ['polish', 15]]);
    const result = await useGameStore.getState().exchangeSigils('enhance', { seal: 3, sting: 2 }, { temper: 35, polish: 15 });

    expect(result.ok).toBe(true);
    expect([amount('seal'), amount('sting'), amount('temper'), amount('polish'), amount('enhance')]).toEqual([0, 0, 5, 0, 1]);
    expect(useGameStore.getState().character!.gold).toBe(1234);
  });

  it('材料含目標同種：淨減 4 個', async () => {
    setup([['chaos', 5], ['temper', 50]]);
    await useGameStore.getState().exchangeSigils('chaos', { chaos: 5 }, { temper: 50 });
    expect([amount('chaos'), amount('temper')]).toEqual([1, 0]);
  });

  it('持有不足：不受理、不扣任何印記', async () => {
    setup([['seal', 5], ['temper', 30], ['polish', 19]]);
    const result = await useGameStore.getState().exchangeSigils('chaos', { seal: 5 }, { temper: 30, polish: 20 });

    expect(result).toEqual({ ok: false, message: '工藝印記不足' });
    expect([amount('seal'), amount('temper'), amount('polish'), amount('chaos')]).toEqual([5, 30, 19, 0]);
  });
});

describe('兌換分頁', () => {
  const plus = (name: string) => fireEvent.click(screen.getByRole('button', { name: `增加${name}` }));
  const exchangeBtn = () => screen.getByRole('button', { name: '兌換' }) as HTMLButtonElement;

  function openTab() {
    render(<SigilMaster />);
    fireEvent.click(screen.getByRole('button', { name: '兌換印記' }));
  }

  it('預設在「使用印記」分頁', () => {
    setup([]);
    render(<SigilMaster />);
    expect(screen.getByRole('button', { name: '使用印記' }).className).toContain('active');
    expect(screen.queryByRole('button', { name: '兌換' })).toBeNull();
  });

  it('湊滿材料與手續費後兌換：背包更新、數量清零、顯示結果', async () => {
    setup([['seal', 5], ['temper', 50]]);
    openTab();
    fireEvent.click(screen.getByRole('button', { name: /^突破印記/ }));
    expect(exchangeBtn().disabled).toBe(true);
    expect(screen.getByText('材料需剛好 5 個（目前 0）')).toBeTruthy();

    for (let i = 0; i < 5; i++) plus('封印印記');
    expect(screen.getByText('手續費需剛好 50 個（目前 0）')).toBeTruthy();
    for (let i = 0; i < 50; i++) plus('精鍊印記');
    expect(exchangeBtn().disabled).toBe(false);

    fireEvent.click(exchangeBtn());

    await waitFor(() => expect(screen.getByText('兌換成功，獲得 突破印記 ×1')).toBeTruthy());
    expect([amount('seal'), amount('temper'), amount('enhance')]).toEqual([0, 0, 1]);
    expect(screen.getByText('材料（已選 0 / 5）')).toBeTruthy();
    expect(screen.getByText('手續費（已選 0 / 50）')).toBeTruthy();
  });

  it('＋ 在持有用完或合計已滿時停用', () => {
    setup([['seal', 2], ['sting', 9], ['temper', 50]]);
    openTab();
    plus('封印印記');
    plus('封印印記');
    expect((screen.getByRole('button', { name: '增加封印印記' }) as HTMLButtonElement).disabled).toBe(true);

    for (let i = 0; i < 3; i++) plus('刺針印記');
    expect((screen.getByRole('button', { name: '增加刺針印記' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('目標選單沒有精鍊與工藝', () => {
    setup([]);
    openTab();
    const targets = screen.getAllByRole('button').filter(b => b.className.includes('sigil-choice'));
    expect(targets.map(b => b.textContent?.replace(/×\d+$/, ''))).toEqual(
      SIGIL_EXCHANGE_TYPES.map(t => getSigilDefinition(t).name),
    );
  });
});
