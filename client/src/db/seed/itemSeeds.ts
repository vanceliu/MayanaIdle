import type { ItemDefinition } from '../../models/items';

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  // === 藥水 ===
  { id: 1, name: '紅色藥水', category: 'potion', description: '回復 10~15 HP', weight: 2, buyPrice: 25, healMin: 10, healMax: 15, cooldown: 600, icon: 'items/standing-potion', iconColor: '#DC2626' },
  { id: 2, name: '橙色藥水', category: 'potion', description: '回復 30~45 HP', weight: 5, buyPrice: 80, healMin: 30, healMax: 45, cooldown: 900, icon: 'items/bubbling-flask', iconColor: '#F59E0B' },
  { id: 3, name: '白色藥水', category: 'potion', description: '回復 60~90 HP', weight: 10, buyPrice: 200, healMin: 60, healMax: 90, cooldown: 1500, icon: 'items/potion-ball', iconColor: '#E2E8F0' },
  { id: 133, name: '綠色藥水', category: 'potion', description: '攻速+33%（180秒）', weight: 5, buyPrice: 200, icon: 'items/standing-potion', iconColor: '#4ADE80' },
  { id: 134, name: '強化綠色藥水', category: 'potion', description: '攻速+33%（900秒）', weight: 10, buyPrice: 1000, icon: 'items/bubbling-flask', iconColor: '#4ADE80' },
  
  // === 狀態解除道具 ===
  { id: 144, name: '解毒藥水', category: 'potion', description: '立即解除中毒', weight: 2, buyPrice: 50, icon: 'items/potion-ball', iconColor: '#2DD4BF' },
  { id: 145, name: '止血繃帶', category: 'potion', description: '立即解除流血', weight: 2, buyPrice: 50, icon: 'items/sewing-string', iconColor: '#F87171' },
  { id: 146, name: '淨化藥水', category: 'potion', description: '解除詛咒/虛弱（全解）', weight: 3, buyPrice: 500, icon: 'items/bubbling-flask', iconColor: '#A78BFA' },

  // === 回城卷軸 ===
  { id: 4, name: '薄暮村回城卷軸', category: 'scroll', description: '使用後傳送至薄暮村', weight: 1, buyPrice: 500, icon: 'items/tied-scroll', iconColor: '#FBBF24' },
  { id: 5, name: '艾爾薩斯回城卷軸', category: 'scroll', description: '使用後傳送至艾爾薩斯城鎮', weight: 1, buyPrice: 500, icon: 'items/tied-scroll', iconColor: '#FBBF24' },
  { id: 6, name: '瓦爾登回城卷軸', category: 'scroll', description: '使用後傳送至瓦爾登城鎮', weight: 1, buyPrice: 500, icon: 'items/tied-scroll', iconColor: '#FBBF24' },
  { id: 156, name: '灰脊回城卷軸', category: 'scroll', description: '使用後傳送至灰脊城鎮', weight: 1, buyPrice: 500, icon: 'items/tied-scroll', iconColor: '#FBBF24' },

  // === 強化卷軸 ===
  { id: 7, name: '武器強化卷軸', category: 'scroll', description: '鐵匠鋪武器強化用', weight: 1, buyPrice: 100000, icon: 'items/scroll-unfurled', iconColor: '#F472B6' },
  { id: 8, name: '防具強化卷軸', category: 'scroll', description: '鐵匠鋪防具強化用', weight: 1, buyPrice: 50000, icon: 'items/scroll-unfurled', iconColor: '#60A5FA' },

  // === 印記（`46-sigil.md`）===
  // 詞綴專用消耗品，只在印記師使用。歸 scroll 而非 material —— 它們不是製作原料，
  // 也不該被雜貨店的「Tier N 以下批量販售」（只掃 material）掃掉。
  { id: 147, name: '混沌印記', category: 'scroll', description: '全部 4 條詞綴重骰（上限 T5，商店裝 T3）', weight: 0, sellPrice: 500, icon: 'items/millenium-key', iconColor: '#A855F7' },
  { id: 148, name: '刺針印記', category: 'scroll', description: '指定一條詞綴換成同池的另一條，Tier 不變', weight: 0, sellPrice: 500, icon: 'items/millenium-key', iconColor: '#2DD4BF' },
  { id: 149, name: '重刻印記', category: 'scroll', description: '指定一條詞綴的數值重骰，種類與 Tier 不變', weight: 0, sellPrice: 500, icon: 'items/millenium-key', iconColor: '#60A5FA' },
  { id: 150, name: '突破印記', category: 'scroll', description: '指定一條詞綴 T5→T6（10%）／T6→T7（2%），失敗回 T1', weight: 0, sellPrice: 500, icon: 'items/millenium-key', iconColor: '#FB923C' },
  // 精鍊與工藝走全區域掉落（§ 30.2 印記），故賣價 50G 與其他印記不同；
  // 六種印記重量一律 0（不計負重），圖示同為 millenium-key，只用顏色區分
  { id: 9, name: '工藝印記', category: 'scroll', description: '整件裝備品質 +1%（上限 20%），另收 5,000G', weight: 0, sellPrice: 50, icon: 'items/millenium-key', iconColor: '#FACC15' },
  { id: 10, name: '精鍊印記', category: 'scroll', description: '指定一條詞綴 Tier +1，必定成功，最高 T5（商店裝 T3）', weight: 0, sellPrice: 50, icon: 'items/millenium-key', iconColor: '#F1F5F9' },

  // === 製作用素材 ===
  { id: 11, name: '銀礦石', category: 'material', description: '銀材質裝備製作素材', weight: 5, sellPrice: 50, iconType: 'ore', iconTier: 2 },
  { id: 12, name: '銀精華', category: 'material', description: '銀材質高級配方素材', weight: 5, sellPrice: 50, iconType: 'crystal', iconTier: 3 },
  { id: 13, name: '米索利碎片', category: 'material', description: '米索利裝備製作素材', weight: 7, sellPrice: 150, iconType: 'ore', iconTier: 3 },
  { id: 14, name: '米索利礦石', category: 'material', description: '米索利高級配方素材', weight: 7, sellPrice: 150, iconType: 'ore', iconTier: 4 },
  { id: 15, name: '龍骨碎片', category: 'material', description: '龍材質裝備製作素材', weight: 7, sellPrice: 250, iconType: 'bone', iconTier: 3 },
  { id: 16, name: '龍心結晶', category: 'material', description: '龍材質高級配方素材', weight: 7, sellPrice: 250, iconType: 'crystal', iconTier: 4 },
  { id: 17, name: '奧里哈魯根碎片', category: 'material', description: '奧里哈魯根裝備製作素材', weight: 10, sellPrice: 550, iconType: 'ore', iconTier: 4 },
  { id: 18, name: '奧里哈魯根精華', category: 'material', description: '奧里哈魯根高級配方素材', weight: 10, sellPrice: 550, iconType: 'crystal', iconTier: 5 },

  // === 區域素材（曙光平原/綠谷/翡翠森林/迷霧沼地/風嘯高原/山賊據點）===
  { id: 19, name: '破碎獸牙', category: 'material', description: '暴牙兔的碎牙', weight: 1, sellPrice: 14, iconType: 'bone', iconTier: 1 },
  { id: 20, name: '黏液殘渣', category: 'material', description: '史萊姆的殘留物', weight: 1, sellPrice: 16, iconType: 'misc', iconTier: 1 },
  { id: 21, name: '粗糙獸皮', category: 'material', description: '野牛的粗皮', weight: 1, sellPrice: 18, iconType: 'fabric', iconTier: 1 },
  { id: 22, name: '狼爪碎片', category: 'material', description: '野狼的爪片', weight: 1, sellPrice: 20, iconType: 'bone', iconTier: 1 },
  { id: 23, name: '妖魔角', category: 'material', description: '妖魔的斷角', weight: 1, sellPrice: 24, iconType: 'bone', iconTier: 1 },
  { id: 24, name: '哥布林耳環', category: 'material', description: '哥布林的飾品', weight: 1, sellPrice: 28, iconType: 'misc', iconTier: 1 },
  { id: 25, name: '蜘蛛絲束', category: 'material', description: '森林蜘蛛的絲線', weight: 2, sellPrice: 30, iconType: 'fabric', iconTier: 1 },
  { id: 26, name: '樹精樹脂', category: 'material', description: '樹精靈分泌的樹脂', weight: 2, sellPrice: 32, iconType: 'misc', iconTier: 1 },
  { id: 27, name: '碎裂魔核', category: 'material', description: '碎裂的魔力核心', weight: 2, sellPrice: 36, iconType: 'crystal', iconTier: 1 },
  { id: 28, name: '毒蛇鱗片', category: 'material', description: '毒蛇的鱗片', weight: 2, sellPrice: 36, iconType: 'fabric', iconTier: 1 },
  { id: 29, name: '鷹羽', category: 'material', description: '風之鷹的羽毛', weight: 2, sellPrice: 50, iconType: 'fabric', iconTier: 1 },
  { id: 30, name: '蜥蜴甲殼', category: 'material', description: '沼澤蜥蜴的甲殼', weight: 2, sellPrice: 60, iconType: 'bone', iconTier: 1 },
  { id: 31, name: '石像碎片', category: 'material', description: '石像鬼的碎片', weight: 3, sellPrice: 80, iconType: 'ore', iconTier: 2 },
  { id: 32, name: '獅鷲羽毛', category: 'material', description: '高地獅鷲的羽毛', weight: 3, sellPrice: 110, iconType: 'fabric', iconTier: 2 },
  { id: 33, name: '山賊鐵塊', category: 'material', description: '山賊的鐵製碎塊', weight: 3, sellPrice: 140, iconType: 'ore', iconTier: 2 },

  // === 區域素材（象牙塔）===
  { id: 34, name: '凍骨碎片', category: 'material', description: '凍骨哥布林的骨片', weight: 3, sellPrice: 160, iconType: 'bone', iconTier: 2 },
  { id: 35, name: '冰霜蛛絲', category: 'material', description: '冰霜蜘蛛的絲線', weight: 3, sellPrice: 200, iconType: 'fabric', iconTier: 2 },
  { id: 36, name: '雪狼毛皮', category: 'material', description: '雪狼的毛皮', weight: 3, sellPrice: 260, iconType: 'fabric', iconTier: 2 },
  { id: 37, name: '巫師布片', category: 'material', description: '象牙巫師的布料', weight: 4, sellPrice: 200, iconType: 'fabric', iconTier: 3 },
  { id: 38, name: '霜甲碎片', category: 'material', description: '霜甲戰士的碎甲', weight: 4, sellPrice: 280, iconType: 'ore', iconTier: 3 },
  { id: 39, name: '冰晶核心', category: 'material', description: '冰霜元素的核心', weight: 4, sellPrice: 360, iconType: 'crystal', iconTier: 3 },

  // === 區域素材（艾爾薩斯領地）===
  { id: 40, name: '高等妖魔角', category: 'material', description: '高等妖魔的巨角', weight: 4, sellPrice: 200, iconType: 'bone', iconTier: 3 },
  { id: 41, name: '妖魔鬥士護符', category: 'material', description: '妖魔鬥士的護符', weight: 4, sellPrice: 280, iconType: 'misc', iconTier: 3 },
  { id: 42, name: '巨人指骨', category: 'material', description: '巨人的指骨', weight: 4, sellPrice: 360, iconType: 'bone', iconTier: 3 },
  { id: 43, name: '蟲殼碎片', category: 'material', description: '洞窟巨蟲的殼片', weight: 5, sellPrice: 400, iconType: 'bone', iconTier: 3 },
  { id: 44, name: '幻獸水晶', category: 'material', description: '朦朧幻獸的水晶', weight: 5, sellPrice: 520, iconType: 'crystal', iconTier: 3 },
  { id: 45, name: '洞窟菌絲', category: 'material', description: '洞窟深處的菌絲', weight: 5, sellPrice: 640, iconType: 'fabric', iconTier: 3 },
  { id: 151, name: '腐葉孢囊', category: 'material', description: '腐生樹妖的孢囊', weight: 4, sellPrice: 400, iconType: 'misc', iconTier: 3 },
  { id: 152, name: '祭壇黑曜石', category: 'material', description: '妖魔祭壇的黑曜石塊', weight: 5, sellPrice: 480, iconType: 'ore', iconTier: 3 },

  // === 區域素材（瓦爾登領地）===
  { id: 46, name: '鏡面碎片', category: 'material', description: '鏡面精靈的碎片', weight: 4, sellPrice: 200, iconType: 'crystal', iconTier: 3 },
  { id: 47, name: '光影狐尾毛', category: 'material', description: '光影狐的尾毛', weight: 4, sellPrice: 280, iconType: 'fabric', iconTier: 3 },
  { id: 48, name: '幻光鱗粉', category: 'material', description: '幻光獵蛾的鱗粉', weight: 4, sellPrice: 360, iconType: 'misc', iconTier: 3 },
  { id: 49, name: '亡靈碎骨', category: 'material', description: '溺水亡靈的碎骨', weight: 5, sellPrice: 400, iconType: 'bone', iconTier: 3 },
  { id: 50, name: '深海藻液', category: 'material', description: '深海藻獸的黏液', weight: 5, sellPrice: 520, iconType: 'misc', iconTier: 3 },
  { id: 51, name: '潮汐珠', category: 'material', description: '潮汐元素的珠子', weight: 5, sellPrice: 640, iconType: 'crystal', iconTier: 3 },
  { id: 153, name: '湖鏡水晶', category: 'material', description: '湖畔水靈凝出的水晶', weight: 4, sellPrice: 400, iconType: 'crystal', iconTier: 3 },
  { id: 154, name: '逆光鏡片', category: 'material', description: '碎鏡之影留下的鏡片', weight: 5, sellPrice: 480, iconType: 'crystal', iconTier: 3 },

  // === 區域素材（龍之谷）===
  { id: 155, name: '龍蛻碎片', category: 'material', description: '谷口幼龍蛻下的鱗屑', weight: 4, sellPrice: 240, iconType: 'fabric', iconTier: 3 },
  { id: 52, name: '飛龍鱗片', category: 'material', description: '飛龍的鱗片', weight: 4, sellPrice: 200, iconType: 'fabric', iconTier: 3 },
  { id: 53, name: '骷髏兵裝飾', category: 'material', description: '高階骷髏兵的裝飾', weight: 4, sellPrice: 280, iconType: 'misc', iconTier: 3 },
  { id: 54, name: '亞利安結晶', category: 'material', description: '亞利安的結晶', weight: 4, sellPrice: 360, iconType: 'crystal', iconTier: 3 },
  { id: 55, name: '剝皮蛛牙', category: 'material', description: '剝皮蜘蛛的牙齒', weight: 5, sellPrice: 400, iconType: 'bone', iconTier: 3 },
  { id: 56, name: '死亡靈魂殘片', category: 'material', description: '死亡靈魂的殘片', weight: 5, sellPrice: 520, iconType: 'crystal', iconTier: 3 },
  { id: 57, name: '大莫蛛眼', category: 'material', description: '大莫蜘蛛的眼球', weight: 5, sellPrice: 640, iconType: 'misc', iconTier: 3 },
  { id: 58, name: '深層龍鱗', category: 'material', description: '深層龍族的鱗片', weight: 6, sellPrice: 600, iconType: 'fabric', iconTier: 4 },
  { id: 59, name: '死亡靈魂精華', category: 'material', description: '死亡靈魂的精華', weight: 6, sellPrice: 700, iconType: 'crystal', iconTier: 4 },

  // === 區域素材（灰脊山脈）===
  { id: 60, name: '殭屍碎骨', category: 'material', description: '戰場殭屍的碎骨', weight: 5, sellPrice: 360, iconType: 'bone', iconTier: 4 },
  { id: 61, name: '骷髏兵箭簇', category: 'material', description: '骷髏弓手的箭頭', weight: 5, sellPrice: 440, iconType: 'ore', iconTier: 4 },
  { id: 62, name: '亡魂騎士碎甲', category: 'material', description: '亡魂騎士的碎甲', weight: 5, sellPrice: 560, iconType: 'ore', iconTier: 4 },
  { id: 63, name: '百柱蛛絲', category: 'material', description: '百柱蜘蛛的絲線', weight: 5, sellPrice: 440, iconType: 'fabric', iconTier: 4 },
  { id: 64, name: '奇美拉角', category: 'material', description: '百柱奇美拉的角', weight: 5, sellPrice: 560, iconType: 'bone', iconTier: 4 },
  { id: 65, name: '幻影殘片', category: 'material', description: '百柱幻影的殘片', weight: 5, sellPrice: 680, iconType: 'crystal', iconTier: 4 },
  { id: 66, name: '不死骨髓', category: 'material', description: '不死系列的骨髓', weight: 6, sellPrice: 560, iconType: 'bone', iconTier: 4 },
  { id: 67, name: '古龍牙', category: 'material', description: '古代龍的牙齒', weight: 6, sellPrice: 700, iconType: 'bone', iconTier: 4 },
  { id: 68, name: '女妖淚珠', category: 'material', description: '哭嚎女妖的淚珠', weight: 6, sellPrice: 840, iconType: 'crystal', iconTier: 4 },
  { id: 69, name: '霜凍結晶', category: 'material', description: '霜凍巨人的結晶', weight: 7, sellPrice: 700, iconType: 'crystal', iconTier: 4 },
  { id: 70, name: '熔岩核', category: 'material', description: '熔岩巨獸的核心', weight: 7, sellPrice: 800, iconType: 'crystal', iconTier: 4 },
  { id: 71, name: '殘影精華', category: 'material', description: '殘影系列的精華', weight: 7, sellPrice: 940, iconType: 'crystal', iconTier: 4 },
  { id: 72, name: '遠古鎖鏈', category: 'material', description: '遠古囚犯的鎖鏈', weight: 5, sellPrice: 300, iconType: 'ore', iconTier: 4 },
  { id: 73, name: '遠古箭頭', category: 'material', description: '遠古弓箭手的箭頭', weight: 5, sellPrice: 360, iconType: 'ore', iconTier: 4 },
  { id: 74, name: '封印碎片', category: 'material', description: '封印殭屍的碎片', weight: 6, sellPrice: 400, iconType: 'crystal', iconTier: 4 },
  { id: 75, name: '遠古勳章', category: 'material', description: '遠古戰士的勳章', weight: 6, sellPrice: 500, iconType: 'misc', iconTier: 4 },
  { id: 76, name: '凶獸牙', category: 'material', description: '遠古凶獸的尖牙', weight: 7, sellPrice: 600, iconType: 'bone', iconTier: 4 },
  { id: 77, name: '遠古戰士碎甲', category: 'material', description: '遠古戰士的碎甲', weight: 7, sellPrice: 760, iconType: 'ore', iconTier: 4 },

  // === Boss 專屬素材 ===
  { id: 78, name: '試煉飛龍之鱗', category: 'material', description: '試煉飛龍的鱗片', weight: 5, sellPrice: 200, iconType: 'fabric', iconTier: 5 },
  { id: 79, name: '雪地之主的凍心', category: 'material', description: '雪地之主的冰凍心臟', weight: 5, sellPrice: 500, iconType: 'crystal', iconTier: 5 },
  { id: 80, name: '惡魔之瞳', category: 'material', description: '象牙塔惡魔的眼瞳', weight: 5, sellPrice: 800, iconType: 'crystal', iconTier: 5 },
  { id: 81, name: '蛇魔毒囊', category: 'material', description: '朦朧蛇魔的毒囊', weight: 5, sellPrice: 800, iconType: 'misc', iconTier: 5 },
  { id: 82, name: '獄王深海珠', category: 'material', description: '深海獄王的珍珠', weight: 5, sellPrice: 800, iconType: 'crystal', iconTier: 5 },
  { id: 83, name: '巨龍逆鱗', category: 'material', description: '安塔巨龍的逆鱗', weight: 8, sellPrice: 1000, iconType: 'fabric', iconTier: 6 },
  { id: 84, name: '遠古騎士紋章', category: 'material', description: '遠古騎士的紋章', weight: 8, sellPrice: 1400, iconType: 'misc', iconTier: 6 },
  { id: 85, name: '皇女毒腺', category: 'material', description: '毒之皇女的毒腺', weight: 5, sellPrice: 800, iconType: 'misc', iconTier: 5 },
  { id: 86, name: '哥布林王冠碎片', category: 'material', description: '哥布林之王的王冠碎片', weight: 5, sellPrice: 800, iconType: 'ore', iconTier: 5 },
  { id: 87, name: '吸血鬼血晶', category: 'material', description: '暗影吸血鬼的血晶', weight: 5, sellPrice: 800, iconType: 'crystal', iconTier: 5 },
  { id: 88, name: '殭屍王心臟', category: 'material', description: '不死殭屍王的心臟', weight: 7, sellPrice: 900, iconType: 'misc', iconTier: 6 },
  { id: 89, name: '約特勒龍鱗', category: 'material', description: '龍王約特勒的龍鱗', weight: 7, sellPrice: 900, iconType: 'fabric', iconTier: 6 },
  { id: 90, name: '冥王靈魂石', category: 'material', description: '冥王哈馬斯的靈魂石', weight: 7, sellPrice: 900, iconType: 'crystal', iconTier: 6 },
  { id: 91, name: '伊莉絲霜核', category: 'material', description: '霜凍伊莉絲的霜核', weight: 7, sellPrice: 960, iconType: 'crystal', iconTier: 6 },
  { id: 92, name: '伊弗利特熔心', category: 'material', description: '熔岩伊弗利特的熔心', weight: 7, sellPrice: 960, iconType: 'crystal', iconTier: 6 },
  { id: 93, name: '守護者印記', category: 'material', description: '守護者之主的印記', weight: 7, sellPrice: 960, iconType: 'misc', iconTier: 6 },
  { id: 94, name: '死神碎魂', category: 'material', description: '百柱死神的碎魂', weight: 10, sellPrice: 1000, iconType: 'crystal', iconTier: 7 },

  // === 副本用素材 ===
  { id: 95, name: '百柱塔 1F 通行卷軸', category: 'dungeon', description: '進入百柱塔 1~10F 所需', weight: 1, buyPrice: 2000, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 135, name: '百柱塔 11F 通行卷軸', category: 'dungeon', description: '進入百柱塔 11F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 136, name: '百柱塔 21F 通行卷軸', category: 'dungeon', description: '進入百柱塔 21F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 137, name: '百柱塔 31F 通行卷軸', category: 'dungeon', description: '進入百柱塔 31F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 138, name: '百柱塔 41F 通行卷軸', category: 'dungeon', description: '進入百柱塔 41F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 139, name: '百柱塔 51F 通行卷軸', category: 'dungeon', description: '進入百柱塔 51F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 140, name: '百柱塔 61F 通行卷軸', category: 'dungeon', description: '進入百柱塔 61F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 141, name: '百柱塔 71F 通行卷軸', category: 'dungeon', description: '進入百柱塔 71F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 142, name: '百柱塔 81F 通行卷軸', category: 'dungeon', description: '進入百柱塔 81F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },
  { id: 143, name: '百柱塔 91F 通行卷軸', category: 'dungeon', description: '進入百柱塔 91F 所需', weight: 1, icon: 'items/tied-scroll', iconColor: '#A78BFA' },

  // === 任務素材 ===
  { id: 96, name: '任務素材', category: 'material', noSell: true, description: '職業工會素材收集任務用', weight: 1, iconType: 'misc', iconTier: 2 },

  // === 魔法書 ===
  { id: 97, name: '基礎魔法書', category: 'spellbook', description: '學習 4~5 級魔法', weight: 10, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 98, name: '中階魔法書', category: 'spellbook', description: '學習 6~7 級魔法', weight: 10, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 99, name: '高階魔法書', category: 'spellbook', description: '學習 8 級魔法', weight: 10, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 100, name: '稀有魔法書（上）', category: 'spellbook', description: '學習 9 級魔法', weight: 10, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 101, name: '稀有魔法書（下）', category: 'spellbook', description: '學習 10 級魔法', weight: 10, icon: 'items/spell-book', iconColor: '#C4B5FD' },

  // === 職業技能書 ===
  { id: 102, name: '盾擊技能書', category: 'spellbook', description: '騎士職業魔法 1 級：盾擊', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 103, name: '裂傷斬技能書', category: 'spellbook', description: '騎士職業魔法 2 級：裂傷斬', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 104, name: '鋼鐵護盾技能書', category: 'spellbook', description: '騎士職業魔法 3 級：鋼鐵護盾', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 105, name: '挑釁怒吼技能書', category: 'spellbook', description: '騎士職業魔法 4 級：挑釁怒吼', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 106, name: '復仇之刃技能書', category: 'spellbook', description: '騎士職業魔法 5 級：復仇之刃', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 107, name: '精準射擊技能書', category: 'spellbook', description: '妖精職業魔法 1 級：精準射擊', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 108, name: '火矢附魔技能書', category: 'spellbook', description: '妖精職業魔法 2 級：火矢附魔', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 109, name: '三連射技能書', category: 'spellbook', description: '妖精職業魔法 3 級：三連射', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 110, name: '鷹眼技能書', category: 'spellbook', description: '妖精職業魔法 4 級：鷹眼', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 111, name: '穿透箭雨技能書', category: 'spellbook', description: '妖精職業魔法 5 級：穿透箭雨', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 112, name: '冷卻縮減技能書', category: 'spellbook', description: '元素師職業魔法 1 級：冷卻縮減', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 113, name: '魔力奪取技能書', category: 'spellbook', description: '元素師職業魔法 2 級：魔力奪取', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 114, name: '元素增幅技能書', category: 'spellbook', description: '元素師職業魔法 3 級：元素增幅', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 115, name: '強化冷卻縮減技能書', category: 'spellbook', description: '元素師職業魔法 4 級：強化冷卻縮減', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 116, name: '元素風暴技能書', category: 'spellbook', description: '元素師職業魔法 5 級：元素風暴', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 117, name: '聖光護盾技能書', category: 'spellbook', description: '牧師職業魔法 1 級：聖光護盾', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 118, name: '高階治癒技能書', category: 'spellbook', description: '牧師職業魔法 2 級：高階治癒', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 119, name: '群體治癒技能書', category: 'spellbook', description: '牧師職業魔法 3 級：群體治癒', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 120, name: '聖光審判技能書', category: 'spellbook', description: '牧師職業魔法 4 級：聖光審判', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 121, name: '神聖領域技能書', category: 'spellbook', description: '牧師職業魔法 5 級：神聖領域', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 122, name: '淬毒技能書', category: 'spellbook', description: '盜賊職業魔法 1 級：淬毒', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 123, name: '致命一擊技能書', category: 'spellbook', description: '盜賊職業魔法 2 級：致命一擊', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 124, name: '煙霧彈技能書', category: 'spellbook', description: '盜賊職業魔法 3 級：煙霧彈', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 125, name: '精準打擊技能書', category: 'spellbook', description: '盜賊職業魔法 4 級：精準打擊', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },
  { id: 126, name: '背刺技能書', category: 'spellbook', description: '盜賊職業魔法 5 級：背刺', weight: 5, icon: 'items/spell-book', iconColor: '#C4B5FD' },

  // === 魔法書素材 ===
  { id: 127, name: '魔法書碎片', category: 'material', noSell: true, description: '合成魔法書用', weight: 5, iconType: 'spellbook-mat', iconTier: 2 },
  { id: 128, name: '魔法書材料（基礎）', category: 'material', noSell: true, description: '合成基礎魔法書', weight: 5, iconType: 'spellbook-mat', iconTier: 2 },
  { id: 129, name: '魔法書材料（中階）', category: 'material', noSell: true, description: '合成中階魔法書', weight: 5, iconType: 'spellbook-mat', iconTier: 3 },
  { id: 130, name: '魔法書材料（高階）', category: 'material', noSell: true, description: '合成高階魔法書', weight: 5, iconType: 'spellbook-mat', iconTier: 4 },
  { id: 131, name: '魔法書材料（稀有）', category: 'material', noSell: true, description: '合成稀有魔法書', weight: 5, iconType: 'spellbook-mat', iconTier: 5 },

  // === 其他 ===
  { id: 132, name: '磨刀石', category: 'other', description: '修復武器壞刀 1 層', weight: 2, buyPrice: 200 },
];
