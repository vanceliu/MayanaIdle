/** 怪物外框（`38-map-control.md` § 38.9 第二代背景 render） */
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { GEN2_STYLE } from '../../backgroundRender';
import { MonsterEntity } from '../MonsterEntity';

/** 子層裡由 8 個剪影組成的外框 */
function outlinesIn(container: Container): Container[] {
  return container.children.filter(c => c.children.length === 8 && c.children.every(s => s instanceof Graphics)) as Container[];
}

function silhouetteOffset(outline: Container): number {
  return Math.max(...outline.children.map(s => Math.hypot(s.x, s.y)));
}

describe('怪物外框', () => {
  it('不給樣式時不畫外框（第一代背景 render）', () => {
    const m = new MonsterEntity('m', true, 'small', null);
    expect(outlinesIn(m.container)).toHaveLength(0);
    m.destroy();
  });

  it('球體外框插在球體正下方，粗細同背景物', () => {
    const m = new MonsterEntity('m', false, 'small', GEN2_STYLE);
    const [outline] = outlinesIn(m.container);
    expect(outline).toBeDefined();
    expect(silhouetteOffset(outline)).toBeCloseTo(GEN2_STYLE.objectOutlineWidth);
    m.destroy();
  });

  it('Boss 的角與血條各有外框，血條外框較細', () => {
    const m = new MonsterEntity('b', true, 'small', GEN2_STYLE);
    const overhead = m.container.children[m.container.children.length - 1] as Container;
    expect(outlinesIn(overhead)).toHaveLength(1);
    const healthBar = overhead.children.find(c => outlinesIn(c).length === 1)!;
    const [barOutline] = outlinesIn(healthBar);
    expect(silhouetteOffset(barOutline)).toBeCloseTo(GEN2_STYLE.hpBarOutlineWidth);
    expect(GEN2_STYLE.hpBarOutlineWidth).toBeLessThan(GEN2_STYLE.objectOutlineWidth);
    m.destroy();
  });

  it('體型改變後外框跟著球體變大', () => {
    const m = new MonsterEntity('m', false, 'small', GEN2_STYLE);
    const [outline] = outlinesIn(m.container);
    const before = outline.getLocalBounds().height;
    m.setSize('large');
    expect(outline.getLocalBounds().height).toBeGreaterThan(before);
    m.destroy();
  });
});
