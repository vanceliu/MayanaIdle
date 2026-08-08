// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { SigilMaster, SIGIL_FX_DURATION_MS } from '../town/SigilMaster';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';
import { makeBagItem } from '../../models/bagItem';
import { getItemId } from '../../models/items';

/**
 * 印記演出（`48-vfx.md` § 48.5）。
 *
 * 這裡驗的是「哪一種印記演哪一段」與「演出不影響判定」，
 * 受理範圍與成功率由 `sigil` 的單元測試負責，不在這裡重測。
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
    bagItems: bag.map(b => makeBagItem(getItemId(b.name)!, b.amount)!),
    inventory: [item],
    equippedGear: {},
  });
  render(<SigilMaster />);
}

const pickSigil = (name: string) => fireEvent.click(screen.getByText(new RegExp(`^⚠?\\s*${name}`)));
const pickAffix = (label: string) => fireEvent.click(screen.getByText(label));
const apply = (name: string) => fireEvent.click(screen.getByRole('button', { name: `使用${name}` }));

describe('印記選單（`13-town.md` § 13.13.1）', () => {
  it('依操作性質兩兩成對排列，且預設停在精鍊印記', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [{ name: '精鍊印記', amount: 1 }]);
    const labels = [...document.querySelectorAll('.sigil-choice')].map(
      el => el.textContent?.replace(/[⚠\s]|×\d+/g, '') ?? '',
    );
    expect(labels).toEqual(['精鍊印記', '突破印記', '刺針印記', '重刻印記', '混沌印記', '工藝印記']);

    // 預設不可停在突破印記 —— 失敗會把詞綴打回 T1
    const selected = document.querySelector('.sigil-choice.is-selected');
    expect(selected?.textContent).toContain('精鍊印記');
    expect(screen.getByRole('button', { name: '使用精鍊印記' })).toBeDefined();
  });
});

describe('詞綴顯示（`34-ui-guidelines.md` § 34.2）', () => {
  /**
   * 滿值詞綴整條變粗，與背包 tooltip 一致。面板把名稱與數值拆成兩個元素，
   * 只粗體其中一個會變成同一條詞綴一半粗一半不粗。
   */
  it('滿值詞綴的名稱與數值都掛 max-roll', () => {
    // T3 的上限是 11（`affix.ts` AFFIX_TIERS），T5 上限 15
    setup(
      gear([
        { type: 'attack_power', tier: 3, value: 11 },  // 滿值
        { type: 'attack_power', tier: 5, value: 14 },  // 非滿值
      ]),
      [{ name: '精鍊印記', amount: 1 }],
    );
    const rows = [...document.querySelectorAll('.sigil-affix-row')];

    expect(rows[0].querySelector('.affix-tag')!.className).toContain('max-roll');
    expect(rows[0].querySelector('.sigil-affix-value')!.className).toContain('max-roll');

    expect(rows[1].querySelector('.affix-tag')!.className).not.toContain('max-roll');
    expect(rows[1].querySelector('.sigil-affix-value')!.className).not.toContain('max-roll');
  });
});

describe('印記演出（§ 48.5）', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('必定生效的印記只有掃光，沒有白閃與爆閃', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [{ name: '精鍊印記', amount: 1 }]);
    pickSigil('精鍊印記');
    pickAffix('攻擊力 T3');
    apply('精鍊印記');

    expect(screen.getByTestId('sigil-fx-sweep')).toBeDefined();
    expect(document.querySelector('.enh-flash-soft')).toBeNull();
    expect(document.querySelector('.enh-flash-gold')).toBeNull();
  });

  // § 48.5：突破與強化共用同一組元件，前半拍完全相同
  it('突破成功：白閃 + 爆閃 + 兩圈光環 + 往上的浮字', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [{ name: '突破印記', amount: 1 }]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apply('突破印記');

    const layer = screen.getByTestId('sigil-fx-break-ok');
    expect(layer.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(layer.querySelector('.enh-flash-gold')).not.toBeNull();
    expect(layer.querySelectorAll('.enh-ring')).toHaveLength(2);
    const float = layer.querySelector('.enh-float')!;
    expect(float.textContent).toBe('T6');
    expect(float.className).not.toContain('is-down');
  });

  it('突破失敗：白閃 + 紅閃 + 往下掉的浮字，浮字寫 T1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [{ name: '突破印記', amount: 1 }]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apply('突破印記');

    const layer = screen.getByTestId('sigil-fx-break-fail');
    expect(layer.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(layer.querySelector('.enh-flash-red')).not.toBeNull();
    const float = layer.querySelector('.enh-float')!;
    expect(float.className).toContain('is-down');
    expect(float.textContent).toBe('T1');
    // 判定不因演出延後：詞綴當下就掉回 T1 了
    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(1);
  });

  it('取消突破的確認時不演出，也不動詞綴', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [{ name: '突破印記', amount: 1 }]);
    pickSigil('突破印記');
    pickAffix('攻擊力 T5');
    apply('突破印記');

    expect(screen.queryByTestId('sigil-fx-break-ok')).toBeNull();
    expect(screen.queryByTestId('sigil-fx-break-fail')).toBeNull();
    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(5);
  });

  /**
   * 連點：React 會沿用同一個 DOM 節點，CSS 動畫不會重跑 —— 第二次按下去等於沒有演出。
   * 覆蓋層與帶動畫 class 的元素都以 token 當 key，強制重新掛載。
   */
  it('連續使用時演出會重播，不是沿用同一個節點', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [{ name: '精鍊印記', amount: 3 }]);
    pickSigil('精鍊印記');
    pickAffix('攻擊力 T3');
    apply('精鍊印記');
    const first = screen.getByTestId('sigil-fx-sweep');

    // 不等演出結束就再按一次
    apply('精鍊印記');
    const second = screen.getByTestId('sigil-fx-sweep');
    expect(second).not.toBe(first);
  });

  it('演出結束後覆蓋層收掉', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [{ name: '精鍊印記', amount: 1 }]);
    pickSigil('精鍊印記');
    pickAffix('攻擊力 T3');
    apply('精鍊印記');
    expect(screen.getByTestId('sigil-fx-sweep')).toBeDefined();

    act(() => { vi.advanceTimersByTime(SIGIL_FX_DURATION_MS + 50); });
    expect(screen.queryByTestId('sigil-fx-sweep')).toBeNull();
  });
});
