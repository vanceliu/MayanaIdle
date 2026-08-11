import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
  * 介面風格 token 的回歸測試（`34-ui-guidelines.md` § 34.10）。
  * jsdom 不套用樣式表，因此與 `hudBand.test.ts` 一樣以原始碼斷言把守。
  */
const APP_CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8');

/** 取 `:root` 第一個區塊裡某個 token 的值 */
function token(name: string): string {
  const m = APP_CSS.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token ${name} 不存在`);
  return m[1].trim();
}

function relativeLuminance(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  const channels = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('邊框 token', () => {
  it('容器邊框一律走 --border-width / --outline-dark，不再寫死 px 與 border 色 token', () => {
    expect(APP_CSS).not.toMatch(/border: *[0-9.]+px +(solid|dashed) +var\(--border(-subtle)?\)/);
    expect(APP_CSS).toContain('--border-width: 1.75px;');
    expect(APP_CSS).toContain('--outline-base: #4A4585;');
  });

  it('--border-dim 已經清掉（它從來沒有被定義過，border 會退回 currentColor）', () => {
    expect(APP_CSS).not.toContain('--border-dim');
  });

  it('HUD 玻璃底走 --glass-rgb，且維持原本的明度', () => {
    expect(APP_CSS).not.toContain('rgba(18, 18, 30');
    expect(APP_CSS).toMatch(/--glass-rgb:\s*16,\s*16,\s*32;/);
    expect(relativeLuminance('#101020')).toBeLessThan(relativeLuminance(token('--bg-panel')));
  });
});

describe('分區色相', () => {
  it('五個區色就是既有的 accent，不新增色票', () => {
    expect(token('--area-char')).toBe('var(--accent-primary)');
    expect(token('--area-nav')).toBe('var(--accent-info)');
    expect(token('--area-town')).toBe('var(--accent-success)');
    expect(token('--area-battle')).toBe('var(--accent-danger)');
    expect(token('--area-item')).toBe('var(--accent-gold)');
  });

  it('區色只上容器：區內的按鈕／格子／條把描邊收回中性值', () => {
    const block = APP_CSS.match(
      /\.status-panel \.bar,\s*\n\.panel-dock \.panel-dock-btn,\s*\n\.town-npc-btn,\s*\n\.quick-slot,\s*\n\.shop-item\s*\{([^}]*)\}/
    );
    expect(block, '規矩 1 的重設規則不見了').toBeTruthy();
    expect(block![1]).toContain('--outline-dark: var(--outline-base)');
  });

  it('村莊列不加容器框（浮在地圖上的一排按鈕，框起來等於憑空生出容器）', () => {
    const block = APP_CSS.match(/\n\.town-npc-bar \{([^}]*)\}/);
    expect(block).toBeTruthy();
    expect(block![1]).not.toMatch(/(^|\s)border:/);
  });

  it('村莊綠落在 active 的設施鈕上', () => {
    const block = APP_CSS.match(/\.town-npc-btn\.active \{([^}]*)\}/);
    expect(block).toBeTruthy();
    expect(block![1]).toContain('border-color: var(--area)');
  });
});

describe('文字對比（WCAG 4.5:1）', () => {
  it('--text-dim 在卡片底上讀得到 —— 它用在 .npc-label、.quick-slot-key', () => {
    expect(contrast(token('--text-dim'), token('--bg-card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('--text-secondary 與 --text-primary 同樣過關', () => {
    expect(contrast(token('--text-secondary'), token('--bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--text-primary'), token('--bg-card'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('數量徽章', () => {
  it('底色不可是 --accent-primary —— 那是 .panel-dock-btn.active 的背景色', () => {
    expect(token('--badge-bg')).not.toContain('--accent-primary');
  });

  it('金底深字過 4.5:1（原本白字在紫底只有 2.7:1）', () => {
    expect(contrast(token('--accent-gold'), token('--badge-fg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('字級吃 --fs-xs，不寫死 px（否則文字放大時只有它不變，違反 § 34.6）', () => {
    const block = APP_CSS.match(/\.quest-tracker-btn \.quest-count-badge \{([^}]*)\}/);
    expect(block).toBeTruthy();
    expect(block![1]).toContain('font-size: var(--fs-xs)');
  });
});

describe('設施列不因加粗邊框而換行', () => {
  it('設施鈕左右 padding 收成 7px，抵掉加粗邊框多佔的寬度', () => {
    const block = APP_CSS.match(/\n\.town-npc-btn \{([^}]*)\}/);
    expect(block).toBeTruthy();
    expect(block![1]).toContain('padding: 6px 7px');
  });
});

describe('面板按鈕分組', () => {
  it('組間間隔只在 >1200px 給 —— 以下是圖示模式，空間會把徽章擠出去', () => {
    expect(APP_CSS).toMatch(
      /@media \(min-width: 1201px\) \{\s*\n\s*\.hud-bottomright \{ --dock-group-gap: 16px; \}/
    );
  });

  it('間隔掛在任務鈕自己的 class 上，不用 :nth-child', () => {
    expect(APP_CSS).toContain('.panel-dock > .quest-tracker-btn { margin-left: var(--dock-group-gap, 0px); }');
  });
});
