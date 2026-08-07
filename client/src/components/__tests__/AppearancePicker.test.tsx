import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { AppearancePicker } from '../AppearancePicker';
import {
  createDefaultAppearance,
  normalizeAppearance,
  MIN_EYE_CONTRAST,
  contrastRatio,
  HAIR_TUNABLES,
  LASH_TUNABLES,
  HAIR_STYLES,
  SKIN_TONES,
  PALETTE,
  PALETTE_ROWS,
  type Appearance,
} from '../../models/appearance';

/**
 * @vitest-environment jsdom
 *
 * 創角的外觀區塊（`04-character.md` § 4.10）。
 *
 * jsdom 沒有 canvas，`getContext('2d')` 會回 null —— 元件本身就要撐得住
 * （預覽畫不出來不該讓整個創角畫面掛掉），所以這裡不 mock 它，直接讓它回 null。
 */

/** 受控元件，測互動要有人幫它把 onChange 接回 value */
function Harness({ onValue }: { onValue?: (a: Appearance) => void }) {
  const [value, setValue] = useState<Appearance>(createDefaultAppearance);
  return (
    <AppearancePicker
      value={value}
      onChange={(next) => { setValue(next); onValue?.(next); }}
    />
  );
}

describe('AppearancePicker', () => {
  let latest: Appearance | null = null;
  const capture = vi.fn((a: Appearance) => { latest = a; });

  beforeEach(() => {
    latest = null;
    capture.mockClear();
  });

  it('沒有 canvas 也畫得出畫面，不拋錯', () => {
    expect(() => render(<Harness />)).not.toThrow();
  });

  it('13 個髮型全部列出來', () => {
    render(<Harness />);
    for (const h of HAIR_STYLES) {
      expect(screen.getByText(h.label), h.label).toBeDefined();
    }
  });

  it('四個朝向都能切', () => {
    render(<Harness />);
    for (const label of ['正面', '右', '左', '背面']) {
      expect(screen.getByText(label)).toBeDefined();
    }
    fireEvent.click(screen.getByText('背面'));
    expect(screen.getByText('背面').className).toContain('active');
  });

  it('選髮型會換掉 appearance.hair', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('長雙馬尾'));
    expect(latest!.hair).toBe('twinlong');
  });

  it('微調寫進該髮型自己的 tune，不影響別的髮型', () => {
    render(<Harness onValue={capture} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '60' } });

    expect(latest!.tune[latest!.hair]?.[HAIR_TUNABLES[0].key]).toBe(60);
    expect(Object.keys(latest!.tune)).toEqual([latest!.hair]);
  });

  it('換髮型後微調是另一組 —— 每個髮型各自獨立', () => {
    render(<Harness onValue={capture} />);
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '60' } });
    const firstHair = latest!.hair;

    fireEvent.click(screen.getByText('麻花辮'));
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '25' } });

    expect(latest!.tune[firstHair]?.[HAIR_TUNABLES[0].key]).toBe(60);
    expect(latest!.tune.braid?.[HAIR_TUNABLES[0].key]).toBe(25);
  });

  /** 沒有睫毛時那幾根滑桿調什麼都不會有反應，留著只會讓人以為壞了 */
  /**
   * 控制項分成髮型／睫毛／顏色三頁。全部攤開的話光外觀就比左半邊還高，
   * 而左欄下半是空的 —— 一次只顯示一組，整頁高度被最高的那組壓住。
   */
  it('一次只顯示一組控制項', () => {
    render(<Harness />);
    /* 髮型頁：只有髮型的 4 根滑桿，看不到調色盤也沒有勾選框 */
    expect(screen.getAllByRole('slider')).toHaveLength(HAIR_TUNABLES.length);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText(PALETTE[0])).toBeNull();

    fireEvent.click(screen.getByText('顏色'));
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.getByLabelText(PALETTE[0])).toBeDefined();
  });

  it('沒勾睫毛時不顯示睫毛的滑桿，勾了才出現', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('睫毛'));
    expect(screen.queryAllByRole('slider')).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(latest!.lash.on).toBe(1);
    expect(screen.getAllByRole('slider')).toHaveLength(LASH_TUNABLES.length);
  });

  it('取消勾選會把睫毛滑桿收回去', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('睫毛'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(latest!.lash.on).toBe(0);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });

  it('膚色點下去會換色', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(SKIN_TONES[5]));
    expect(latest!.skin).toBe(SKIN_TONES[5]);
  });

  /**
   * 髮色／眼色／衣色共用同一張調色盤，所以要先選改哪個再點顏色。
   * 三個各鋪一張完整色表的話，光顏色就佔掉整個畫面。
   */
  it('調色盤只出現一次，不是三個顏色各一張', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('顏色'));
    for (const c of PALETTE) {
      expect(screen.getAllByLabelText(c), c).toHaveLength(1);
    }
  });

  it('預設先改髮色', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[9][2]));
    expect(latest!.hairColor).toBe(PALETTE_ROWS[9][2]);
  });

  it('切到眼色之後點的顏色只改眼色', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByText('眼色'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[7][1]));

    expect(latest!.eyeColor).toBe(PALETTE_ROWS[7][1]);
    expect(latest!.hairColor).not.toBe(PALETTE_ROWS[7][1]);
  });

  it('切到衣色之後點的顏色只改衣色', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByText('衣色（內衣）'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[4][2]));

    expect(latest!.cloth).toBe(PALETTE_ROWS[4][2]);
    expect(latest!.hairColor).not.toBe(PALETTE_ROWS[4][2]);
  });

  /**
   * 眼珠在遊戲內只有 1～2 px，對比不足等於那個角色沒有眼睛。
   * 在放大的預覽上看不出來，所以要用文字講。
   */
  it('眼色在膚色上看不見時給出警告', () => {
    render(<Harness onValue={capture} />);

    /* 最深的膚色配最深的眼色 —— 一定不足 */
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(SKIN_TONES[SKIN_TONES.length - 1]));
    fireEvent.click(screen.getByText('眼色'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[0][0]));

    expect(contrastRatio(latest!.eyeColor, latest!.skin)).toBeLessThan(MIN_EYE_CONTRAST);
    expect(screen.getByText(/幾乎看不見/)).toBeDefined();
  });

  it('對比足夠時不出現警告', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(SKIN_TONES[SKIN_TONES.length - 1]));
    fireEvent.click(screen.getByText('眼色'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[0][5]));

    expect(screen.queryByText(/幾乎看不見/)).toBeNull();
    expect(screen.getByText(/仍看得出眼睛/)).toBeDefined();
  });

  it('隨機出來的外觀一定合法，而且眼睛看得見', () => {
    render(<Harness onValue={capture} />);
    for (let i = 0; i < 30; i++) {
      fireEvent.click(screen.getByText('隨機'));
      expect(normalizeAppearance(latest!)).toEqual(latest!);
      expect(contrastRatio(latest!.eyeColor, latest!.skin)).toBeGreaterThanOrEqual(MIN_EYE_CONTRAST);
    }
  });

  it('回到預設只清微調與睫毛形狀，不動已經選好的髮型與顏色', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('丸子頭'));
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '60' } });
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(SKIN_TONES[4]));
    fireEvent.click(screen.getByText('髮型'));

    fireEvent.click(screen.getByText('回到預設'));

    expect(latest!.hair).toBe('bun');
    expect(latest!.skin).toBe(SKIN_TONES[4]);
    expect(latest!.tune.bun).toEqual({});
  });

  it('全程產出的外觀都通得過驗證', () => {
    render(<Harness onValue={capture} />);
    fireEvent.click(screen.getByText('長髮'));
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '70' } });
    fireEvent.click(screen.getByText('睫毛'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('顏色'));
    fireEvent.click(screen.getByLabelText(PALETTE_ROWS[6][3]));

    expect(normalizeAppearance(latest!)).toEqual(latest!);
  });
});
