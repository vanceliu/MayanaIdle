/**
 * 城鎮設施 NPC 的固定外觀（`13-town.md` § 13.2.1）。
 *
 * 玩家的外觀存在角色列上、可以自己調；NPC 的是**寫死的**，
 * 每個設施一組，換地圖也不會變 —— 認人靠的就是他長什麼樣子。
 *
 * 配色規則與玩家共用（`04-character.md` § 4.10）：
 * 眼色必須在該膚色上看得見，`npcAppearance.test.ts` 會逐一檢查。
 */
import {
  DEFAULT_LASH,
  createDefaultAppearance,
  type Appearance,
  type HairStyleId,
} from './appearance';

interface NpcLookSpec {
  hair: HairStyleId;
  skin: string;
  hairColor: string;
  eyeColor: string;
  /** 內衣顏色（`04-character.md` § 4.10）—— 各設施給不同色，遠看就分得出誰是誰 */
  cloth: string;
  lash?: boolean;
}

const SPECS: Record<string, NpcLookSpec> = {
  /* 深膚配亮眼、淺膚配深眼，混著給 */
  'general-store': { hair: 'twin', skin: '#e8c9a0', hairColor: '#7a5a3c', eyeColor: '#2a1a12', cloth: '#4a9c5e', lash: true },
  blacksmith: { hair: 'bald', skin: '#7c4f2c', hairColor: '#2f2a33', eyeColor: '#e3a45f', cloth: '#4a3728' },
  'weapon-shop': { hair: 'buzz', skin: '#c98f5e', hairColor: '#2f2a33', eyeColor: '#0b0b16', cloth: '#3d7fb8' },
  'armor-shop': { hair: 'mohawk', skin: '#a9703f', hairColor: '#b03a2e', eyeColor: '#e3c765', cloth: '#6b2a2a' },
  inn: { hair: 'bun', skin: '#f2d6b8', hairColor: '#c9a227', eyeColor: '#24506e', cloth: '#e3a45f', lash: true },
  storage: { hair: 'part', skin: '#dcb894', hairColor: '#c9c2b4', eyeColor: '#2a1a12', cloth: '#2f5d3a' },
  'magic-academy': { hair: 'long', skin: '#e8c9a0', hairColor: '#7b52a8', eyeColor: '#4a2f5e', cloth: '#b98ae0', lash: true },
  'class-guild': { hair: 'braid', skin: '#c98f5e', hairColor: '#b03a2e', eyeColor: '#2f5d3a', cloth: '#b0546a', lash: true },
  'starter-npc': { hair: 'part', skin: '#f2d6b8', hairColor: '#4a3728', eyeColor: '#0b0b16', cloth: '#c9c2b4' },
  'adventurer-guild': { hair: 'pony', skin: '#dcb894', hairColor: '#e3c765', eyeColor: '#24506e', cloth: '#24506e', lash: true },
  'statistics-center': { hair: 'twinbun', skin: '#e8c9a0', hairColor: '#24506e', eyeColor: '#4a2a10', cloth: '#55505c', lash: true },
  'sigil-master': { hair: 'bun', skin: '#5a3720', hairColor: '#c9c2b4', eyeColor: '#b98ae0', cloth: '#4a2f5e' },
};

function toAppearance(spec: NpcLookSpec): Appearance {
  return {
    hair: spec.hair,
    skin: spec.skin,
    hairColor: spec.hairColor,
    eyeColor: spec.eyeColor,
    cloth: spec.cloth,
    lash: { ...DEFAULT_LASH, on: spec.lash ? 1 : 0 },
    tune: {},
  };
}

export const NPC_APPEARANCES: Record<string, Appearance> = Object.fromEntries(
  Object.entries(SPECS).map(([facility, spec]) => [facility, toAppearance(spec)]),
);

/**
 * 沒有登記的設施退回預設外觀而不是拋錯 ——
 * 新增設施時忘了配外觀只該讓他長得普通，不該讓整張地圖畫不出來。
 */
export function getNpcAppearance(facility: string): Appearance {
  return NPC_APPEARANCES[facility] ?? createDefaultAppearance();
}
