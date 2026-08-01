import { describe, expect, it } from 'vitest';
import { REGIONS, getRegionsByZone } from '../mapData';

/**
 * 導覽分組：同組的 region 在地圖選單裡收成一個入口，點進去才列出各段。
 * 這只影響導覽層級——region id 不變，掉落／怪物／任務／存檔一律照舊。
 */
describe('區域導覽分組', () => {
  it('百柱塔十個區段都掛在同一組', () => {
    const segments = REGIONS.filter(r => r.id.startsWith('hundred-pillar-'));
    expect(segments).toHaveLength(10);
    for (const r of segments) {
      expect(r.group, r.id).toEqual({ id: 'hundred-pillar', name: '百柱塔' });
    }
  });

  it('分組不改變 region id——掉落與任務的對應不受影響', () => {
    const ids = REGIONS.filter(r => r.group?.id === 'hundred-pillar').map(r => r.id);
    expect(ids).toContain('hundred-pillar-1-10f');
    expect(ids).toContain('hundred-pillar-91-100f');
  });

  it('灰脊山脈的清單收合後從 12 個入口變成 3 個', () => {
    const regions = getRegionsByZone('grey-ridge');
    const collapsed = new Set(regions.map(r => r.group?.id ?? r.id));
    expect(regions.length).toBe(12);
    expect(collapsed.size).toBe(3);          // 遠古戰場 + 百柱塔(收合) + 遠古地監
  });

  it('其他區域沒有分組，維持原本的平鋪', () => {
    const others = REGIONS.filter(r => !r.id.startsWith('hundred-pillar-'));
    expect(others.every(r => r.group === undefined)).toBe(true);
  });

  it('每個區段各自的通行卷軸需求保留不變', () => {
    const second = REGIONS.find(r => r.id === 'hundred-pillar-11-20f');
    expect(second?.entryScrollName).toBe('百柱塔 11F 通行卷軸');
    const first = REGIONS.find(r => r.id === 'hundred-pillar-1-10f');
    expect(first?.entryScrollName).toBeUndefined();   // 第一段不需卷軸
  });
});
