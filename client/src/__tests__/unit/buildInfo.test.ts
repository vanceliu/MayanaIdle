import { describe, it, expect } from 'vitest';
import { BUILD_INFO, formatBuildLabel, formatBuildTime } from '../../buildInfo';

/**
 * 建置資訊在 vitest 下沒有 vite 的 define，必須安全退回而不是拋 ReferenceError。
 */
describe('buildInfo', () => {
  it('缺少注入值時退回 dev 而不拋錯', () => {
    expect(BUILD_INFO.version).toBe('dev');
    expect(BUILD_INFO.commit).toBe('dev');
  });

  it('標籤格式為 v<版本> · <commit>', () => {
    expect(formatBuildLabel()).toBe('dev · dev');
  });

  it('沒有建置時間時顯示開發模式', () => {
    expect(formatBuildTime()).toBe('開發模式');
  });
});
