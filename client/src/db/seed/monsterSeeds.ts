import type { MonsterTemplate } from '../../models/monster';

export const MONSTER_SEEDS: MonsterTemplate[] = [
  // 曙光草原 Lv.1~5
  { id: 1, name: '暴牙兔', level: 2, hp: 10, attackMin: 2, attackMax: 4, defense: 1, exp: 6, race: 'normal', size: 'small', element: 'none', area: 'dawn-plains', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 2, name: '野牛', level: 4, hp: 12, attackMin: 2, attackMax: 4, defense: 1, exp: 7, race: 'normal', size: 'small', element: 'none', area: 'dawn-plains', isBoss: false },
  { id: 3, name: '史萊姆', level: 4, hp: 14, attackMin: 3, attackMax: 5, defense: 1, exp: 10, race: 'normal', size: 'small', element: 'none', area: 'dawn-plains', isBoss: false },
  // 翠綠谷地 Lv.6~10
  { id: 4, name: '野狼', level: 6, hp: 20, attackMin: 4, attackMax: 7, defense: 2, exp: 16, race: 'normal', size: 'small', element: 'none', area: 'green-valley', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 5, name: '妖魔', level: 7, hp: 25, attackMin: 4, attackMax: 9, defense: 3, exp: 20, race: 'demon', size: 'small', element: 'dark', area: 'green-valley', isBoss: false, debuffs: [{ type: 'curse', chance: 10 }] },
  { id: 6, name: '哥布林', level: 8, hp: 28, attackMin: 5, attackMax: 9, defense: 3, exp: 24, race: 'normal', size: 'small', element: 'none', area: 'green-valley', isBoss: false },
  // 風語林地 Lv.11~15
  { id: 7, name: '森林蜘蛛', level: 12, hp: 55, attackMin: 8, attackMax: 13, defense: 5, exp: 60, race: 'normal', size: 'small', element: 'none', area: 'wind-woods', isBoss: false, debuffs: [{ type: 'poison', chance: 15 }] },
  { id: 8, name: '樹精靈', level: 14, hp: 65, attackMin: 9, attackMax: 14, defense: 6, exp: 80, race: 'normal', size: 'small', element: 'earth', area: 'wind-woods', isBoss: false },
  // 迷霧沼澤 Lv.16~20
  { id: 9, name: '毒蛇', level: 16, hp: 75, attackMin: 10, attackMax: 15, defense: 6, exp: 100, race: 'normal', size: 'small', element: 'none', area: 'misty-swamp', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  { id: 10, name: '風之鷹', level: 18, hp: 90, attackMin: 12, attackMax: 16, defense: 7, exp: 130, race: 'normal', size: 'small', element: 'wind', area: 'misty-swamp', isBoss: false },
  { id: 11, name: '沼澤蜥蜴', level: 20, hp: 105, attackMin: 13, attackMax: 18, defense: 8, exp: 155, race: 'normal', size: 'small', element: 'earth', area: 'misty-swamp', isBoss: false },
  // 試煉高地 Lv.21~25
  { id: 12, name: '石像鬼', level: 22, hp: 130, attackMin: 15, attackMax: 22, defense: 10, exp: 200, race: 'demon', size: 'large', element: 'earth', area: 'trial-highlands', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 13, name: '高地狼人', level: 23, hp: 140, attackMin: 16, attackMax: 24, defense: 11, exp: 230, race: 'normal', size: 'small', element: 'none', area: 'trial-highlands', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 14, name: '風蝎', level: 24, hp: 150, attackMin: 17, attackMax: 26, defense: 11, exp: 255, race: 'normal', size: 'small', element: 'wind', area: 'trial-highlands', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  { id: 15, name: '高地獅鷲', level: 25, hp: 160, attackMin: 18, attackMax: 28, defense: 12, exp: 280, race: 'normal', size: 'large', element: 'wind', area: 'trial-highlands', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  // 試煉高地頂部 Lv.26~30
  { id: 16, name: '暴風鷹', level: 26, hp: 165, attackMin: 19, attackMax: 28, defense: 12, exp: 300, race: 'normal', size: 'small', element: 'wind', area: 'trial-highlands-top', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 17, name: '山賊', level: 27, hp: 175, attackMin: 20, attackMax: 30, defense: 13, exp: 330, race: 'normal', size: 'small', element: 'none', area: 'trial-highlands-top', isBoss: false },
  { id: 18, name: '山賊頭目', level: 28, hp: 185, attackMin: 21, attackMax: 30, defense: 13, exp: 360, race: 'normal', size: 'small', element: 'none', area: 'trial-highlands-top', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 19, name: '岩石巨人', level: 30, hp: 200, attackMin: 22, attackMax: 32, defense: 14, exp: 400, race: 'normal', size: 'large', element: 'earth', area: 'trial-highlands-top', isBoss: false, debuffs: [{ type: 'stun', chance: 10 }] },
  { id: 20, name: '試煉飛龍', level: 30, hp: 1200, attackMin: 25, attackMax: 36, defense: 16, exp: 2500, race: 'dragon', size: 'large', element: 'wind', area: 'trial-highlands-top', isBoss: true, debuffs: [{ type: 'bleed', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 雪原地帶 Lv.30~33
  { id: 21, name: '凍骨哥布林', level: 30, hp: 210, attackMin: 22, attackMax: 32, defense: 14, exp: 420, race: 'normal', size: 'small', element: 'ice', area: 'snow-field', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 22, name: '冰霜蜘蛛', level: 31, hp: 220, attackMin: 23, attackMax: 33, defense: 15, exp: 450, race: 'normal', size: 'small', element: 'ice', area: 'snow-field', isBoss: false, debuffs: [{ type: 'poison', chance: 12 }] },
  { id: 23, name: '雪狼', level: 32, hp: 235, attackMin: 24, attackMax: 34, defense: 15, exp: 480, race: 'normal', size: 'small', element: 'ice', area: 'snow-field', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 24, name: '冰晶蝙蝠', level: 33, hp: 250, attackMin: 25, attackMax: 36, defense: 16, exp: 510, race: 'normal', size: 'small', element: 'ice', area: 'snow-field', isBoss: false },

  // 雪原地帶深處 Lv.34~35
  { id: 25, name: '雪人', level: 34, hp: 270, attackMin: 27, attackMax: 38, defense: 17, exp: 550, race: 'normal', size: 'large', element: 'ice', area: 'snow-field-deep', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 26, name: '雪怪', level: 35, hp: 290, attackMin: 28, attackMax: 40, defense: 18, exp: 580, race: 'normal', size: 'large', element: 'ice', area: 'snow-field-deep', isBoss: false },
  { id: 27, name: '雪地之主', level: 35, hp: 1500, attackMin: 35, attackMax: 48, defense: 22, exp: 3000, race: 'normal', size: 'large', element: 'ice', area: 'snow-field-deep', isBoss: true, debuffs: [{ type: 'stun', chance: 15 }] },
  // 妖魔森林 Lv.30~33
  { id: 28, name: '高等妖魔', level: 32, hp: 240, attackMin: 24, attackMax: 35, defense: 15, exp: 490, race: 'demon', size: 'small', element: 'dark', area: 'demon-forest', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 30, name: '妖魔神射手', level: 33, hp: 255, attackMin: 26, attackMax: 36, defense: 16, exp: 520, race: 'demon', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'demon-forest', isBoss: false },
  { id: 200, name: '妖魔幼獸', level: 30, hp: 210, attackMin: 22, attackMax: 32, defense: 14, exp: 420, race: 'demon', size: 'small', element: 'dark', area: 'demon-forest', isBoss: false },
  { id: 201, name: '蝕木藤妖', level: 31, hp: 225, attackMin: 23, attackMax: 33, defense: 15, exp: 455, race: 'normal', size: 'small', element: 'earth', area: 'demon-forest', isBoss: false, debuffs: [{ type: 'poison', chance: 15 }] },
  { id: 202, name: '妖魔咒術師', level: 33, hp: 235, attackMin: 25, attackMax: 35, defense: 15, exp: 510, race: 'demon', size: 'small', element: 'dark', attackType: 'magic', attackRange: 8, area: 'demon-forest', isBoss: false, debuffs: [{ type: 'weaken', chance: 12 }] },
  // 腐葉林道 Lv.34~36
  { id: 29, name: '高等妖魔鬥士', level: 35, hp: 300, attackMin: 28, attackMax: 42, defense: 18, exp: 600, race: 'demon', size: 'small', element: 'fire', area: 'rotleaf-path', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 203, name: '腐葉巨蛛', level: 34, hp: 270, attackMin: 27, attackMax: 38, defense: 17, exp: 550, race: 'normal', size: 'small', element: 'earth', area: 'rotleaf-path', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  { id: 204, name: '妖魔獵犬', level: 34, hp: 265, attackMin: 27, attackMax: 39, defense: 17, exp: 545, race: 'demon', size: 'small', element: 'dark', area: 'rotleaf-path', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 205, name: '腐生樹妖', level: 35, hp: 315, attackMin: 29, attackMax: 41, defense: 19, exp: 605, race: 'normal', size: 'large', element: 'earth', area: 'rotleaf-path', isBoss: false, debuffs: [{ type: 'poison', chance: 15 }] },
  { id: 206, name: '妖魔投斧手', level: 36, hp: 300, attackMin: 30, attackMax: 42, defense: 18, exp: 630, race: 'demon', size: 'small', element: 'fire', attackType: 'ranged', attackRange: 10, area: 'rotleaf-path', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  // 妖魔祭壇 Lv.37~40
  { id: 31, name: '巨人', level: 38, hp: 360, attackMin: 33, attackMax: 46, defense: 21, exp: 730, race: 'normal', size: 'large', element: 'earth', area: 'demon-altar', isBoss: false, debuffs: [{ type: 'stun', chance: 10 }] },
  { id: 207, name: '祭壇守衛', level: 37, hp: 340, attackMin: 31, attackMax: 44, defense: 20, exp: 680, race: 'demon', size: 'large', element: 'dark', area: 'demon-altar', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 208, name: '妖魔祭司', level: 38, hp: 330, attackMin: 32, attackMax: 45, defense: 20, exp: 715, race: 'demon', size: 'small', element: 'dark', attackType: 'magic', attackRange: 8, area: 'demon-altar', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }, { type: 'weaken', chance: 15 }] },
  { id: 209, name: '血祭石像', level: 39, hp: 375, attackMin: 34, attackMax: 47, defense: 22, exp: 750, race: 'demon', size: 'large', element: 'earth', area: 'demon-altar', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 210, name: '妖魔統領', level: 40, hp: 390, attackMin: 35, attackMax: 48, defense: 22, exp: 780, race: 'demon', size: 'large', element: 'fire', area: 'demon-altar', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }, { type: 'curse', chance: 15 }] },
  // 明鏡森林 Lv.30~33
  { id: 32, name: '鏡面精靈', level: 32, hp: 235, attackMin: 24, attackMax: 34, defense: 15, exp: 480, race: 'normal', size: 'small', element: 'light', area: 'mirror-forest', isBoss: false },
  { id: 33, name: '光影狐', level: 33, hp: 250, attackMin: 25, attackMax: 36, defense: 16, exp: 510, race: 'normal', size: 'small', element: 'light', area: 'mirror-forest', isBoss: false },
  { id: 211, name: '微光蝶', level: 30, hp: 205, attackMin: 22, attackMax: 31, defense: 14, exp: 415, race: 'normal', size: 'small', element: 'light', area: 'mirror-forest', isBoss: false },
  { id: 212, name: '鏡水蜥', level: 31, hp: 225, attackMin: 23, attackMax: 33, defense: 15, exp: 450, race: 'normal', size: 'small', element: 'ice', area: 'mirror-forest', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 213, name: '折光魔像', level: 33, hp: 265, attackMin: 26, attackMax: 36, defense: 17, exp: 525, race: 'normal', size: 'large', element: 'light', area: 'mirror-forest', isBoss: false },
  // 幻光湖畔 Lv.34~36
  { id: 34, name: '明鏡樹妖', level: 36, hp: 310, attackMin: 29, attackMax: 41, defense: 18, exp: 620, race: 'normal', size: 'large', element: 'earth', area: 'glimmer-shore', isBoss: false },
  { id: 214, name: '湖畔水靈', level: 34, hp: 280, attackMin: 27, attackMax: 38, defense: 18, exp: 555, race: 'normal', size: 'large', element: 'ice', area: 'glimmer-shore', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 215, name: '潛鏡蛇', level: 34, hp: 260, attackMin: 27, attackMax: 38, defense: 17, exp: 545, race: 'normal', size: 'small', element: 'ice', area: 'glimmer-shore', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  { id: 216, name: '鏡湖歌者', level: 35, hp: 275, attackMin: 28, attackMax: 40, defense: 17, exp: 585, race: 'normal', size: 'small', element: 'light', attackType: 'magic', attackRange: 8, area: 'glimmer-shore', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 217, name: '幻影鹿', level: 36, hp: 295, attackMin: 29, attackMax: 41, defense: 18, exp: 615, race: 'normal', size: 'small', element: 'light', area: 'glimmer-shore', isBoss: false },
  // 碎鏡深林 Lv.37~40
  { id: 35, name: '幻光獵蛾', level: 38, hp: 350, attackMin: 32, attackMax: 45, defense: 20, exp: 720, race: 'normal', size: 'small', element: 'light', area: 'shattered-mirror', isBoss: false },
  { id: 218, name: '碎鏡魔像', level: 37, hp: 345, attackMin: 31, attackMax: 43, defense: 21, exp: 675, race: 'normal', size: 'large', element: 'earth', area: 'shattered-mirror', isBoss: false },
  { id: 219, name: '逆影獵手', level: 38, hp: 325, attackMin: 32, attackMax: 45, defense: 20, exp: 710, race: 'normal', size: 'small', element: 'dark', attackType: 'ranged', attackRange: 10, area: 'shattered-mirror', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 220, name: '鏡界巡守', level: 39, hp: 380, attackMin: 34, attackMax: 47, defense: 22, exp: 755, race: 'normal', size: 'large', element: 'light', area: 'shattered-mirror', isBoss: false },
  { id: 221, name: '碎鏡之影', level: 40, hp: 385, attackMin: 35, attackMax: 48, defense: 22, exp: 775, race: 'demon', size: 'large', element: 'dark', area: 'shattered-mirror', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }, { type: 'weaken', chance: 15 }] },
  // 龍之谷（地表）Lv.30~40
  { id: 36, name: '飛龍', level: 35, hp: 300, attackMin: 28, attackMax: 40, defense: 18, exp: 600, race: 'dragon', size: 'large', element: 'wind', area: 'dragon-valley-surface', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 37, name: '高階骷髏警衛', level: 33, hp: 260, attackMin: 26, attackMax: 37, defense: 16, exp: 530, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-surface', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 38, name: '高階骷髏神射手', level: 32, hp: 240, attackMin: 24, attackMax: 35, defense: 15, exp: 490, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'dragon-valley-surface', isBoss: false },
  { id: 39, name: '高階骷髏鬥士', level: 36, hp: 320, attackMin: 30, attackMax: 42, defense: 19, exp: 640, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-surface', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 40, name: '亞利安', level: 38, hp: 360, attackMin: 33, attackMax: 46, defense: 21, exp: 730, race: 'normal', size: 'small', element: 'none', area: 'dragon-valley-surface', isBoss: false },
  // 遠古戰場 Lv.40~45
  { id: 41, name: '戰場殭屍', level: 40, hp: 380, attackMin: 35, attackMax: 48, defense: 22, exp: 780, race: 'undead', size: 'small', element: 'dark', area: 'ancient-battlefield', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 42, name: '戰場骷髏兵', level: 41, hp: 400, attackMin: 36, attackMax: 50, defense: 23, exp: 820, race: 'undead', size: 'small', element: 'dark', area: 'ancient-battlefield', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 43, name: '戰場骷髏弓手', level: 42, hp: 410, attackMin: 37, attackMax: 51, defense: 23, exp: 850, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-battlefield', isBoss: false },
  { id: 44, name: '亡魂騎士', level: 45, hp: 480, attackMin: 42, attackMax: 58, defense: 27, exp: 1000, race: 'undead', size: 'large', element: 'dark', area: 'ancient-battlefield', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  // 朦朧洞窟 1F Lv.40~43
  { id: 45, name: '高等史萊姆', level: 40, hp: 380, attackMin: 34, attackMax: 47, defense: 21, exp: 770, race: 'normal', size: 'small', element: 'none', area: 'misty-cave-1f', isBoss: false },
  { id: 46, name: '高等蜥蜴', level: 41, hp: 400, attackMin: 36, attackMax: 49, defense: 22, exp: 810, race: 'normal', size: 'small', element: 'earth', area: 'misty-cave-1f', isBoss: false },
  { id: 47, name: '高等妖魔鬥士', level: 43, hp: 430, attackMin: 38, attackMax: 52, defense: 24, exp: 880, race: 'demon', size: 'small', element: 'fire', area: 'misty-cave-1f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  // 朦朧洞窟 2F Lv.43~46
  { id: 48, name: '高等史萊姆', level: 43, hp: 420, attackMin: 38, attackMax: 52, defense: 24, exp: 870, race: 'normal', size: 'small', element: 'none', area: 'misty-cave-2f', isBoss: false },
  { id: 49, name: '高等蜥蜴', level: 44, hp: 440, attackMin: 39, attackMax: 54, defense: 25, exp: 910, race: 'normal', size: 'small', element: 'earth', area: 'misty-cave-2f', isBoss: false },
  { id: 50, name: '洞窟巨蟲', level: 46, hp: 500, attackMin: 42, attackMax: 58, defense: 27, exp: 990, race: 'normal', size: 'large', element: 'earth', area: 'misty-cave-2f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  // 朦朧洞窟 3F Lv.46~50
  { id: 51, name: '洞窟巨蟲', level: 47, hp: 520, attackMin: 44, attackMax: 60, defense: 28, exp: 1030, race: 'normal', size: 'large', element: 'earth', area: 'misty-cave-3f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  { id: 52, name: '高等蜥蜴', level: 48, hp: 510, attackMin: 43, attackMax: 59, defense: 28, exp: 1050, race: 'normal', size: 'small', element: 'earth', area: 'misty-cave-3f', isBoss: false },
  { id: 53, name: '朦朧幻獸', level: 49, hp: 550, attackMin: 46, attackMax: 63, defense: 30, exp: 1100, race: 'demon', size: 'large', element: 'dark', area: 'misty-cave-3f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 54, name: '朦朧蛇魔', level: 50, hp: 2000, attackMin: 55, attackMax: 75, defense: 35, exp: 5000, race: 'demon', size: 'large', element: 'dark', area: 'misty-cave-3f', isBoss: true, debuffs: [{ type: 'poison', chance: 15 }, { type: 'curse', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 水下監獄 1F Lv.40~43
  { id: 55, name: '水牢守衛', level: 40, hp: 390, attackMin: 35, attackMax: 48, defense: 22, exp: 780, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-1f', isBoss: false },
  { id: 56, name: '溺水亡靈', level: 41, hp: 380, attackMin: 34, attackMax: 47, defense: 21, exp: 800, race: 'undead', size: 'small', element: 'ice', area: 'underwater-prison-1f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 57, name: '深海藻獸', level: 43, hp: 420, attackMin: 37, attackMax: 51, defense: 23, exp: 870, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-1f', isBoss: false },
  // 水下監獄 2F Lv.43~45
  { id: 58, name: '溺水亡靈', level: 43, hp: 410, attackMin: 37, attackMax: 51, defense: 23, exp: 860, race: 'undead', size: 'small', element: 'ice', area: 'underwater-prison-2f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 59, name: '深海藻獸', level: 44, hp: 440, attackMin: 39, attackMax: 53, defense: 24, exp: 900, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-2f', isBoss: false },
  { id: 60, name: '深海魚人', level: 45, hp: 460, attackMin: 40, attackMax: 55, defense: 25, exp: 940, race: 'normal', size: 'small', element: 'ice', area: 'underwater-prison-2f', isBoss: false },
  // 水下監獄 3F Lv.45~48
  { id: 61, name: '深海魚人', level: 46, hp: 480, attackMin: 42, attackMax: 57, defense: 26, exp: 970, race: 'normal', size: 'small', element: 'ice', area: 'underwater-prison-3f', isBoss: false },
  { id: 62, name: '水牢守衛', level: 47, hp: 510, attackMin: 43, attackMax: 59, defense: 27, exp: 1020, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-3f', isBoss: false },
  { id: 63, name: '潮汐元素', level: 48, hp: 530, attackMin: 45, attackMax: 61, defense: 28, exp: 1060, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-3f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  // 水下監獄 4F Lv.48~50
  { id: 64, name: '潮汐元素', level: 49, hp: 550, attackMin: 46, attackMax: 63, defense: 29, exp: 1090, race: 'normal', size: 'large', element: 'ice', area: 'underwater-prison-4f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 65, name: '深海魚人', level: 48, hp: 500, attackMin: 43, attackMax: 59, defense: 27, exp: 1040, race: 'normal', size: 'small', element: 'ice', area: 'underwater-prison-4f', isBoss: false },
  { id: 66, name: '溺水亡靈', level: 49, hp: 520, attackMin: 44, attackMax: 60, defense: 28, exp: 1070, race: 'undead', size: 'small', element: 'ice', area: 'underwater-prison-4f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 67, name: '深海獄王', level: 50, hp: 2000, attackMin: 55, attackMax: 75, defense: 35, exp: 5000, race: 'demon', size: 'large', element: 'ice', area: 'underwater-prison-4f', isBoss: true, debuffs: [{ type: 'curse', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 象牙塔 1F Lv.33~36
  { id: 68, name: '冰霜蜘蛛', level: 33, hp: 250, attackMin: 25, attackMax: 36, defense: 16, exp: 510, race: 'normal', size: 'small', element: 'ice', area: 'ivory-tower-1f', isBoss: false, debuffs: [{ type: 'poison', chance: 12 }] },
  { id: 69, name: '象牙巫師', level: 34, hp: 260, attackMin: 26, attackMax: 37, defense: 16, exp: 540, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'ivory-tower-1f', isBoss: false, debuffs: [{ type: 'weaken', chance: 12 }] },
  { id: 70, name: '冰晶蝙蝠', level: 35, hp: 270, attackMin: 27, attackMax: 38, defense: 17, exp: 560, race: 'normal', size: 'small', element: 'ice', area: 'ivory-tower-1f', isBoss: false },
  // 象牙塔 2F Lv.36~38
  { id: 71, name: '象牙巫師', level: 36, hp: 290, attackMin: 28, attackMax: 40, defense: 18, exp: 600, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'ivory-tower-2f', isBoss: false, debuffs: [{ type: 'weaken', chance: 12 }] },
  { id: 72, name: '冰晶蝙蝠', level: 37, hp: 300, attackMin: 29, attackMax: 41, defense: 18, exp: 620, race: 'normal', size: 'small', element: 'ice', area: 'ivory-tower-2f', isBoss: false },
  { id: 73, name: '霜甲戰士', level: 38, hp: 340, attackMin: 32, attackMax: 44, defense: 20, exp: 680, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-2f', isBoss: false },
  // 象牙塔 3F Lv.38~40
  { id: 74, name: '霜甲戰士', level: 39, hp: 350, attackMin: 33, attackMax: 45, defense: 21, exp: 710, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-3f', isBoss: false },
  { id: 75, name: '冰霜元素', level: 39, hp: 360, attackMin: 34, attackMax: 46, defense: 21, exp: 720, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-3f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 76, name: '象牙魔導師', level: 40, hp: 340, attackMin: 34, attackMax: 47, defense: 20, exp: 750, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'ivory-tower-3f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  // 象牙塔 4F Lv.40~42
  { id: 77, name: '冰霜元素', level: 41, hp: 390, attackMin: 36, attackMax: 49, defense: 23, exp: 800, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-4f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 78, name: '象牙魔導師', level: 41, hp: 370, attackMin: 36, attackMax: 49, defense: 22, exp: 790, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'ivory-tower-4f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 79, name: '霜甲戰士', level: 42, hp: 410, attackMin: 37, attackMax: 51, defense: 24, exp: 840, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-4f', isBoss: false },
  // 象牙塔 5F Lv.42~45 (Boss)
  { id: 80, name: '冰霜元素', level: 43, hp: 420, attackMin: 38, attackMax: 52, defense: 24, exp: 870, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-5f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 81, name: '象牙魔導師', level: 43, hp: 400, attackMin: 38, attackMax: 52, defense: 23, exp: 860, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'ivory-tower-5f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 82, name: '霜甲戰士', level: 44, hp: 440, attackMin: 39, attackMax: 54, defense: 25, exp: 900, race: 'normal', size: 'large', element: 'ice', area: 'ivory-tower-5f', isBoss: false },
  { id: 83, name: '象牙塔惡魔', level: 45, hp: 1800, attackMin: 50, attackMax: 68, defense: 30, exp: 4500, race: 'demon', size: 'large', element: 'fire', area: 'ivory-tower-5f', isBoss: true, debuffs: [{ type: 'curse', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 龍谷地間 1F Lv.40~43
  { id: 84, name: '高階骷髏警衛', level: 40, hp: 380, attackMin: 35, attackMax: 48, defense: 22, exp: 780, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-1f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 85, name: '高階骷髏神射手', level: 40, hp: 360, attackMin: 34, attackMax: 47, defense: 21, exp: 760, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'dragon-valley-1f', isBoss: false },
  { id: 86, name: '高階骷髏鬥士', level: 42, hp: 410, attackMin: 37, attackMax: 51, defense: 23, exp: 840, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-1f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 87, name: '剝皮蜘蛛', level: 41, hp: 370, attackMin: 35, attackMax: 48, defense: 21, exp: 790, race: 'normal', size: 'small', element: 'earth', area: 'dragon-valley-1f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  // 龍谷地間 2F Lv.40~43
  { id: 88, name: '高階骷髏警衛', level: 41, hp: 390, attackMin: 36, attackMax: 49, defense: 22, exp: 800, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-2f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 89, name: '高階骷髏神射手', level: 41, hp: 370, attackMin: 35, attackMax: 48, defense: 21, exp: 780, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'dragon-valley-2f', isBoss: false },
  { id: 90, name: '高階骷髏鬥士', level: 43, hp: 420, attackMin: 38, attackMax: 52, defense: 24, exp: 860, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-2f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 91, name: '剝皮蜘蛛', level: 42, hp: 380, attackMin: 36, attackMax: 49, defense: 22, exp: 810, race: 'normal', size: 'small', element: 'earth', area: 'dragon-valley-2f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  // 龍谷地間 3F Lv.43~46
  { id: 92, name: '高階骷髏警衛', level: 43, hp: 420, attackMin: 38, attackMax: 52, defense: 24, exp: 860, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-3f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 93, name: '高階骷髏神射手', level: 44, hp: 430, attackMin: 39, attackMax: 53, defense: 24, exp: 890, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'dragon-valley-3f', isBoss: false },
  { id: 94, name: '高階骷髏鬥士', level: 45, hp: 460, attackMin: 40, attackMax: 55, defense: 26, exp: 940, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-3f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 95, name: '大莫蜘蛛', level: 44, hp: 470, attackMin: 40, attackMax: 54, defense: 25, exp: 910, race: 'normal', size: 'large', element: 'earth', area: 'dragon-valley-3f', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  // 龍谷地間 4F Lv.43~46
  { id: 96, name: '高階骷髏警衛', level: 44, hp: 430, attackMin: 39, attackMax: 53, defense: 24, exp: 880, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-4f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 97, name: '高階骷髏神射手', level: 45, hp: 440, attackMin: 40, attackMax: 54, defense: 25, exp: 910, race: 'undead', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'dragon-valley-4f', isBoss: false },
  { id: 98, name: '高階骷髏鬥士', level: 46, hp: 480, attackMin: 42, attackMax: 57, defense: 27, exp: 970, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-4f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 99, name: '大莫蜘蛛', level: 45, hp: 490, attackMin: 41, attackMax: 56, defense: 26, exp: 940, race: 'normal', size: 'large', element: 'earth', area: 'dragon-valley-4f', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  // 龍谷地間 5F Lv.46~49
  { id: 100, name: '大莫蜘蛛', level: 47, hp: 520, attackMin: 44, attackMax: 60, defense: 28, exp: 1030, race: 'normal', size: 'large', element: 'earth', area: 'dragon-valley-5f', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  { id: 101, name: '死亡靈魂', level: 47, hp: 490, attackMin: 43, attackMax: 58, defense: 27, exp: 1000, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-5f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 102, name: '高階骷髏鬥士', level: 48, hp: 510, attackMin: 44, attackMax: 60, defense: 28, exp: 1050, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-5f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  // 龍谷地間 6F Lv.46~49
  { id: 103, name: '大莫蜘蛛', level: 48, hp: 540, attackMin: 45, attackMax: 61, defense: 29, exp: 1060, race: 'normal', size: 'large', element: 'earth', area: 'dragon-valley-6f', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  { id: 104, name: '死亡靈魂', level: 48, hp: 510, attackMin: 44, attackMax: 60, defense: 28, exp: 1040, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-6f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 105, name: '高階骷髏鬥士', level: 49, hp: 530, attackMin: 45, attackMax: 62, defense: 29, exp: 1080, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-6f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  // 龍谷地間 7F Lv.49~50 (Boss)
  { id: 106, name: '大莫蜘蛛', level: 49, hp: 550, attackMin: 46, attackMax: 63, defense: 30, exp: 1090, race: 'normal', size: 'large', element: 'earth', area: 'dragon-valley-7f', isBoss: false, debuffs: [{ type: 'poison', chance: 20 }] },
  { id: 107, name: '死亡靈魂', level: 49, hp: 520, attackMin: 45, attackMax: 61, defense: 29, exp: 1070, race: 'undead', size: 'small', element: 'dark', area: 'dragon-valley-7f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 108, name: '死亡靈魂守衛', level: 50, hp: 600, attackMin: 48, attackMax: 65, defense: 32, exp: 1200, race: 'undead', size: 'large', element: 'dark', area: 'dragon-valley-7f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 109, name: '安塔巨龍', level: 50, hp: 2500, attackMin: 60, attackMax: 82, defense: 38, exp: 6000, race: 'dragon', size: 'large', element: 'wind', area: 'dragon-valley-7f', isBoss: true, debuffs: [{ type: 'bleed', chance: 15 }, { type: 'curse', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 遠古地監 1F Lv.45~50
  { id: 110, name: '遠古囚犯', level: 45, hp: 460, attackMin: 40, attackMax: 55, defense: 25, exp: 940, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-1f', isBoss: false },
  { id: 111, name: '遠古弓箭手', level: 46, hp: 440, attackMin: 41, attackMax: 56, defense: 24, exp: 960, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-1f', isBoss: false },
  // 遠古地監 2F Lv.45~50
  { id: 112, name: '遠古囚犯', level: 47, hp: 490, attackMin: 42, attackMax: 58, defense: 26, exp: 1000, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-2f', isBoss: false },
  { id: 113, name: '遠古弓箭手', level: 47, hp: 470, attackMin: 42, attackMax: 57, defense: 25, exp: 990, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-2f', isBoss: false },
  // 遠古地監 3F Lv.45~50
  { id: 114, name: '遠古囚犯', level: 49, hp: 520, attackMin: 44, attackMax: 60, defense: 28, exp: 1060, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-3f', isBoss: false },
  { id: 115, name: '遠古弓箭手', level: 49, hp: 500, attackMin: 43, attackMax: 59, defense: 27, exp: 1040, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-3f', isBoss: false },
  // 遠古地監 4F Lv.50~55
  { id: 116, name: '封印殭屍', level: 50, hp: 550, attackMin: 46, attackMax: 63, defense: 29, exp: 1100, race: 'undead', size: 'small', element: 'dark', area: 'ancient-dungeon-4f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 117, name: '遠古囚犯', level: 51, hp: 580, attackMin: 48, attackMax: 65, defense: 30, exp: 1150, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-4f', isBoss: false },
  { id: 118, name: '遠古弓箭手', level: 52, hp: 560, attackMin: 47, attackMax: 64, defense: 29, exp: 1130, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-4f', isBoss: false },
  // 遠古地監 5F Lv.50~55
  { id: 119, name: '封印殭屍', level: 52, hp: 580, attackMin: 48, attackMax: 65, defense: 30, exp: 1160, race: 'undead', size: 'small', element: 'dark', area: 'ancient-dungeon-5f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 120, name: '遠古囚犯', level: 53, hp: 610, attackMin: 50, attackMax: 68, defense: 32, exp: 1210, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-5f', isBoss: false },
  { id: 121, name: '遠古弓箭手', level: 54, hp: 590, attackMin: 49, attackMax: 67, defense: 31, exp: 1190, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-5f', isBoss: false },
  // 遠古地監 6F Lv.50~55
  { id: 122, name: '封印殭屍', level: 54, hp: 610, attackMin: 50, attackMax: 68, defense: 32, exp: 1220, race: 'undead', size: 'small', element: 'dark', area: 'ancient-dungeon-6f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 123, name: '遠古囚犯', level: 55, hp: 640, attackMin: 52, attackMax: 71, defense: 33, exp: 1270, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-6f', isBoss: false },
  { id: 124, name: '遠古弓箭手', level: 55, hp: 620, attackMin: 51, attackMax: 69, defense: 32, exp: 1250, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-6f', isBoss: false },
  // 遠古地監 7F Lv.55~60
  { id: 125, name: '遠古凶獸', level: 56, hp: 680, attackMin: 54, attackMax: 73, defense: 34, exp: 1340, race: 'normal', size: 'large', element: 'earth', area: 'ancient-dungeon-7f', isBoss: false, debuffs: [{ type: 'bleed', chance: 20 }, { type: 'stun', chance: 10 }] },
  { id: 126, name: '遠古戰士', level: 56, hp: 650, attackMin: 53, attackMax: 72, defense: 34, exp: 1310, race: 'normal', size: 'small', element: 'none', area: 'ancient-dungeon-7f', isBoss: false },
  { id: 127, name: '遠古神射手', level: 57, hp: 640, attackMin: 53, attackMax: 72, defense: 33, exp: 1300, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-7f', isBoss: false },
  { id: 128, name: '遠古食人妖精', level: 57, hp: 620, attackMin: 52, attackMax: 70, defense: 33, exp: 1280, race: 'demon', size: 'small', element: 'fire', area: 'ancient-dungeon-7f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  // 遠古地監 8F Lv.55~60
  { id: 129, name: '遠古凶獸', level: 58, hp: 710, attackMin: 56, attackMax: 76, defense: 36, exp: 1400, race: 'normal', size: 'large', element: 'earth', area: 'ancient-dungeon-8f', isBoss: false, debuffs: [{ type: 'bleed', chance: 20 }, { type: 'stun', chance: 10 }] },
  { id: 130, name: '遠古戰士', level: 58, hp: 680, attackMin: 55, attackMax: 74, defense: 35, exp: 1370, race: 'normal', size: 'small', element: 'none', area: 'ancient-dungeon-8f', isBoss: false },
  { id: 131, name: '遠古神射手', level: 59, hp: 670, attackMin: 55, attackMax: 74, defense: 35, exp: 1360, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-8f', isBoss: false },
  { id: 132, name: '遠古食人妖精', level: 59, hp: 650, attackMin: 54, attackMax: 73, defense: 34, exp: 1340, race: 'demon', size: 'small', element: 'fire', area: 'ancient-dungeon-8f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  // 遠古地監 9F Lv.55~60 (Boss)
  { id: 133, name: '遠古凶獸', level: 59, hp: 720, attackMin: 57, attackMax: 77, defense: 36, exp: 1420, race: 'normal', size: 'large', element: 'earth', area: 'ancient-dungeon-9f', isBoss: false, debuffs: [{ type: 'bleed', chance: 20 }, { type: 'stun', chance: 10 }] },
  { id: 134, name: '遠古戰士', level: 59, hp: 690, attackMin: 56, attackMax: 75, defense: 35, exp: 1390, race: 'normal', size: 'small', element: 'none', area: 'ancient-dungeon-9f', isBoss: false },
  { id: 135, name: '遠古神射手', level: 60, hp: 680, attackMin: 56, attackMax: 76, defense: 36, exp: 1380, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'ancient-dungeon-9f', isBoss: false },
  { id: 136, name: '遠古食人妖精', level: 60, hp: 660, attackMin: 55, attackMax: 74, defense: 35, exp: 1360, race: 'demon', size: 'small', element: 'fire', area: 'ancient-dungeon-9f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 137, name: '遠古騎士', level: 60, hp: 3000, attackMin: 65, attackMax: 88, defense: 40, exp: 7000, race: 'normal', size: 'large', element: 'none', area: 'ancient-dungeon-9f', isBoss: true, debuffs: [{ type: 'bleed', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 1~10F Lv.45~52
  { id: 138, name: '百柱蜘蛛', level: 46, hp: 480, attackMin: 42, attackMax: 57, defense: 26, exp: 970, race: 'normal', size: 'small', element: 'earth', area: 'hundred-pillar-1-10f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }] },
  { id: 139, name: '百柱祕密', level: 47, hp: 490, attackMin: 43, attackMax: 58, defense: 27, exp: 1000, race: 'demon', size: 'small', element: 'dark', area: 'hundred-pillar-1-10f', isBoss: false, debuffs: [{ type: 'curse', chance: 12 }] },
  { id: 140, name: '百柱妖女', level: 48, hp: 500, attackMin: 44, attackMax: 59, defense: 27, exp: 1030, race: 'demon', size: 'small', element: 'dark', area: 'hundred-pillar-1-10f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 141, name: '百柱奇美拉', level: 50, hp: 580, attackMin: 48, attackMax: 65, defense: 30, exp: 1150, race: 'demon', size: 'large', element: 'fire', area: 'hundred-pillar-1-10f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 142, name: '百柱幻影', level: 49, hp: 510, attackMin: 45, attackMax: 61, defense: 28, exp: 1060, race: 'demon', size: 'small', element: 'dark', area: 'hundred-pillar-1-10f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 143, name: '毒之皇女', level: 52, hp: 2200, attackMin: 58, attackMax: 78, defense: 34, exp: 5500, race: 'demon', size: 'small', element: 'dark', area: 'hundred-pillar-1-10f', isBoss: true, debuffs: [{ type: 'poison', chance: 18 }, { type: 'weaken', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 11~20F Lv.45~52
  { id: 144, name: '高階夢魘', level: 47, hp: 510, attackMin: 43, attackMax: 59, defense: 27, exp: 1010, race: 'demon', size: 'large', element: 'dark', area: 'hundred-pillar-11-20f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 145, name: '高階哥布林', level: 46, hp: 460, attackMin: 41, attackMax: 56, defense: 25, exp: 950, race: 'normal', size: 'small', element: 'none', area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 146, name: '高階地靈', level: 47, hp: 470, attackMin: 42, attackMax: 57, defense: 26, exp: 970, race: 'normal', size: 'small', element: 'earth', area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 147, name: '高階爬蟲', level: 48, hp: 480, attackMin: 43, attackMax: 58, defense: 26, exp: 990, race: 'normal', size: 'small', element: 'earth', area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 148, name: '高階哥布林弓手', level: 49, hp: 490, attackMin: 44, attackMax: 59, defense: 27, exp: 1020, race: 'normal', size: 'small', element: 'wind', attackType: 'ranged', attackRange: 10, area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 149, name: '高階哥布林戰士', level: 50, hp: 560, attackMin: 47, attackMax: 63, defense: 30, exp: 1100, race: 'normal', size: 'large', element: 'none', area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 150, name: '高階地靈之主', level: 51, hp: 580, attackMin: 48, attackMax: 65, defense: 31, exp: 1150, race: 'normal', size: 'large', element: 'earth', area: 'hundred-pillar-11-20f', isBoss: false },
  { id: 151, name: '哥布林之王', level: 52, hp: 2200, attackMin: 58, attackMax: 78, defense: 34, exp: 5500, race: 'normal', size: 'large', element: 'none', area: 'hundred-pillar-11-20f', isBoss: true, debuffs: [{ type: 'stun', chance: 15 }] },
  // 百柱塔 21~30F Lv.45~52
  { id: 152, name: '暗影潛伏者', level: 47, hp: 470, attackMin: 42, attackMax: 57, defense: 26, exp: 970, race: 'normal', size: 'small', element: 'dark', area: 'hundred-pillar-21-30f', isBoss: false },
  { id: 153, name: '暗影蝙蝠', level: 48, hp: 460, attackMin: 42, attackMax: 57, defense: 25, exp: 960, race: 'normal', size: 'small', element: 'dark', area: 'hundred-pillar-21-30f', isBoss: false },
  { id: 154, name: '暗影刺客', level: 49, hp: 500, attackMin: 44, attackMax: 60, defense: 27, exp: 1040, race: 'normal', size: 'small', element: 'dark', area: 'hundred-pillar-21-30f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 155, name: '暗影巫師', level: 49, hp: 480, attackMin: 43, attackMax: 59, defense: 26, exp: 1010, race: 'normal', size: 'small', element: 'dark', attackType: 'magic', attackRange: 8, area: 'hundred-pillar-21-30f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 156, name: '暗影獵犬', level: 50, hp: 560, attackMin: 47, attackMax: 63, defense: 30, exp: 1100, race: 'normal', size: 'large', element: 'dark', area: 'hundred-pillar-21-30f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 157, name: '暗影吸血鬼', level: 52, hp: 2200, attackMin: 58, attackMax: 78, defense: 34, exp: 5500, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-21-30f', isBoss: true, debuffs: [{ type: 'bleed', chance: 15 }, { type: 'curse', chance: 15 }, { type: 'stun', chance: 15 }] },
  // 百柱塔 31~40F Lv.52~57
  { id: 158, name: '不死骷髏兵', level: 52, hp: 570, attackMin: 48, attackMax: 65, defense: 30, exp: 1140, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-31-40f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 159, name: '不死腐屍', level: 53, hp: 620, attackMin: 50, attackMax: 68, defense: 32, exp: 1200, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-31-40f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 160, name: '不死幽魂', level: 54, hp: 580, attackMin: 49, attackMax: 66, defense: 30, exp: 1180, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-31-40f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 161, name: '不死死靈騎士', level: 55, hp: 660, attackMin: 53, attackMax: 72, defense: 34, exp: 1300, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-31-40f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 162, name: '不死巫妖', level: 56, hp: 600, attackMin: 51, attackMax: 69, defense: 32, exp: 1240, race: 'undead', size: 'small', element: 'dark', attackType: 'magic', attackRange: 8, area: 'hundred-pillar-31-40f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }, { type: 'weaken', chance: 15 }] },
  { id: 163, name: '不死殭屍王', level: 57, hp: 2600, attackMin: 63, attackMax: 85, defense: 38, exp: 6500, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-31-40f', isBoss: true, debuffs: [{ type: 'curse', chance: 18 }, { type: 'weaken', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 41~50F Lv.52~57
  { id: 164, name: '古代幼龍', level: 53, hp: 560, attackMin: 49, attackMax: 66, defense: 30, exp: 1160, race: 'dragon', size: 'small', element: 'fire', area: 'hundred-pillar-41-50f', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 165, name: '古代小型飛龍', level: 54, hp: 620, attackMin: 50, attackMax: 68, defense: 32, exp: 1220, race: 'dragon', size: 'large', element: 'wind', area: 'hundred-pillar-41-50f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 166, name: '古代龍人', level: 55, hp: 650, attackMin: 52, attackMax: 70, defense: 33, exp: 1270, race: 'dragon', size: 'large', element: 'earth', area: 'hundred-pillar-41-50f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 167, name: '古代雙頭龍', level: 55, hp: 680, attackMin: 53, attackMax: 72, defense: 34, exp: 1310, race: 'dragon', size: 'large', element: 'fire', area: 'hundred-pillar-41-50f', isBoss: false, debuffs: [{ type: 'bleed', chance: 20 }] },
  { id: 168, name: '古代龍騎兵', level: 56, hp: 660, attackMin: 53, attackMax: 71, defense: 34, exp: 1290, race: 'dragon', size: 'large', element: 'wind', area: 'hundred-pillar-41-50f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }] },
  { id: 169, name: '龍王約特勒', level: 57, hp: 2600, attackMin: 63, attackMax: 85, defense: 38, exp: 6500, race: 'dragon', size: 'large', element: 'fire', area: 'hundred-pillar-41-50f', isBoss: true, debuffs: [{ type: 'bleed', chance: 20 }, { type: 'stun', chance: 20 }] },
  // 百柱塔 51~60F Lv.52~57
  { id: 170, name: '怨念幽靈', level: 53, hp: 550, attackMin: 48, attackMax: 65, defense: 29, exp: 1140, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-51-60f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 171, name: '哭嚎女妖', level: 54, hp: 560, attackMin: 49, attackMax: 66, defense: 30, exp: 1170, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-51-60f', isBoss: false, debuffs: [{ type: 'weaken', chance: 18 }] },
  { id: 172, name: '鬼魂遊蕩者', level: 55, hp: 580, attackMin: 50, attackMax: 68, defense: 31, exp: 1200, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-51-60f', isBoss: false, debuffs: [{ type: 'curse', chance: 15 }] },
  { id: 173, name: '冥界使者', level: 56, hp: 650, attackMin: 53, attackMax: 72, defense: 34, exp: 1300, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-51-60f', isBoss: false, debuffs: [{ type: 'curse', chance: 20 }] },
  { id: 174, name: '冥王哈馬斯', level: 57, hp: 2600, attackMin: 63, attackMax: 85, defense: 38, exp: 6500, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-51-60f', isBoss: true, debuffs: [{ type: 'curse', chance: 18 }, { type: 'weaken', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 61~70F Lv.57~60
  { id: 175, name: '霜凍巨人', level: 57, hp: 680, attackMin: 54, attackMax: 73, defense: 35, exp: 1350, race: 'normal', size: 'large', element: 'ice', area: 'hundred-pillar-61-70f', isBoss: false, debuffs: [{ type: 'stun', chance: 10 }] },
  { id: 176, name: '霜凍狼', level: 58, hp: 620, attackMin: 53, attackMax: 71, defense: 33, exp: 1280, race: 'normal', size: 'small', element: 'ice', area: 'hundred-pillar-61-70f', isBoss: false, debuffs: [{ type: 'bleed', chance: 15 }] },
  { id: 177, name: '冰晶元素', level: 58, hp: 670, attackMin: 55, attackMax: 74, defense: 35, exp: 1340, race: 'normal', size: 'large', element: 'ice', area: 'hundred-pillar-61-70f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }] },
  { id: 178, name: '霜凍女巫', level: 59, hp: 640, attackMin: 54, attackMax: 73, defense: 34, exp: 1310, race: 'normal', size: 'small', element: 'ice', attackType: 'magic', attackRange: 8, area: 'hundred-pillar-61-70f', isBoss: false, debuffs: [{ type: 'weaken', chance: 15 }] },
  { id: 179, name: '霜凍伊莉絲', level: 60, hp: 2800, attackMin: 65, attackMax: 88, defense: 40, exp: 7000, race: 'normal', size: 'large', element: 'ice', area: 'hundred-pillar-61-70f', isBoss: true, debuffs: [{ type: 'weaken', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 71~80F Lv.57~60
  { id: 180, name: '熔岩巨獸', level: 57, hp: 700, attackMin: 55, attackMax: 75, defense: 36, exp: 1380, race: 'normal', size: 'large', element: 'fire', area: 'hundred-pillar-71-80f', isBoss: false, debuffs: [{ type: 'stun', chance: 10 }] },
  { id: 181, name: '火焰蜥蜴', level: 58, hp: 630, attackMin: 53, attackMax: 72, defense: 33, exp: 1290, race: 'normal', size: 'small', element: 'fire', area: 'hundred-pillar-71-80f', isBoss: false },
  { id: 182, name: '岩漿元素', level: 58, hp: 680, attackMin: 55, attackMax: 74, defense: 35, exp: 1350, race: 'normal', size: 'large', element: 'fire', area: 'hundred-pillar-71-80f', isBoss: false },
  { id: 183, name: '熔岩守衛', level: 59, hp: 710, attackMin: 56, attackMax: 76, defense: 36, exp: 1400, race: 'normal', size: 'large', element: 'fire', area: 'hundred-pillar-71-80f', isBoss: false },
  { id: 184, name: '熔岩伊弗利特', level: 60, hp: 2800, attackMin: 65, attackMax: 88, defense: 40, exp: 7000, race: 'demon', size: 'large', element: 'fire', area: 'hundred-pillar-71-80f', isBoss: true, debuffs: [{ type: 'weaken', chance: 18 }, { type: 'stun', chance: 18 }] },
  // 百柱塔 81~90F Lv.57~60
  { id: 185, name: '殘影毒之皇女', level: 58, hp: 650, attackMin: 54, attackMax: 73, defense: 34, exp: 1320, race: 'demon', size: 'small', element: 'dark', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'poison', chance: 18 }, { type: 'weaken', chance: 18 }] },
  { id: 186, name: '殘影哥布林之王', level: 58, hp: 680, attackMin: 55, attackMax: 74, defense: 35, exp: 1360, race: 'normal', size: 'large', element: 'none', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'stun', chance: 15 }] },
  { id: 187, name: '殘影暗影吸血鬼', level: 59, hp: 690, attackMin: 56, attackMax: 75, defense: 36, exp: 1390, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'bleed', chance: 18 }, { type: 'curse', chance: 18 }] },
  { id: 188, name: '殘影不死殭屍王', level: 59, hp: 700, attackMin: 56, attackMax: 76, defense: 36, exp: 1400, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }, { type: 'weaken', chance: 18 }] },
  { id: 189, name: '殘影龍王約特勒', level: 59, hp: 710, attackMin: 57, attackMax: 77, defense: 37, exp: 1420, race: 'dragon', size: 'large', element: 'fire', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'bleed', chance: 22 }] },
  { id: 190, name: '殘影冥王哈瑪斯', level: 59, hp: 700, attackMin: 56, attackMax: 76, defense: 36, exp: 1400, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }, { type: 'weaken', chance: 18 }] },
  { id: 191, name: '殘影霜凍伊莉絲', level: 60, hp: 720, attackMin: 57, attackMax: 78, defense: 37, exp: 1440, race: 'normal', size: 'large', element: 'ice', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'slow', chance: 10 }, { type: 'weaken', chance: 18 }] },
  { id: 192, name: '殘影熔岩伊弗利特', level: 60, hp: 730, attackMin: 58, attackMax: 79, defense: 38, exp: 1460, race: 'demon', size: 'large', element: 'fire', area: 'hundred-pillar-81-90f', isBoss: false, debuffs: [{ type: 'weaken', chance: 20 }] },
  { id: 193, name: '守護者之主', level: 60, hp: 3200, attackMin: 68, attackMax: 92, defense: 42, exp: 8000, race: 'demon', size: 'large', element: 'dark', area: 'hundred-pillar-81-90f', isBoss: true, debuffs: [{ type: 'curse', chance: 20 }, { type: 'weaken', chance: 20 }, { type: 'stun', chance: 20 }] },
  // 百柱塔 91~100F Lv.60
  { id: 194, name: '精靈王衛兵', level: 60, hp: 740, attackMin: 58, attackMax: 79, defense: 38, exp: 1470, race: 'normal', size: 'large', element: 'light', area: 'hundred-pillar-91-100f', isBoss: false },
  { id: 195, name: '死之信徒', level: 60, hp: 680, attackMin: 56, attackMax: 76, defense: 36, exp: 1380, race: 'undead', size: 'small', element: 'dark', area: 'hundred-pillar-91-100f', isBoss: false, debuffs: [{ type: 'curse', chance: 18 }] },
  { id: 196, name: '精靈王射手', level: 60, hp: 660, attackMin: 55, attackMax: 75, defense: 35, exp: 1350, race: 'normal', size: 'small', element: 'light', attackType: 'ranged', attackRange: 10, area: 'hundred-pillar-91-100f', isBoss: false },
  { id: 197, name: '精靈王魔導士', level: 60, hp: 650, attackMin: 55, attackMax: 74, defense: 35, exp: 1340, race: 'normal', size: 'small', element: 'light', attackType: 'magic', attackRange: 8, area: 'hundred-pillar-91-100f', isBoss: false, debuffs: [{ type: 'weaken', chance: 18 }] },
  { id: 198, name: '死之執行者', level: 60, hp: 750, attackMin: 59, attackMax: 80, defense: 39, exp: 1500, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-91-100f', isBoss: false, debuffs: [{ type: 'curse', chance: 20 }] },
  { id: 199, name: '百柱死神', level: 60, hp: 3500, attackMin: 70, attackMax: 95, defense: 44, exp: 9000, race: 'undead', size: 'large', element: 'dark', area: 'hundred-pillar-91-100f', isBoss: true, debuffs: [{ type: 'curse', chance: 22 }, { type: 'weaken', chance: 22 }, { type: 'stun', chance: 22 }] },
];
