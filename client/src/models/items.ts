export type ItemCategory = 'potion' | 'scroll' | 'material' | 'dungeon' | 'spellbook' | 'other';

export interface ItemDefinition {
  name: string;
  category: ItemCategory;
  description: string;
  weight: number;
  buyPrice?: number;
  sellPrice?: number;
  healMin?: number;
  healMax?: number;
  cooldown?: number;
}

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  // === 藥水 ===
  { name: '紅色藥水', category: 'potion', description: '回復 10~15 HP', weight: 2, buyPrice: 25, healMin: 10, healMax: 15, cooldown: 600 },
  { name: '橙色藥水', category: 'potion', description: '回復 30~45 HP', weight: 5, buyPrice: 80, healMin: 30, healMax: 45, cooldown: 900 },
  { name: '白色藥水', category: 'potion', description: '回復 60~90 HP', weight: 10, buyPrice: 200, healMin: 60, healMax: 90, cooldown: 1500 },

  // === 回城卷軸 ===
  { name: '薄暮村回城卷軸', category: 'scroll', description: '使用後傳送至薄暮村', weight: 1, buyPrice: 500 },
  { name: '艾爾薩斯回城卷軸', category: 'scroll', description: '使用後傳送至艾爾薩斯城鎮', weight: 1, buyPrice: 500 },
  { name: '瓦爾登回城卷軸', category: 'scroll', description: '使用後傳送至瓦爾登城鎮', weight: 1, buyPrice: 500 },

  // === 強化卷軸 ===
  { name: '武器強化卷軸', category: 'scroll', description: '鐵匠鋪武器強化用', weight: 1, buyPrice: 100000 },
  { name: '防具強化卷軸', category: 'scroll', description: '鐵匠鋪防具強化用', weight: 1, buyPrice: 50000 },

  // === 強化用素材 ===
  { name: '品質石', category: 'material', description: '鐵匠鋪提升裝備品質（+1%，上限 20%）', weight: 2 },
  { name: '強化石', category: 'material', description: '鐵匠鋪詞綴強化（逐級提升 Tier，最高 T5）', weight: 2 },

  // === 製作用素材 ===
  { name: '銀礦石', category: 'material', description: '銀材質裝備製作素材', weight: 5 },
  { name: '銀精華', category: 'material', description: '銀材質高階配方素材', weight: 5 },
  { name: '米索利碎片', category: 'material', description: '米索利裝備製作素材', weight: 7 },
  { name: '米索利礦石', category: 'material', description: '米索利高階配方素材', weight: 7 },
  { name: '龍骨碎片', category: 'material', description: '龍材質裝備製作素材', weight: 7 },
  { name: '龍心結晶', category: 'material', description: '龍材質高階配方素材', weight: 7 },
  { name: '奧里哈魯根碎片', category: 'material', description: '奧里哈魯根裝備製作素材', weight: 10 },
  { name: '奧里哈魯根精華', category: 'material', description: '奧里哈魯根高階配方素材', weight: 10 },

  // === 副本用素材 ===
  { name: '百柱塔卷軸', category: 'dungeon', description: '進入百柱塔對應區段所需', weight: 1 },

  // === 任務素材 ===
  { name: '任務素材', category: 'material', description: '職業工會素材收集任務用', weight: 1 },

  // === 魔法書 ===
  { name: '基礎魔法書', category: 'spellbook', description: '學習 4~5 級魔法', weight: 10 },
  { name: '中階魔法書', category: 'spellbook', description: '學習 6~7 級魔法', weight: 10 },
  { name: '高階魔法書', category: 'spellbook', description: '學習 8 級魔法', weight: 10 },
  { name: '稀有魔法書（上）', category: 'spellbook', description: '學習 9 級魔法', weight: 10 },
  { name: '稀有魔法書（下）', category: 'spellbook', description: '學習 10 級魔法', weight: 10 },

  // === 職業技能書 ===
  { name: '盾擊技能書', category: 'spellbook', description: '騎士職業魔法 1 級：盾擊', weight: 5 },
  { name: '裂傷斬技能書', category: 'spellbook', description: '騎士職業魔法 2 級：裂傷斬', weight: 5 },
  { name: '鋼鐵護盾技能書', category: 'spellbook', description: '騎士職業魔法 3 級：鋼鐵護盾', weight: 5 },
  { name: '挑釁怒吼技能書', category: 'spellbook', description: '騎士職業魔法 4 級：挑釁怒吼', weight: 5 },
  { name: '復仇之刃技能書', category: 'spellbook', description: '騎士職業魔法 5 級：復仇之刃', weight: 5 },
  { name: '精準射擊技能書', category: 'spellbook', description: '妖精職業魔法 1 級：精準射擊', weight: 5 },
  { name: '火矢附魔技能書', category: 'spellbook', description: '妖精職業魔法 2 級：火矢附魔', weight: 5 },
  { name: '三連射技能書', category: 'spellbook', description: '妖精職業魔法 3 級：三連射', weight: 5 },
  { name: '鷹眼技能書', category: 'spellbook', description: '妖精職業魔法 4 級：鷹眼', weight: 5 },
  { name: '穿透箭雨技能書', category: 'spellbook', description: '妖精職業魔法 5 級：穿透箭雨', weight: 5 },
  { name: '冷卻縮減技能書', category: 'spellbook', description: '元素師職業魔法 1 級：冷卻縮減', weight: 5 },
  { name: '魔力奪取技能書', category: 'spellbook', description: '元素師職業魔法 2 級：魔力奪取', weight: 5 },
  { name: '元素增幅技能書', category: 'spellbook', description: '元素師職業魔法 3 級：元素增幅', weight: 5 },
  { name: '連鎖詠唱技能書', category: 'spellbook', description: '元素師職業魔法 4 級：連鎖詠唱', weight: 5 },
  { name: '元素風暴技能書', category: 'spellbook', description: '元素師職業魔法 5 級：元素風暴', weight: 5 },
  { name: '聖光護盾技能書', category: 'spellbook', description: '牧師職業魔法 1 級：聖光護盾', weight: 5 },
  { name: '高階治癒技能書', category: 'spellbook', description: '牧師職業魔法 2 級：高階治癒', weight: 5 },
  { name: '群體治癒技能書', category: 'spellbook', description: '牧師職業魔法 3 級：群體治癒', weight: 5 },
  { name: '聖光審判技能書', category: 'spellbook', description: '牧師職業魔法 4 級：聖光審判', weight: 5 },
  { name: '神聖領域技能書', category: 'spellbook', description: '牧師職業魔法 5 級：神聖領域', weight: 5 },
  { name: '淬毒技能書', category: 'spellbook', description: '盜賊職業魔法 1 級：淬毒', weight: 5 },
  { name: '致命一擊技能書', category: 'spellbook', description: '盜賊職業魔法 2 級：致命一擊', weight: 5 },
  { name: '煙霧彈技能書', category: 'spellbook', description: '盜賊職業魔法 3 級：煙霧彈', weight: 5 },
  { name: '精準打擊技能書', category: 'spellbook', description: '盜賊職業魔法 4 級：精準打擊', weight: 5 },
  { name: '背刺技能書', category: 'spellbook', description: '盜賊職業魔法 5 級：背刺', weight: 5 },

  // === 魔法書素材 ===
  { name: '魔法書碎片', category: 'material', description: '合成魔法書用', weight: 5 },
  { name: '魔法書材料（基礎）', category: 'material', description: '合成基礎魔法書', weight: 5 },
  { name: '魔法書材料（中階）', category: 'material', description: '合成中階魔法書', weight: 5 },
  { name: '魔法書材料（高階）', category: 'material', description: '合成高階魔法書', weight: 5 },
  { name: '魔法書材料（稀有）', category: 'material', description: '合成稀有魔法書', weight: 5 },

  // === 其他 ===
  { name: '磨刀石', category: 'other', description: '修復武器壞刀 1 層', weight: 2, buyPrice: 200 },
  { name: '綠色藥水', category: 'potion', description: '攻速+33%（120秒）', weight: 5, buyPrice: 200 },
  { name: '強化綠色藥水', category: 'potion', description: '攻速+33%（600秒）', weight: 10, buyPrice: 1000 },
];

const ITEM_MAP = new Map<string, ItemDefinition>(
  ITEM_DEFINITIONS.map(item => [item.name, item])
);

export function getItemDefinition(name: string): ItemDefinition | undefined {
  return ITEM_MAP.get(name);
}

export function getItemWeight(name: string): number {
  return ITEM_MAP.get(name)?.weight ?? 0;
}

export function getItemDescription(name: string): string {
  return ITEM_MAP.get(name)?.description ?? '';
}

export function getItemBuyPrice(name: string): number {
  return ITEM_MAP.get(name)?.buyPrice ?? 0;
}
