import { describe, it, expect } from 'vitest';
import { describeInitError } from '../../App';

/**
 * 開機失敗必須給出玩家看得懂、且指得出下一步的訊息。
 * 遊戲資料全在 server（`97-selfhosted-server.md` § 97.5），開機唯一會擋住人的是連不上 server。
 */
describe('describeInitError', () => {
  it('連不上 server：指出要先啟動 server、確認網址', () => {
    const text = describeInitError(new Error('連不上遊戲 server'));
    expect(text).toContain('server');
    expect(text).toContain('啟動');
  });

  it('其他錯誤保留原始訊息，方便回報', () => {
    expect(describeInitError(new Error('something broke'))).toContain('something broke');
  });

  it('非 Error 物件也不會拋錯', () => {
    expect(describeInitError('壞掉了')).toContain('壞掉了');
    expect(describeInitError(null)).toBeTypeOf('string');
  });
});
