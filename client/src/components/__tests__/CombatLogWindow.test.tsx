// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CombatLogWindow,
  clampLogPosition,
  loadLogPosition,
  loadLogOpacity,
  opacityToAlpha,
} from '../CombatLogWindow';
import { useGameStore } from '../../stores/gameStore';

describe('CombatLogWindow（可拖曳的戰鬥日誌視窗，§ 32.3）', () => {
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

    it('拖出畫面右邊時至少留 40px 在畫面上', () => {
      expect(clampLogPosition({ left: 5000, top: 10 }, size, viewport).left).toBe(960);
    });

    it('拖出畫面左邊時也至少留 40px', () => {
      // 視窗寬 420，最左只能到 40 - 420 = -380
      expect(clampLogPosition({ left: -9999, top: 10 }, size, viewport).left).toBe(-380);
    });

    it('上緣不可為負、下緣至少留 40px', () => {
      expect(clampLogPosition({ left: 0, top: -50 }, size, viewport).top).toBe(0);
      expect(clampLogPosition({ left: 0, top: 5000 }, size, viewport).top).toBe(760);
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
    const { container } = render(<CombatLogWindow />);
    const win = container.querySelector('.combat-log-window') as HTMLElement;

    expect(win.className).not.toContain('is-moved');
    expect(win.style.left).toBe('');
    expect(win.style.top).toBe('');
  });

  it('標題列只有標題與 ⚙ 按鈕，設定收在下拉選單裡（預設關閉）', () => {
    const { container } = render(<CombatLogWindow />);

    expect(container.querySelector('.combat-log-title')?.textContent).toContain('戰鬥紀錄');
    expect(screen.getByLabelText('戰鬥紀錄視窗設定')).toBeTruthy();
    expect(container.querySelector('.log-menu')).toBeNull();
  });

  it('點 ⚙ 展開選單，裡面有透明度與回到預設位置', () => {
    const { container } = render(<CombatLogWindow />);

    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));

    expect(container.querySelector('.log-menu')).toBeTruthy();
    expect(screen.getByLabelText('戰鬥紀錄背景透明度')).toBeTruthy();
    expect(screen.getByText('回到預設位置')).toBeTruthy();
  });

  it('調整透明度會寫進 localStorage 並反映在 --log-alpha', () => {
    const { container } = render(<CombatLogWindow />);
    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));

    fireEvent.change(screen.getByLabelText('戰鬥紀錄背景透明度'), { target: { value: '40' } });

    const win = container.querySelector('.combat-log-window') as HTMLElement;
    expect(localStorage.getItem('mayana.combatLogOpacity')).toBe('40');
    expect(win.style.getPropertyValue('--log-alpha')).toBe(String(opacityToAlpha(40)));
  });

  it('「回到預設位置」清掉存檔並回到左下角', () => {
    localStorage.setItem('mayana.combatLogPos', '{"left":500,"top":100}');
    const { container } = render(<CombatLogWindow />);
    const win = () => container.querySelector('.combat-log-window') as HTMLElement;

    expect(win().className).toContain('is-moved');

    fireEvent.click(screen.getByLabelText('戰鬥紀錄視窗設定'));
    fireEvent.click(screen.getByText('回到預設位置'));

    expect(localStorage.getItem('mayana.combatLogPos')).toBeNull();
    expect(win().className).not.toContain('is-moved');
  });

  it('▲ 循環三段大小：原大小 → 40vh → 70vh → 原大小', () => {
    const { container } = render(<CombatLogWindow />);
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
