// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { SigilMaster } from '../town/SigilMaster';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';
import { POLISH_SIGIL_GOLD_COST } from '../../models/sigil';
import { makeBagItem } from '../../models/bagItem';
import { getItemId } from '../../models/items';

/**
 * 印記師的新版流程（`13-town.md` § 13.13）：選裝備 → 選詞綴 → 選印記 → 右下角一顆按鈕執行。
 *
 * **精鍊與突破是兩個獨立的印記選項**（`46-sigil.md` § 46.2）——
 * 合成單一「升階」時玩家連按就會誤用突破，而突破失敗是把詞綴打回 T1 的不可逆代價。
 */

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

function gear(affixes: Affix[], over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: 1,
    templateId: 100,
    name: '鋼心劍',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    smallMonsterDamage: 20,
    largeMonsterDamage: 18,
    weight: 15,
    quality: 0,
    enhancement: 0,
    stability: 6,
    affixes,
    ownerId: 1,
    equipped: false,
    ...over,
  } as EquipmentInstance;
}

function setup(item: EquipmentInstance, bag: { name: string; amount: number }[], gold = 1_000_000) {
  useGameStore.setState({
    character: {
      name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 1,
      hp: 1, maxHp: 1, mp: 1, maxMp: 1,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null,
      skills: [], quests: [], unspentAttributePoints: 0,
      areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
    } as never,
    // 背包格一律由 seed 反查（`models/bagItem.ts`），不手寫 name／type
    bagItems: bag.map(b => makeBagItem(getItemId(b.name)!, b.amount)!),
    inventory: [item],
    equippedGear: {},
  });
  render(<SigilMaster />);
}

/** 選印記：選單上的名稱就是道具名（§ 99.1 名稱由 id 反查 seed） */
const pickSigil = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^⚠?\\s*${name}`) }));

/** 選詞綴：列上顯示的是「詞綴名 T{tier}」 */
const pickAffix = (label: string) =>
  fireEvent.click(screen.getByText(label).closest('button')!);

const applyBtn = (name: string) =>
  screen.getByRole('button', { name: `使用${name}` }) as HTMLButtonElement;

/*
 * 同一句話會同時出現在兩個區塊（印記說明 vs 消耗行、詞綴列的原因 vs 底部訊息），
 * 斷言一律指名區塊，不可用全域 getByText。
 */
const costText = () => document.querySelector('.sigil-cost')!.textContent ?? '';
const footerText = () => document.querySelector('.sigil-footer-msg')!.textContent ?? '';

describe('印記師 — 精鍊印記（§ 46.6）', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('管道上限以內的詞綴必定成功，只扣精鍊印記', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '精鍊印記', amount: 2 },
      { name: '突破印記', amount: 1 },
    ]);
    pickSigil('精鍊印記');
    pickAffix('攻擊力 T3');

    expect(costText()).toContain('消耗：精鍊印記 ×1');
    expect(costText()).toContain('必定成功');
    fireEvent.click(applyBtn('精鍊印記'));

    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(4);
    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '精鍊印記')?.amount).toBe(1);
    // 沒動到突破印記
    expect(bag.find(b => b.name === '突破印記')?.amount).toBe(1);
  });

  it('精鍊不跳確認，直接升階', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '精鍊印記', amount: 1 },
    ]);
    pickSigil('精鍊印記');
    pickAffix('攻擊力 T3');
    fireEvent.click(applyBtn('精鍊印記'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(4);
  });

  it('T5 不在精鍊的守備範圍，該列停用並指向突破印記', () => {
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [
      { name: '精鍊印記', amount: 2 },
      { name: '突破印記', amount: 1 },
    ]);
    pickSigil('精鍊印記');

    const row = screen.getByText('攻擊力 T5').closest('button')!;
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.textContent).toContain('突破印記');
  });

  it('商店裝到 T3 就沒有印記可用（§ 6A.6 硬上限）', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 11 }], { maxAffixTier: 3 }), [
      { name: '精鍊印記', amount: 5 },
      { name: '突破印記', amount: 5 },
    ]);
    pickSigil('精鍊印記');

    expect(screen.getByText('攻擊力 T3').closest('button')!.getAttribute('aria-disabled')).toBe('true');
    expect(applyBtn('精鍊印記').disabled).toBe(true);
  });

  it('摘要寫「精鍊上限」而不是「詞綴上限」（突破不看取得管道，§ 46.7）', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [{ name: '精鍊印記', amount: 1 }]);
    expect(screen.getByText(/精鍊上限 T5/)).toBeTruthy();
    expect(screen.queryByText(/詞綴上限/)).toBeNull();
  });
});

describe('印記師 — 突破印記（§ 46.7）', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T5 由突破受理，成功率寫在消耗那一行', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // < 10%，成功
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [
      { name: '精鍊印記', amount: 2 },
      { name: '突破印記', amount: 1 },
    ]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');

    expect(costText()).toContain('成功率 10%（T5 → T6）');
    expect(costText()).toContain('失敗時該詞綴掉回 T1');
    fireEvent.click(applyBtn('突破印記'));

    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(6);
    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '突破印記')).toBeUndefined();
    expect(bag.find(b => b.name === '精鍊印記')?.amount).toBe(2);
  });

  it('使用前跳出確認，訊息含詞綴、成功率與失敗代價', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [
      { name: '突破印記', amount: 1 },
    ]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');
    fireEvent.click(applyBtn('突破印記'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const msg = confirmSpy.mock.calls[0][0] as string;
    expect(msg).toContain('突破印記');
    expect(msg).toContain('10%');
    expect(msg).toContain('T5 → T6');
    expect(msg).toContain('掉回 T1');
  });

  it('取消確認時不扣印記也不動詞綴', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [
      { name: '突破印記', amount: 1 },
    ]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');
    fireEvent.click(applyBtn('突破印記'));

    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(5);
    expect(useGameStore.getState().bagItems.find(b => b.name === '突破印記')?.amount).toBe(1);
  });

  it('T1~T4 不受理，該列停用 —— 連按也不會誤用突破', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '突破印記', amount: 5 },
    ]);
    pickSigil('突破印記');

    const row = screen.getByText('攻擊力 T3').closest('button')!;
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    // 點了也選不起來，動作鈕仍要求先選一條可用的詞綴
    expect(applyBtn('突破印記').disabled).toBe(true);
  });
});

describe('印記師 — 工藝印記（§ 46.8）', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('消耗工藝印記 ×1 + 5,000G，品質 +1%，不需指定詞綴', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '工藝印記', amount: 1 },
    ], 60_000);
    pickSigil('工藝印記');

    expect(costText()).toContain(`消耗：工藝印記 ×1 ＋ ${POLISH_SIGIL_GOLD_COST.toLocaleString()}G`);
    expect(costText()).toContain('對象是整件裝備');
    fireEvent.click(applyBtn('工藝印記'));

    expect(useGameStore.getState().inventory[0].quality).toBe(1);
    expect(useGameStore.getState().character!.gold).toBe(55_000);
    expect(useGameStore.getState().bagItems.find(b => b.name === '工藝印記')).toBeUndefined();
  });

  it('金幣不足時擋下並說明原因', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '工藝印記', amount: 1 },
    ], 100);
    pickSigil('工藝印記');

    expect(applyBtn('工藝印記').disabled).toBe(true);
    expect(footerText()).toBe('金幣不足');
  });

  it('品質已滿 20% 不受理', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }], { quality: 20 }), [
      { name: '工藝印記', amount: 1 },
    ]);
    pickSigil('工藝印記');

    expect(applyBtn('工藝印記').disabled).toBe(true);
    expect(footerText()).toContain('品質已達 20%');
  });
});

describe('印記師 — 選取流程（§ 13.13）', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('沒有印記時停用並說明是哪一種不夠', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '精鍊印記', amount: 1 },
    ]);
    pickSigil('重刻印記');

    expect(applyBtn('重刻印記').disabled).toBe(true);
    expect(footerText()).toBe('背包裡沒有重刻印記');
  });

  it('指定詞綴的印記未選詞綴時停用', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '刺針印記', amount: 1 },
    ]);
    pickSigil('刺針印記');

    expect(applyBtn('刺針印記').disabled).toBe(true);
    expect(footerText()).toBe('請先選一條詞綴');
  });

  it('換裝備會清掉詞綴選取，避免對新裝備誤用', () => {
    const other = gear([{ type: 'defense', tier: 2, value: 5 }], { id: 2, name: '鐵盾' });
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '刺針印記', amount: 1 },
    ]);
    useGameStore.setState({
      inventory: [useGameStore.getState().inventory[0], other],
    });

    pickSigil('刺針印記');
    pickAffix('攻擊力 T3');
    expect(applyBtn('刺針印記').disabled).toBe(false);

    fireEvent.click(screen.getByText('鐵盾').closest('button')!);
    expect(applyBtn('刺針印記').disabled).toBe(true);
    expect(footerText()).toBe('請先選一條詞綴');
  });

  it('新手裝在清單上就標出來，且所有印記都不受理', () => {
    setup(gear([]), [{ name: '混沌印記', amount: 1 }]);
    pickSigil('混沌印記');

    expect(applyBtn('混沌印記').disabled).toBe(true);
    expect(footerText()).toBe('這件裝備沒有詞綴');
  });

  /*
   * 裝備名在左欄清單與右欄摘要各有一份，斷言一律限縮在清單內
   * —— 全域 getByText 會同時抓到兩個。
   */
  const pickerName = () => within(document.querySelector('.sigil-picker')!).getByText('鋼心劍');

  /** 圖示與 Tier 色與背包／裝備欄同源，同一件裝備在三個地方不會長成三種樣子 */
  it('清單列印出裝備圖示，名稱上 Tier 色', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '混沌印記', amount: 1 },
    ]);

    const name = pickerName();
    // 武器用類型圖示（劍），防具才用部位圖示
    expect(
      name.closest('button')!.querySelector('[data-testid="icon-equipment/spinning-sword"]'),
    ).not.toBeNull();
    // 查不到模板時退回 Tier 1 的灰色（`models/equipmentTier.ts`）
    expect((name as HTMLElement).style.color).toBe('rgb(107, 114, 128)');
  });

  it('強化等級接在名稱後面，清單與摘要各一份', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }], { enhancement: 6 }), [
      { name: '混沌印記', amount: 1 },
    ]);

    const picker = within(document.querySelector('.sigil-picker')!);
    expect(picker.getByText('鋼心劍 +6')).toBeDefined();
    expect(document.querySelector('.sigil-summary-main')!.textContent).toContain('鋼心劍 +6');
  });

  it('印記不受理的裝備維持灰階，名稱不上 Tier 色', () => {
    setup(gear([]), [{ name: '混沌印記', amount: 1 }]);

    const name = pickerName();
    expect(name.closest('button')!.className).toContain('is-inert');
    // 上了 Tier 色就跟能操作的列看起來一樣了（`13-town.md` § 13.13 灰階標示）
    expect((name as HTMLElement).style.color).toBe('');
  });
});
