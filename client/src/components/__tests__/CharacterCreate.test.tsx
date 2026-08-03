import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterCreate } from '../CharacterCreate';
import { useGameStore } from '../../stores/gameStore';
import type { Attributes, ClassName } from '../../models/character';
import { CHARACTER_NAME_ERROR_MESSAGES } from '../../models/characterIdentity';

/**
 * @vitest-environment jsdom
 *
 * § 19.4：名稱**不要求唯一**，建立角色是純本機行為 ——
 * 沒有預檢 API、沒有註冊、離線也建得起來。只剩本機格式驗證會擋人。
 */

const createCharacter =
  vi.fn<(name: string, className: ClassName, bonus: Attributes) => Promise<void>>(async () => {});

/** 騎士初始可分配 4 點，全加在力量上（14 → 18，剛好到上限） */
function allocateAllPoints() {
  const plusButtons = screen.getAllByText('+');
  for (let i = 0; i < 4; i++) fireEvent.click(plusButtons[0]);
}

function typeName(value: string) {
  fireEvent.change(screen.getByPlaceholderText('輸入名稱...'), { target: { value } });
}

describe('CharacterCreate', () => {
  beforeEach(() => {
    createCharacter.mockReset().mockResolvedValue(undefined);
    useGameStore.setState({ createCharacter, phase: 'create' });
  });

  it('名稱含空白時顯示錯誤且不可建立', async () => {
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇 者');

    await waitFor(() => {
      expect(screen.getByText(CHARACTER_NAME_ERROR_MESSAGES.invalid_char)).toBeDefined();
    });

    fireEvent.click(screen.getByText('開始冒險'));
    expect(createCharacter).not.toHaveBeenCalled();
  });

  it('名稱只有 1 個字時不可建立', async () => {
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('王');

    await waitFor(() => expect(screen.getByText('名稱至少 2 個字')).toBeDefined());

    fireEvent.click(screen.getByText('開始冒險'));
    expect(createCharacter).not.toHaveBeenCalled();
  });

  it('格式正確就直接建立，不打任何 API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => expect(createCharacter).toHaveBeenCalled());
    const args = createCharacter.mock.calls[0];
    expect(args[0]).toBe('勇者');
    expect(args[1]).toBe('knight');
    // 建角完全不碰網路：沒有名稱預檢、沒有註冊（§ 19.4）
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('同名角色照樣建得起來（名稱不要求唯一）', async () => {
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    fireEvent.click(screen.getByText('開始冒險'));
    await waitFor(() => expect(createCharacter).toHaveBeenCalledTimes(1));

    // 沒有任何「此名稱已被使用」的路徑可以擋住第二個同名角色
    expect(screen.queryByText('此名稱已被使用')).toBeNull();
  });

  it('屬性點未分配完時不可建立', () => {
    render(<CharacterCreate />);
    typeName('勇者');

    fireEvent.click(screen.getByText('還有 4 點未分配'));
    expect(createCharacter).not.toHaveBeenCalled();
  });
});
