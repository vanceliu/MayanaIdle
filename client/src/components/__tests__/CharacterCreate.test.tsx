import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterCreate } from '../CharacterCreate';
import { useGameStore } from '../../stores/gameStore';
import { useTownStore } from '../../stores/townStore';
import type { Attributes, ClassName } from '../../models/character';
import { CHARACTER_NAME_ERROR_MESSAGES } from '../../models/characterIdentity';
import { createDefaultAppearance, normalizeAppearance, type Appearance } from '../../models/appearance';

/**
 * @vitest-environment jsdom
 *
 * § 19.4：名稱**不要求唯一**，建立角色是純本機行為 ——
 * 沒有預檢 API、沒有註冊、離線也建得起來。只剩本機格式驗證會擋人。
 */

const createCharacter =
  vi.fn<(name: string, className: ClassName, bonus: Attributes, appearance?: Appearance) => Promise<void>>(async () => {});

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
    useTownStore.getState().closeFacility();
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

  it('建立成功後直接開啟新手指導員視窗', async () => {
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('新來的');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => {
      expect(useTownStore.getState().facility).toBe('starter-npc');
    });
  });

  it('建立失敗時不開新手指導員', async () => {
    createCharacter.mockRejectedValueOnce(new Error('boom'));
    render(<CharacterCreate />);
    allocateAllPoints();
    typeName('倒楣鬼');

    fireEvent.click(screen.getByText('開始冒險'));

    await waitFor(() => {
      expect(screen.getByText('建立失敗，請稍後再試')).toBeDefined();
    });
    expect(useTownStore.getState().facility).toBe('list');
  });

  it('屬性點未分配完時不可建立', () => {
    render(<CharacterCreate />);
    typeName('勇者');

    fireEvent.click(screen.getByText('還有 4 點未分配'));
    expect(createCharacter).not.toHaveBeenCalled();
  });

  /**
   * 外觀（`04-character.md` § 4.10）。
   *
   * 建角時漏傳外觀不會報錯 —— 角色照樣建得起來，只是所有人長一樣。
   * 所以測到「傳出去的那份就是畫面上選的那份」為止。
   */
  describe('外觀', () => {
    it('沒動外觀時帶預設值出去', async () => {
      render(<CharacterCreate />);
      allocateAllPoints();
      typeName('勇者');
      fireEvent.click(screen.getByText('開始冒險'));

      await waitFor(() => expect(createCharacter).toHaveBeenCalled());
      expect(createCharacter.mock.calls[0][3]).toEqual(createDefaultAppearance());
    });

    it('選過的髮型與顏色會跟著建角一起送出去', async () => {
      render(<CharacterCreate />);
      allocateAllPoints();
      typeName('勇者');

      fireEvent.click(screen.getByText('長雙馬尾'));
      fireEvent.click(screen.getByText('睫毛'));       // 外觀的控制項分頁
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByText('開始冒險'));

      await waitFor(() => expect(createCharacter).toHaveBeenCalled());
      const appearance = createCharacter.mock.calls[0][3]!;
      expect(appearance.hair).toBe('twinlong');
      expect(appearance.lash.on).toBe(1);
    });

    it('送出去的外觀一定是合法的', async () => {
      render(<CharacterCreate />);
      allocateAllPoints();
      typeName('勇者');
      fireEvent.click(screen.getByText('隨機'));
      fireEvent.click(screen.getByText('開始冒險'));

      await waitFor(() => expect(createCharacter).toHaveBeenCalled());
      const appearance = createCharacter.mock.calls[0][3]!;
      expect(normalizeAppearance(appearance)).toEqual(appearance);
    });
  });

});
