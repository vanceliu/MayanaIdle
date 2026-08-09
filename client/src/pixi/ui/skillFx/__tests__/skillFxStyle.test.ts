/**
 * 技能 → 原型的判定（`48-vfx.md` § 48.7.3）。
 *
 * 重點不是「風刃演什麼」，而是**整份技能表有沒有人掉出規則之外**：
 * 75 個技能全掃一次，判定順序改壞了會在這裡叫。
 */
import { describe, it, expect } from 'vitest';
import { SKILL_CATALOG } from '../../../../models/skill';
import { CLASS_SKILLS } from '../../../../models/classSkills';
import { ELEMENT_COLORS, NO_ELEMENT_PROJECTILE_COLOR } from '../../projectileStyle';
import {
  DROP_FX_SKILL_IDS, MELEE_FX_SKILL_IDS, VOLLEY_FX_SKILL_IDS, CHAIN_FX_SKILL_IDS,
  resolveAuraColor, resolveSkillFxPlan,
} from '../skillFxStyle';
import {
  BUFF_AURA_COLOR, DEBUFF_AURA_COLOR, BUFF_EMBLEM_BY_CATEGORY, BUFF_SHIELD_BY_CATEGORY,
  EMBLEM_COLORS, EMBLEM_KINDS, ATTRIBUTE_COLORS, STAT_LABEL_TEXT, SKILL_FX_ART,
  hitShakeOffset, lighten,
  resolveBuffEmblem, resolveBuffShield, resolveDebuffTint, DEBUFF_TINT,
} from '../geometry';

const ALL_SKILLS = [...SKILL_CATALOG, ...CLASS_SKILLS.map(c => c.skill)];

const byId = (id: string) => {
  const s = ALL_SKILLS.find(x => x.id === id);
  if (!s) throw new Error(`技能表沒有 ${id}`);
  return s;
};

describe('resolveSkillFxPlan：每個技能都要有演出', () => {
  it('全部 75 個技能都判定得出原型，沒有人掉出規則之外', () => {
    expect(ALL_SKILLS.length).toBe(75);
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.landing, skill.name).toBeTruthy();
      expect(plan.color, skill.name).toBeTypeOf('number');
    }
  });

  it('buff 一律走 § 48.8 的 aura，不吃技能元素色', () => {
    /* 火矢附魔是火屬性 buff —— 施加的閃光仍然是藍的（§ 48.8.1） */
    const plan = resolveSkillFxPlan(byId('fire-arrow'));
    expect(plan.landing).toBe('aura');
    expect(plan.color).toBe(BUFF_AURA_COLOR);

    for (const skill of ALL_SKILLS.filter(s => s.type === 'buff')) {
      expect(resolveSkillFxPlan(skill).landing, skill.name).toBe('aura');
    }
  });

  it('所有 buff 都演起手 —— 少了起手會讀成「身上自己多了一圈光」', () => {
    for (const skill of ALL_SKILLS.filter(s => s.type === 'buff')) {
      expect(resolveSkillFxPlan(skill).cast, skill.name).toBe(true);
    }
  });

  it('只有近戰技能不演起手（起手環會蓋掉揮擊的前搖）', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.cast, skill.name).toBe(plan.delivery !== 'melee');
    }
  });

  it('治癒走 heal，沒有飛行段', () => {
    for (const skill of ALL_SKILLS.filter(s => s.type === 'heal')) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.landing, skill.name).toBe('heal');
      expect(plan.delivery, skill.name).toBe('none');
    }
    /* 群體治癒是 target: 'aoe' 的治癒 —— 不可以被 AoE 規則接走變成 burst */
    expect(resolveSkillFxPlan(byId('group-heal')).landing).toBe('heal');
  });

  it('落下名單排在 AoE 之前：隕石彈是 AoE 但要走 drop', () => {
    const meteor = resolveSkillFxPlan(byId('meteor-shot'));
    expect(meteor.delivery).toBe('drop');
    expect(meteor.landing).toBe('burst');
    expect(meteor.volley).toBe(false);
    expect(meteor.radiusTiles).toBe(6);

    const rock = resolveSkillFxPlan(byId('rock-fall'));
    expect(rock.delivery).toBe('drop');
    expect(rock.landing).toBe('impact');
  });

  it('覆寫壓過名單：震裂術在落下名單裡，但被改成自身爆', () => {
    expect(DROP_FX_SKILL_IDS).toContain('earth-shatter');
    const quake = resolveSkillFxPlan(byId('earth-shatter'));
    expect(quake.delivery).toBe('none');
    expect(quake.landing).toBe('nova');
    /* 半徑跟著 landing 走，不用在覆寫表裡手寫 */
    expect(quake.radiusTiles).toBe(8);
  });

  it('自身中心 AoE 走 nova，沒有飛行段（天雷被覆寫成落下，不算）', () => {
    for (const id of ['apocalypse-flame']) {
      const plan = resolveSkillFxPlan(byId(id));
      expect(plan.landing, id).toBe('nova');
      expect(plan.delivery, id).toBe('none');
      expect(plan.radiusTiles, id).toBe(10);
    }
  });

  it('目標中心 AoE 預設走 travel → burst，半徑吃 aoeRadius', () => {
    /* 風暴沒有覆寫 —— 一發飛到圓心炸一片 */
    const storm = resolveSkillFxPlan(byId('storm'));
    expect(storm.delivery).toBe('travel');
    expect(storm.landing).toBe('burst');
    expect(storm.volley).toBe(false);
    expect(storm.radiusTiles).toBe(4);
    expect(storm.color).toBe(ELEMENT_COLORS.wind);
  });

  it('齊射會把 landing 補成命中 —— 覆寫表不用寫兩個欄位', () => {
    /* 暴風雪只設了 volley，landing 由 applyOverride 補齊 */
    const bs = resolveSkillFxPlan(byId('blizzard-storm'));
    expect(bs.volley).toBe(true);
    expect(bs.landing).toBe('impact');
    expect(bs.radiusTiles).toBe(0);
  });

  it('齊射名單的 AoE 改成每個目標各一發，沒有範圍爆（§ 48.7.4）', () => {
    for (const id of VOLLEY_FX_SKILL_IDS) {
      const plan = resolveSkillFxPlan(byId(id));
      expect(plan.volley, id).toBe(true);
      expect(plan.landing, id).toBe('impact');
      /* 齊射沒有圓心爆，就不該留半徑 —— 留著會讓下游以為要畫地面環 */
      expect(plan.radiusTiles, id).toBe(0);
    }
    /* 火球與冰霧是「丟三顆」，不是「炸一片」 */
    expect(resolveSkillFxPlan(byId('fireball')).volley).toBe(true);
    expect(resolveSkillFxPlan(byId('ice-fog')).volley).toBe(true);
  });

  it('閃電鎖鏈走連鎖，不是齊射也不是範圍爆（§ 48.7.3）', () => {
    const chain = resolveSkillFxPlan(byId('chain-lightning'));
    expect(chain.delivery).toBe('chain');
    expect(chain.landing).toBe('impact');
    expect(chain.volley).toBe(false);
    /* 連鎖沒有圓心爆，就不該留半徑 */
    expect(chain.radiusTiles).toBe(0);

    /*
     * 煉獄火的 AoE 欄位與閃電鎖鏈**一模一樣**（目標中心、半徑 7、最多 7 隻），
     * 演出卻完全不同 —— 差別只在意象，所以只能逐技能決定。
     */
    const hell = byId('purgatory');
    const lightning = byId('chain-lightning');
    expect(hell.aoeCenter).toBe(lightning.aoeCenter);
    expect(hell.aoeRadius).toBe(lightning.aoeRadius);
    expect(hell.maxTargets).toBe(lightning.maxTargets);
    expect(resolveSkillFxPlan(hell).delivery).toBe('travel');
    expect(resolveSkillFxPlan(hell).landing).toBe('pillar');
  });

  it('連鎖與齊射互斥，不會同時成立', () => {
    for (const id of CHAIN_FX_SKILL_IDS) {
      expect(VOLLEY_FX_SKILL_IDS).not.toContain(id);
      expect(resolveSkillFxPlan(byId(id)).volley).toBe(false);
    }
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.delivery === 'chain' && plan.volley, skill.name).toBe(false);
    }
  });

  it('齊射只對 AoE 有意義：單體與自身中心一律 false', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      if (skill.target !== 'aoe' || skill.aoeCenter === 'self') {
        expect(plan.volley, skill.name).toBe(false);
      }
    }
  });

  it('武器祝福在頭上多一個劍徽，靠 buffCategory 推導而不是逐技能列', () => {
    /* 祝福武器與祝福魔法武器是同一類 buff，本來就共用 buffCategory */
    const a = byId('bless-weapon');
    const b = byId('bless-magic-weapon');
    expect(a.buffCategory).toBe('weapon-bless');
    expect(b.buffCategory).toBe(a.buffCategory);

    expect(resolveSkillFxPlan(a).emblem).toBe('sword');
    expect(resolveSkillFxPlan(b).emblem).toBe('sword');
    /* 徽記不改藍環那條規則 —— 顏色仍然是 buff 藍 */
    expect(resolveSkillFxPlan(a).color).toBe(BUFF_AURA_COLOR);
  });

  it('淬毒是綠水滴、致命一擊是 X，同樣吃 buffCategory 推導', () => {
    expect(byId('envenom').buffCategory).toBe('poison-enchant');
    expect(byId('deadly-strike').buffCategory).toBe('crit-buff');
    expect(resolveSkillFxPlan(byId('envenom')).emblem).toBe('poison');
    expect(resolveSkillFxPlan(byId('deadly-strike')).emblem).toBe('crit');
  });

  it('火矢附魔頭上是火焰，顏色直接吃 § 42.4 的火色', () => {
    expect(byId('fire-arrow').buffCategory).toBe('fire-enchant');
    expect(resolveSkillFxPlan(byId('fire-arrow')).emblem).toBe('flame');
    /* 不抄 hex —— 抄了改色表就會有一邊沒跟到 */
    expect(EMBLEM_COLORS.flame).toBe(ELEMENT_COLORS.fire);
  });

  it('敏捷／力量提升沒有 buffCategory，改吃提升哪個屬性', () => {
    const agi = byId('agility-boost');
    const str = byId('strength-boost');
    /* 效果資料是完整的（600s、+5），缺的只有互斥分組用的 buffCategory */
    expect(agi.buffCategory).toBeUndefined();
    expect(agi.buffDuration).toBe(600000);
    expect(agi.buffModifiers).toEqual([{ stat: 'agility', value: 5, isPercent: false }]);

    expect(resolveSkillFxPlan(agi).emblem).toBe('statAgi');
    expect(resolveSkillFxPlan(str).emblem).toBe('statStr');
    expect(EMBLEM_COLORS.statAgi).toBe(ATTRIBUTE_COLORS.agility);
    expect(EMBLEM_COLORS.statStr).toBe(ATTRIBUTE_COLORS.str);
    /* 文字直接用屬性縮寫 —— 玩家不用學「藍色的粉＝敏捷」 */
    expect(STAT_LABEL_TEXT.statAgi).toBe('AGI');
    expect(STAT_LABEL_TEXT.statStr).toBe('STR');
  });

  it('category 優先於屬性 —— 兩張表都命中時不會挑錯', () => {
    /* 祝福魔法武器有 category，也有 buffModifiers（命中／額外攻擊），要走 category */
    const bless = byId('bless-magic-weapon');
    expect(bless.buffCategory).toBe('weapon-bless');
    expect(bless.buffModifiers?.length).toBeGreaterThan(0);
    expect(resolveSkillFxPlan(bless).emblem).toBe('sword');
  });

  it('符號可以帶自己的顏色，但環仍然只有藍紅（§ 48.8.1）', () => {
    /* 毒不可能是藍的 —— 綠取中毒 debuff 的染色，黃取 § 42.3 的暴擊數字色 */
    expect(EMBLEM_COLORS.poison).toBe(DEBUFF_TINT.poisoned);
    expect(EMBLEM_COLORS.crit).toBe(0xffff00);
    /* 沒有自己顏色的就沿用 buff 藍 */
    expect(EMBLEM_COLORS.sword).toBeNull();
    expect(EMBLEM_COLORS.haste).toBeNull();

    /* 不管符號什麼顏色，plan 的顏色（環用的）永遠是 buff 藍 */
    for (const skill of ALL_SKILLS.filter(s => s.type === 'buff')) {
      expect(resolveSkillFxPlan(skill).color, skill.name).toBe(BUFF_AURA_COLOR);
    }
  });

  it('每個符號都有顏色設定，不會漏掉新加的', () => {
    for (const kind of EMBLEM_KINDS) {
      expect(kind in EMBLEM_COLORS, kind).toBe(true);
    }
  });

  it('加速術與強化加速術是同一類，共用往上疊的人字', () => {
    const a = byId('haste');
    const b = byId('greater-haste');
    expect(a.buffCategory).toBe('speed');
    expect(b.buffCategory).toBe(a.buffCategory);

    expect(resolveSkillFxPlan(a).emblem).toBe('haste');
    expect(resolveSkillFxPlan(b).emblem).toBe('haste');
  });

  it('兩張表都查不到的 buff 不放徽記，非 buff 技能一律沒有', () => {
    /* 保護罩的 category 不在表裡、聖光術連 modifiers 都沒有 */
    expect(resolveSkillFxPlan(byId('protect-shield')).emblem).toBeNull();
    expect(resolveSkillFxPlan(byId('holy-light')).emblem).toBeNull();
    expect(resolveSkillFxPlan(byId('fireball')).emblem).toBeNull();

    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      if (skill.type !== 'buff') expect(plan.emblem, skill.name).toBeNull();
      else {
        expect(plan.emblem, skill.name)
          .toBe(resolveBuffEmblem(skill.buffCategory, skill.buffModifiers));
      }
    }
  });

  it('徽記表的每個 category 都真的有技能在用 —— 不留死條目', () => {
    for (const category of Object.keys(BUFF_EMBLEM_BY_CATEGORY)) {
      const users = ALL_SKILLS.filter(s => s.buffCategory === category);
      expect(users.length, category).toBeGreaterThan(0);
    }
  });

  it('擋傷害那一類的 buff 改演球形罩，取代藍環（§ 48.8.3）', () => {
    /* 防禦三階遞進：保護罩 → 魔法盔甲 → 高級魔法盔甲，後兩者共用 defense-buff */
    const armorTier = ['protect-shield', 'magic-armor', 'greater-magic-armor'];
    for (const id of [...armorTier, 'iron-shield', 'holy-shield', 'sanctuary', 'holy-domain']) {
      expect(resolveSkillFxPlan(byId(id)).shield, id).toBe('shield');
    }
    /* 無敵是白球，與護盾同一顆球只是換色 */
    expect(resolveSkillFxPlan(byId('absolute-barrier')).shield).toBe('invincible');
  });

  it('不擋傷害的 buff 沒有球，非 buff 技能一律沒有', () => {
    for (const id of ['haste', 'agility-boost', 'precise-shot', 'bless-weapon', 'smoke-bomb']) {
      expect(resolveSkillFxPlan(byId(id)).shield, id).toBeNull();
    }
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      if (skill.type !== 'buff') expect(plan.shield, skill.name).toBeNull();
      else expect(plan.shield, skill.name).toBe(resolveBuffShield(skill.buffCategory));
    }
  });

  it('球形罩表的每個 category 都真的有技能在用 —— 不留死條目', () => {
    for (const category of Object.keys(BUFF_SHIELD_BY_CATEGORY)) {
      const users = ALL_SKILLS.filter(s => s.buffCategory === category);
      expect(users.length, category).toBeGreaterThan(0);
    }
  });

  it('近戰技能沿用武器揮擊，不演起手環', () => {
    /* 吸血鬼之吻的 range 雖然是 1.5，但被覆寫成遠程（它是魔法不是砍人） */
    for (const id of ['shield-bash', 'rend', 'vengeance', 'backstab']) {
      const plan = resolveSkillFxPlan(byId(id));
      expect(plan.delivery, id).toBe('melee');
      expect(plan.landing, id).toBe('impact');
      expect(plan.cast, id).toBe(false);
    }
  });

  it('逐技能覆寫（§ 48.7.3）：資料上看不出來的美術決定', () => {
    /* 冰槍是長槍、火焰箭是箭 —— 兩者的資料完全看不出外型 */
    expect(resolveSkillFxPlan(byId('ice-lance')).shape).toBe('lance');
    expect(resolveSkillFxPlan(byId('flame-arrow')).shape).toBe('arrow');
    /* 地裂術飛行途中地面裂開 */
    expect(resolveSkillFxPlan(byId('earth-rend')).trailFx).toBe('crack');
    /* 炎柱命中後竄起柱子，不是一般的命中點 */
    expect(resolveSkillFxPlan(byId('flame-pillar')).landing).toBe('pillar');

    /*
     * 吸血鬼之吻的 `range` 是 1.5，照規則會判成武器揮擊 ——
     * 但它是魔法不是砍人，覆寫成遠程且不揮武器。
     * **沒有去改 `range`**：那是戰鬥規則，特效不得為了演出動它（§ 48.1）。
     */
    const kiss = byId('vampire-kiss');
    expect(kiss.range).toBe(1.5);
    const kissPlan = resolveSkillFxPlan(kiss);
    expect(kissPlan.delivery).toBe('travel');
    expect(kissPlan.weapon).toBe('none');
    expect(kissPlan.cast).toBe(true);
  });

  it('挑釁怒吼的 range 是 3，靠名單而不是靠 range 判成近戰', () => {
    const taunt = byId('taunt');
    expect(taunt.range).toBe(3);
    expect(MELEE_FX_SKILL_IDS).toContain('taunt');
    expect(resolveSkillFxPlan(taunt).delivery).toBe('melee');
  });

  it('三連射是普攻型多段：三支箭、有起手、沒有命中爆點', () => {
    const t = byId('triple-shot');
    /* § 23.1.1：唯一走物理普攻公式的技能，以 hits 標記多段判定 */
    expect(t.hits).toBe(3);

    const plan = resolveSkillFxPlan(t);
    expect(plan.hits).toBe(3);
    expect(plan.delivery).toBe('travel');
    expect(plan.shape).toBe('arrow');
    /* 命中沿用普攻的演出，技能自己不加東西 */
    expect(plan.landing).toBe('none');
    /* 但起手照演 —— 它終究是主動施放的技能，這是與普攻的唯一區別 */
    expect(plan.cast).toBe(true);
  });

  it('只有三連射是多段，其餘一律單發', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.hits, skill.name).toBe(skill.hits ?? 1);
      if (skill.id !== 'triple-shot') expect(plan.hits, skill.name).toBe(1);
    }
  });

  it('多段與齊射是兩件事，不會同時成立', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      expect(plan.hits > 1 && plan.volley, skill.name).toBe(false);
    }
  });

  it('三連射吃刻印與附魔：優先序是 刻印 → 附魔 → 技能元素（§ 42.4）', () => {
    const t = byId('triple-shot');

    /* 什麼都沒有 → 白（它自己是 element: 'none'） */
    expect(resolveSkillFxPlan(t).color).toBe(NO_ELEMENT_PROJECTILE_COLOR);

    /* 火矢附魔生效 → 三支箭變火色（`23-class-magic.md` § 23.4） */
    expect(resolveSkillFxPlan(t, { enchantElement: 'fire' }).color).toBe(ELEMENT_COLORS.fire);

    /* 元素刻印詞綴同樣會改色 */
    expect(resolveSkillFxPlan(t, { weaponElement: 'ice' }).color).toBe(ELEMENT_COLORS.ice);

    /* 兩者都有時刻印蓋過附魔 */
    expect(
      resolveSkillFxPlan(t, { weaponElement: 'ice', enchantElement: 'fire' }).color,
    ).toBe(ELEMENT_COLORS.ice);
  });

  it('穿透箭雨同樣是弓技，但走魔法公式所以不吃附魔（§ 23.4）', () => {
    const rain = byId('arrow-rain');
    expect(rain.requiredWeaponType).toBe('bow');
    for (const ctx of [{ enchantElement: 'fire' }, { weaponElement: 'ice' }]) {
      expect(resolveSkillFxPlan(rain, ctx).color).toBe(NO_ELEMENT_PROJECTILE_COLOR);
    }
  });

  it('刻印與附魔不影響其他技能的顏色，也不影響原型判定', () => {
    const ctx = { weaponElement: 'ice', enchantElement: 'fire' };
    for (const skill of ALL_SKILLS) {
      const plain = resolveSkillFxPlan(skill);
      const withCtx = resolveSkillFxPlan(skill, ctx);
      /* 原型永遠不受影響 —— 這兩項只改顏色 */
      expect(withCtx.delivery, skill.name).toBe(plain.delivery);
      expect(withCtx.landing, skill.name).toBe(plain.landing);
      expect(withCtx.volley, skill.name).toBe(plain.volley);
      if (skill.id !== 'triple-shot') expect(withCtx.color, skill.name).toBe(plain.color);
    }
  });

  it('武器演出：近戰揮擊、弓技拉弓、其餘不碰武器（§ 48.6）', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      const expected = plan.delivery === 'melee'
        ? 'swing'
        : skill.requiredWeaponType === 'bow' ? 'shoot' : 'none';
      expect(plan.weapon, skill.name).toBe(expected);
    }
    /* 三連射與穿透箭雨都是弓技，兩個都要拉弓 */
    expect(resolveSkillFxPlan(byId('triple-shot')).weapon).toBe('shoot');
    expect(resolveSkillFxPlan(byId('arrow-rain')).weapon).toBe('shoot');
  });

  it('裂傷斬命中帶流血的紅 —— 吃 DEBUFF_TINT，不另立一張表（§ 48.7.4.3）', () => {
    const rend = byId('rend');
    expect(rend.applyDebuff?.tags).toEqual(['bleeding']);
    const plan = resolveSkillFxPlan(rend);
    expect(plan.accent).toBe(DEBUFF_TINT.bleeding);
    /* 點綴不改技能本身的顏色 —— 裂傷斬是無屬性物理，主色仍然是白 */
    expect(plan.color).toBe(NO_ELEMENT_PROJECTILE_COLOR);
  });

  it('沒有 debuff、或 debuff 沒有對應顏色的就不點綴', () => {
    /* 盾擊是暈眩 —— 暈眩不染色（§ 48.8.2），所以也不點綴 */
    expect(byId('shield-bash').applyDebuff?.tags).toEqual(['stunned']);
    expect(resolveSkillFxPlan(byId('shield-bash')).accent).toBeNull();
    /* 挑釁怒吼的 tag 不在色表裡 */
    expect(resolveSkillFxPlan(byId('taunt')).accent).toBeNull();
    /* 沒有 applyDebuff 的一律 null */
    expect(resolveSkillFxPlan(byId('backstab')).accent).toBeNull();
    expect(resolveSkillFxPlan(byId('wind-blade')).accent).toBeNull();
  });

  it('點綴色一定來自 DEBUFF_TINT，不會冒出新顏色', () => {
    const allowed = new Set(Object.values(DEBUFF_TINT));
    for (const skill of ALL_SKILLS) {
      const accent = resolveSkillFxPlan(skill).accent;
      if (accent !== null) expect(allowed.has(accent), skill.name).toBe(true);
    }
  });

  it('高光是同色系往白混，不是換成白（§ 48.7.2）', () => {
    const fire = ELEMENT_COLORS.fire;   // 0xff6600
    expect(lighten(fire, 0)).toBe(fire);
    expect(lighten(fire, 1)).toBe(0xffffff);

    /* 混一半之後仍然是橘的 —— R 最高、B 最低，色相沒被洗掉 */
    const half = lighten(fire, 0.5);
    const r = (half >> 16) & 0xff;
    const g = (half >> 8) & 0xff;
    const b = half & 0xff;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    /* 而且每一個通道都比原色亮 */
    expect(r).toBeGreaterThanOrEqual((fire >> 16) & 0xff);
    expect(b).toBeGreaterThan(fire & 0xff);

    /* 換成白的話冰與火的中心會長一樣 —— 這正是不能直接用白的原因 */
    expect(lighten(ELEMENT_COLORS.ice, 0.6)).not.toBe(lighten(fire, 0.6));
  });

  it('每個原型都有高光旋鈕，而且不會超出 0~1', () => {
    const withLight = ['cast', 'travel', 'impact', 'burst', 'nova', 'heal', 'aura', 'emblem'] as const;
    for (const k of withLight) {
      const v = (SKILL_FX_ART[k] as { light: number }).light;
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    }
  });

  it('命中抖動是一次來回，結束就歸零，而且暴擊不加碼', () => {
    const p = SKILL_FX_ART.impact;
    expect(hitShakeOffset(-1, p)).toBe(0);
    expect(hitShakeOffset(0, p)).toBeCloseTo(0, 5);
    expect(hitShakeOffset(p.hitShakeMs, p)).toBe(0);
    expect(hitShakeOffset(p.hitShakeMs + 100, p)).toBe(0);
    /* 中段要真的有位移，而且不超過設定值 */
    const mid = hitShakeOffset(p.hitShakeMs * 0.3, p);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(p.hitShakePx);
  });

  it('弓技射箭，其餘遠程技能射彈丸（§ 42.4）', () => {
    expect(resolveSkillFxPlan(byId('triple-shot')).shape).toBe('arrow');
    expect(resolveSkillFxPlan(byId('arrow-rain')).shape).toBe('arrow');
    /* 暗影球沒有覆寫，維持預設的彈丸 */
    expect(resolveSkillFxPlan(byId('shadow-ball')).shape).toBe('circle');
  });

  it('無元素技能取白色，與物理普攻一致', () => {
    /* 究極光裂術與魔力奪取都是 element: 'none' 的傷害技能 */
    expect(resolveSkillFxPlan(byId('ultimate-ray')).color).toBe(NO_ELEMENT_PROJECTILE_COLOR);
    expect(resolveSkillFxPlan(byId('mana-drain')).color).toBe(NO_ELEMENT_PROJECTILE_COLOR);
  });

  it('色表只有一張：每個技能的顏色都來自 § 42.4', () => {
    const allowed = new Set<number>([...Object.values(ELEMENT_COLORS), BUFF_AURA_COLOR]);
    for (const skill of ALL_SKILLS) {
      expect(allowed.has(resolveSkillFxPlan(skill).color), skill.name).toBe(true);
    }
  });

  it('只有 burst／nova 帶半徑，其餘一律 0', () => {
    for (const skill of ALL_SKILLS) {
      const plan = resolveSkillFxPlan(skill);
      if (plan.landing === 'burst' || plan.landing === 'nova') {
        expect(plan.radiusTiles, skill.name).toBeGreaterThan(0);
        expect(plan.volley, skill.name).toBe(false);
      } else {
        expect(plan.radiusTiles, skill.name).toBe(0);
      }
    }
  });
});

describe('§ 48.8 Buff／Debuff 的顏色', () => {
  it('施加瞬間只有藍與紅兩色，沿用 § 24.8.2 的 icon 框色', () => {
    expect(resolveAuraColor('buff')).toBe(0x3b82f6);
    expect(resolveAuraColor('debuff')).toBe(0xef4444);
    expect(resolveAuraColor('buff')).toBe(BUFF_AURA_COLOR);
    expect(resolveAuraColor('debuff')).toBe(DEBUFF_AURA_COLOR);
  });

  it('多個 debuff 同時掛著取優先度最高的一種，不混色', () => {
    expect(resolveDebuffTint(['slowed', 'poisoned', 'bleeding'])).toBe(DEBUFF_TINT.bleeding);
    expect(resolveDebuffTint(['weakened', 'cursed'])).toBe(DEBUFF_TINT.cursed);
    expect(resolveDebuffTint(new Set(['slowed']))).toBe(DEBUFF_TINT.slowed);
  });

  it('暈眩不染色 —— 它已經有頭頂星星了', () => {
    expect(resolveDebuffTint(['stunned'])).toBeNull();
    /* 暈眩＋中毒時染中毒的綠，不是不染 */
    expect(resolveDebuffTint(['stunned', 'poisoned'])).toBe(DEBUFF_TINT.poisoned);
  });

  it('沒有 debuff 時不染色', () => {
    expect(resolveDebuffTint([])).toBeNull();
  });
});

/**
 * `24-buff-debuff.md` § 24.4.1 登記過的 debuff tag（兩張表的聯集）。
 *
 * **技能與怪物是兩條獨立的路**（效果與秒數各走各的），共用的只有 tag ——
 * 同一種狀態在兩邊必須是同一個字，查表才不會靜默漏掉。
 */
const DEBUFF_TAGS_24_4_1 = [
  'poisoned', 'bleeding', 'cursed', 'weakened', 'slowed', 'stunned',
  'armor-break', 'defense-down', 'taunt',
] as const;

describe('debuff tag 修正之後的連帶效果（§ 24.4.1）', () => {
  /*
   * 詛咒的 tag 曾經是 `curse`，而染色表的 key 是 § 24.4.1 的 `cursed` ——
   * 差一個字，命中的紫色點綴就永遠查不到，而且不會報錯。
   * 這一條把「特效自動吃到」釘住：資料改對了，這裡就該亮。
   */
  it('詛咒命中會點綴紫色，而且顏色與染色同一個出處', () => {
    const curse = ALL_SKILLS.find(s => s.id === 'curse')!;
    const plan = resolveSkillFxPlan(curse);
    expect(plan.accent).toBe(DEBUFF_TINT.cursed);
  });

  it('每個會上 debuff 的技能，tag 都在 § 24.4.1 的表上', () => {
    /*
     * tag 是免疫詞綴（`07-affix.md` § 7.10）、狀態解除道具、
     * Boss 控場免疫的查表 key —— 打錯一個字整條查不到，而且不會報錯。
     * 這一條是新增技能時的守門員：tag 沒登記就在這裡擋下來。
     */
    const registered = new Set<string>(DEBUFF_TAGS_24_4_1);
    const unknown = new Set<string>();
    for (const skill of ALL_SKILLS) {
      for (const tag of skill.applyDebuff?.tags ?? []) {
        if (!registered.has(tag)) unknown.add(`${skill.name}:${tag}`);
      }
    }
    expect([...unknown].sort()).toEqual([]);
  });
});
