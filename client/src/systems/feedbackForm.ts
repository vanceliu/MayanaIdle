/**
 * 回饋表單預填連結（`34-ui-guidelines.md` § 34.6「回饋」）。
 *
 * 只帶下列四欄；可用來登入的資料（復原碼、token、characterId）一律不得加進來。
 */
import { CLASS_NAMES_ZH, type ClassName } from '../models/character';

export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeRvUPItlZOxm_UXHzg6XdHs4j2PdwNWVaR3QJmS2jZZ-mPzw/viewform';

const ENTRY = {
  version: 'entry.1185590020',
  characterName: 'entry.724575202',
  classLevel: 'entry.236143254',
  platform: 'entry.1813319086',
} as const;

export type FeedbackPlatform = '桌面版' | '手機' | '網頁版';

export interface FeedbackContext {
  version: string;
  platform: FeedbackPlatform;
  character: { name: string; className: ClassName; level: number } | null;
}

export function detectFeedbackPlatform(userAgent: string, handheld: boolean): FeedbackPlatform {
  if (userAgent.includes('Electron')) return '桌面版';
  return handheld ? '手機' : '網頁版';
}

export function buildFeedbackUrl({ version, platform, character }: FeedbackContext): string {
  const params = new URLSearchParams({ usp: 'pp_url', [ENTRY.version]: version });
  if (character) {
    params.set(ENTRY.characterName, character.name);
    params.set(ENTRY.classLevel, `${CLASS_NAMES_ZH[character.className]} Lv${character.level}`);
  }
  params.set(ENTRY.platform, platform);
  return `${FEEDBACK_FORM_URL}?${params.toString()}`;
}
