/**
 * 公會規則（`docs/design/11-guild.md`）。client 的驗證只是 UX，判定在 server。
 */
import { characterNameKey, validateNameWidth, type CharacterNameError } from './characterIdentity';

/** § 11.3 */
export const GUILD_CREATE_MIN_LEVEL = 10;
/** § 11.4：寬度同角色名稱（中文佔 2、其餘佔 1） */
export const GUILD_NAME_MIN_WIDTH = 2;
export const GUILD_NAME_MAX_WIDTH = 12;
/** § 11.5：人數上限＝盟主魅力（含裝備）× 2，含盟主 */
export const GUILD_CAPACITY_PER_CHA = 2;
/** § 11.8：公會倉庫格數。一件裝備 1 格、同種道具合計 1 格、金幣不佔格 */
export const GUILD_WAREHOUSE_CAPACITY = 200;
export const GUILD_WAREHOUSE_FULL_MESSAGE = `公會倉庫已滿（${GUILD_WAREHOUSE_CAPACITY}/${GUILD_WAREHOUSE_CAPACITY}）`;
export const GUILD_WAREHOUSE_TAKEN_MESSAGE = '已被其他成員取走';

export const GUILD_NAME_ERROR_MESSAGES: Record<CharacterNameError, string> = {
  empty: '請輸入公會名稱',
  too_short: '公會名稱至少 1 個中文或 2 個英數字',
  too_long: '公會名稱最多 6 個中文或 12 個英數字（中文算 2 格）',
  all_symbols: '公會名稱不可全部都是符號，至少要有一個中文、英文或數字',
  invalid_char: '公會名稱只能使用中文、英文、數字與 -_~=. 這些符號，不可有空白',
};

export function validateGuildName(name: string): CharacterNameError | null {
  return validateNameWidth(name, GUILD_NAME_MIN_WIDTH, GUILD_NAME_MAX_WIDTH);
}

/** 唯一性比對鍵，同角色名稱（`19-account-character.md` § 19.4） */
export function guildNameKey(name: string): string {
  return characterNameKey(name);
}

export function guildCapacity(leaderCha: number): number {
  return Math.max(0, leaderCha) * GUILD_CAPACITY_PER_CHA;
}
