import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { ArenaNpc } from '../town/ArenaNpc';
import { ArenaHud } from '../ArenaHud';
import { ArenaRanking } from '../town/ArenaRanking';
import { useGameStore } from '../../stores/gameStore';
import { usePartyStore, type PartyView } from '../../stores/partyStore';
import { connection } from '../../net/connection';
import { EMPTY_ARENA_SLOTS, arenaGoldCost, arenaSlotStart, type ArenaCharacterRun } from '../../models/arena';
import type { Character } from '../../models/character';

/**
 * @vitest-environment jsdom
 *
 * 競技場 NPC、場內 HUD、統計中心排行榜（`55-arena.md`）。
 */

function setCharacter(level: number, gold = 1_000_000, warehouseGold = 0) {
  useGameStore.setState({
    character: { id: 1, userId: 1, name: '我方', className: 'knight', level, gold, currentRegion: 'neutral-town' } as Character,
    warehouseGold,
    bagItems: [],
    arenaSlots: EMPTY_ARENA_SLOTS,
    arenaRun: null,
  } as never);
}

function party(leaderId: number, memberLevel: number): PartyView {
  const member = (characterId: number, name: string, level: number) => ({
    characterId, name, className: 'knight', level, hp: 1, maxHp: 1, mp: 1, maxMp: 1, regionId: 'neutral-town', floor: null, online: true, joinedAt: 0,
  });
  return { id: 'p', leaderId, dropMode: 'free', members: [member(1, '我方', 60), member(2, '小白', memberLevel)] } as unknown as PartyView;
}

describe('ArenaNpc', () => {
  beforeEach(() => {
    setCharacter(55);
    usePartyStore.setState({ party: null });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('T7 未開放；等級未達的段位顯示門檻', () => {
    render(<ArenaNpc />);
    expect((screen.getByRole('button', { name: '未開放' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('需要 Lv.60')).toBeTruthy();
    expect(screen.getByText(/回城卷軸撤退：票券全留/)).toBeTruthy();
  });

  it('入場只收金幣：不列材料，顯示金幣來源說明（§ 55.1）', () => {
    render(<ArenaNpc />);
    expect(screen.queryByText(/入場材料/)).toBeNull();
    expect(screen.getByText(`💰 ${arenaGoldCost(4).toLocaleString()} 金幣`)).toBeTruthy();
    expect(screen.getByText(/身上金幣與帳號倉庫金幣合計支付，先扣身上/)).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '票券場入場' })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('身上與帳號倉庫合計不足時票券場按鈕不能按', () => {
    setCharacter(55, arenaGoldCost(4) - 2, 1);
    render(<ArenaNpc />);
    expect(screen.getAllByText('金幣不足').length).toBe(2);
    for (const b of screen.getAllByRole('button', { name: '票券場入場' })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('身上不足但加上帳號倉庫金幣足夠時可以入場', () => {
    setCharacter(55, arenaGoldCost(4) - 1, 1);
    render(<ArenaNpc />);
    expect(screen.getAllByText('金幣不足').length).toBe(1);
    expect((screen.getAllByRole('button', { name: '票券場入場' })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('本時段已用掉的段位不收費，金幣不足也可入場（§ 55.4）', () => {
    setCharacter(55, 0, 0);
    useGameStore.setState({ arenaSlots: { slotStart: arenaSlotStart(Date.now()), tiers: [4] } });
    render(<ArenaNpc />);
    expect(screen.getByText('本時段已用掉票券場：入場不收費、不給票券')).toBeTruthy();
    expect((screen.getByRole('button', { name: '入場（不給票券）' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('組隊：隊長看到「隊長付」；隊員看到由隊長「X」付，且不檢查自己的金幣', () => {
    setCharacter(60);
    usePartyStore.setState({ party: party(1, 60) });
    const { unmount } = render(<ArenaNpc />);
    expect(screen.getAllByText('（隊長付）').length).toBe(4);
    unmount();
    setCharacter(60, 0, 0);
    usePartyStore.setState({ party: party(2, 60) });
    render(<ArenaNpc />);
    expect(screen.getAllByText('（由隊長「小白」付）').length).toBe(4);
    expect(screen.getByText('組隊 2 人（隊長「小白」付費）')).toBeTruthy();
    expect(screen.queryByText('金幣不足')).toBeNull();
    for (const b of screen.getAllByRole('button', { name: '票券場入場' })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('組隊時非隊長不能帶隊、隊員等級未達會指名', () => {
    usePartyStore.setState({ party: party(2, 60) });
    const { unmount } = render(<ArenaNpc />);
    expect(screen.getAllByText('組隊時由隊長帶隊進場').length).toBeGreaterThan(0);
    unmount();
    setCharacter(60);
    usePartyStore.setState({ party: party(1, 45) });
    render(<ArenaNpc />);
    expect(screen.getByText('隊員「小白」未達 Lv.50')).toBeTruthy();
  });

  it('兌換分頁列出 T4～T6 三種兌換箱', () => {
    render(<ArenaNpc />);
    fireEvent.click(screen.getByRole('button', { name: '兌換' }));
    expect(screen.getAllByRole('button', { name: '兌換' }).length).toBeGreaterThan(9);
    expect(screen.getByText('T6 飾品兌換箱')).toBeTruthy();
  });
});

describe('ArenaHud', () => {
  afterEach(cleanup);

  it('顯示波次、王波、剩餘怪物、時間與本場票券', () => {
    const run: ArenaCharacterRun = {
      runKey: 'k', tier: 5, ticketRun: true, tickets: 2, returnRegion: 'neutral-town', theme: 'forest', slotStart: 0,
      wave: 30, elapsedMs: 754_000, monstersLeft: 2,
    };
    useGameStore.setState({ arenaRun: run });
    render(<ArenaHud />);
    expect(screen.getByText('30 / 100（王波）')).toBeTruthy();
    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('2 張')).toBeTruthy();
  });

  it('不在競技場不顯示', () => {
    useGameStore.setState({ arenaRun: null });
    render(<ArenaHud />);
    expect(screen.queryByTestId('arena-hud')).toBeNull();
  });
});

describe('ArenaRanking', () => {
  beforeEach(() => setCharacter(55));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('依篩選向 server 要榜單', async () => {
    const spy = vi.spyOn(connection, 'requestArenaRanking').mockResolvedValue([
      { name: '別人', className: 'elf', wave: 42, timeMs: 61_000 },
    ]);
    render(<ArenaRanking />);
    expect(await screen.findByText('別人')).toBeTruthy();
    expect(spy).toHaveBeenLastCalledWith({ tier: 4, party: false, className: undefined });
    fireEvent.click(screen.getByRole('button', { name: '組隊' }));
    fireEvent.click(screen.getByRole('button', { name: 'T6' }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ tier: 6, party: true, className: undefined }));
  });
});
