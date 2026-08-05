import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CharacterSelect } from '../CharacterSelect';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

/** 角色卡顯示的屬性 = 建角配點 + Lv.51+ 配點（不含裝備／buff，§ 20.10） */
const ATTRS = { STR: 18, AGI: 12, VIT: 16, SPI: 10, INT: 14, CHA: 10 };

describe('CharacterSelect', () => {
  beforeEach(() => {
    useGameStore.setState({
      characterList: [],
      phase: 'characterSelect',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should show 4 empty slots when no characters exist', () => {
    render(<CharacterSelect />);
    const createButtons = screen.getAllByText('建立新角色');
    expect(createButtons).toHaveLength(4);
  });

  it('should show character info in filled slots', () => {
    useGameStore.setState({
      characterList: [
        { id: 1, name: 'Knight1', className: 'knight', level: 10, attributes: ATTRS },
        { id: 2, name: 'Mage1', className: 'elementalist', level: 5, attributes: ATTRS },
      ],
    });
    render(<CharacterSelect />);

    expect(screen.getByText('Knight1')).toBeDefined();
    expect(screen.getByText('騎士')).toBeDefined();
    expect(screen.getByText('Lv.10')).toBeDefined();
    expect(screen.getByText('Mage1')).toBeDefined();
    expect(screen.getByText('元素師')).toBeDefined();
    expect(screen.getByText('Lv.5')).toBeDefined();

    // 2 empty slots remaining
    const createButtons = screen.getAllByText('建立新角色');
    expect(createButtons).toHaveLength(2);
  });

  it('每個角色卡都列出職業、等級與六項屬性', () => {
    useGameStore.setState({
      characterList: [
        { id: 1, name: '夏天好熱', className: 'elf', level: 42, attributes: ATTRS },
      ],
    });
    const { container } = render(<CharacterSelect />);

    expect(screen.getByText('妖精')).toBeDefined();
    expect(screen.getByText('Lv.42')).toBeDefined();

    const slot = container.querySelector('.character-slot.filled') as HTMLElement;
    const pairs = Array.from(slot.querySelectorAll('.slot-attribute')).map(el => el.textContent);
    expect(pairs).toEqual(['STR18', 'AGI12', 'VIT16', 'SPI10', 'INT14', 'CHA10']);
  });

  it('屬性列與角色資訊同屬可點擊的進入遊戲區塊', () => {
    const selectCharacter = vi.fn();
    useGameStore.setState({
      characterList: [{ id: 7, name: 'Hero', className: 'knight', level: 1, attributes: ATTRS }],
      selectCharacter,
    } as never);
    const { container } = render(<CharacterSelect />);

    fireEvent.click(container.querySelector('.slot-attributes') as HTMLElement);
    expect(selectCharacter).toHaveBeenCalledWith(7);
  });

  it('should navigate to create screen on empty slot click', () => {
    render(<CharacterSelect />);
    fireEvent.click(screen.getAllByText('建立新角色')[0]);
    expect(useGameStore.getState().phase).toBe('create');
  });

  it('should show delete button for each character', () => {
    useGameStore.setState({
      characterList: [
        { id: 1, name: 'Hero', className: 'knight', level: 1, attributes: ATTRS },
      ],
    });
    render(<CharacterSelect />);
    const deleteBtn = screen.getByText('刪除');
    expect(deleteBtn).toBeDefined();
  });

  /** 刪除是純本機行為：名稱不唯一，沒有線上資源要回收（§ 37.4.3） */
  describe('刪除角色', () => {
    function setupOneCharacter() {
      const deleteCharacter = vi.fn().mockResolvedValue(undefined);
      useGameStore.setState({
        characterList: [{ id: 1, name: 'Hero', className: 'knight', level: 1, attributes: ATTRS }],
        deleteCharacter,
      } as never);
      return deleteCharacter;
    }

    it('確認後刪除，只問一次、也不打任何 API', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteCharacter = setupOneCharacter();
      render(<CharacterSelect />);

      fireEvent.click(screen.getByText('刪除'));

      await waitFor(() => expect(deleteCharacter).toHaveBeenCalledWith(1));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('取消確認時不刪除', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const deleteCharacter = setupOneCharacter();
      render(<CharacterSelect />);

      fireEvent.click(screen.getByText('刪除'));

      expect(deleteCharacter).not.toHaveBeenCalled();
    });
  });
});
