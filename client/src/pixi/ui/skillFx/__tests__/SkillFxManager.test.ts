/**
 * 播放與池化（`48-vfx.md` § 48.7.5、§ 48.7.7）。
 *
 * 這裡跑的是**真的 `Graphics`** —— Pixi 的 `Graphics` 只是幾何，不需要 renderer，
 * 所以繪製函式的 API 用錯（形狀方法名、fill/stroke 參數）在這裡就會爆，
 * 不必等到開瀏覽器。
 */
import { describe, it, expect } from 'vitest';
import { SKILL_FX_PROTOTYPES, SKILL_FX_ART } from '../geometry';
import { SkillFxManager, MAX_ACTIVE_SKILL_FX, travelDurationMs } from '../SkillFxManager';
import { playSkillFx } from '../playSkillFx';
import { resolveSkillFxPlan, resolveNormalAttackFxPlan } from '../skillFxStyle';
import { SKILL_CATALOG } from '../../../../models/skill';
import { CLASS_SKILLS } from '../../../../models/classSkills';

const ALL_SKILLS = [...SKILL_CATALOG, ...CLASS_SKILLS.map(c => c.skill)];

/** 推一段時間，每幀 16ms —— 與實際 ticker 的粒度一致 */
function run(fx: SkillFxManager, ms: number): void {
  for (let t = 0; t < ms; t += 16) fx.update(16);
}

describe('SkillFxManager', () => {
  /** 唯一常駐的是暈眩標記 —— 護盾只演掛上去那一下，不留常駐的球（§ 48.8.3） */
  const PERSISTENT = new Set(['mark']);

  it('十二個原型都畫得出來，一次性的都會自己收掉', () => {
    for (const prototype of SKILL_FX_PROTOTYPES) {
      const fx = new SkillFxManager();
      fx.spawn({
        prototype, x: 0, y: 0, toX: 120, toY: 60,
        color: 0xff6600, radiusTiles: 6, crit: true,
        markKind: 'stun', shieldKind: 'invincible',
      });
      expect(fx.activeCount, prototype).toBe(1);

      run(fx, 5000);

      expect(fx.activeCount, prototype).toBe(PERSISTENT.has(prototype) ? 1 : 0);
      fx.destroy();
    }
  });

  it('護盾只演掛上去那一下，不留常駐的球（§ 48.8.3）', () => {
    const fx = new SkillFxManager();
    fx.spawn({ prototype: 'shield', x: 0, y: 0, shieldKind: 'shield' });

    /* 護盾動輒 20 秒，若是常駐就代表整整 20 秒每幀重建同一顆球 */
    run(fx, SKILL_FX_ART.shield.durationMs + 200);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('onArrive 只觸發一次，而且是在到點的那一幀', () => {
    const fx = new SkillFxManager();
    let hits = 0;
    const ms = travelDurationMs(400, 0);
    fx.spawn({ prototype: 'travel', x: 0, y: 0, toX: 400, toY: 0, onArrive: () => { hits++; } });

    run(fx, ms - 32);
    expect(hits).toBe(0);
    run(fx, 200);
    expect(hits).toBe(1);
    fx.destroy();
  });

  it('onStart 在 delayMs 走完的那一幀觸發，只觸發一次', () => {
    const fx = new SkillFxManager();
    let starts = 0;
    fx.spawn({ prototype: 'impact', x: 0, y: 0, delayMs: 200, onStart: () => { starts++; } });

    run(fx, 180);
    expect(starts).toBe(0);
    run(fx, 32);
    expect(starts).toBe(1);
    run(fx, 500);
    expect(starts).toBe(1);
    fx.destroy();
  });

  it('delayMs 期間不畫，時間到才接手', () => {
    const fx = new SkillFxManager();
    const handle = fx.spawn({ prototype: 'impact', x: 0, y: 0, delayMs: 200 });
    expect(handle).toBeGreaterThan(0);

    fx.update(100);
    expect(fx.activeCount).toBe(1);
    /* 還在等的實例不該演完就消失 */
    fx.update(SKILL_FX_ART.impact.durationMs);
    expect(fx.activeCount).toBe(1);

    run(fx, SKILL_FX_ART.impact.durationMs);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('超過上限丟最舊的，不丟剛按下去的那一發', () => {
    const fx = new SkillFxManager();
    const first = fx.spawn({ prototype: 'impact', x: 0, y: 0 });
    for (let i = 0; i < MAX_ACTIVE_SKILL_FX + 5; i++) {
      fx.spawn({ prototype: 'impact', x: i, y: 0 });
    }
    expect(fx.activeCount).toBe(MAX_ACTIVE_SKILL_FX);
    /* 最舊的那一個已經被擠掉，stop 找不到也不該報錯 */
    expect(() => fx.stop(first)).not.toThrow();
    fx.destroy();
  });

  it('mark 一直循環到 stop 為止，並且跟著目標走', () => {
    const fx = new SkillFxManager();
    const h = fx.spawn({ prototype: 'mark', x: 0, y: 0, markKind: 'stun' });
    run(fx, 10_000);
    expect(fx.activeCount).toBe(1);
    expect(() => fx.move(h, 50, 20)).not.toThrow();
    fx.stop(h);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('clear 之後不留任何實例，Graphics 進池子重用', () => {
    const fx = new SkillFxManager();
    for (let i = 0; i < 8; i++) fx.spawn({ prototype: 'burst', x: 0, y: 0, radiusTiles: 4 });
    fx.clear();
    expect(fx.activeCount).toBe(0);
    fx.spawn({ prototype: 'burst', x: 0, y: 0, radiusTiles: 4 });
    expect(fx.activeCount).toBe(1);
    fx.destroy();
  });
});

describe('playSkillFx：整份技能表都跑得完', () => {
  it('75 個技能各播一次，沒有人丟例外、也沒有人卡住不收', () => {
    for (const skill of ALL_SKILLS) {
      const fx = new SkillFxManager();
      const plan = resolveSkillFxPlan(skill);
      const total = playSkillFx(fx, {
        plan,
        fromX: 0, fromY: 0,
        toX: 256, toY: 128,
        targets: [
          { x: 256, y: 100, crit: true },
          { x: 288, y: 116 },
        ],
      });

      expect(total, skill.name).toBeGreaterThan(0);
      run(fx, total + 2000);
      expect(fx.activeCount, skill.name).toBe(0);
      fx.destroy();
    }
  });

  it('範圍爆是一發：圓心只爆一次，不是一個目標一發（§ 48.7.4）', () => {
    const fx = new SkillFxManager();
    const inferno = ALL_SKILLS.find(s => s.id === 'storm')!; // 風暴：沒有覆寫
    const targets = [0, 1, 2].map(i => ({ x: 200 + i * 30, y: 100 }));
    const plan = resolveSkillFxPlan(inferno);
    expect(plan.volley).toBe(false);
    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets });

    /* 起手 1 ＋ 飛行 1 ＋ 爆 1 ＝ 3。三個目標沒有 onLand，所以不另外生命中點 */
    expect(fx.activeCount).toBe(3);
    fx.destroy();
  });

  it('齊射是每個目標各一發，各自命中，沒有範圍爆（§ 48.7.4）', () => {
    const fx = new SkillFxManager();
    const fireball = ALL_SKILLS.find(s => s.id === 'fireball')!;
    const plan = resolveSkillFxPlan(fireball);
    expect(plan.volley).toBe(true);
    expect(plan.landing).toBe('impact');

    const targets = [0, 1, 2].map(i => ({ x: 200 + i * 30, y: 100 }));
    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets });

    /* 起手 1 ＋ 三顆各自的飛行與命中 3×2 ＝ 7 */
    expect(fx.activeCount).toBe(7);
    fx.destroy();
  });

  it('齊射每一發錯開，不是六發同時出去疊成一堵牆', () => {
    const fx = new SkillFxManager();
    const plan = resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'arrow-rain')!);
    const landed: number[] = [];
    let clock = 0;
    const targets = [0, 1, 2, 3].map(i => ({
      /* 四個目標與施法者等距 —— 到點的先後只會來自 stagger，不是距離 */
      x: 200, y: 100 + i * 0.0001,
      onLand: () => landed.push(clock),
    }));

    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets });
    for (; clock < 4000; clock += 16) fx.update(16);

    expect(landed.length).toBe(4);
    for (let i = 1; i < landed.length; i++) {
      expect(landed[i]).toBeGreaterThan(landed[i - 1]);
    }
    fx.destroy();
  });

  it('流星雨是落下＋齊射：多顆各自落在各自的目標上', () => {
    const shower = ALL_SKILLS.find(s => s.id === 'meteor-shower')!;
    const plan = resolveSkillFxPlan(shower);
    expect(plan.delivery).toBe('drop');
    expect(plan.volley).toBe(true);
    expect(plan.landing).toBe('impact');
    expect(plan.radiusTiles).toBe(0); // 齊射沒有範圍爆，就沒有半徑

    const fx = new SkillFxManager();
    const targets = [0, 1, 2].map(i => ({ x: 100 + i * 40, y: 80 }));
    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 100, toY: 80, targets });
    expect(fx.activeCount).toBe(7); // 起手 ＋ 三顆落下 ＋ 三個命中
    fx.destroy();
  });

  it('三連射：起手 ＋ 三支箭，沒有命中爆點', () => {
    const fx = new SkillFxManager();
    const triple = ALL_SKILLS.find(s => s.id === 'triple-shot')!;
    const plan = resolveSkillFxPlan(triple);

    const landed: number[] = [];
    let clock = 0;
    /* 三發打同一隻怪，每一發各自判定命中，數字也各跳一個 */
    const targets = [0, 1, 2].map(() => ({
      x: 200, y: 100, onLand: () => landed.push(clock),
    }));
    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets });

    /* 起手 1 ＋ 箭 3 ＝ 4。沒有第五個（命中爆點） */
    expect(fx.activeCount).toBe(4);

    for (; clock < 4000; clock += 16) fx.update(16);
    expect(landed.length).toBe(3);
    /* 三發是連射，不是射了三次 —— 依序到點且間隔不長 */
    expect(landed[1]).toBeGreaterThan(landed[0]);
    expect(landed[2]).toBeGreaterThan(landed[1]);
    expect(landed[2] - landed[0]).toBeLessThan(400);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('連鎖是接力：每一段電弧從上一隻怪出發（§ 48.7.3）', () => {
    const fx = new SkillFxManager();
    const plan = resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'chain-lightning')!);
    const targets = [
      { x: 200, y: 100 }, { x: 260, y: 120 }, { x: 300, y: 90 },
    ];
    playSkillFx(fx, { plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets });

    /* 起手 1 ＋ 三段電弧 ＋ 三個命中 ＝ 7 */
    expect(fx.activeCount).toBe(7);

    /* 電弧的起點：第一段從施法者，之後每一段從上一隻怪 */
    const bolts = fx.container.children
      .map(c => ({ x: Math.round(c.x), y: Math.round(c.y) }))
      .filter(c => targets.some(t => t.x === c.x && t.y === c.y) || (c.x === 0 && c.y === 0));
    expect(bolts.some(b => b.x === 0 && b.y === 0)).toBe(true);
    expect(bolts.some(b => b.x === 200 && b.y === 100)).toBe(true);
    expect(bolts.some(b => b.x === 260 && b.y === 120)).toBe(true);

    fx.destroy();
  });

  it('連鎖照命中名單走，不會多連一隻（§ 48.1 不得改變規則）', () => {
    const fx = new SkillFxManager();
    const plan = resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'chain-lightning')!);
    const landed: number[] = [];
    const targets = [0, 1, 2, 3].map(i => ({
      x: 200 + i * 40, y: 100, onLand: () => landed.push(i),
    }));
    const total = playSkillFx(fx, {
      plan, fromX: 0, fromY: 0, toX: 200, toY: 100, targets,
    });

    run(fx, total + 500);
    /* 四個目標剛好四次命中，順序照名單 */
    expect(landed).toEqual([0, 1, 2, 3]);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('近戰不排飛行段，改回報「該揮了」', () => {
    const fx = new SkillFxManager();
    const backstab = ALL_SKILLS.find(s => s.id === 'backstab')!;
    const acted: string[] = [];
    playSkillFx(fx, {
      plan: resolveSkillFxPlan(backstab),
      fromX: 0, fromY: 0, toX: 40, toY: 20,
      targets: [{ x: 40, y: 10 }],
      onWeaponAction: k => acted.push(k),
    });
    expect(acted).toEqual(['swing']);
    fx.destroy();
  });

  it('弓技要拉弓，而且箭等到放箭那一格才出去（§ 48.6）', () => {
    for (const id of ['triple-shot', 'arrow-rain']) {
      const fx = new SkillFxManager();
      const acted: string[] = [];
      const landed: number[] = [];
      let clock = 0;

      playSkillFx(fx, {
        plan: resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === id)!),
        fromX: 0, fromY: 0, toX: 200, toY: 100,
        targets: [{ x: 200, y: 100, onLand: () => landed.push(clock) }],
        onWeaponAction: k => acted.push(k),
        weaponStrikeMs: 235,
      });
      expect(acted, id).toEqual(['shoot']);

      /* 拉弓還沒放完就不該有箭到點 */
      for (; clock < 200; clock += 16) fx.update(16);
      expect(landed.length, id).toBe(0);

      for (; clock < 4000; clock += 16) fx.update(16);
      expect(landed.length, id).toBeGreaterThan(0);
      fx.destroy();
    }
  });

  it('槍口只搬投射物，起手環仍然畫在腳下（§ 48.6）', () => {
    /*
     * 弓的箭要從弓上出去，但起手環是畫在腳下的。
     * 兩者共用一個座標的話，起手環會跟著跑到弓上，讀起來像地上浮著一個圈。
     */
    const plan = resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'triple-shot')!);
    const feet = { x: 100, y: 200 };
    const muzzle = { x: 118, y: 176 };

    const fx = new SkillFxManager();
    playSkillFx(fx, {
      plan,
      fromX: feet.x, fromY: feet.y,
      muzzleX: muzzle.x, muzzleY: muzzle.y,
      toX: 400, toY: 200,
      targets: [{ x: 400, y: 200 }],
    });

    const g = fx.container.children;
    /* 起手是第一個生出來的，它的位置必須是腳下 */
    expect({ x: g[0].x, y: g[0].y }).toEqual(feet);
    /* 其餘三支箭都從槍口出發 */
    for (let i = 1; i <= plan.hits; i++) {
      expect(g[i].x, `箭 ${i}`).toBe(muzzle.x);
    }
    fx.destroy();
  });

  it('沒給槍口就退回腳下', () => {
    const fx = new SkillFxManager();
    playSkillFx(fx, {
      plan: resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'wind-blade')!),
      fromX: 10, fromY: 20, toX: 200, toY: 100,
      targets: [{ x: 200, y: 100 }],
    });
    const g = fx.container.children;
    expect({ x: g[0].x, y: g[0].y }).toEqual({ x: 10, y: 20 });
    expect({ x: g[1].x, y: g[1].y }).toEqual({ x: 10, y: 20 });
    fx.destroy();
  });

  it('普攻沒有起手、命中走最小型態（§ 48.7.6）', () => {
    const melee = resolveNormalAttackFxPlan({ ranged: false, bow: false });
    expect(melee.cast).toBe(false);
    expect(melee.delivery).toBe('melee');
    expect(melee.weapon).toBe('swing');
    expect(melee.minimalImpact).toBe(true);
    expect(melee.emblem).toBeNull();

    const bow = resolveNormalAttackFxPlan({ ranged: true, bow: true });
    expect(bow.delivery).toBe('travel');
    expect(bow.weapon).toBe('shoot');
    expect(bow.shape).toBe('arrow');

    /* 演得完、收得掉 */
    const fx = new SkillFxManager();
    const total = playSkillFx(fx, {
      plan: bow, fromX: 0, fromY: 0, toX: 200, toY: 100,
      targets: [{ x: 200, y: 100 }],
      weaponStrikeMs: 235,
    });
    run(fx, total + 500);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('命中回饋在爆點**開始**那一幀，不是演完之後（普攻與技能同一條路）', () => {
    /*
     * 近戰沒有飛行段，命中回饋只能掛在爆點上。掛 `onArrive` 的話會等
     * 整個爆點演完才跳數字、才彈目標，看起來像慢半拍 —— 這裡把時間點釘住。
     */
    const cases: [string, ReturnType<typeof resolveNormalAttackFxPlan>][] = [
      ['普攻', resolveNormalAttackFxPlan({ ranged: false, bow: false })],
      ['技能', resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'flame-arrow')!)],
    ];

    for (const [label, plan] of cases) {
      const fx = new SkillFxManager();
      let landedAt = -1;
      let clock = 0;
      const total = playSkillFx(fx, {
        plan, fromX: 0, fromY: 0, toX: 200, toY: 100,
        targets: [{ x: 200, y: 100, onLand: () => { landedAt = clock; } }],
        weaponStrikeMs: 235,
      });

      for (; clock < total + 500; clock += 16) fx.update(16);

      expect(landedAt, label).toBeGreaterThanOrEqual(0);
      /* 爆點是最後一段，所以「開始」必然落在整段結束的一個爆點長度之前 */
      expect(total - landedAt, label).toBeGreaterThanOrEqual(SKILL_FX_ART.impact.durationMs);
      fx.destroy();
    }
  });

  it('普攻顏色吃刻印 → 附魔 → 白（§ 42.4）', () => {
    const plain = resolveNormalAttackFxPlan({ ranged: false, bow: false });
    expect(plain.color).toBe(0xffffff);

    const enchanted = resolveNormalAttackFxPlan(
      { ranged: false, bow: false }, { enchantElement: 'fire' });
    expect(enchanted.color).toBe(0xff6600);

    /* 刻印蓋過附魔 —— 冰刻印的劍砍下去是淺藍的 */
    const engraved = resolveNormalAttackFxPlan(
      { ranged: false, bow: false }, { weaponElement: 'ice', enchantElement: 'fire' });
    expect(engraved.color).toBe(0x66ccff);
  });

  it('法杖類遠程技能不碰武器 —— 施法不是攻擊動作', () => {
    const fx = new SkillFxManager();
    const acted: string[] = [];
    playSkillFx(fx, {
      plan: resolveSkillFxPlan(ALL_SKILLS.find(s => s.id === 'fireball')!),
      fromX: 0, fromY: 0, toX: 200, toY: 100,
      targets: [{ x: 200, y: 100 }],
      onWeaponAction: k => acted.push(k),
    });
    expect(acted).toEqual([]);
    fx.destroy();
  });

  it('武器祝福：藍環與劍徽同時起跑，各走各的長度（§ 48.8.1）', () => {
    const fx = new SkillFxManager();
    const bless = ALL_SKILLS.find(s => s.id === 'bless-weapon')!;
    const plan = resolveSkillFxPlan(bless);
    const total = playSkillFx(fx, {
      plan, fromX: 0, fromY: 0, toX: 0, toY: 0, targets: [],
    });

    /* 起手 ＋ 環 ＋ 徽記。環與徽記同時起跑，只是各走各的長度 */
    expect(plan.cast).toBe(true);
    expect(fx.activeCount).toBe(3);
    /* 尾端取環與徽記較長的那個 —— 徽記要停久一點才讀得懂 */
    expect(total).toBeGreaterThan(SKILL_FX_ART.emblem.durationMs);
    expect(total).toBeGreaterThan(SKILL_FX_ART.aura.durationMs);

    run(fx, total + 200);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('護盾類 buff 演的是球，不是環（§ 48.8.3）', () => {
    const fx = new SkillFxManager();
    const armor = ALL_SKILLS.find(s => s.id === 'greater-magic-armor')!;
    const plan = resolveSkillFxPlan(armor);
    expect(plan.shield).toBe('shield');

    const total = playSkillFx(fx, {
      plan, fromX: 0, fromY: 0, toX: 0, toY: 0, targets: [],
    });
    /* 起手 ＋ 球。球取代環，不是球與環兩個疊在一起 */
    expect(fx.activeCount).toBe(2);
    expect(total).toBeGreaterThan(SKILL_FX_ART.shield.durationMs);

    run(fx, total + 200);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('沒有徽記的 buff 只有環', () => {
    const fx = new SkillFxManager();
    /* 聖光術是淨化，沒有 category、沒有 buffModifiers，所以既沒有符號也沒有球 */
    const agility = ALL_SKILLS.find(s => s.id === 'holy-light')!;
    const plan = resolveSkillFxPlan(agility);
    expect(plan.emblem).toBeNull();
    expect(plan.shield).toBeNull();

    const total = playSkillFx(fx, {
      plan, fromX: 0, fromY: 0, toX: 0, toY: 0, targets: [],
    });
    /* 起手 ＋ 環，沒有第三個 */
    expect(fx.activeCount).toBe(2);
    expect(total).toBeGreaterThan(SKILL_FX_ART.aura.durationMs);
    run(fx, total + 200);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('治癒沒有目標時治自己', () => {
    const fx = new SkillFxManager();
    const heal = ALL_SKILLS.find(s => s.id === 'heal')!;
    playSkillFx(fx, {
      plan: resolveSkillFxPlan(heal),
      fromX: 10, fromY: 20, toX: 10, toY: 20,
      targets: [],
    });
    expect(fx.activeCount).toBe(2); // 起手 ＋ 治癒
    run(fx, 3000);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });
});
