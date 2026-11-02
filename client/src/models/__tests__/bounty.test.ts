/** 懸賞契約（`53-bounty-contract.md`） */
import { describe, it, expect } from 'vitest';
import {
  generateBountyBoard, getBountyBossCandidates, getBountyMonsterCandidates, getBountyPrice,
  getBountySignBlock, getBountyTotalPrice, isBountyBoardStale, isBountyTarget, isSameBountyTarget,
  latestBountyRefreshAt, nextBountyRefreshAt, recordBountyKill,
  BOUNTY_BOSS_KILLS, BOUNTY_MONSTER_KILLS, MAX_SIGNED_BOUNTIES,
  type BountyContract, type SignedBounty,
} from '../bounty';
import { QUEST_TOWN_IDS } from '../adventurerQuest';
import { createSeededSource } from '../../core/rng';
import { resolveArea } from '../mapData';

function contract(overrides: Partial<BountyContract> = {}): BountyContract {
  return { id: 'c1', kind: 'monster', areaId: 'snow-field', monsterName: '雪狼', targetKills: 60, priceLevel: 30, ...overrides };
}

function signed(overrides: Partial<SignedBounty> = {}): SignedBounty {
  return { ...contract(), kills: 0, takeBetter: false, ...overrides };
}

describe('§ 53.2 價格', () => {
  it.each([
    [29, null],
    [30, { base: 30_000, takeBetter: 200_000 }],
    [39, { base: 30_000, takeBetter: 200_000 }],
    [40, { base: 50_000, takeBetter: 300_000 }],
    [50, { base: 60_000, takeBetter: 400_000 }],
    [59, { base: 60_000, takeBetter: 400_000 }],
    [60, { base: 70_000, takeBetter: 500_000 }],
    [80, { base: 70_000, takeBetter: 500_000 }],
  ])('定價等級 %i', (level, expected) => {
    expect(getBountyPrice(level)).toEqual(expected);
  });

  it('加購時合計契約價與加價', () => {
    expect(getBountyTotalPrice(45, false)).toBe(50_000);
    expect(getBountyTotalPrice(45, true)).toBe(350_000);
  });
});

describe('§ 53.4 定時更新', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m).getTime();

  it.each([
    [at(0, 0), at(0)], [at(5, 59), at(0)], [at(6, 0), at(6)], [at(13, 30), at(12)], [at(23, 59), at(18)],
  ])('最近一個更新時刻', (now, expected) => {
    expect(latestBountyRefreshAt(now)).toBe(expected);
  });

  it('下一個更新時刻；18 點之後跨到隔天 0 點', () => {
    expect(nextBountyRefreshAt(at(13, 30))).toBe(at(18));
    expect(nextBountyRefreshAt(at(18, 0))).toBe(new Date(2026, 10, 3, 0, 0).getTime());
  });

  it('清單生成時間早於最近更新時刻才過期', () => {
    expect(isBountyBoardStale(undefined, at(8))).toBe(true);
    expect(isBountyBoardStale({ slots: [], generatedAt: at(6, 1) }, at(11, 59))).toBe(false);
    expect(isBountyBoardStale({ slots: [], generatedAt: at(11, 59) }, at(12, 0))).toBe(true);
  });
});

describe('§ 53.1 契約清單', () => {
  it.each(QUEST_TOWN_IDS)('%s：5 格，前 4 普通怪、最後 1 Boss，擊殺數與定價等級在範圍內', town => {
    const board = generateBountyBoard(town, createSeededSource(7), 1000);
    expect(board.slots).toHaveLength(5);
    const kinds = board.slots.map(c => c?.kind);
    expect(kinds).toEqual(['monster', 'monster', 'monster', 'monster', 'boss']);
    for (const c of board.slots) {
      const range = c!.kind === 'boss' ? BOUNTY_BOSS_KILLS : BOUNTY_MONSTER_KILLS;
      expect(c!.targetKills).toBeGreaterThanOrEqual(range.min);
      expect(c!.targetKills).toBeLessThanOrEqual(range.max);
      expect(c!.priceLevel).toBeGreaterThanOrEqual(30);
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
  });
});

describe('§ 53.5 對象判定與擊殺計數', () => {
  it('普通怪契約要區域與名稱都符合，且不是 Boss', () => {
    expect(isBountyTarget(contract(), 'snow-field', '雪狼', false)).toBe(true);
    expect(isBountyTarget(contract(), 'snow-field-deep', '雪狼', false)).toBe(false);
    expect(isBountyTarget(contract(), 'snow-field', '雪狼', true)).toBe(false);
  });

  it('Boss 契約只看 Boss 名稱', () => {
    const boss = contract({ kind: 'boss', monsterName: '雪地之主', areaId: 'snow-field-deep' });
    expect(isBountyTarget(boss, 'anywhere', '雪地之主', true)).toBe(true);
    expect(isBountyTarget(boss, 'snow-field-deep', '雪地之主', false)).toBe(false);
  });

  it('擊殺 +1；達標移除並回報完成', () => {
    const one = recordBountyKill([signed({ kills: 10 })], 'snow-field', '雪狼', false);
    expect(one.signed[0].kills).toBe(11);
    expect(one.completed).toEqual([]);

    const done = recordBountyKill([signed({ kills: 59 })], 'snow-field', '雪狼', false);
    expect(done.signed).toEqual([]);
    expect(done.completed[0].kills).toBe(60);

    const miss = recordBountyKill([signed()], 'snow-field', '雪人', false);
    expect(miss.signed[0].kills).toBe(0);
  });
});
