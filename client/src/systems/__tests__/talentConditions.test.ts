import { describe, it, expect } from 'vitest';
import { evaluateCombatScript, type CombatScriptContext } from '../scriptRunner';
import type { CombatRule } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';

/**
 * 階段 6 新增的零前置條件（`51-auto-talent.md` § 51.4.5~51.4.6）。
 *
 * 只驗新條件的判定，不重測既有的 —— 那些在 `scriptRunner` 的既有測試裡。
 */

const baseChar = {
  level: 20, hp: 100, maxHp: 200, mp: 50, maxMp: 100,
  areaEnteredAt: 0,
  currentArea: 'wind-woods', currentRegion: 'starter',
} as unknown as Character;

function monster(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: 'M', level: 20, currentHp: 100, maxHp: 100,
    attackMin: 1, attackMax: 2, defense: 10, exp: 1,
    race: 'normal', size: 'small', element: 'fire', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...over,
  } as MonsterInstance;
}

function ctx(over: Partial<CombatScriptContext> = {}): CombatScriptContext {
  return {
    character: baseChar,
    monsters: [{ id: 'm1', instance: monster(), position: { x: 3, y: 0 } }],
    skills: [],
    now: 60_000,
    playerPos: { x: 0, y: 0 },
    primaryTargetId: 'm1',
    weaponRange: 1.5,
    ...over,
  };
}

/** 只有一條規則：條件成立就回 normal_attack，不成立回 null */
function check(condition: Record<string, unknown>, c: CombatScriptContext): boolean {
  const rules = [{
    id: 'r', enabled: true, conditions: [condition], action: { type: 'normal_attack' },
  }] as unknown as CombatRule[];
  return evaluateCombatScript(rules, c) !== null;
}

describe('共用條件（§ 51.4.5）', () => {
  it('HP 低於／高於 —— 走 effectiveMaxHp，不是 character.maxHp', () => {
    // hp 100 / effectiveMaxHp 400 ＝ 25%
    const c = ctx({ effectiveMaxHp: 400 });
    expect(check({ type: 'hp_below', value: 30 }, c)).toBe(true);
    expect(check({ type: 'hp_below', value: 20 }, c)).toBe(false);
    expect(check({ type: 'hp_above', value: 20 }, c)).toBe(true);
  });

  it('手持武器類型', () => {
    expect(check({ type: 'weapon_type_is', match: 'bow' }, ctx({ weaponType: 'bow' }))).toBe(true);
    expect(check({ type: 'weapon_type_is', match: 'bow' }, ctx({ weaponType: 'sword' }))).toBe(false);
    // 空手
    expect(check({ type: 'weapon_type_is', match: 'bow' }, ctx())).toBe(false);
  });

  it('在本區停留超過 N 分鐘 —— 對應 Pressure 的壓力累積', () => {
    // areaEnteredAt = 0、now = 60000 → 剛好 1 分鐘
    expect(check({ type: 'area_dwell_gte', value: 1 }, ctx())).toBe(true);
    expect(check({ type: 'area_dwell_gte', value: 2 }, ctx())).toBe(false);
  });

  it('負重超過 X%', () => {
    expect(check({ type: 'weight_over', value: 80 }, ctx({ weightPercent: 90 }))).toBe(true);
    expect(check({ type: 'weight_over', value: 80 }, ctx({ weightPercent: 70 }))).toBe(false);
    // 沒帶就是 0，不會誤觸發
    expect(check({ type: 'weight_over', value: 0.1 }, ctx())).toBe(false);
  });

  it('自身無敵中／帶護盾', () => {
    const shield = [{
      target: 'player', startTime: 59_000, duration: 5_000, shieldRemaining: 50,
    }] as any;
    const expired = [{
      target: 'player', startTime: 0, duration: 1_000, invincible: true,
    }] as any;
    expect(check({ type: 'self_shielded' }, ctx({ activeEffects: shield }))).toBe(true);
    // 過期的不算
    expect(check({ type: 'self_shielded' }, ctx({ activeEffects: expired }))).toBe(false);
    expect(check({ type: 'self_shielded' }, ctx())).toBe(false);
  });

  it('所在區域 —— area 與 region 都比對得到', () => {
    expect(check({ type: 'current_area_is', match: 'wind-woods' }, ctx())).toBe(true);
    expect(check({ type: 'current_area_is', match: 'starter' }, ctx())).toBe(true);
    expect(check({ type: 'current_area_is', match: 'other' }, ctx())).toBe(false);
  });
});

describe('戰鬥專屬條件（§ 51.4.6）', () => {
  it('目標距離 —— compare 決定方向', () => {
    // 目標在 (3,0)，玩家在 (0,0) → 距離 3
    expect(check({ type: 'target_distance', value: 2, compare: 'gt' }, ctx())).toBe(true);
    expect(check({ type: 'target_distance', value: 2, compare: 'lt' }, ctx())).toBe(false);
    expect(check({ type: 'target_distance', value: 5, compare: 'lt' }, ctx())).toBe(true);
  });

  it('目標攻擊型別 —— 真正的反制軸，遠程怪要優先處理', () => {
    const ranged = ctx({ monsters: [{ id: 'm1', instance: monster({ attackType: 'ranged' }), position: { x: 3, y: 0 } }] });
    expect(check({ type: 'target_attack_type', match: 'ranged' }, ranged)).toBe(true);
    expect(check({ type: 'target_attack_type', match: 'melee' }, ranged)).toBe(false);
  });

  it('目標種族／元素／體型', () => {
    const undead = ctx({ monsters: [{ id: 'm1', instance: monster({ race: 'undead', element: 'dark', size: 'large' }), position: { x: 1, y: 0 } }] });
    expect(check({ type: 'target_race', match: 'undead' }, undead)).toBe(true);
    expect(check({ type: 'target_element', match: 'dark' }, undead)).toBe(true);
    expect(check({ type: 'target_size', match: 'large' }, undead)).toBe(true);
    expect(check({ type: 'target_size', match: 'small' }, undead)).toBe(false);
  });

  it('目標是 Boss', () => {
    const boss = ctx({ monsters: [{ id: 'm1', instance: monster({ isBoss: true }), position: { x: 1, y: 0 } }] });
    expect(check({ type: 'target_is_boss' }, boss)).toBe(true);
    expect(check({ type: 'target_is_boss' }, ctx())).toBe(false);
  });

  it('目標防禦與等級差', () => {
    const tough = ctx({ monsters: [{ id: 'm1', instance: monster({ defense: 50, level: 25 }), position: { x: 1, y: 0 } }] });
    expect(check({ type: 'target_defense', value: 40, compare: 'gt' }, tough)).toBe(true);
    // 角色 Lv.20、目標 Lv.25 → 差 +5
    expect(check({ type: 'target_level_diff', value: 3, compare: 'gt' }, tough)).toBe(true);
    expect(check({ type: 'target_level_diff', value: 10, compare: 'gt' }, tough)).toBe(false);
  });

  it('目標射程', () => {
    const archer = ctx({ monsters: [{ id: 'm1', instance: monster({ attackRange: 8 }), position: { x: 1, y: 0 } }] });
    expect(check({ type: 'target_range_gt', value: 5 }, archer)).toBe(true);
    expect(check({ type: 'target_range_gt', value: 10 }, archer)).toBe(false);
  });

  it('沒有目標時，所有目標系條件一律不成立', () => {
    const empty = ctx({ monsters: [], primaryTargetId: null });
    for (const type of ['target_distance', 'target_attack_type', 'target_race', 'target_is_boss', 'target_defense', 'target_level_diff', 'target_range_gt']) {
      expect(check({ type, value: 0, match: 'x' }, empty), type).toBe(false);
    }
  });
});

describe('接線項：目標狀態與 HP 歷程（§ 51.4.10、階段 7）', () => {
  const effect = (over: Record<string, unknown>) => ({
    id: 'e', sourceSkillId: 's', sourceSkillName: 's', category: 'c',
    type: 'debuff', target: 'monster', targetMonsterId: 'm1',
    startTime: 59_000, duration: 5_000, tags: ['poison'], name: 'n', description: 'd',
    ...over,
  }) as any;

  it('目標身上有／沒有指定 debuff —— 讓 DoT 不再重複覆蓋', () => {
    const withPoison = ctx({ activeEffects: [effect({})] });
    expect(check({ type: 'target_has_debuff', match: 'poison' }, withPoison)).toBe(true);
    expect(check({ type: 'target_lacks_debuff', match: 'poison' }, withPoison)).toBe(false);

    const clean = ctx({ activeEffects: [] });
    expect(check({ type: 'target_lacks_debuff', match: 'poison' }, clean)).toBe(true);
  });

  it('只算掛在該目標身上的 —— 別隻怪中毒不算', () => {
    const other = ctx({ activeEffects: [effect({ targetMonsterId: 'm2' })] });
    expect(check({ type: 'target_has_debuff', match: 'poison' }, other)).toBe(false);
  });

  it('過期的 debuff 不算', () => {
    const expired = ctx({ activeEffects: [effect({ startTime: 0, duration: 1_000 })] });
    expect(check({ type: 'target_has_debuff', match: 'poison' }, expired)).toBe(false);
  });

  it('目標控場免疫中 —— 免疫窗內放控場技是純浪費 MP', () => {
    const immune = ctx({
      monsters: [{ id: 'm1', instance: monster({ ccImmuneUntil: 70_000 }), position: { x: 1, y: 0 } }],
    });
    expect(check({ type: 'target_cc_immune' }, immune)).toBe(true);
    // 免疫窗已過
    const over = ctx({
      monsters: [{ id: 'm1', instance: monster({ ccImmuneUntil: 10_000 }), position: { x: 1, y: 0 } }],
    });
    expect(check({ type: 'target_cc_immune' }, over)).toBe(false);
  });

  it('目標無敵中／帶護盾', () => {
    const shielded = ctx({
      activeEffects: [effect({ type: 'buff', shieldRemaining: 30, tags: [] })],
    });
    expect(check({ type: 'target_shielded' }, shielded)).toBe(true);
    expect(check({ type: 'target_shielded' }, ctx({ activeEffects: [] }))).toBe(false);
  });

  it('HP 在 N 秒內下降超過 X% —— 取窗內最高值減現在', () => {
    // 3 秒前 100%、現在 40% → 掉了 60
    const history = [
      { t: 57_000, percent: 100 },
      { t: 59_000, percent: 70 },
      { t: 60_000, percent: 40 },
    ];
    const c = ctx({ hpHistory: history });
    expect(check({ type: 'hp_dropped_recently', value: 50, radius: 5 }, c)).toBe(true);
    expect(check({ type: 'hp_dropped_recently', value: 70, radius: 5 }, c)).toBe(false);
  });

  it('窗外的取樣不算 —— 慢慢磨掉的血不算爆發', () => {
    const history = [
      { t: 10_000, percent: 100 },  // 50 秒前，落在窗外
      { t: 59_500, percent: 42 },
      { t: 60_000, percent: 40 },
    ];
    const c = ctx({ hpHistory: history });
    // 窗內只從 42 掉到 40
    expect(check({ type: 'hp_dropped_recently', value: 50, radius: 3 }, c)).toBe(false);
    expect(check({ type: 'hp_dropped_recently', value: 1, radius: 3 }, c)).toBe(true);
  });

  it('沒有 HP 歷程時不成立，不會誤觸發', () => {
    expect(check({ type: 'hp_dropped_recently', value: 1, radius: 3 }, ctx())).toBe(false);
  });
});
