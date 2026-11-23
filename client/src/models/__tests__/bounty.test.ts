/** 懸賞契約（`53-bounty-contract.md`） */
import { describe, it, expect } from 'vitest';
import {
  generateBountyBoard, getBountyBossCandidates, getBountyMonsterCandidates, getBountyPrice,
  getBountySignBlock, getBountyTotalPrice, isBountyBoardStale, isBountyTarget, isSameBountyTarget, isUniqueBountyTarget,
  latestBountyRefreshAt, nextBountyRefreshAt, recordBountyKill,
  BOUNTY_BOSS_KILLS, BOUNTY_MONSTER_KILLS, MAX_SIGNED_BOUNTIES,
  type BountyContract, type SignedBounty,
} from '../bounty';
import { QUEST_TOWN_IDS, type QuestTownId } from '../adventurerQuest';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';
import { createSeededSource } from '../../core/rng';
import { resolveArea } from '../mapData';

const UNIQUE_NAMES = new Set(MONSTER_SEEDS.filter(m => m.isUnique).map(m => m.name));

function contract(overrides: Partial<BountyContract> = {}): BountyContract {
  return { id: 'c1', kind: 'monster', areaId: 'snow-field', monsterName: '雪狼', targetKills: 60, priceLevel: 30, ...overrides };
}

function signed(overrides: Partial<SignedBounty> = {}): SignedBounty {
  return { ...contract(), kills: 0, takeBetter: false, ...overrides };
}

describe('§ 53.2 價格', () => {
  it.each([
    [29, null],
    [30, { base: 30_000, takeBetter: 20_000 }],
    [39, { base: 30_000, takeBetter: 20_000 }],
    [40, { base: 50_000, takeBetter: 30_000 }],
    [50, { base: 60_000, takeBetter: 40_000 }],
    [59, { base: 60_000, takeBetter: 40_000 }],
    [60, { base: 70_000, takeBetter: 50_000 }],
    [80, { base: 70_000, takeBetter: 50_000 }],
  ])('定價等級 %i', (level, expected) => {
    expect(getBountyPrice(level)).toEqual(expected);
  });

  it('加購時合計契約價與加價', () => {
    expect(getBountyTotalPrice(45, false)).toBe(50_000);
    expect(getBountyTotalPrice(45, true)).toBe(80_000);
  });
});

describe('§ 53.4 定時更新', () => {
  /** 遊戲時間（UTC+8）2026-11-02 h:m */
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 2, h - 8, m);

  it.each([
    [at(0, 0), at(0)], [at(5, 59), at(0)], [at(6, 0), at(6)], [at(13, 30), at(12)], [at(23, 59), at(18)],
  ])('最近一個更新時刻', (now, expected) => {
    expect(latestBountyRefreshAt(now)).toBe(expected);
  });

  it('下一個更新時刻；18 點之後跨到隔天 0 點', () => {
    expect(nextBountyRefreshAt(at(13, 30))).toBe(at(18));
    expect(nextBountyRefreshAt(at(18, 0))).toBe(at(24));
  });

  it('清單生成時間早於最近更新時刻才過期', () => {
    expect(isBountyBoardStale(undefined, at(8))).toBe(true);
    expect(isBountyBoardStale({ slots: [], generatedAt: at(6, 1) }, at(11, 59))).toBe(false);
    expect(isBountyBoardStale({ slots: [], generatedAt: at(11, 59) }, at(12, 0))).toBe(true);
  });
});

describe('§ 53.1 契約清單', () => {
  it.each(QUEST_TOWN_IDS)('%s：6 格，前 3 普通怪、後 3 Boss，擊殺數與定價等級在範圍內', town => {
    const board = generateBountyBoard(town, createSeededSource(7), 1000);
    expect(board.slots).toHaveLength(6);
    const kinds = board.slots.map(c => c?.kind);
    expect(kinds).toEqual(['monster', 'monster', 'monster', 'boss', 'boss', 'boss']);
    for (const c of board.slots) {
      const range = c!.kind === 'boss' ? BOUNTY_BOSS_KILLS : BOUNTY_MONSTER_KILLS;
      expect(c!.targetKills).toBeGreaterThanOrEqual(range.min);
      expect(c!.targetKills).toBeLessThanOrEqual(range.max);
      expect(c!.priceLevel).toBeGreaterThanOrEqual(30);
    }
  });

  it.each(QUEST_TOWN_IDS)('%s：同一份清單內不重複對象', town => {
    for (let seed = 1; seed <= 200; seed++) {
      const slots = generateBountyBoard(town, createSeededSource(seed), 1000).slots.filter(c => c !== null);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(isSameBountyTarget(slots[i]!, slots[j]!)).toBe(false);
        }
      }
    }
  });

  it('普通怪只取區域最低等級 ≥ 30 的區域，定價等級＝區域最低等級', () => {
    for (const town of QUEST_TOWN_IDS) {
      for (const c of getBountyMonsterCandidates(town)) {
        expect(resolveArea(c.areaId)?.levelMin).toBe(c.priceLevel);
        expect(c.priceLevel).toBeGreaterThanOrEqual(30);
      }
    }
    expect(getBountyMonsterCandidates('neutral-town').some(c => c.areaId === 'trial-highlands-top')).toBe(false);
  });

  it('Boss 取 Boss 等級 ≥ 30，試煉飛龍（Lv.30）列入薄暮村', () => {
    const names = getBountyBossCandidates('neutral-town').map(c => c.monsterName);
    expect(names).toContain('試煉飛龍');
    expect(getBountyBossCandidates('neutral-town').find(c => c.monsterName === '試煉飛龍')!.priceLevel).toBe(30);
  });

  it('Boss 池的獨特魔物＝該城鎮隨機出現的獨特魔物（§ 53.1 表），定時出現者不列入', () => {
    const expected: Record<QuestTownId, string[]> = {
      'neutral-town': ['冰牙狼王', '冰晶蝙蝠王', '象牙大巫師'],
      'elsarth-town': ['妖魔大頭目', '腐根樹王', '蜥蜴首領', '洞窟巨蟲母', '亡魂將軍', '封印屍王', '遠古食人妖精王'],
      'varden-town': ['鏡之守護靈', '湖光幻后', '典獄長', '溺亡之主', '潮汐巨靈', '亡魂將軍', '封印屍王', '遠古食人妖精王'],
      'greyridge-town': ['骸骨百夫長', '骷髏軍團長', '怨魂聚合體', '亡魂將軍', '封印屍王', '遠古食人妖精王'],
    };
    for (const town of QUEST_TOWN_IDS) {
      const uniques = getBountyBossCandidates(town).map(c => c.monsterName).filter(n => UNIQUE_NAMES.has(n));
      expect(uniques.sort(), town).toEqual([...expected[town]].sort());
    }
  });

  it('Boss 池的 Boss 不變（§ 53.1 表）', () => {
    const expected: Record<QuestTownId, string[]> = {
      'neutral-town': ['試煉飛龍', '雪地之主', '象牙塔惡魔'],
      'elsarth-town': ['朦朧蛇魔', '遠古騎士'],
      'varden-town': ['深海獄王', '遠古騎士'],
      'greyridge-town': [
        '安塔巨龍', '毒之皇女', '哥布林之王', '暗影吸血鬼', '不死殭屍王', '龍王約特勒', '冥王哈馬斯',
        '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神', '遠古騎士',
      ],
    };
    for (const town of QUEST_TOWN_IDS) {
      const bosses = getBountyBossCandidates(town).map(c => c.monsterName).filter(n => !UNIQUE_NAMES.has(n));
      expect(bosses.sort(), town).toEqual([...expected[town]].sort());
    }
  });

  it('獨特魔物契約：定價等級＝獨特魔物等級，區域＝§ 36.8.2 區域欄', () => {
    const find = (town: QuestTownId, name: string) => getBountyBossCandidates(town).find(c => c.monsterName === name)!;
    expect(find('greyridge-town', '骷髏軍團長')).toEqual({ areaId: 'dragon-valley-1f', monsterName: '骷髏軍團長', priceLevel: 43 });
    expect(find('elsarth-town', '封印屍王')).toEqual({ areaId: 'ancient-dungeon-5f', monsterName: '封印屍王', priceLevel: 55 });
    expect(find('varden-town', '遠古食人妖精王')).toEqual({ areaId: 'ancient-dungeon-7f', monsterName: '遠古食人妖精王', priceLevel: 60 });
    expect(find('neutral-town', '冰牙狼王')).toEqual({ areaId: 'snow-field', monsterName: '冰牙狼王', priceLevel: 33 });
  });
});

describe('§ 53.3 簽約條件', () => {
  it('金幣不足、已簽滿、同對象依序擋下', () => {
    const c = contract();
    expect(getBountySignBlock(c, false, [], 29_999)).toBe('gold');
    expect(getBountySignBlock(c, true, [], 30_000)).toBe('gold');
    const full = Array.from({ length: MAX_SIGNED_BOUNTIES }, (_, i) => signed({ id: `s${i}`, monsterName: `m${i}` }));
    expect(getBountySignBlock(c, false, full, 1_000_000)).toBe('limit');
    expect(getBountySignBlock(c, false, [signed({ id: 'x' })], 1_000_000)).toBe('duplicate');
    expect(getBountySignBlock(c, false, [], 30_000)).toBeNull();
  });

  it('同對象：普通怪看區域＋名稱，Boss 只看名稱', () => {
    expect(isSameBountyTarget(contract(), contract({ id: 'c2' }))).toBe(true);
    expect(isSameBountyTarget(contract(), contract({ id: 'c2', areaId: 'snow-field-deep' }))).toBe(false);
    const boss = contract({ kind: 'boss', monsterName: '雪地之主', areaId: 'snow-field-deep' });
    expect(isSameBountyTarget(boss, { ...boss, id: 'b2', areaId: 'x' })).toBe(true);
    const unique = contract({ kind: 'boss', monsterName: '封印屍王', areaId: 'ancient-dungeon-5f' });
    expect(isSameBountyTarget(unique, { ...unique, id: 'u2', areaId: 'ancient-dungeon-6f' })).toBe(true);
    expect(isSameBountyTarget(unique, { ...unique, id: 'u3', kind: 'monster' })).toBe(false);
  });
});

describe('§ 53.5 對象判定與擊殺計數', () => {
  it('普通怪契約要區域與名稱都符合，且不是 Boss', () => {
    expect(isBountyTarget(contract(), 'snow-field', '雪狼', 'normal')).toBe(true);
    expect(isBountyTarget(contract(), 'snow-field-deep', '雪狼', 'normal')).toBe(false);
    expect(isBountyTarget(contract(), 'snow-field', '雪狼', 'boss')).toBe(false);
    expect(isBountyTarget(contract(), 'snow-field', '雪狼', 'unique')).toBe(false);
  });

  it('Boss 契約只看 Boss 名稱', () => {
    const boss = contract({ kind: 'boss', monsterName: '雪地之主', areaId: 'snow-field-deep' });
    expect(isBountyTarget(boss, 'anywhere', '雪地之主', 'boss')).toBe(true);
    expect(isBountyTarget(boss, 'snow-field-deep', '雪地之主', 'normal')).toBe(false);
  });

  it('Boss 契約對獨特魔物同樣只看名稱，跨樓層皆符合', () => {
    const unique = contract({ kind: 'boss', monsterName: '骷髏軍團長', areaId: 'dragon-valley-1f', priceLevel: 43 });
    expect(isBountyTarget(unique, 'dragon-valley-1f', '骷髏軍團長', 'unique')).toBe(true);
    expect(isBountyTarget(unique, 'dragon-valley-2f', '骷髏軍團長', 'unique')).toBe(true);
    expect(isBountyTarget(unique, 'dragon-valley-1f', '骷髏軍團長', 'normal')).toBe(false);
    expect(isBountyTarget(unique, 'dragon-valley-1f', '骷髏', 'unique')).toBe(false);
    const done = recordBountyKill([signed({ ...unique, kills: 0, targetKills: 1 })], 'dragon-valley-2f', '骷髏軍團長', 'unique');
    expect(done.completed).toHaveLength(1);
  });

  it('擊殺 +1；達標移除並回報完成', () => {
    const one = recordBountyKill([signed({ kills: 10 })], 'snow-field', '雪狼', 'normal');
    expect(one.signed[0].kills).toBe(11);
    expect(one.completed).toEqual([]);

    const done = recordBountyKill([signed({ kills: 59 })], 'snow-field', '雪狼', 'normal');
    expect(done.signed).toEqual([]);
    expect(done.completed[0].kills).toBe(60);

    const miss = recordBountyKill([signed()], 'snow-field', '雪人', 'normal');
    expect(miss.signed[0].kills).toBe(0);
  });
});

describe('isUniqueBountyTarget（§ 53.7 獨特魔物小標）', () => {
  it('Boss 契約對象為獨特魔物才回 true', () => {
    expect(isUniqueBountyTarget({ kind: 'boss', monsterName: '骷髏軍團長' })).toBe(true);
    expect(isUniqueBountyTarget({ kind: 'boss', monsterName: '安塔巨龍' })).toBe(false);
    expect(isUniqueBountyTarget({ kind: 'monster', monsterName: '骷髏軍團長' })).toBe(false);
  });

  it('所有 seed 的獨特魔物都判定為獨特魔物', () => {
    for (const name of UNIQUE_NAMES) {
      expect(isUniqueBountyTarget({ kind: 'boss', monsterName: name })).toBe(true);
    }
  });
});
