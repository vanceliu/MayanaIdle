import { describe, it, expect } from 'vitest';
import { buildFeedbackUrl, detectFeedbackPlatform, FEEDBACK_FORM_URL } from '../feedbackForm';

/** 回饋表單預填連結（`34-ui-guidelines.md` § 34.6「回饋」） */
describe('buildFeedbackUrl', () => {
  const params = (url: string) => new URL(url).searchParams;

  it('帶入版本、角色名稱、職業等級與平台', () => {
    const url = buildFeedbackUrl({
      version: 'v0.1.0 · a1b2c3d',
      platform: '網頁版',
      character: { name: '瑪雅 那&=?', className: 'knight', level: 60 },
    });

    expect(url.startsWith(`${FEEDBACK_FORM_URL}?`)).toBe(true);
    const p = params(url);
    expect(p.get('usp')).toBe('pp_url');
    expect(p.get('entry.1185590020')).toBe('v0.1.0 · a1b2c3d');
    expect(p.get('entry.724575202')).toBe('瑪雅 那&=?');
    expect(p.get('entry.236143254')).toBe('騎士 Lv60');
    expect(p.get('entry.1813319086')).toBe('網頁版');
  });

  it('沒有角色時不帶角色欄位', () => {
    const p = params(buildFeedbackUrl({ version: 'dev · dev', platform: '桌面版', character: null }));

    expect(p.has('entry.724575202')).toBe(false);
    expect(p.has('entry.236143254')).toBe(false);
    expect(p.get('entry.1813319086')).toBe('桌面版');
  });

  it('只帶規格列出的欄位', () => {
    const p = params(buildFeedbackUrl({
      version: 'dev · dev',
      platform: '手機',
      character: { name: 'A', className: 'elf', level: 1 },
    }));

    expect([...p.keys()].sort()).toEqual(
      ['entry.1185590020', 'entry.1813319086', 'entry.236143254', 'entry.724575202', 'usp'],
    );
  });
});

describe('detectFeedbackPlatform', () => {
  it('Electron 為桌面版，優先於手持判定', () => {
    expect(detectFeedbackPlatform('Mozilla/5.0 Chrome/130 Electron/33.0.0', true)).toBe('桌面版');
  });

  it('手持裝置為手機，其餘為網頁版', () => {
    expect(detectFeedbackPlatform('Mozilla/5.0 (iPhone) Safari', true)).toBe('手機');
    expect(detectFeedbackPlatform('Mozilla/5.0 Chrome/130', false)).toBe('網頁版');
  });
});
