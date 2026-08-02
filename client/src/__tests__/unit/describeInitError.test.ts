import { describe, it, expect } from 'vitest';
import { describeInitError } from '../../App';

/**
 * 開機失敗必須給出玩家看得懂、且指得出下一步的訊息（docs/RELEASE.md § 7.3）。
 */

function errorWithName(name: string, message = 'boom'): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('describeInitError', () => {
  it('Dexie VersionError：提示載到舊版程式，請重新整理', () => {
    const text = describeInitError(errorWithName('VersionError'));
    expect(text).toContain('較新版本');
    expect(text).toContain('重新整理');
  });

  it('儲存空間不足', () => {
    expect(describeInitError(errorWithName('QuotaExceededError'))).toContain('儲存空間不足');
  });

  it('無痕模式 / 封鎖網站資料', () => {
    expect(describeInitError(errorWithName('InvalidStateError'))).toContain('無痕模式');
    expect(describeInitError(errorWithName('SecurityError'))).toContain('無痕模式');
  });

  it('其他錯誤保留原始訊息，方便回報', () => {
    expect(describeInitError(new Error('something broke'))).toContain('something broke');
  });

  it('非 Error 物件也不會拋錯', () => {
    expect(describeInitError('壞掉了')).toContain('壞掉了');
    expect(describeInitError(null)).toBeTypeOf('string');
  });
});
