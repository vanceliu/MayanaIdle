// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent, screen } from '@testing-library/react';
import { ScriptEditorContent } from '../ScriptEditorPanel';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../../models/scriptTemplate';

/**
 * 自動天賦視窗的捲動契約（`16-tech-frontend-architecture.md` § 32.3）。
 *
 * `.floating-window.is-script .floating-window-body` 是 `overflow: hidden` 的 flex 容器，
 * 捲動必須發生在分頁內容自己身上。四個分頁的根元素 class 不同，CSS 漏列任何一個，
 * 那一頁就會溢出被裁掉而且沒有捲軸 —— jsdom 量不到版面，改用「CSS 有沒有涵蓋到
 * 實際渲染出來的 class」來守。
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');

/** 從 App.css 取出 `.floating-window.is-script` 底下設了 `overflow-y: auto` 的 class */
function scrollableClasses(): Set<string> {
  const blocks = CSS.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const found = new Set<string>();
  for (const block of blocks) {
    const [selector, body] = block.split('{');
    if (!/overflow-y:\s*auto/.test(body)) continue;
    for (const part of selector.split(',')) {
      const m = part.trim().match(/^\.floating-window\.is-script\s+\.([\w-]+)$/);
      if (m) found.add(m[1]);
    }
  }
  return found;
}

const TABS = ['常駐', '戰鬥', '補給', '天賦合成'] as const;

describe('自動天賦視窗的分頁捲動', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: null,
      scriptTemplates: [createDefaultTemplate()],
      activeTemplateId: DEFAULT_TEMPLATE_ID,
    });
  });

  it('CSS 確實有宣告 is-script 底下的捲動容器', () => {
    expect(scrollableClasses().size).toBeGreaterThan(0);
  });

  it.each(TABS)('「%s」分頁的內容根元素有被 CSS 指定為捲動容器', tabLabel => {
    const covered = scrollableClasses();
    const { container } = render(<ScriptEditorContent />);
    fireEvent.click(screen.getByRole('button', { name: tabLabel }));

    // 分頁內容是 ScriptEditorContent 的最後一個子節點（template 列、分頁列在前）
    const content = container.lastElementChild as HTMLElement;
    expect(content, `${tabLabel} 沒有渲染任何內容`).toBeTruthy();

    const classes = [...content.classList];
    expect(
      classes.some(c => covered.has(c)),
      `「${tabLabel}」的根元素 class [${classes.join(' ')}] 不在 App.css 的捲動規則內，這一頁會被裁掉且沒有捲軸`,
    ).toBe(true);
  });
});
