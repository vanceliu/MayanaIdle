// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useSettingsStore,
  normalizeScale,
  applyDisplaySettings,
  getElementScale,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_DEFAULT,
} from '../settingsStore';

describe('normalizeScale', () => {
  it('夾在 80%~150% 之間', () => {
    expect(normalizeScale(0.5)).toBe(SCALE_MIN);
    expect(normalizeScale(3)).toBe(SCALE_MAX);
  });

  it('對齊 5% 級距並消掉浮點誤差', () => {
    expect(normalizeScale(1.13)).toBe(1.15);
    expect(normalizeScale(1.1500000000000001)).toBe(1.15);
    expect(normalizeScale(0.97)).toBe(0.95);
  });

  it('字串（localStorage 讀回來的形態）照樣接受', () => {
    expect(normalizeScale('1.25')).toBe(1.25);
  });

  it('非數值一律回預設，不讓壞掉的設定擋住開機', () => {
    expect(normalizeScale('abc')).toBe(SCALE_DEFAULT);
    expect(normalizeScale(null)).toBe(SCALE_DEFAULT);
    expect(normalizeScale(NaN)).toBe(SCALE_DEFAULT);
  });
});

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().setLinkScales(false);
    useSettingsStore.getState().resetDisplaySettings();
    document.documentElement.style.removeProperty('--ui-scale');
    document.documentElement.style.removeProperty('--font-scale');
  });

  it('設定介面倍率會寫進 localStorage 與 CSS 變數', () => {
    useSettingsStore.getState().setUiScale(1.25);

    expect(useSettingsStore.getState().uiScale).toBe(1.25);
    expect(localStorage.getItem('mayana_ui_scale')).toBe('1.25');
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');
  });

  it('文字倍率與介面倍率互相獨立', () => {
    useSettingsStore.getState().setUiScale(0.9);
    useSettingsStore.getState().setFontScale(1.4);

    expect(useSettingsStore.getState().uiScale).toBe(0.9);
    expect(useSettingsStore.getState().fontScale).toBe(1.4);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.9');
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.4');
  });

  it('超出範圍的輸入會被夾住後才存', () => {
    useSettingsStore.getState().setUiScale(5);
    expect(useSettingsStore.getState().uiScale).toBe(SCALE_MAX);
    expect(localStorage.getItem('mayana_ui_scale')).toBe(String(SCALE_MAX));
  });

  it('連動模式會存進 localStorage，兩個倍率同步變動', () => {
    useSettingsStore.getState().setLinkScales(true);
    useSettingsStore.getState().setUiScale(1.35);

    expect(localStorage.getItem('mayana_scale_linked')).toBe('true');
    expect(useSettingsStore.getState().fontScale).toBe(1.35);
    expect(localStorage.getItem('mayana_font_scale')).toBe('1.35');

    useSettingsStore.getState().setLinkScales(false);
    useSettingsStore.getState().setUiScale(1);
    expect(useSettingsStore.getState().fontScale).toBe(1.35);
  });

  it('重設把兩個倍率與 CSS 變數都拉回 100%', () => {
    useSettingsStore.getState().setUiScale(1.5);
    useSettingsStore.getState().setFontScale(0.8);

    useSettingsStore.getState().resetDisplaySettings();

    expect(useSettingsStore.getState().uiScale).toBe(SCALE_DEFAULT);
    expect(useSettingsStore.getState().fontScale).toBe(SCALE_DEFAULT);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1');
    expect(localStorage.getItem('mayana_font_scale')).toBe('1');
  });
});

describe('applyDisplaySettings', () => {
  it('把倍率寫成 CSS 變數，樣式端只讀變數', () => {
    applyDisplaySettings(1.2, 0.85);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.2');
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.85');
  });
});

describe('getElementScale', () => {
  it('沒有元素時回 1', () => {
    expect(getElementScale(null)).toBe(1);
  });

  it('版面寬度為 0（jsdom 預設）時回 1，不會產生 NaN 讓拖曳壞掉', () => {
    const el = document.createElement('div');
    expect(getElementScale(el)).toBe(1);
  });

  it('渲染寬度與版面寬度的比值就是縮放比', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 200 });
    el.getBoundingClientRect = () => ({ width: 250, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
    expect(getElementScale(el)).toBe(1.25);
  });
});
