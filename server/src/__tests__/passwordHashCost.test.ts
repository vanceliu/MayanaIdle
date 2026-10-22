import { describe, it, expect, afterEach } from 'vitest';
import { PASSWORD_HASH_COST, hashPassword, setPasswordHashCost, verifyPassword } from '../auth';

const TEST_COST = { iterations: 1, memorySize: 8 };

/** 密碼雜湊成本（`97-selfhosted-server.md` § 97.5）：測試 setup 降成本，正式參數不變 */
describe('密碼雜湊成本', () => {
  afterEach(() => setPasswordHashCost(TEST_COST));

  it('正式參數：argon2id、64 MiB、3 次迭代', async () => {
    setPasswordHashCost(PASSWORD_HASH_COST);
    const hash = await hashPassword('secret-1');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword('secret-1', hash)).toBe(true);
  });

  it('雜湊自帶參數：不同成本產生的雜湊都驗得過', async () => {
    const cheap = await hashPassword('secret-2');
    setPasswordHashCost(PASSWORD_HASH_COST);
    expect(await verifyPassword('secret-2', cheap)).toBe(true);
    expect(await verifyPassword('wrong', cheap)).toBe(false);
  });
});
