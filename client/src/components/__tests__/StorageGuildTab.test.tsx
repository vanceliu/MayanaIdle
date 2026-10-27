// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Storage } from '../town/Storage';
import { GuildNpc } from '../town/GuildNpc';
import { useGameStore } from '../../stores/gameStore';
import { useGuildStore, type GuildView } from '../../stores/guildStore';
import { useOnlineStore } from '../../net/online';
import { bagItem } from '../../testing/bagFixtures';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

/** 公會倉庫分頁（`11-guild.md` § 11.8、`13-town.md` § 13.8） */
const GUILD: GuildView = {
  id: 1, name: '星辰', leaderId: 1, capacity: 24,
  members: [{ characterId: 1, name: '我', className: 'knight', level: 30, online: true, joinedAt: 1 }],
};

const open = vi.fn(async () => true);
const close = vi.fn(async () => true);
const deposit = vi.fn(async () => true);
const depositGold = vi.fn(async () => true);

beforeEach(() => {
  open.mockClear();
  close.mockClear();
  deposit.mockClear();
  depositGold.mockClear();
  useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
  useGameStore.setState({
    character: { id: 1, name: '我', gold: 500 } as never,
    bagItems: [bagItem('銀礦石', 8)],
    inventory: [],
    storedEquipment: [],
    storedMaterials: [],
    personalStoredEquipment: [],
    personalStoredMaterials: [],
    equippedGear: {},
    warehouseGold: 0,
  });
  useGuildStore.setState({
    guild: GUILD,
    warehouse: null,
    message: null,
    openWarehouse: open,
    closeWarehouse: close,
    depositWarehouse: deposit,
    depositWarehouseGold: depositGold,
  });
});

const tab = (name: string) => screen.getByRole('button', { name });

describe('倉庫分頁', () => {
  it('順序：帳號倉庫、個人倉庫、公會倉庫；「共用倉庫」已改名', () => {
    const { container } = render(<Storage />);
    const labels = [...container.querySelector('.storage-tabs')!.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toEqual(['帳號倉庫', '個人倉庫', '公會倉庫']);
    expect(container.textContent).not.toContain('共用倉庫');
  });

  it('單機世界不顯示公會倉庫', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'solo' });
    render(<Storage />);
    expect(screen.queryByRole('button', { name: '公會倉庫' })).toBeNull();
  });

  it('沒有公會：分頁變暗，點了沒反應、不向 server 要內容', () => {
    useGuildStore.setState({ guild: null });
    render(<Storage />);
    const guildTab = tab('公會倉庫');
    expect(guildTab.className).toContain('is-unavailable');
    expect(guildTab.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(guildTab);
    expect(guildTab.className).not.toContain('active');
    expect(open).not.toHaveBeenCalled();
  });

  it('打開公會分頁才要內容，切走就釋放', () => {
    render(<Storage />);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(tab('公會倉庫'));
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.click(tab('帳號倉庫'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('公會分頁顯示格數與金幣，存入走公會倉庫', () => {
    useGuildStore.setState({ warehouse: { equipment: [], items: [bagItem('銀精華', 3)], gold: 1200, used: 1, capacity: 200 } });
    render(<Storage />);
    fireEvent.click(tab('公會倉庫'));
    expect(screen.getByText('已用 1 / 200 格')).toBeTruthy();
    expect(screen.getByText('倉庫金幣：1200 G')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('金額'), { target: { value: '100' } });
    fireEvent.click(screen.getAllByRole('button', { name: '存入' })[0]);
    expect(depositGold).toHaveBeenCalledWith(100);
  });

  it('公會倉庫的提示（已滿／已被取走）顯示在面板上', () => {
    useGuildStore.setState({ message: '公會倉庫已滿（200/200）' });
    render(<Storage />);
    fireEvent.click(tab('公會倉庫'));
    expect(screen.getByRole('status').textContent).toBe('公會倉庫已滿（200/200）');
  });
});

describe('公會 NPC 解散確認', () => {
  it('註明倉庫會一併消失', () => {
    render(<GuildNpc />);
    fireEvent.click(screen.getByRole('button', { name: '解散公會' }));
    expect(screen.getByText(/公會倉庫內物品與金幣會一併消失/)).toBeTruthy();
  });
});
