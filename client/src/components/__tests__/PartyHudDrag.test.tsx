import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { PartyHud, PARTY_HUD_KEY } from '../PartyPanel';
import { positionKey } from '../LogWindow';
import { usePartyStore } from '../../stores/partyStore';
import { useGameStore } from '../../stores/gameStore';
import { usePanelWindowStore } from '../../stores/panelWindowStore';

/**
 * @vitest-environment jsdom
 *
 * 隊伍 HUD 可拖曳（`16-tech-frontend-architecture.md` § 32.3）：
 * 它接在 buff 下面，buff 一多就被一路往下推 —— 拖走之後改成固定座標，才推不到它。
 */
const KEY = positionKey(PARTY_HUD_KEY);

function party() {
  usePartyStore.setState({
    party: {
      id: 'p1',
      leaderId: 2,
      dropMode: 'participants',
      members: [
        { characterId: 1, name: '我', className: 'knight', level: 10, online: true, hp: 10, maxHp: 10, mp: 1, maxMp: 1, regionId: 'neutral-town', floor: null },
        { characterId: 2, name: '隊友', className: 'elf', level: 12, online: true, hp: 8, maxHp: 10, mp: 1, maxMp: 1, regionId: 'neutral-town', floor: null },
      ],
    },
  } as never);
  useGameStore.setState({ character: { id: 1, name: '我' } } as never);
}

beforeEach(() => {
  localStorage.clear();
  party();
});

describe('隊伍 HUD 拖曳', () => {
  it('沒拖過就待在原本的流排裡（不是浮動的）', () => {
    const { container } = render(<PartyHud />);
    const hud = container.querySelector('.party-hud') as HTMLElement;

    expect(hud.className).not.toContain('is-floating');
    expect(hud.style.left).toBe('');
  });

  it('拖過之後改成固定座標，並且記住位置', () => {
    const { container } = render(<PartyHud />);
    const hud = container.querySelector('.party-hud') as HTMLElement;

    fireEvent.pointerDown(hud, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(hud, { clientX: 210, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(hud, { clientX: 210, clientY: 160, pointerId: 1 });

    expect(hud.className).toContain('is-floating');
    expect(hud.style.left).toBe('200px');
    expect(hud.style.top).toBe('150px');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ left: 200, top: 150 });
  });

  it('重新開啟時回到上次拖到的位置', () => {
    localStorage.setItem(KEY, JSON.stringify({ left: 120, top: 90 }));
    const { container } = render(<PartyHud />);
    const hud = container.querySelector('.party-hud') as HTMLElement;

    expect(hud.className).toContain('is-floating');
    expect(hud.style.left).toBe('120px');
  });

  it('存下來的位置超出畫面時夾回來（換小螢幕開）', () => {
    localStorage.setItem(KEY, JSON.stringify({ left: 9999, top: 9999 }));
    const { container } = render(<PartyHud />);
    const hud = container.querySelector('.party-hud') as HTMLElement;

    expect(parseInt(hud.style.left, 10)).toBeLessThanOrEqual(window.innerWidth);
    expect(parseInt(hud.style.top, 10)).toBeLessThanOrEqual(window.innerHeight);
  });

  it('「重設視窗位置」把它放回流排，鍵也清掉', () => {
    localStorage.setItem(KEY, JSON.stringify({ left: 120, top: 90 }));
    const { container } = render(<PartyHud />);
    const hud = container.querySelector('.party-hud') as HTMLElement;
    expect(hud.className).toContain('is-floating');

    act(() => usePanelWindowStore.getState().resetPositions());

    expect(hud.className).not.toContain('is-floating');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
