import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PATCH_NOTES, PATCH_NOTE_LIMIT } from '../patchNotes';
import { compareVersion } from '../compensations';

const releaseVersion = (JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf-8')) as { version: string }).version;

/** `52-mailbox.md` § 52.6 更新公告 */
describe('更新公告', () => {
  it('最新一筆就是發布版本 —— 發版時要在 patchNotes.ts 加這版的公告', () => {
    expect(PATCH_NOTES[0].version).toBe(releaseVersion);
  });

  it(`只留最新 ${PATCH_NOTE_LIMIT} 版 —— 加新版時刪掉最舊一筆`, () => {
    expect(PATCH_NOTES.length).toBeLessThanOrEqual(PATCH_NOTE_LIMIT);
  });

  it('新版在前，版本號嚴格遞減', () => {
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(compareVersion(PATCH_NOTES[i - 1].version, PATCH_NOTES[i].version)).toBeGreaterThan(0);
    }
  });

  it('日期為 YYYY-MM-DD 且不晚於前一筆；每版至少一條變更', () => {
    for (const [i, note] of PATCH_NOTES.entries()) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(note.date))).toBe(false);
      if (i > 0) expect(note.date <= PATCH_NOTES[i - 1].date).toBe(true);
      expect(note.changes.length).toBeGreaterThan(0);
      for (const line of note.changes) expect(line.trim()).not.toBe('');
    }
  });
});
