export interface AssetCredit {
  /** 素材在遊戲中的用途 */
  usage: string;
  /** 素材名稱 */
  name: string;
  /** 作者（依原始授權要求標注） */
  authors: string;
  license: string;
  licenseUrl: string;
  /** 原始來源頁面 */
  sourceUrl: string;
  /** 版庫中的存放路徑；尚未匯入者為 undefined */
  path?: string;
}

/** CC BY 3.0 要求的標注文字，需原樣呈現 */
export const GAME_ICONS_ATTRIBUTION =
  'Icons made by Lorc & Delapouite. Available on https://game-icons.net';

/**
 * **目前實際使用中**的第三方素材。此頁只列還在用的東西，不列候選。
 *
 * 等距地形素材曾經評估並接上，後因三套來源的畫風與尺寸對不齊而整批移除；
 * 候選名單與授權研究留在 `client/src/assets/CREDITS.md`，
 * 選型需求見 `docs/design/38-map-control.md` § 38.9。
 * 重新採用素材時，除了放進版庫也必須同步補回此表。
 */
export const ASSET_CREDITS: readonly AssetCredit[] = [
  {
    usage: '遊戲圖示（技能、道具、裝備、增益／減益）',
    name: 'game-icons.net',
    authors: 'Lorc、Delapouite',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl: 'https://game-icons.net',
    path: 'client/src/assets/icons/',
  },
];
