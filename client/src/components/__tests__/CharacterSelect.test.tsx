import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
