import { describe, it, expect } from 'vitest';
import { appearanceSvg } from '../pawnSvg';
import { createDefaultAppearance } from '../../../client/src/models/appearance';

const viewBox = (svg: string) => svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);

describe('角色外觀 SVG（`97-selfhosted-server.md` § 97.8）', () => {
  it('四個朝向排成一列，viewBox 為有限數值', () => {
    const svg = appearanceSvg(createDefaultAppearance());
    const [, , w, h] = viewBox(svg);
    expect(viewBox(svg).every(Number.isFinite)).toBe(true);
    expect(w).toBeGreaterThan(h * 2);
    expect(svg).toContain('<path ');
  });

  it('外觀不同畫出來就不同；顏色取自外觀', () => {
    const base = createDefaultAppearance();
    const other = { ...base, hair: 'twinlong' as const, hairColor: '#ff0000' };
    expect(appearanceSvg(other)).not.toBe(appearanceSvg(base));
    expect(appearanceSvg(other)).toContain('fill="#ff0000"');
  });

  it('沒有外觀資料的舊角色畫預設外觀', () => {
    expect(appearanceSvg(undefined)).toBe(appearanceSvg(createDefaultAppearance()));
  });
});
