export interface MonsterJob {
  /** 怪物 id（`monsterSeeds.ts`） */
  id: number;
  key: string;
  /** 產圖批次 */
  group: string;
  legs: 'trim' | 'keep';
  sideFacesLeft: boolean;
  enclosedTolerance?: number;
  legTrim?: { region: number; coverage: number };
  seed: number;
  prompt: string;
  /** img2img 底圖（`monsterBase.ts`） */
  base?: import('../../src/pixi/entities/monster/monsterBase').MonsterBase;
  /** img2img 底圖改用該 key 的 AI 原圖（`assets-src/ai-raw/monsters/<baseRaw>.png`） */
  baseRaw?: string;
  /** img2img 強度（有 base 或 baseRaw 時） */
  denoise?: number;
}

export const MONSTER_JOBS: MonsterJob[];
