import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CharacterSelect } from '../CharacterSelect';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

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
        { id: 1, name: 'Knight1', className: 'knight', level: 10 },
        { id: 2, name: 'Mage1', className: 'elementalist', level: 5 },
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

  it('should navigate to create screen on empty slot click', () => {
    render(<CharacterSelect />);
    fireEvent.click(screen.getAllByText('建立新角色')[0]);
    expect(useGameStore.getState().phase).toBe('create');
  });

  it('should show delete button for each character', () => {
    useGameStore.setState({
      characterList: [
        { id: 1, name: 'Hero', className: 'knight', level: 1 },
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
        characterList: [{ id: 1, name: 'Hero', className: 'knight', level: 1 }],
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
