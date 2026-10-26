import { describe, it, expect } from 'vitest';
import { MAX_REGISTRATIONS, REGISTRATION_WINDOW_MS, RegistrationLimit } from '../registrationLimit';

/** 註冊限制（`97-selfhosted-server.md` § 97.5） */
describe('註冊限制', () => {
  function setup() {
    let now = 1_000_000;
    const limit = new RegistrationLimit(() => now);
    return { limit, advance: (ms: number) => { now += ms; } };
  }

  function register(limit: RegistrationLimit, ip: string, created = true): boolean {
    if (!limit.begin(ip)) return false;
    limit.finish(ip, created);
    return true;
  }

  it('每 IP 每 60 分鐘最多建立 2 個帳號', () => {
    const { limit } = setup();
    expect(MAX_REGISTRATIONS).toBe(2);
    expect(REGISTRATION_WINDOW_MS).toBe(60 * 60 * 1000);

    expect(register(limit, 'ip')).toBe(true);
    expect(register(limit, 'ip')).toBe(true);
    expect(register(limit, 'ip')).toBe(false);
    expect(register(limit, 'other')).toBe(true);
  });

  it('滾動視窗：最早一筆滿 60 分鐘後釋出一個名額', () => {
    const { limit, advance } = setup();
    register(limit, 'ip');
    advance(10 * 60 * 1000);
    register(limit, 'ip');

    advance(50 * 60 * 1000 - 1);
    expect(limit.retryAfter('ip')).toBe(1);
    expect(register(limit, 'ip')).toBe(false);

    advance(1);
    expect(limit.retryAfter('ip')).toBe(0);
    expect(register(limit, 'ip')).toBe(true);
    expect(register(limit, 'ip')).toBe(false);
  });

  it('進行中的註冊計入上限', () => {
    const { limit } = setup();
    const started = Array.from({ length: 30 }, () => limit.begin('ip')).filter(Boolean).length;

    expect(started).toBe(MAX_REGISTRATIONS);
    expect(limit.retryAfter('ip')).toBe(0);
  });

  it('沒有建立帳號的註冊不佔名額', () => {
    const { limit } = setup();
    for (let i = 0; i < 10; i++) expect(register(limit, 'ip', false)).toBe(true);

    expect(register(limit, 'ip')).toBe(true);
    expect(register(limit, 'ip')).toBe(true);
    expect(register(limit, 'ip')).toBe(false);
  });
});
