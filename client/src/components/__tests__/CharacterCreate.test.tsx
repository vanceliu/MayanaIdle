import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterCreate } from '../CharacterCreate';
import { useGameStore } from '../../stores/gameStore';
import { LeaderboardError } from '../../services/leaderboardService';
import type { Attributes, ClassName } from '../../models/character';
import { CHARACTER_NAME_ERROR_MESSAGES } from '../../models/characterIdentity';

/**
 * @vitest-environment jsdom
 *
 * § 19.4：角色名稱全球唯一，註冊成功才可建立角色。
 */

const registerCharacter = vi.fn();
const checkNameAvailable = vi.fn();

vi.mock('../../services/leaderboardService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/leaderboardService')>();
  return {
    ...actual,
    registerCharacter: (...args: unknown[]) => registerCharacter(...args),
    checkNameAvailable: (...args: unknown[]) => checkNameAvailable(...args),
  };
});

const createCharacter =
  vi.fn<(name: string, className: ClassName, bonus: Attributes, uuid?: string) => Promise<void>>(
    async () => {},
  );

/** 騎士初始可分配 4 點，全加在力量上（14 → 18，剛好到上限） */
function allocateAllPoints() {
  const plusButtons = screen.getAllByText('+');
  for (let i = 0; i < 4; i++) fireEvent.click(plusButtons[0]);
}

function typeName(value: string) {
  fireEvent.change(screen.getByPlaceholderText('輸入名稱...'), { target: { value } });
}

describe('CharacterCreate 名稱驗證與註冊', () => {
  beforeEach(() => {
    registerCharacter.mockReset().mockResolvedValue(undefined);
    checkNameAvailable.mockReset().mockResolvedValue({ available: true, reason: null });
    createCharacter.mockReset();
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
    expect(registerCharacter).not.toHaveBeenCalled();
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

  it('註冊成功後才建立角色，且沿用同一個 uuid', async () => {
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => expect(createCharacter).toHaveBeenCalled());

    const registerArgs = registerCharacter.mock.calls[0][0];
    expect(registerArgs.character_name).toBe('勇者');
    expect(registerArgs.class_name).toBe('knight');
    expect(registerArgs.character_level).toBe(1);

    const createArgs = createCharacter.mock.calls[0];
    expect(createArgs[0]).toBe('勇者');
    expect(createArgs[1]).toBe('knight');
    expect(createArgs[3]).toBe(registerArgs.character_id);
  });

  it('名稱被搶註冊（409）時不建立角色並提示改名', async () => {
    registerCharacter.mockRejectedValue(new LeaderboardError('name_taken'));
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => expect(screen.getByText('這個名稱已經被使用，請換一個')).toBeDefined());
    expect(createCharacter).not.toHaveBeenCalled();
  });

  it('離線時不建立角色（硬性阻擋）', async () => {
    registerCharacter.mockRejectedValue(new LeaderboardError('network'));
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => {
      expect(screen.getByText('無法連線到伺服器，角色名稱需連線驗證，請稍後再試')).toBeDefined();
    });
    expect(createCharacter).not.toHaveBeenCalled();
  });

  it('預檢顯示名稱已被使用時，建立按鈕被鎖住', async () => {
    checkNameAvailable.mockResolvedValue({ available: false, reason: 'name_taken' });
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');

    await waitFor(() => expect(screen.getByText('此名稱已被使用')).toBeDefined());

    fireEvent.click(screen.getByText('開始冒險'));
    expect(registerCharacter).not.toHaveBeenCalled();
    expect(createCharacter).not.toHaveBeenCalled();
  });

  it('遲到的名稱檢查結果不可覆蓋當前的錯誤提示', async () => {
    // 第一個名稱的請求刻意延遲，模擬網路較慢時使用者已經改了輸入
    let resolveSlow: (value: { available: boolean; reason: null }) => void = () => {};
    checkNameAvailable.mockImplementationOnce(
      () => new Promise(resolve => { resolveSlow = resolve; }),
    );

    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('勇者');
    await waitFor(() => expect(checkNameAvailable).toHaveBeenCalled());

    // 使用者改成含空白的名稱（本機驗證即失敗）
    typeName('勇 者');
    await waitFor(() => {
      expect(screen.getByText(CHARACTER_NAME_ERROR_MESSAGES.invalid_char)).toBeDefined();
    });

    // 此時第一個請求才回來，不可把錯誤提示蓋掉
    resolveSlow({ available: true, reason: null });
    await new Promise(r => setTimeout(r, 20));

    expect(screen.getByText(CHARACTER_NAME_ERROR_MESSAGES.invalid_char)).toBeDefined();
    expect(screen.queryByText('此名稱可以使用')).toBeNull();
  });

  it('屬性點未分配完時不可建立', () => {
    render(<CharacterCreate />);
    typeName('勇者');

    fireEvent.click(screen.getByText('還有 4 點未分配'));
    expect(registerCharacter).not.toHaveBeenCalled();
    expect(createCharacter).not.toHaveBeenCalled();
  });
});
