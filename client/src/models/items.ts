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


  { name: '破碎獸牙', category: 'material', description: '暴牙兔的碎牙', weight: 1, sellPrice: 4 },
  { name: '黏液殘渣', category: 'material', description: '史萊姆的殘留物', weight: 1, sellPrice: 6 },
  { name: '粗糙獸皮', category: 'material', description: '野牛的粗皮', weight: 1, sellPrice: 8 },
  { name: '狼爪碎片', category: 'material', description: '野狼的爪片', weight: 1, sellPrice: 10 },
  { name: '妖魔角', category: 'material', description: '妖魔的斷角', weight: 1, sellPrice: 14 },
  { name: '哥布林耳環', category: 'material', description: '哥布林的飾品', weight: 1, sellPrice: 18 },
  { name: '蜘蛛絲束', category: 'material', description: '森林蜘蛛的絲線', weight: 2, sellPrice: 20 },
  { name: '樹精樹脂', category: 'material', description: '樹精靈分泌的樹脂', weight: 2, sellPrice: 30 },
  { name: '碎裂魔核', category: 'material', description: '碎裂的魔力核心', weight: 2, sellPrice: 36 },
  { name: '毒蛇鱗片', category: 'material', description: '毒蛇的鱗片', weight: 2, sellPrice: 36 },
  { name: '鷹羽', category: 'material', description: '風之鷹的羽毛', weight: 2, sellPrice: 50 },
  { name: '蜥蜴甲殼', category: 'material', description: '沼澤蜥蜴的甲殼', weight: 2, sellPrice: 60 },
  { name: '石像碎片', category: 'material', description: '石像鬼的碎片', weight: 3, sellPrice: 80 },
  { name: '獅鷲羽毛', category: 'material', description: '高地獅鷲的羽毛', weight: 3, sellPrice: 110 },
  { name: '山賊鐵塊', category: 'material', description: '山賊的鐵製碎塊', weight: 3, sellPrice: 140 },

  // === 區域素材（象牙塔）===
  { name: '凍骨碎片', category: 'material', description: '凍骨哥布林的骨片', weight: 3, sellPrice: 160 },
  { name: '冰霜蛛絲', category: 'material', description: '冰霜蜘蛛的絲線', weight: 3, sellPrice: 200 },
  { name: '雪狼毛皮', category: 'material', description: '雪狼的毛皮', weight: 3, sellPrice: 260 },
  { name: '巫師布片', category: 'material', description: '象牙巫師的布料', weight: 4, sellPrice: 200 },
  { name: '霜甲碎片', category: 'material', description: '霜甲戰士的碎甲', weight: 4, sellPrice: 280 },
  { name: '冰晶核心', category: 'material', description: '冰霜元素的核心', weight: 4, sellPrice: 360 },

  // === 區域素材（艾爾薩斯領地）===
  { name: '高等妖魔角', category: 'material', description: '高等妖魔的巨角', weight: 4, sellPrice: 200 },
  { name: '妖魔鬥士護符', category: 'material', description: '妖魔鬥士的護符', weight: 4, sellPrice: 280 },
  { name: '巨人指骨', category: 'material', description: '巨人的指骨', weight: 4, sellPrice: 360 },
  { name: '蟲殼碎片', category: 'material', description: '洞窟巨蟲的殼片', weight: 5, sellPrice: 400 },
  { name: '幻獸水晶', category: 'material', description: '朦朧幻獸的水晶', weight: 5, sellPrice: 520 },
  { name: '洞窟菌絲', category: 'material', description: '洞窟深處的菌絲', weight: 5, sellPrice: 640 },

  // === 區域素材（瓦爾登領地）===
  { name: '鏡面碎片', category: 'material', description: '鏡面精靈的碎片', weight: 4, sellPrice: 200 },
  { name: '光影狐尾毛', category: 'material', description: '光影狐的尾毛', weight: 4, sellPrice: 280 },
  { name: '幻光鱗粉', category: 'material', description: '幻光獵蛾的鱗粉', weight: 4, sellPrice: 360 },
  { name: '亡靈碎骨', category: 'material', description: '溺水亡靈的碎骨', weight: 5, sellPrice: 400 },
  { name: '深海藻液', category: 'material', description: '深海藻獸的黏液', weight: 5, sellPrice: 520 },
  { name: '潮汐珠', category: 'material', description: '潮汐元素的珠子', weight: 5, sellPrice: 640 },

  // === 區域素材（龍之谷）===
  { name: '飛龍鱗片', category: 'material', description: '飛龍的鱗片', weight: 4, sellPrice: 200 },
  { name: '骷髏兵裝飾', category: 'material', description: '高階骷髏兵的裝飾', weight: 4, sellPrice: 280 },
  { name: '亞利安結晶', category: 'material', description: '亞利安的結晶', weight: 4, sellPrice: 360 },
  { name: '剝皮蛛牙', category: 'material', description: '剝皮蜘蛛的牙齒', weight: 5, sellPrice: 400 },
  { name: '死亡靈魂殘片', category: 'material', description: '死亡靈魂的殘片', weight: 5, sellPrice: 520 },
  { name: '大莫蛛眼', category: 'material', description: '大莫蜘蛛的眼球', weight: 5, sellPrice: 640 },
  { name: '深層龍鱗', category: 'material', description: '深層龍族的鱗片', weight: 6, sellPrice: 600 },
  { name: '死亡靈魂精華', category: 'material', description: '死亡靈魂的精華', weight: 6, sellPrice: 700 },

  // === 區域素材（灰脊山脈）===
  { name: '殭屍碎骨', category: 'material', description: '戰場殭屍的碎骨', weight: 5, sellPrice: 360 },
  { name: '骷髏兵箭簇', category: 'material', description: '骷髏弓手的箭頭', weight: 5, sellPrice: 440 },
  { name: '亡魂騎士碎甲', category: 'material', description: '亡魂騎士的碎甲', weight: 5, sellPrice: 560 },
  { name: '百柱蛛絲', category: 'material', description: '百柱蜘蛛的絲線', weight: 5, sellPrice: 440 },
  { name: '奇美拉角', category: 'material', description: '百柱奇美拉的角', weight: 5, sellPrice: 560 },
  { name: '幻影殘片', category: 'material', description: '百柱幻影的殘片', weight: 5, sellPrice: 680 },
  { name: '不死骨髓', category: 'material', description: '不死系列的骨髓', weight: 6, sellPrice: 560 },
  { name: '古龍牙', category: 'material', description: '古代龍的牙齒', weight: 6, sellPrice: 700 },
  { name: '女妖淚珠', category: 'material', description: '哭嚎女妖的淚珠', weight: 6, sellPrice: 840 },
  { name: '霜凍結晶', category: 'material', description: '霜凍巨人的結晶', weight: 7, sellPrice: 700 },
  { name: '熔岩核', category: 'material', description: '熔岩巨獸的核心', weight: 7, sellPrice: 800 },
  { name: '殘影精華', category: 'material', description: '殘影系列的精華', weight: 7, sellPrice: 940 },
  { name: '遠古鎖鏈', category: 'material', description: '遠古囚犯的鎖鏈', weight: 5, sellPrice: 300 },
  { name: '遠古箭頭', category: 'material', description: '遠古弓箭手的箭頭', weight: 5, sellPrice: 360 },
  { name: '封印碎片', category: 'material', description: '封印殭屍的碎片', weight: 6, sellPrice: 400 },
  { name: '遠古勳章', category: 'material', description: '遠古戰士的勳章', weight: 6, sellPrice: 500 },
  { name: '凶獸牙', category: 'material', description: '遠古凶獸的尖牙', weight: 7, sellPrice: 600 },
  { name: '遠古戰士碎甲', category: 'material', description: '遠古戰士的碎甲', weight: 7, sellPrice: 760 },

  // === Boss 專屬素材 ===
  { name: '試煉飛龍之鱗', category: 'material', description: '試煉飛龍的鱗片', weight: 5, sellPrice: 200 },
  { name: '雪地之主的凍心', category: 'material', description: '雪地之主的冰凍心臟', weight: 5, sellPrice: 500 },
  { name: '惡魔之瞳', category: 'material', description: '象牙塔惡魔的眼瞳', weight: 5, sellPrice: 800 },
  { name: '蛇魔毒囊', category: 'material', description: '朦朧蛇魔的毒囊', weight: 5, sellPrice: 800 },
  { name: '獄王深海珠', category: 'material', description: '深海獄王的珍珠', weight: 5, sellPrice: 800 },
  { name: '巨龍逆鱗', category: 'material', description: '安塔巨龍的逆鱗', weight: 8, sellPrice: 1000 },
  { name: '遠古騎士紋章', category: 'material', description: '遠古騎士的紋章', weight: 8, sellPrice: 1400 },
  { name: '皇女毒腺', category: 'material', description: '毒之皇女的毒腺', weight: 5, sellPrice: 800 },
  { name: '哥布林王冠碎片', category: 'material', description: '哥布林之王的王冠碎片', weight: 5, sellPrice: 800 },
  { name: '吸血鬼血晶', category: 'material', description: '暗影吸血鬼的血晶', weight: 5, sellPrice: 800 },
  { name: '殭屍王心臟', category: 'material', description: '不死殭屍王的心臟', weight: 7, sellPrice: 900 },
  { name: '約特勒龍鱗', category: 'material', description: '龍王約特勒的龍鱗', weight: 7, sellPrice: 900 },
  { name: '冥王靈魂石', category: 'material', description: '冥王哈馬斯的靈魂石', weight: 7, sellPrice: 900 },
  { name: '伊莉絲霜核', category: 'material', description: '霜凍伊莉絲的霜核', weight: 7, sellPrice: 960 },
  { name: '伊弗利特熔心', category: 'material', description: '熔岩伊弗利特的熔心', weight: 7, sellPrice: 960 },
  { name: '守護者印記', category: 'material', description: '守護者之主的印記', weight: 7, sellPrice: 960 },
  { name: '死神碎魂', category: 'material', description: '百柱死神的碎魂', weight: 10, sellPrice: 1000 },

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
