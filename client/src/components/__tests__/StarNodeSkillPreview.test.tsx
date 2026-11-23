/**
 * @vitest-environment jsdom
 *
 * 星盤技能節點的技能預覽（`56-star-chart.md` § 56.5）：顯示點下後的實際數值。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StarNodeSkillPreview } from '../StarNodeSkillPreview';
import { STAR_NODE_BY_ID } from '../../models/starChart';

afterEach(cleanup);

const preview = (nodeId: string, allocated: string[], classId: 'elf' | 'knight' = 'elf') =>
  render(<StarNodeSkillPreview node={STAR_NODE_BY_ID.get(nodeId)!} classId={classId} allocated={new Set(allocated)} />).container;

describe('StarNodeSkillPreview', () => {
  it('火矢附魔點到 II：額外火傷 +10、持續 200 秒、冷卻 10s，變動數字標黃', () => {
    const el = preview('elf-magic1-level0', ['elf-start', 'elf-magic1-boost0']);
    expect(el.textContent).toContain('火矢附魔(II)');
    expect(el.textContent).toContain('弓額外 +10 火傷害');
    expect(el.textContent).toContain('持續: 200 秒');
    expect(el.textContent).toContain('冷卻: 10s');
    expect(el.textContent).not.toContain('×');
    expect(el.querySelector('.stat-changed')).not.toBeNull();
  });

  it('盾擊點到 II：物理段依角色數值顯示數字、暈眩 1s', () => {
    const node = STAR_NODE_BY_ID.get('knight-magic0-level0')!;
    const el = render(
      <StarNodeSkillPreview node={node} classId="knight" allocated={new Set(['knight-start'])} physicalOf={scale => Math.floor(150 * scale)} />,
    ).container;
    expect(el.textContent).toContain('威力: 32 + 90');
    expect(el.textContent).toContain('1s／持盾 2s');
  });

  it('沒有角色資料時物理段寫「物理傷害」；血濺咒殺點到 II 打 2 下、扣 20%', () => {
    expect(preview('knight-magic0-level0', ['knight-start'], 'knight').textContent).toContain('威力: 32 + 物理傷害');
    const curse = preview('knight-magic5-level0', ['knight-start'], 'knight').textContent;
    expect(curse).toContain('威力: 40');
    expect(curse).toContain('扣自身最大 HP 20%，對 4 格內隨機打 2 下');
  });

  it('非技能節點與他職業的技能節點不顯示', () => {
    expect(preview('elf-hub', ['elf-start']).textContent).toBe('');
    expect(preview('knight-magic0-level0', ['elf-start']).textContent).toBe('');
  });
});
