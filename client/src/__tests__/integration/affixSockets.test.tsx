// @vitest-environment jsdom
/**
 * 詞綴洞、新增印記、封印印記（`07-affix.md` § 7.1／§ 7.11.1、`46-sigil.md` § 46.11／§ 46.12）——
 * 走 store 的 `applySigil` 與畫面。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGameStore } from '../../stores/gameStore';
import { rollDropAffixCount, formatAffixDisplay, AFFIX_SOCKETS, type Affix } from '../../models/affix';
import { SEAL_SIGIL_SUCCESS_RATE } from '../../models/sigil';
import { makeBagItem, getBagItemAmount } from '../../models/bagItem';
import { EquipmentDetail } from '../../components/EquipmentInfo';
import { SigilMaster } from '../../components/town/SigilMaster';
import { AffixesPage } from '../../wiki/pages/AffixesPage';
import type { EquipmentInstance } from '../../models/equipment';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

const ADD_SIGIL = 161;
const SEAL_SIGIL = 162;

const FOUR: Affix[] = [
  { type: 'attack_power', tier: 4, value: 12 },
  { type: 'crit_rate', tier: 3, value: 10 },
  { type: 'crit_damage', tier: 2, value: 7 },
  { type: 'attack_speed', tier: 1, value: 4 },
];

function sword(affixes: Affix[], over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: 7, templateId: 100, name: '鋼心劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 20, largeMonsterDamage: 18, quality: 10, enhancement: 0, stability: 6,
    affixes, ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance;
}

function setup(item: EquipmentInstance, sigils: Record<number, number>) {
  useGameStore.setState({
    character: {
      name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
      currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
    } as never,
    bagItems: Object.entries(sigils).map(([id, n]) => makeBagItem(Number(id), n)!),
    inventory: [item],
    equippedGear: {},
  });
}

const stored = () => useGameStore.getState().inventory[0];
const apply = (type: 'add' | 'seal' | 'chaos', idx: number | null = null) =>
  useGameStore.getState().applySigil(7, type, idx) as { ok: boolean; success?: boolean; affixSlots?: number };

afterEach(() => { vi.restoreAllMocks(); });

describe('掉落條數（§ 7.1）', () => {
  it('1~4 條均等', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 8000; i++) {
      const n = rollDropAffixCount();
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (const c of counts.values()) expect(c / 8000).toBeCloseTo(0.25, 1);
  });
});

describe('store：新增印記', () => {
  it('補空洞並消耗印記', () => {
    setup(sword(FOUR.slice(0, 2)), { [ADD_SIGIL]: 2 });
    expect(apply('add').ok).toBe(true);
    expect(stored().affixes).toHaveLength(3);
    expect(getBagItemAmount(useGameStore.getState().bagItems, ADD_SIGIL)).toBe(1);
  });

  it('洞滿不受理、不扣印記', () => {
    setup(sword(FOUR), { [ADD_SIGIL]: 1 });
    expect(apply('add').ok).toBe(false);
    expect(getBagItemAmount(useGameStore.getState().bagItems, ADD_SIGIL)).toBe(1);
  });
});

describe('store：封印印記', () => {
  it('成功：該條移出詞綴洞變成封印、排到最後，空出的洞可用新增印記補', () => {
    vi.spyOn(Math, 'random').mockReturnValue(SEAL_SIGIL_SUCCESS_RATE - 0.01);
    setup(sword(FOUR), { [SEAL_SIGIL]: 1, [ADD_SIGIL]: 1 });
    const r = apply('seal', 2);
    expect(r.ok && r.success).toBe(true);
    expect(stored().affixes.map(a => [a.type, !!a.sealed])).toEqual([
      ['attack_power', false], ['crit_rate', false], ['attack_speed', false], ['crit_damage', true],
    ]);
    expect(stored().affixSlots).toBeUndefined();
    vi.restoreAllMocks();
    expect(apply('add').ok).toBe(true);
    expect(stored().affixes).toHaveLength(5);
    expect(stored().affixes[4].sealed).toBe(true);
  });

  it('失敗：該條與洞一起毀壞，洞數存進實例', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(sword(FOUR), { [SEAL_SIGIL]: 1 });
    const r = apply('seal', 2);
    expect(r.ok).toBe(true);
    expect(r.success).toBe(false);
    expect(stored().affixes.map(a => a.type)).toEqual(['attack_power', 'crit_rate', 'attack_speed']);
    expect(stored().affixSlots).toBe(AFFIX_SOCKETS - 1);
    expect(getBagItemAmount(useGameStore.getState().bagItems, SEAL_SIGIL)).toBe(0);
  });

  it('毀壞的洞新增印記補不回來，混沌也只抽滿剩下的洞', () => {
    setup(sword(FOUR.slice(0, 3), { affixSlots: 3 }), { [ADD_SIGIL]: 1, 147: 1 });
    expect(apply('add').ok).toBe(false);
    expect(apply('chaos').ok).toBe(true);
    expect(stored().affixes).toHaveLength(3);
  });

  it('封印詞綴吃品質，顯示 (封)', () => {
    const sealed: Affix = { type: 'attack_power', tier: 4, value: 12, sealed: true };
    expect(formatAffixDisplay(sealed, 10)).toBe('(封) 攻擊力 +13% (T4)');
  });
});

describe('畫面', () => {
  it('裝備說明：詞綴洞（含空洞、已毀壞）在前，封印詞綴不佔洞、排在最後', () => {
    const item = sword([FOUR[1], { ...FOUR[0], sealed: true }], { affixSlots: 3 });
    const { container } = render(<EquipmentDetail item={item} />);
    expect(screen.getByText('(封) 攻擊力 +13% (T4)').className).toContain('sealed');
    expect(container.querySelectorAll('.empty-socket')).toHaveLength(2);
    expect(container.querySelectorAll('.broken-socket')).toHaveLength(1);
    const rows = [...container.querySelectorAll('.equip-detail-affix')].map(el => el.textContent);
    expect(rows).toEqual(['爆擊率 +11% (T3)', '空洞', '空洞', '已毀壞', '(封) 攻擊力 +13% (T4)']);
  });

  it('印記師：詞綴洞列在前，封印詞綴排在洞下面，且不可再被指定', () => {
    setup(sword([FOUR[1], FOUR[2], { ...FOUR[0], sealed: true }]), { 148: 1 });
    render(<SigilMaster />);
    const rows = [...document.querySelectorAll('.sigil-affix-row')];
    expect(rows.map(r => r.querySelector('.affix-tag')?.textContent)).toEqual([
      '爆擊率 T3', '爆擊傷害 T2', '空洞', '空洞', '(封) 攻擊力 T4',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /刺針印記/ }));
    expect(rows[4].getAttribute('aria-disabled')).toBe('true');
  });

  it('印記師封印前跳確認，取消就不動', () => {
    setup(sword(FOUR), { [SEAL_SIGIL]: 1 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SigilMaster />);
    fireEvent.click(screen.getByRole('button', { name: /封印印記/ }));
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('爆擊率'))!);
    fireEvent.click(screen.getByRole('button', { name: '使用封印印記' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('連同詞綴洞一起毀壞');
    expect(stored().affixes).toEqual(FOUR);
    expect(getBagItemAmount(useGameStore.getState().bagItems, SEAL_SIGIL)).toBe(1);
  });

  it('Wiki 詞綴頁寫出洞數、掉落條數、封印與新增', () => {
    render(<MemoryRouter><AffixesPage /></MemoryRouter>);
    const text = document.body.textContent ?? '';
    expect(text).toContain('怪物與 Boss 掉落（含 T7）為 1~4 條均等');
    expect(text).toContain('封印詞綴名稱前標 (封)');
    expect(text).toContain('連同詞綴洞一起毀壞');
    expect(text).toContain('填滿所有詞綴洞');
    expect(screen.getAllByText('新增印記').length).toBeGreaterThan(0);
  });
});
