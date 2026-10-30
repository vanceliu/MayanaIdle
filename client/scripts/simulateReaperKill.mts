/**
 * Lv.75 滿裝角色 vs 百柱死神（百柱塔 100F Boss）擊殺時間模擬。
 *
 * 直接呼叫 `src/systems/combat.ts` 的真實函式，不重寫任何傷害公式；
 * 怪物素質直接讀 `monsterSeeds.ts`、裝備直接讀 `equipmentSeeds.ts`，避免手抄數字。
 *
 * 前提（見 docs/design/44-dps-prediction.md）：
 *  - 目標「擺著不動」：不還手，因此不套用 詛咒／虛弱／暈眩，也不需計算玩家存活
 *  - MP 計入：消耗、每 6 秒的戰鬥中回魔、魔力奪取回魔都算；同時輸出「MP 無限」對照組
 *  - 長效 buff（≥300s）視為戰前已開好；短效 buff／攻擊技能進入輪替，佔用行動 tick
 *  - 技能一律讀 `skill.ts`／`classSkills.ts`，可學範圍讀 `skillRestrictions.ts`；輪替最多佔 `TALENT_INSTALL_MAX` 格戰鬥天賦
 *  - 技能降防（詛咒／護甲崩壞／極冰封印）照實施放；只降防的技能放不放由同種子試算決定
 *
 * 模型依據：
 *  - `playerCombatFSM.ts:96-99`：一個攻擊 tick 只能做一件事（放技能 or 普攻）
 *  - `combat.ts:362-366`：interval = max(300, floor(1200 / (1 + 攻速%/100)))
 *  - `PixiGame.tsx:610`：DoT 直接扣血，**不吃怪物防禦減傷**
 *  - `gameLoop.ts` DOT_TICK_INTERVAL = 1000ms
 *  - `regen.ts` MP_REGEN_INTERVAL_MS = 6000ms（戰鬥中回魔減半）
 *
 * 用法：npx vite-node scripts/simulateReaperKill.mts [--class=a,b] [--top=N] [--runs=N] [--no-skill-debuff]
 */
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculatePhysicalSnapshotSkill,
  calculateBasePhysicalDamage,
  getPlayerAttackInterval,
  getCombatBonuses,
  getTotalMagicAttack,
  getTotalDefense,
  getWeaponAttackSuccess,
  hasActiveFireEnchant,
  getAffixBonusesFromGear,
  getWeaponHitCount,
  COOLDOWN_REDUCTION_CAP,
  INT_SKILL_DAMAGE_PERCENT_PER_2,
  INT_COOLDOWN_PERCENT_PER_2,
} from '../src/systems/combat';
import {
  ATTRIBUTE_KEYS, CLASS_NAMES_ZH,
  getEffectiveAGI, getEffectiveINT, getEffectiveSTR, getTotalAttributes,
} from '../src/models/character';
import { getExpToNextLevel, INITIAL_HP, INITIAL_MP, tryLevelUp } from '../src/systems/levelUp';
import { getHpRegen, getMpRegen, HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../src/systems/regen';
import type { Attributes, Character, ClassName } from '../src/models/character';
import type { EquipmentInstance } from '../src/models/equipment';
import type { MonsterInstance } from '../src/models/monster';
import { SPEED_POTION_ATTACK_SPEED_PERCENT, type ActiveEffect, type StatModifier } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import { SKILL_CATALOG, resolveDotDamagePercent } from '../src/models/skill';
import { CLASS_MAGIC_RESTRICTIONS, getLearnableMaxLevel } from '../src/models/skillRestrictions';
import { TALENT_INSTALL_MAX } from '../src/models/talent';
import { CLASS_SKILLS } from '../src/models/classSkills';
import {
  getErosion, getWeaponBaseDamage, getWeaponDebuffAffixes,
  AFFIX_DEBUFF_CHANCE, AFFIX_DEBUFF_DURATION_MS, DEFENSE_DOWN_CATEGORY,
} from '../src/models/affix';
import {
  UNIQUE_AFFIX_DEFINITIONS, UNIQUE_HIT_PROC_CHANCE, sumUniqueAffix, type UniqueAffixType,
} from '../src/models/uniqueAffix';
import { getEffectiveGear } from '../src/systems/gear';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';

import {
  mulberry32,
  nativeRandom,
  withSeed,
  RUNS_ARG,
  RUNS,
  MP_DRAIN_THRESHOLD,
  Rules,
  RULE_SETS,
  NO_SKILL_DEBUFF,
  RULES_ARG,
  RULES,
  intCooldownReduction,
  ruledSkillPower,
  FRAME_MS,
  DOT_TICK_MS,
  EROSION_MS,
  TIMEOUT_MS,
  ATTRIBUTE_CAP_NOTE,
  CREATION_ATTRIBUTES,
  designEffectiveInt,
  GEAR_INT_BONUS,
  LEVELUP_ALLOCATION,
  partialAllocation,
  levelTo75,
  buildCharacter,
  REAPER_SEED,
  makeReaper,
  AffixType,
  uniqueMax,
  WEAPON_UNIQUE_OPTIONS,
  T7,
  WEAPON_GENERAL_AFFIXES,
  QUALITY,
  ARMOR_AFFIXES,
  Loadout,
  Template,
  MISSING,
  ARMOR_SLOTS,
  OFFHAND_TYPES,
  MAIN_STAT,
  usableBy,
  enhancementFor,
  BRAND_COUNTER,
  BIS_BRAND_ELEMENT,
  EROSION_MODE,
  erosionRollValue,
  instantiate,
  scoreSupportPiece,
  pickSupport,
  buildSupportGear,
  bestOffhand,
  handCombos,
  buildLoadout,
  resolveLoadout,
  makeBuff,
  makeMonsterDebuff,
  CHAR_LEVEL,
  PRECOMBAT_MIN_DURATION_MS,
  DEFENSIVE_STATS,
  OUTPUT_MONSTER_DEBUFF_STATS,
  SPEED_CATEGORY,
  SPEED_POTION_NAME,
  SkillDef,
  SkillHandling,
  HANDLING_LABEL,
  SkillPlanItem,
  OnHitDot,
  ClassSkillPlan,
  hasOutputModifier,
  lowersMonsterDefense,
  speedPercentOf,
  unmeasurableReason,
  attackSideNote,
  classifySkill,
  learnPriority,
  buildSkillPlan,
  SKILL_PLANS,
  getSkillPlan,
  preCombatBuffs,
  ActionKind,
  RotationEntry,
  meetsWeaponRequirement,
  magicEntry,
  toRotationEntry,
  buildRotation,
  CALIBRATION_SAMPLES,
  ActionScore,
  calibrate,
  percentile,
  effectiveMaxMp,
  effectiveMaxHp,
  WEAPON_AFFIX_POOL,
  PROXY_SAMPLES,
  TOP_N_ARG,
  TOP_HANDS,
  TOP_FINAL,
  SEED_AFFIXES,
  chooseAll,
  chooseK,
  uniqueOptions,
  uniqueLabel,
  proxyDps,
  searchBis,
  CLASS_ARG,
  ALL_CLASSES,
  TARGET_CLASSES,
} from './reaperShared.mts';

// ---------------------------------------------------------------- 模擬

interface DotState { category: string; damage: number; nextTick: number; expiresAt: number }

interface SimStats {
  totalDamage: number; hits: number; misses: number; crits: number;
  physHits: number; physMisses: number;
  mpSpent: number; mpStarvedActions: number;
}

/** MP 模型：`enabled: false` 代表理論上限（MP 無限），`true` 代表把消耗與回復都算進去 */
interface MpModel { enabled: boolean; maxMp: number; regenPerTick: number }

function simulateOnce(
  char: Character,
  loadout: Loadout,
  rotation: RotationEntry[],
  baseEffects: ActiveEffect[],
  actionCounts: Record<string, number>,
  stats: SimStats,
  mp: MpModel,
  effInt: number,
): number {
  const monster = makeReaper();
  const onHitDot = getSkillPlan(char.className).onHitDot;
  const effects: ActiveEffect[] = [...baseEffects];
  const timedEffects: { effect: ActiveEffect; expiresAt: number }[] = [];
  const cooldowns: Record<string, number> = {};
  const dots: DotState[] = [];

  /**
   * § 7.4 元素侵蝕：命中後依觸發率上 DoT。普攻與魔法命中都判定，
   * 雙持武器一次攻擊打兩下故判定兩次；存續期間不可刷新。
   */
  const erosion = getErosion(loadout.weapon.affixes, loadout.weapon.quality ?? 0);
  const erosionRolls = getWeaponHitCount(loadout.weapon);
  function tryErosion(now: number, rolls: number) {
    if (!erosion || dots.some(d => d.category === 'eroded')) return;
    for (let r = 0; r < rolls; r++) {
      if (Math.random() * 100 < erosion.chance) {
        dots.push({
          category: 'eroded', damage: erosion.damage,
          nextTick: now + DOT_TICK_MS, expiresAt: now + EROSION_MS,
        });
        return;
      }
    }
  }

  /**
   * § 7.9 防禦下降：判定次數同 `arpgEventHandler.ts` —— 普攻依打擊數、技能一次；
   * 只在有命中時判定；觸發後覆蓋並刷新時間。
   */
  const weaponDebuffs = getWeaponDebuffAffixes(loadout.weapon.affixes, loadout.weapon.quality ?? 0)
    .filter(d => d.type === 'defense_down');
  function tryDefenseDown(rolls: number) {
    for (const proc of weaponDebuffs) {
      let triggered = false;
      for (let r = 0; r < rolls && !triggered; r++) {
        if (Math.random() * 100 < AFFIX_DEBUFF_CHANCE) triggered = true;
      }
      if (!triggered) continue;
      addTimed(
        makeMonsterDebuff('防禦下降', DEFENSE_DOWN_CATEGORY, [{ stat: 'defense', value: -proc.value, isPercent: true }]),
        AFFIX_DEBUFF_DURATION_MS,
      );
    }
  }
  /** § 7T.4 追加傷害：每下命中 20% 機率，加在最終傷害 */
  const bonusDamage = sumUniqueAffix(loadout.gear, 'hit_bonus_damage');
  const rollBonus = (landedHits: number) => {
    let extra = 0;
    for (let h = 0; h < landedHits; h++) {
      if (Math.random() * 100 < UNIQUE_HIT_PROC_CHANCE) extra += bonusDamage;
    }
    return extra;
  };

  let now = 0;
  let nextAction = 0;
  // MP：戰鬥開始時全滿；`regen.ts` 每 6 秒回一次，戰鬥中減半（回魔 buff 的固定值不減半）
  let currentMp = mp.enabled ? mp.maxMp : Number.POSITIVE_INFINITY;
  let nextMpTick = MP_REGEN_INTERVAL_MS;
  // HP：木樁不還手，只有自扣 HP 的技能（血濺咒殺、血魔轉換）會壓低，供復仇之刃的殘血加成
  const maxHp = effectiveMaxHp(char, loadout.gear);
  let hp = maxHp;
  let nextHpTick = HP_REGEN_INTERVAL_MS;
  /** 不佔行動的續航技（血魔轉換）：MP 低於門檻且 HP 高於一半時施放 */
  const sustain = getSkillPlan(char.className).items.filter(i => i.handling === 'sustain').map(i => i.skill);

  const expire = (t: number) => {
    for (let i = timedEffects.length - 1; i >= 0; i--) {
      if (timedEffects[i].expiresAt <= t) {
        const idx = effects.indexOf(timedEffects[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timedEffects.splice(i, 1);
      }
    }
  };

  const addTimed = (e: ActiveEffect, duration: number) => {
    // 同 category 互蓋
    for (let i = timedEffects.length - 1; i >= 0; i--) {
      if (timedEffects[i].effect.category === e.category) {
        const idx = effects.indexOf(timedEffects[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timedEffects.splice(i, 1);
      }
    }
    effects.push(e);
    timedEffects.push({ effect: e, expiresAt: now + duration });
  };

  const applyDamage = (dmg: number) => {
    monster.currentHp = Math.max(0, monster.currentHp - dmg);
    stats.totalDamage += dmg;
  };

  while (monster.currentHp > 0 && now < TIMEOUT_MS) {
    const nextDot = dots.length ? Math.min(...dots.map(d => d.nextTick)) : Infinity;
    const next = Math.min(nextAction, nextDot, mp.enabled ? nextMpTick : Infinity);
    now = next;
    expire(now);

    // --- MP 自然回復（regen.ts：每 6s，戰鬥中減半；魔力湧泉等固定值另加）
    while (mp.enabled && now >= nextMpTick) {
      currentMp = Math.min(mp.maxMp, currentMp + getMpRegen(char, true, loadout.gear, effects));
      nextMpTick += MP_REGEN_INTERVAL_MS;
    }
    // --- HP 自然回復（regen.ts：每 5s，戰鬥中減半）
    while (now >= nextHpTick) {
      hp = Math.min(maxHp, hp + getHpRegen(char, true, loadout.gear, effects));
      nextHpTick += HP_REGEN_INTERVAL_MS;
    }
    // --- 續航技（常駐天賦，不佔行動）
    for (const s of sustain) {
      if (!mp.enabled || (cooldowns[s.id] ?? -Infinity) > now) continue;
      if (currentMp >= mp.maxMp * (1 - (s.mpRestorePercent ?? 0) / 100) || hp <= maxHp / 2) continue;
      hp -= Math.min(Math.floor(maxHp * (s.selfHpCostPercent ?? 0) / 100), hp - 1);
      currentMp = Math.min(mp.maxMp, currentMp + Math.floor(mp.maxMp * (s.mpRestorePercent ?? 0) / 100));
      cooldowns[s.id] = now + s.cooldown;
    }

    // --- DoT tick（直接扣血，不吃防禦，PixiGame.tsx:610）
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (d.nextTick > now) continue;
      if (now >= d.expiresAt) { dots.splice(i, 1); continue; }
      applyDamage(d.damage);
      d.nextTick += DOT_TICK_MS;
      if (d.nextTick >= d.expiresAt) dots.splice(i, 1);
    }
    if (monster.currentHp <= 0) break;

    if (now < nextAction) continue;

    // --- 行動
    // 詞綴 + buff 的 CDR 與 INT 提供的 CDR 加總後，同樣受 50% 上限（combat.ts:373）
    const cdr = Math.min(COOLDOWN_REDUCTION_CAP, getCombatBonuses(loadout.gear, effects).cooldown_reduction + intCooldownReduction(effInt));
    const pick = rotation.find(e => {
      const ready = (cooldowns[e.id] ?? -Infinity) <= now;
      if (!ready) return false;
      // `canUseSkill`：MP 不足就跳過這招，往下找下一個負擔得起的
      if (currentMp < e.mpCost) return false;
      // 回魔技只在 MP 低於 30% 時才放（常駐腳本的典型條件）；MP 無限的對照組永遠不放
      if (e.mpDrainRatio != null && (!mp.enabled || currentMp >= mp.maxMp * MP_DRAIN_THRESHOLD)) return false;
      if (e.kind === 'self_buff') {
        // buff 已在身上就不重複施放
        return !effects.some(x => x.category === e.buff!.category);
      }
      if (e.dot) {
        // § 24.3.2 DoT 存續期間不重複施加 —— 流血還在就不用這招
        return !dots.some(d => d.category === e.dot!.category);
      }
      if (e.debuff && !e.debuffRecast) {
        // 價值全在降防的技能：同 category 還掛著就不放
        return !effects.some(x => x.target === 'monster' && x.category === e.debuff!.category);
      }
      return true;
    });

    const entry = pick ?? null;
    if (mp.enabled && !entry && rotation.length > 0) {
      // 有招可放卻只能普攻 → 若最便宜的技能也付不起，記為 MP 見底
      const cheapest = Math.min(...rotation.map(e => e.mpCost));
      if (currentMp < cheapest) stats.mpStarvedActions++;
    }
    const key = entry ? entry.name : '普通攻擊';
    actionCounts[key] = (actionCounts[key] ?? 0) + 1;

    if (!entry) {
      const res = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      if (res.hit) {
        stats.hits++;
        stats.physHits++;
        if (res.isCritical) stats.crits++;
        applyDamage(res.damage + rollBonus(res.hits.filter(h => !h.isMiss).length));
        tryErosion(now, erosionRolls);
        tryDefenseDown(erosionRolls);
        // 淬毒：普攻命中觸發毒 DoT（快照制、存續期間不刷新），比例讀技能定義
        if (onHitDot && !dots.some(d => d.category === onHitDot.category)) {
          const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
          dots.push({
            category: onHitDot.category,
            damage: Math.max(1, Math.floor(base * onHitDot.percent)),
            nextTick: now + onHitDot.interval,
            expiresAt: now + onHitDot.duration,
          });
        }
      } else {
        stats.misses++;
        stats.physMisses++;
      }
    } else if (entry.kind === 'self_buff') {
      const cost = entry.mpCost;
      currentMp -= cost;
      stats.mpSpent += cost;
      addTimed(makeBuff(entry.name, entry.buff!.category, entry.buff!.modifiers), entry.buff!.duration);
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else if (entry.kind === 'physical_skill') {
      currentMp -= entry.mpCost;
      stats.mpSpent += entry.mpCost;
      const fireEnchant = hasActiveFireEnchant(effects);
      let landed = 0;
      for (let h = 0; h < (entry.hits ?? 1); h++) {
        const res = calculatePhysicalSkillHit(
          char, loadout.weapon, monster, loadout.gear, fireEnchant, entry.name, effects, 0,
          entry.ignoreDefensePercent ?? 0,
        );
        if (res.hit) {
          landed++;
          stats.hits++;
          stats.physHits++;
          if (res.isCritical) stats.crits++;
          applyDamage(res.damage + rollBonus(1));
          tryErosion(now, 1);
        } else {
          stats.misses++;
          stats.physMisses++;
        }
      }
      if (landed > 0) tryDefenseDown(1);
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else {
      currentMp -= entry.mpCost;
      stats.mpSpent += entry.mpCost;
      // 自扣 HP（血濺咒殺）：最低留 1
      if (entry.selfHpCostPercent) hp -= Math.min(Math.floor(maxHp * entry.selfHpCostPercent / 100), hp - 1);
      // 攻擊技能自身 buff 於傷害結算「前」施加（arpgEventHandler.ts `applySkillSelfBuff`）
      if (entry.selfBuff) {
        const scale = entry.selfBuff.scaleByMissingHp;
        const modifiers = scale
          ? [{ stat: scale.stat, value: Math.floor(Math.min(scale.maxPercent, Math.max(0, (1 - hp / maxHp) * 100))), isPercent: true }]
            .filter(m => m.value > 0)
          : entry.selfBuff.modifiers;
        if (modifiers.length > 0) addTimed(makeBuff(entry.name, entry.selfBuff.category, modifiers), entry.selfBuff.duration);
      }
      // 只上毒的技能（毒霧）沒有直接傷害；隨機多擊（血濺咒殺）在單一目標上全中
      let res = { damage: 0, isCritical: false };
      for (let h = 0; h < (entry.dotOnly ? 0 : entry.randomHits ?? 1); h++) {
        res = entry.physicalSnapshot
          ? calculatePhysicalSnapshotSkill(
              char, ruledSkillPower(entry, effInt, char.className), entry.element!, loadout.weapon, monster, loadout.gear, entry.name, effects, 0,
              entry.ignoreDefensePercent ?? 0,
            )
          : calculateSkillAttack(
              char, ruledSkillPower(entry, effInt, char.className), entry.element!, monster, loadout.gear, entry.name, effects, 0,
              entry.ignoreDefensePercent ?? 0, undefined, entry.physicalDamage === true,
            );
        stats.hits++;
        if (res.isCritical) stats.crits++;
        applyDamage(res.damage + rollBonus(1));
        tryErosion(now, 1);
        tryDefenseDown(1);
      }
      // 魔力奪取：回復等同最終傷害的 MP（combat.ts:609 calculateMpRestored）
      if (mp.enabled && entry.mpDrainRatio) {
        currentMp = Math.min(mp.maxMp, currentMp + Math.floor(res.damage * entry.mpDrainRatio));
      }
      // § 24.3.1 數值型 debuff：命中後施加，同 category 覆蓋並刷新時間
      if (entry.debuff) {
        addTimed(makeMonsterDebuff(entry.name, entry.debuff.category, entry.debuff.modifiers), entry.debuff.duration);
      }
      if (entry.dot && !dots.some(d => d.category === entry.dot!.category)) {
        const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
        dots.push({
          category: entry.dot.category,
          damage: Math.max(1, Math.floor(base * entry.dot.percent)),
          nextTick: now + entry.dot.interval,
          expiresAt: now + entry.dot.duration,
        });
      }
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    }

    // 下一次行動：對齊 60fps 幀邊界（playerCombatFSM 的 attackTimer 以 deltaMs 累加）
    const interval = getPlayerAttackInterval(loadout.gear, effects);
    nextAction = Math.ceil((now + interval) / FRAME_MS) * FRAME_MS;
  }

  return monster.currentHp <= 0 ? now : Number.NaN;
}

interface ScenarioReport {
  className: ClassName;
  label: string;
  speedLabel: string;
  mpLabel: string;
  maxMp: number;
  mpRegen: number;
  mpStarvedPercent: number;
  mpPerKill: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  dps: number;
  hitRate: number;
  critRate: number;
  interval: number;
  actionMix: [string, number][];
  derived: Record<string, number | string>;
  scores: ActionScore[];
  /** 實際進輪替的降防技能 */
  debuffSkillsUsed: string[];
  /** 試算後不放的降防技能（佔行動或 MP 得不償失） */
  debuffSkillsDropped: string[];
  /** 輪替佔用的戰鬥天賦格數 */
  combatSlots: number;
}

function runScenario(
  className: ClassName,
  loadout: Loadout,
  withSpeed: boolean,
  mpEnabled: boolean,
  seed: number,
): ScenarioReport {
  const char = buildCharacter(className);
  const candidates = buildRotation(className, loadout.weapon);
  const effects = preCombatBuffs(className);
  const speed = getSkillPlan(className).speed;
  if (withSpeed) effects.push(speed.effect);
  loadout = resolveLoadout(char, effects, loadout);

  const effInt = designEffectiveInt(className, loadout.gear);
  const { order: calibrated, scores } = calibrate(char, loadout, candidates, effects, effInt, seed + 500_000);

  const maxMp = effectiveMaxMp(char, loadout.gear);
  // regen.ts：戰鬥中回魔減半，每 MP_REGEN_INTERVAL_MS 一次
  const regenPerTick = getMpRegen(char, true, loadout.gear, effects);
  const mp: MpModel = { enabled: mpEnabled, maxMp, regenPerTick };

  /*
   * 價值全在降防的技能要佔一次行動、花 MP —— 放不放由實測決定：
   * 每種取捨組合以同一顆種子各跑 RUNS/5 次，取平均擊殺最快者
   */
  const debuffOnly = calibrated.filter(e => e.debuffOnly);
  let rotation = calibrated;
  if (debuffOnly.length > 0) {
    const probeRuns = Math.max(20, Math.floor(RUNS / 5));
    let bestMean = Infinity;
    for (const subset of chooseAll(debuffOnly)) {
      const rot = calibrated.filter(e => !e.debuffOnly || subset.includes(e));
      const probeStats: SimStats = {
        totalDamage: 0, hits: 0, misses: 0, crits: 0,
        physHits: 0, physMisses: 0, mpSpent: 0, mpStarvedActions: 0,
      };
      let sum = 0;
      let n = 0;
      withSeed(seed + 900_000, () => {
        for (let i = 0; i < probeRuns; i++) {
          const t = simulateOnce(char, loadout, rot, effects, {}, probeStats, mp, effInt);
          if (!Number.isNaN(t)) { sum += t; n++; }
        }
      });
      const m = n > 0 ? sum / n : Infinity;
      if (m < bestMean) { bestMean = m; rotation = rot; }
    }
  }
  const debuffSkillsUsed = rotation.filter(e => e.debuff).map(e => e.name);
  const combatSlots = rotation.length;
  const debuffSkillsDropped = debuffOnly.filter(e => !rotation.includes(e)).map(e => e.name);

  const actionCounts: Record<string, number> = {};
  const stats: SimStats = {
    totalDamage: 0, hits: 0, misses: 0, crits: 0,
    physHits: 0, physMisses: 0, mpSpent: 0, mpStarvedActions: 0,
  };
  const killTimes: number[] = [];

  withSeed(seed, () => {
    for (let i = 0; i < RUNS; i++) {
      const t = simulateOnce(char, loadout, rotation, effects, actionCounts, stats, mp, effInt);
      if (!Number.isNaN(t)) killTimes.push(t);
    }
  });

  killTimes.sort((a, b) => a - b);
  const mean = killTimes.reduce((s, t) => s + t, 0) / killTimes.length;

  const bonuses = getCombatBonuses(loadout.gear, effects);
  const attrs = getTotalAttributes(char, effects, loadout.gear);
  const derived: Record<string, number | string> = {
    攻擊力詞綴: bonuses.attack_power,
    元素刻印: bonuses.element_brand,
    技能元素: bonuses.skill_elemental,
    爆擊率: Math.min(75, 5 + bonuses.crit_rate),
    爆擊倍率: Number((2 + bonuses.crit_damage / 100).toFixed(2)),
    攻速詞綴: bonuses.attack_speed,
    減CD: Math.min(COOLDOWN_REDUCTION_CAP, getCombatBonuses(loadout.gear, effects).cooldown_reduction + intCooldownReduction(effInt)),
    裝備魔攻: getTotalMagicAttack(loadout.gear),
    裝備防禦: getTotalDefense(loadout.gear),
    武器攻擊成功: getWeaponAttackSuccess(loadout.weapon),
    有效STR: getEffectiveSTR(attrs.STR),
    有效AGI: getEffectiveAGI(attrs.AGI),
    有效INT: effInt,
    最大MP: maxMp,
    戰鬥中回魔: `${regenPerTick}/6s`,
  };

  const totalActions = Object.values(actionCounts).reduce((s, n) => s + n, 0);
  const actionMix = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, Number(((v / totalActions) * 100).toFixed(1))] as [string, number]);

  return {
    className,
    label: loadout.label,
    speedLabel: withSpeed ? speed.name : '無加速',
    mpLabel: mpEnabled ? '計入 MP' : 'MP 無限',
    maxMp,
    mpRegen: regenPerTick,
    mpStarvedPercent: (stats.mpStarvedActions / Math.max(1, totalActions)) * 100,
    mpPerKill: stats.mpSpent / Math.max(1, killTimes.length),
    mean: mean / 1000,
    median: percentile(killTimes, 0.5) / 1000,
    p10: percentile(killTimes, 0.1) / 1000,
    p90: percentile(killTimes, 0.9) / 1000,
    dps: REAPER_SEED!.hp / (mean / 1000),
    hitRate: stats.physHits + stats.physMisses > 0
      ? (stats.physHits / (stats.physHits + stats.physMisses)) * 100
      : 100,
    critRate: (stats.crits / stats.hits) * 100,
    interval: getPlayerAttackInterval(loadout.gear, effects),
    actionMix,
    derived,
    scores,
    debuffSkillsUsed,
    debuffSkillsDropped,
    combatSlots,
  };
}

console.log('## BiS 自動選定（§ 44.5）\n');
const SCENARIOS: { className: ClassName; loadouts: Loadout[] }[] = [];
for (const cn of TARGET_CLASSES) {
  const { loadouts, searched } = searchBis(cn);
  console.log(`- ${CLASS_NAMES_ZH[cn]}：粗排 ${searched} 組（手部 ${handCombos(cn).length} × 詞綴 ${chooseK(WEAPON_AFFIX_POOL, WEAPON_GENERAL_AFFIXES + 1).length} × T7 獨有詞綴 ${WEAPON_UNIQUE_OPTIONS.length}），`
    + `取前 ${loadouts.length} 名進全模擬 → ${loadouts.map(l => l.label).join(' / ')}`);
  SCENARIOS.push({ className: cn, loadouts });
}
if (MISSING.length > 0) console.log(`\n⚠️ 缺件：${[...new Set(MISSING)].join('、')}`);
console.log('');

console.log('## 技能盤點（Lv.75 學得到的全部技能）\n');
for (const cn of TARGET_CLASSES) {
  const plan = getSkillPlan(cn);
  console.log(`### ${CLASS_NAMES_ZH[cn]}（加速來源：${plan.speed.name}）\n`);
  console.log('| 技能 | 來源 | 類型 | 處理 | 說明 |');
  console.log('|---|---|---|---|---|');
  for (const i of plan.items) {
    console.log(`| ${i.skill.name} | ${i.source} | ${i.skill.type} | ${HANDLING_LABEL[i.handling]} | ${i.note || '—'} |`);
  }
  console.log('');
}

// ---------------------------------------------------------------- 執行

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

console.log(`# Lv.75 滿裝 vs 百柱死神 — ${RUNS.toLocaleString()} 次模擬 / 情境`
  + `${TARGET_CLASSES.length < ALL_CLASSES.length ? `（僅 ${TARGET_CLASSES.map(c => CLASS_NAMES_ZH[c]).join('／')}）` : ''}`);
console.log(`目標：${REAPER_SEED.name} Lv.${REAPER_SEED.level} HP ${REAPER_SEED.hp} 防禦 ${REAPER_SEED.defense}`
  + `（減傷 ${Math.min(REAPER_SEED.defense, 75)}%）${REAPER_SEED.race}/${REAPER_SEED.size}/${REAPER_SEED.element}`);
console.log(`屬性預算：${ATTRIBUTE_CAP_NOTE}`);
if (NO_SKILL_DEBUFF) console.log('技能降防：**關閉**（--no-skill-debuff）');
console.log(`元素侵蝕每跳傷害：**${EROSION_MODE === 'max' ? '完美 roll' : EROSION_MODE === 'low' ? '範圍下緣' : '範圍期望值'}**（--erosion=${EROSION_MODE}）`);
console.log(`規則組：**${RULES.label}**（--rules=${RULES.name}）`
  + ` — INT 每 2 點 +${RULES.intDamagePer2}% 技能威力 / +${RULES.intCdrPer2}% 冷卻縮減；`
  + `基礎魔法威力 ×${RULES.basicPowerMult}、職業魔法威力 ×${RULES.classPowerMult}`);
console.log('');

const pairs: { unlimited: ScenarioReport; limited: ScenarioReport }[] = [];
let seed = 20260801;
for (const sc of SCENARIOS) {
  for (const lo of sc.loadouts) {
    for (const withSpeed of [false, true]) {
      const s0 = seed++;
      pairs.push({
        unlimited: runScenario(sc.className, lo, withSpeed, false, s0),
        limited: runScenario(sc.className, lo, withSpeed, true, s0),
      });
    }
  }
}

console.log('| 職業 | 配置 | 加速 | 攻擊間隔 | 擊殺(MP無限) | 擊殺(計入MP) | 差異 | 中位(計入MP) | P10 | P90 | DPS(計入MP) | 每殺耗魔 | MP池 | MP見底行動% |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { unlimited: u, limited: l } of pairs) {
  const delta = u.mean > 0 ? ((l.mean - u.mean) / u.mean) * 100 : 0;
  console.log(`| ${CLASS_NAMES_ZH[l.className]} | ${l.label} | ${l.speedLabel} | ${l.interval}ms `
    + `| ${fmt(u.mean, 2)}s | ${fmt(l.mean, 2)}s | ${delta >= 0 ? '+' : ''}${fmt(delta)}% `
    + `| ${fmt(l.median, 2)}s | ${fmt(l.p10, 2)}s | ${fmt(l.p90, 2)}s | ${fmt(l.dps)} `
    + `| ${Math.round(l.mpPerKill)} | ${l.maxMp} | ${fmt(l.mpStarvedPercent)}% |`);
}

// § 44.7 表 2：各職業最佳解摘要
const bestPerClass = new Map<ClassName, ScenarioReport>();
for (const { limited } of pairs) {
  const cur = bestPerClass.get(limited.className);
  if (!cur || limited.mean < cur.mean) bestPerClass.set(limited.className, limited);
}
const ordered = [...bestPerClass.values()].sort((a, b) => a.mean - b.mean);
const slowest = ordered[ordered.length - 1].mean;
console.log('\n## 各職業最佳解摘要（計入 MP）\n');
console.log('| 職業 | 最佳配置 | 加速 | 擊殺 | 平均 DPS | 相對最慢 | MP 見底行動% |');
console.log('|---|---|---|---|---|---|---|');
for (const r of ordered) {
  console.log(`| ${CLASS_NAMES_ZH[r.className]} | ${r.label} | ${r.speedLabel} | ${fmt(r.mean, 2)}s `
    + `| ${fmt(r.dps)} | ${fmt(slowest / r.mean, 2)}x | ${fmt(r.mpStarvedPercent)}% |`);
}

console.log('\n## 各職業最佳解的行動分佈（計入 MP）\n');
for (const r of ordered) {
  console.log(`- ${CLASS_NAMES_ZH[r.className]}（戰鬥天賦 ${r.combatSlots} 格）：${r.actionMix.map(([k, v]) => `${k} ${v}%`).join('、')}`
    + `${r.debuffSkillsUsed.length ? `｜降防進輪替：${r.debuffSkillsUsed.join('、')}` : ''}`
    + `${r.debuffSkillsDropped.length ? `｜試算後不放：${r.debuffSkillsDropped.join('、')}` : ''}`);
}

console.log('\n## 各配置衍生數值與行動分佈（計入 MP）\n');
for (const { limited: r } of pairs) {
  if (r.speedLabel === '無加速') continue;
  console.log(`### ${CLASS_NAMES_ZH[r.className]} — ${r.label}`);
  console.log(Object.entries(r.derived).map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`實測物理命中率 ${fmt(r.hitRate)}%（技能 100% 命中，不計入）  實測暴擊率 ${fmt(r.critRate)}%`);
  console.log('單次期望傷害（校準用，> 普通攻擊者才進輪替）：'
    + r.scores.filter(s => Number.isFinite(s.avg))
      .map(s => `${s.name} ${fmt(s.avg)}${s.note ? `（${s.note}）` : ''}`).join('、'));
  console.log(`戰鬥天賦：${r.combatSlots}／${TALENT_INSTALL_MAX} 格`);
  console.log('實際行動分佈：' + r.actionMix.map(([k, v]) => `${k} ${v}%`).join('、'));
  if (r.debuffSkillsUsed.length || r.debuffSkillsDropped.length) {
    console.log(`降防技能：進輪替 ${r.debuffSkillsUsed.join('、') || '—'}／試算後不放 ${r.debuffSkillsDropped.join('、') || '—'}`);
  }
  console.log('');
}
