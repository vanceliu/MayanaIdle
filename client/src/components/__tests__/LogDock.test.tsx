// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LogDock, POSITION_KEY, OPACITY_KEY } from '../LogDock';
import {
  clampLogPosition,
  resizeLogPosition,
  loadWindowPosition,
  loadWindowOpacity,
  opacityToAlpha,
} from '../LogWindow';
import { useGameStore } from '../../stores/gameStore';
import { useChatStore } from '../../stores/chatStore';
import { useOnlineStore } from '../../net/online';

const loadLogPosition = (storage: Pick<Storage, 'getItem'>) => loadWindowPosition(POSITION_KEY, storage);
const loadLogOpacity = (storage: Pick<Storage, 'getItem'>) => loadWindowOpacity(OPACITY_KEY, storage);

describe('LogDock（可拖曳的紀錄視窗，§ 32.3.1）', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ combatLogs: [] });
  });

  describe('opacityToAlpha', () => {
    it('0~100 映射到 0~0.95', () => {
      expect(opacityToAlpha(0)).toBe(0);
      expect(opacityToAlpha(100)).toBe(0.95);
      expect(opacityToAlpha(50)).toBeCloseTo(0.475, 3);
    });

    it('超出範圍的值會被夾住，不會做出負的或大於 1 的 alpha', () => {
      expect(opacityToAlpha(-30)).toBe(0);
      expect(opacityToAlpha(400)).toBe(0.95);
    });
  });

  describe('loadLogPosition', () => {
    it('沒存過就回 null（由 CSS 的預設左下角接手）', () => {
      expect(loadLogPosition({ getItem: () => null })).toBeNull();
    });

    it('存檔壞掉不可整個炸掉，回 null 即可', () => {
      expect(loadLogPosition({ getItem: () => 'not json' })).toBeNull();
      expect(loadLogPosition({ getItem: () => '{"left":"x"}' })).toBeNull();
    });

    it('正常存檔照讀', () => {
      expect(loadLogPosition({ getItem: () => '{"left":120,"top":40}' })).toEqual({ left: 120, top: 40 });
    });
  });

  describe('clampLogPosition', () => {
    const size = { width: 420, height: 160 };
    const viewport = { width: 1000, height: 800 };

    // 與背包／技能／裝備欄同語意：整個視窗都要留在畫面內。
    // 舊版只保證露出 40px，但 .game-layout 是 overflow: hidden，
    // 拖出去的部分是被裁掉的，等於玩家能把日誌弄丟。
    it('拖出畫面右邊時，右緣貼齊畫面右側', () => {
      // 畫面寬 1000、視窗寬 420 → 最右 580
      expect(clampLogPosition({ left: 5000, top: 10 }, size, viewport).left).toBe(580);
    });

    it('拖出畫面左邊時，左緣貼齊 0（不再允許負值）', () => {
      expect(clampLogPosition({ left: -9999, top: 10 }, size, viewport).left).toBe(0);
    });

    it('上下同樣完全收在畫面內', () => {
      expect(clampLogPosition({ left: 0, top: -50 }, size, viewport).top).toBe(0);
      // 畫面高 800、視窗高 160 → 最低 640
      expect(clampLogPosition({ left: 0, top: 5000 }, size, viewport).top).toBe(640);
    });

    it('視窗比畫面大時貼齊左上，標題列不可被推出畫面', () => {
      const huge = { width: 1400, height: 1200 };
      expect(clampLogPosition({ left: 300, top: 300 }, huge, viewport)).toEqual({ left: 0, top: 0 });
    });
  });

  describe('resizeLogPosition（調整大小時往上長，不可衝出畫面底部）', () => {
    const viewport = { width: 1000, height: 800 };

    it('放大時下緣不動 —— 也就是往上長', () => {
      // 原本 top 600、高 160 → 下緣 760。放大到 400 後 top 應為 760 - 400 = 360
      expect(resizeLogPosition(760, 12, { width: 420, height: 400 }, viewport))
        .toEqual({ left: 12, top: 360 });
    });

    it('縮小時下緣同樣不動 —— 收合後不會吊在畫面中間', () => {
      expect(resizeLogPosition(760, 12, { width: 420, height: 160 }, viewport))
        .toEqual({ left: 12, top: 600 });
    });

    it('回歸：拖曳過之後放大不可往下衝出畫面', () => {
      // 拖曳過的視窗改用 top 定位，改版前放大會整片超出畫面底部
      const result = resizeLogPosition(760, 12, { width: 420, height: 560 }, viewport);
      expect(result.top + 560).toBeLessThanOrEqual(viewport.height);
    });

    it('視窗比畫面還高時貼齊上緣，不讓標題列跑到畫面外', () => {
      expect(resizeLogPosition(760, 12, { width: 420, height: 900 }, viewport).top).toBe(0);
    });

    it('左右位置不因調整大小而改變（合法範圍內）', () => {
      expect(resizeLogPosition(760, 300, { width: 420, height: 400 }, viewport).left).toBe(300);
    });
  });

  describe('loadLogOpacity', () => {
    it('沒存過或超出範圍就用預設 80', () => {
      expect(loadLogOpacity({ getItem: () => null })).toBe(80);
      expect(loadLogOpacity({ getItem: () => '150' })).toBe(80);
      expect(loadLogOpacity({ getItem: () => 'abc' })).toBe(80);
    });

    it('存過就照讀', () => {
      expect(loadLogOpacity({ getItem: () => '30' })).toBe(30);
    });
  });

  it('預設停在左下角（沒有 inline 定位，也沒有 is-moved）', () => {
    const { container } = render(<LogDock />);
    const win = container.querySelector('.combat-log-window') as HTMLElement;

    expect(win.className).not.toContain('is-moved');
    expect(win.style.left).toBe('');
    expect(win.style.top).toBe('');
  });

  it('標題列只有標題與 ⚙ 按鈕，設定收在下拉選單裡（預設關閉）', () => {
    const { container } = render(<LogDock />);

    expect(container.querySelector('.combat-log-title')?.textContent).toContain('戰鬥紀錄');
    expect(screen.getByLabelText('戰鬥紀錄視窗設定')).toBeTruthy();
    expect(container.querySelector('.log-menu')).toBeNull();
  });

  it('點 ⚙ 展開選單，裡面有透明度與回到預設位置', () => {
    const { container } = render(<LogDock />);

    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));

    expect(container.querySelector('.log-menu')).toBeTruthy();
    expect(screen.getByLabelText('戰鬥紀錄背景透明度')).toBeTruthy();
    expect(screen.getByText('回到預設位置')).toBeTruthy();
  });

  it('調整透明度會寫進 localStorage 並反映在 --log-alpha', () => {
    const { container } = render(<LogDock />);
    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));

    fireEvent.change(screen.getByLabelText('戰鬥紀錄背景透明度'), { target: { value: '40' } });

    const win = container.querySelector('.combat-log-window') as HTMLElement;
    expect(localStorage.getItem('mayana.combatLogOpacity')).toBe('40');
    expect(win.style.getPropertyValue('--log-alpha')).toBe(String(opacityToAlpha(40)));
  });

  it('「回到預設位置」清掉存檔並回到左下角', () => {
    localStorage.setItem('mayana.combatLogPos', '{"left":500,"top":100}');
    const { container } = render(<LogDock />);
    const win = () => container.querySelector('.combat-log-window') as HTMLElement;

    expect(win().className).toContain('is-moved');

    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));
    fireEvent.click(screen.getByText('回到預設位置'));

    expect(localStorage.getItem('mayana.combatLogPos')).toBeNull();
    expect(win().className).not.toContain('is-moved');
  });

  it('▲ 循環三段大小：原大小 → 40vh → 70vh → 原大小', () => {
    const { container } = render(<LogDock />);
    const btn = container.querySelector('.log-resize-btn')!;
    const wrap = () => container.querySelector('.bottom-log-wrap')!.className;

    expect(wrap()).toContain('log-size-0');
    fireEvent.click(btn);
    expect(wrap()).toContain('log-size-1');
    fireEvent.click(btn);
    expect(wrap()).toContain('log-size-2');
    fireEvent.click(btn);
    expect(wrap()).toContain('log-size-0');
  });
});

/**
 * 分頁（§ 32.3.1）：戰鬥紀錄與聊天在同一個視窗，各自的緩衝與捲動位置獨立。
 * 兩者的產生速率差兩個數量級，合成一串等於戰鬥把聊天洗掉。
 */
describe('LogDock 分頁', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ combatLogs: [] });
    useChatStore.getState().reset();
    useChatStore.getState().setPanelOpen(false);
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
  });

  afterEach(() => useOnlineStore.setState({ enabled: false, status: 'offline', worldMode: null }));

  const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });

  it('線上有兩個分頁，預設停在戰鬥紀錄', () => {
    render(<LogDock />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['戰鬥紀錄', '聊天']);
    expect(tab('戰鬥紀錄').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByLabelText('聊天輸入')).toBeNull();
  });

  it('切到聊天分頁換內容，輸入列跟著出現', () => {
    render(<LogDock />);
    fireEvent.click(tab('聊天'));

    expect(tab('聊天').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('聊天輸入')).toBeTruthy();
    expect(screen.queryByText('目前沒有戰鬥紀錄')).toBeNull();
  });

  it('沒連 server 就沒有聊天分頁，標題列退回單純的標題', () => {
    useOnlineStore.setState({ enabled: false, status: 'offline', worldMode: null });
    const { container } = render(<LogDock />);

    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(container.querySelector('.combat-log-title')?.textContent).toContain('戰鬥紀錄');
  });

  // 單機世界照樣連著 server，所以不能只看有沒有連線（§ 97.1）
  it('單機形態沒有聊天分頁', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'solo' });
    render(<LogDock />);

    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.queryByLabelText('聊天輸入')).toBeNull();
  });

  it('停在戰鬥分頁時聊天累加未讀，切過去歸零', () => {
    render(<LogDock />);
    act(() => {
      useChatStore.getState().receive({ id: 1, channel: 'world', from: { characterId: 2, name: 'A' }, text: '嗨', at: 1 });
      useChatStore.getState().receive({ id: 2, channel: 'world', from: { characterId: 2, name: 'A' }, text: '在嗎', at: 2 });
    });

    expect(tab('聊天').textContent).toContain('2');

    fireEvent.click(tab('聊天'));
    expect(useChatStore.getState().unread).toBe(0);
    expect(tab('聊天').textContent).not.toContain('2');
  });

  it('人在聊天分頁時不累加未讀', () => {
    render(<LogDock />);
    fireEvent.click(tab('聊天'));
    act(() => {
      useChatStore.getState().receive({ id: 3, channel: 'world', from: { characterId: 2, name: 'A' }, text: '嗨', at: 3 });
    });

    expect(useChatStore.getState().unread).toBe(0);
  });

  it('斷線時退回戰鬥分頁，不會停在空白的聊天上', () => {
    const { rerender } = render(<LogDock />);
    fireEvent.click(tab('聊天'));

    act(() => { useOnlineStore.setState({ status: 'connecting' }); });
    rerender(<LogDock />);

    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByText('目前沒有戰鬥紀錄')).toBeTruthy();
  });
});
