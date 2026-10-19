import { describe, it, expect } from 'vitest';
import { clientAddress } from '../clientAddress';

/** 來源 IP 與 `trust-proxy`（`97-selfhosted-server.md` § 97.2） */
describe('clientAddress', () => {
  const req = (headers: Record<string, string | string[]> = {}) => ({ socket: { remoteAddress: '10.0.0.1' }, headers }) as never;

  it('trust-proxy 關閉時忽略 X-Forwarded-For', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '1.2.3.4' }), false)).toBe('10.0.0.1');
  });

  it('trust-proxy 開啟時取 X-Forwarded-For 最右一筆', () => {
    expect(clientAddress(req({ 'x-forwarded-for': '9.9.9.9, 1.2.3.4' }), true)).toBe('1.2.3.4');
    expect(clientAddress(req({ 'x-forwarded-for': ['9.9.9.9', '1.2.3.4 '] }), true)).toBe('1.2.3.4');
  });

  it('trust-proxy 開啟但沒有該 header 時用連線對端', () => {
    expect(clientAddress(req(), true)).toBe('10.0.0.1');
    expect(clientAddress(req({ 'x-forwarded-for': ' , ' }), true)).toBe('10.0.0.1');
  });
});
