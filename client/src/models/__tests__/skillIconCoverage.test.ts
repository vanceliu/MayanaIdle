import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SKILL_CATALOG } from '../skill';
import { CLASS_SKILLS } from '../classSkills';
import { SKILL_ID_ICON_MAP, getSkillDisplayIcon, getEffectIcon } from '../iconMap';

/**
 * 技能圖示的完整性（`05-skill.md` § 技能圖示）。
 *
 * 圖示是**打包進 bundle 的本機 SVG**（`GameIcon` 走 `import.meta.glob`），
 * 檔案不在就靜默顯示空白 —— 不會報錯、不會 404，只是那一格什麼都沒有。
 * 這一份把「對應表有寫」與「檔案真的在」綁在一起，新增技能漏補素材時會當場爆掉。
 */

const ICON_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/icons');

const ALL_SKILLS = [
  ...SKILL_CATALOG,
  ...CLASS_SKILLS.map(c => c.skill),
];

function iconFileExists(icon: string): boolean {
  return existsSync(resolve(ICON_DIR, `${icon}.svg`));
}

describe('技能圖示完整性', () => {
  it('每一招都解析得出圖示，且素材檔案存在', () => {
    const missing: string[] = [];
    for (const skill of ALL_SKILLS) {
      const icon = getSkillDisplayIcon(skill);
      if (!iconFileExists(icon)) missing.push(`${skill.id}（${skill.name}）→ ${icon}.svg`);
    }
    expect(missing, `以下技能的圖示素材不存在：\n${missing.join('\n')}`).toEqual([]);
  });

  /**
   * buff 技能刻意**不**進 `SKILL_ID_ICON_MAP`：它們沿用 buff bar 的
   * `getEffectIcon(buffCategory)`，同一個 buff 在狀態列與技能面板才會是同一顆。
   */
  it('buff 技能走狀態列的圖示，不在每招圖示表裡', () => {
    for (const skill of ALL_SKILLS.filter(s => s.type === 'buff')) {
      expect(SKILL_ID_ICON_MAP[skill.id], skill.id).toBeUndefined();
      expect(getSkillDisplayIcon(skill), skill.id)
        .toBe(getEffectIcon(skill.buffCategory ?? skill.id));
    }
  });

  it('攻擊與治癒技能每一招都有專屬圖示（不吃元素 fallback）', () => {
    const noOwnIcon = ALL_SKILLS
      .filter(s => s.type === 'attack' || s.type === 'heal')
      .filter(s => !SKILL_ID_ICON_MAP[s.id])
      .map(s => `${s.id}（${s.name}）`);
    expect(noOwnIcon, `以下技能還在吃元素 fallback：\n${noOwnIcon.join('\n')}`).toEqual([]);
  });

  it('專屬圖示不重複 —— 兩招共用一顆就失去分辨的意義', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [skillId, icon] of Object.entries(SKILL_ID_ICON_MAP)) {
      const prev = seen.get(icon);
      if (prev) clashes.push(`${icon}：${prev} 與 ${skillId}`);
      else seen.set(icon, skillId);
    }
    expect(clashes, `重複的圖示：\n${clashes.join('\n')}`).toEqual([]);
  });

  /**
   * 通用的 `concentration-orb` 是「查不到」的 fallback，不是設計選擇 ——
   * 目前**每一個** buff 都配了專屬圖示，所以這裡不留白名單。
   * 新增 buff 技能忘了配圖示時會掉進 fallback，這條就會擋下來，
   * 而不是靜悄悄在狀態列多一顆分不出來的通用球。
   */
  it('每個 buff 技能都有專屬圖示，沒有人落在通用 fallback 上', () => {
    const generic = ALL_SKILLS
      .filter(s => s.type === 'buff')
      .filter(s => getSkillDisplayIcon(s) === 'buffs/concentration-orb')
      .map(s => `${s.id}（${s.name}）→ category ${s.buffCategory ?? s.id}`);
    expect(generic, `以下 buff 還在通用圖示上，請到 EFFECT_ICON_MAP 配一顆：\n${generic.join('\n')}`)
      .toEqual([]);
  });

  it('對應表不含已被刪除的技能 id', () => {
    const validIds = new Set(ALL_SKILLS.map(s => s.id));
    const orphans = Object.keys(SKILL_ID_ICON_MAP).filter(id => !validIds.has(id));
    expect(orphans, `對應表有孤兒項目：${orphans.join(', ')}`).toEqual([]);
  });
});
