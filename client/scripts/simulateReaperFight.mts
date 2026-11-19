/**
 * Lv.75 滿裝角色 vs 會攻擊的百柱死神（實戰模擬，`44-dps-prediction.md` § 44.12）。
 *
 * 直接驅動遊戲的 `tickWorld()`（server 同一套，每 tick `TICK_MS`）：死神走過來攻擊、詠唱、上負面狀態，
 * 角色依戰鬥天賦出手、依常駐天賦補血／喝藥／補 buff。傷害、迴避、護盾、反擊、位移全走遊戲本身的程式。
 * 配裝（木樁 BiS 第一名）、技能盤點與輪替排序共用 `reaperShared.mts`，天賦配置共用 `fightSetup.mts`。
 *
 * 前提：
 *  - 一場一隻死神，背包 20 瓶橙色藥水
 *  - 長效 buff（≥300s）與加速視為戰前已開好；其餘 buff 由常駐天賦在效果結束時重放
 *  - 藥水不花 MP：騎士 HP 低於 50% 才喝，其他職業缺血量 ≥ 一瓶的補量就喝
 *  - 技能補血只在 HP 低於 50% 時放，且只放每點 MP 補最多血的那一招
 *  - 便宜、長效的防守 buff 到期就重放；絕對屏障、聖域、神聖領域只在 HP 低於 50% 時放
 *  - 學得到魔力護盾的職業，「常駐」與「危險時才開」兩種策略各跑一組
 *  - 死亡算失敗；擊殺時間只計存活場次
 *
 * 星盤：逐一試三種配法（`starAllocation.mts`），各打 `STAR_SELECT_RUNS` 場取勝率最高、擊殺中位最快者，再打滿 `--runs`
 *
 * 用法：npx vite-node scripts/simulateReaperFight.mts [--class=a,b] [--runs=N] [--proxy-samples=N] [--star=<policy>]
 */
import { tickWorld } from '../src/systems/worldTick';
import { createMapInstance, attachInstance } from '../src/systems/mapInstance';
import { createMonsterFromTemplate } from '../src/systems/monsterSpawn';
import { createMonsterCombatContext } from '../src/systems/monsterCombatFSM';
import { defaultSession } from '../src/stores/session';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, POTION_CONFIG, getPotionCount } from '../src/stores/gameStore';
import { useMapControlStore } from '../src/stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../src/stores/mapMonsterStore';
import { useTalentStore } from '../src/stores/talentStore';
import { setGameNow, TICK_MS } from '../src/core/clock';
import { makeBagItem } from '../src/models/bagItem';
import { TileType, type MapData } from '../src/models/mapControl';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';
import type { MonsterTemplate } from '../src/models/monster';
import type { CombatVisual } from '../src/systems/combatLoop';
import type { EquipmentInstance } from '../src/models/equipment';
import { formatAffixDisplay } from '../src/models/affix';
import { readFileSync } from 'node:fs';
import {
  bestAbility, buildLoadout, buildSupportGear, getSkillPlan, percentile, searchBis, setProxySamples, setStarOverride, setStarPolicy, starPolicyCandidates,
  starSummary, withGlovesUnique, withSeed, CHAR_LEVEL, REAPER_SEED, RUNS, STAR_POLICY_LABEL, TARGET_CLASSES,
  BIS_AFFIX_TIER, BIS_BRAND_ELEMENT, MAIN_STAT, erosionRollValue,
  type AffixType, type Loadout, type SupportPlan,
} from './reaperShared.mts';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { AbilityType } from '../src/models/ability';
import type { StarPolicy } from './starAllocation.mts';
import { tweakWeapon } from './starTweaks.mts';
import { probeAffixGear, rankedWeaponAffixes, rankedWeaponUnique, removeAffixGear, setAffixContext } from './affixLoadout.mts';
import { getWeaponBaseDamage, type AffixType as GameAffixType } from '../src/models/affix';

setAffixContext('reaper');
/** 邊際量測（§ 44.2）：`--probe-affix=<type>` 加在最多 3 件防具／飾品，`--probe-weapon=<type>` 加在武器 */
const PROBE_ARMOR = process.argv.find(a => a.startsWith('--probe-affix='))?.split('=')[1] as GameAffixType | undefined;
const PROBE_WEAPON = process.argv.find(a => a.startsWith('--probe-weapon='))?.split('=')[1] as GameAffixType | undefined;
const PROBE_UNIQUE = process.argv.find(a => a.startsWith('--probe-unique='))?.split('=')[1] as UniqueAffixType | undefined;
/** `--probe-remove=<type>`：移除所有裝備上的該詞綴（已帶詞綴的移除損失） */
const PROBE_REMOVE = process.argv.find(a => a.startsWith('--probe-remove='))?.split('=')[1] as GameAffixType | undefined;
import type { UniqueAffixType } from '../src/models/uniqueAffix';
import {
  buildSetup, fmt, KNIGHT_HP_TARGET, MANA_SHIELD_CATEGORY, type FightSetup, type ManaShieldPolicy,
} from './fightSetup.mts';
import { MemoryRepository } from '../src/db/memoryRepository';
import { CLASS_SKILLS } from '../src/models/classSkills';

const CLASS_SKILL_NAMES = new Set(CLASS_SKILLS.map(c => c.skill.name));
/** DoT 依 debuff 標籤分組（傷害來源統計） */
const DOT_GROUP: Record<string, string> = { frostbite: '冰霧凍傷', poisoned: '淬毒中毒', bleeding: '裂傷斬流血' };

/** 擊殺後的掉寶與存檔走記憶體資料庫（同測試）；偏好設定寫的 `localStorage` 以記憶體代替 */
defaultSession.repo = new MemoryRepository();
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

// ---------------------------------------------------------------- 場地與前提

const ARENA_SIZE = 24;
const PLAYER_START = { x: 6, y: 12 };
/** 死神出生在 6 格外（仇恨範圍 10 格內），開場先走過來 */
const REAPER_START = { x: 12, y: 12 };
const MAP: MapData = {
  id: 'reaper-arena', name: 'Reaper Arena', width: ARENA_SIZE, height: ARENA_SIZE,
  spawnPoint: PLAYER_START, autoSpawn: false,
  tiles: Array.from({ length: ARENA_SIZE }, (_, y) =>
    Array.from({ length: ARENA_SIZE }, (_, x) =>
      (x === 0 || y === 0 || x === ARENA_SIZE - 1 || y === ARENA_SIZE - 1 ? TileType.Wall : TileType.Ground))),
};

/**
 * 配裝粗排的取樣數（木樁腳本為 600）。這裡只取第一名配裝，降低取樣把全五職業壓在 15 分鐘內。
 * `--proxy-samples=N` 可覆寫。
 */
const PROXY_SAMPLES_ARG = Number(process.argv.find(a => a.startsWith('--proxy-samples='))?.split('=')[1]);
/** 印出落敗場次的種子與最後的戰鬥紀錄 */
const TRACE_DEATHS = process.argv.includes('--trace-deaths');
/** `--heal-scale=X`：補血技能（`type: 'heal'`）威力乘 X，吸血不變（對照用） */
const HEAL_SCALE = Number(process.argv.find(a => a.startsWith('--heal-scale='))?.split('=')[1] ?? 1);
/** `--heal-power=full-heal:80,great-heal:53`：指定補血技能的威力（優先於 `--heal-scale`） */
const HEAL_POWER = new Map((process.argv.find(a => a.startsWith('--heal-power='))?.split('=')[1] ?? '')
  .split(',').filter(Boolean).map(kv => [kv.split(':')[0], Number(kv.split(':')[1])] as const));
const healPower = (s: { id: string; power: number }) => HEAL_POWER.get(s.id) ?? Math.round(s.power * HEAL_SCALE);
/** 武器不帶隨機技能（對照用） */
const NO_ABILITY = process.argv.includes('--no-ability');
const TRACE_LOG_LINES = 40;
setProxySamples(Number.isFinite(PROXY_SAMPLES_ARG) && PROXY_SAMPLES_ARG > 0 ? PROXY_SAMPLES_ARG : 200);

const ORANGE_POTIONS = 20;
/** 單場上限：超過算未擊殺 */
const FIGHT_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------- 單場

interface FightResult {
  won: boolean;
  died: boolean;
  /** `--trace-deaths`：落敗場次的最後戰鬥紀錄（含時間與 HP） */
  deathLog?: string[];
  ms: number;
  minHpPercent: number;
  damageTaken: number;
  potionsUsed: number;
  dodges: number;
  manaShieldAbsorbed: number;
  counters: number;
  lifesteal: number;
  /** 出手次數（技能名／普攻） */
  actions: Record<string, number>;
  /** MP 低於有效上限 10% 的時間比例 */
  lowMpRatio: number;
  /** 直接傷害依來源（普攻／技能名） */
  damageBy: Record<string, number>;
}

const MANA_SHIELD_LOG = /魔力護盾承擔 (\d+) 傷害/;
const LIFESTEAL_LOG = /吸血回復 (\d+) HP/;

function fightOnce(setup: FightSetup, seed: number): FightResult {
  return withSeed(seed, () => {
    setGameNow(0);
    const instance = createMapInstance('reaper', useMapMonsterStore);
    attachInstance(defaultSession, instance);

    const mm: MapMonster = {
      id: 'reaper', position: { ...REAPER_START }, targetPosition: { ...PLAYER_START },
      speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
      lastPathPlayerPos: { ...PLAYER_START }, isBoss: true, attackRange: 1.5,
    };
    const reaper = createMonsterFromTemplate(mm, [REAPER_SEED as unknown as MonsterTemplate])!;
    useMapMonsterStore.setState({ monsters: [mm], combatMonsterIds: [], maxMonsters: 1 });
    useMapControlStore.setState({
      currentMap: MAP, playerPosition: { ...PLAYER_START }, prevPlayerPosition: { ...PLAYER_START },
      currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
    });
    const character = { ...setup.character };
    const maxHp = getEffectiveMaxHp(character, setup.gear, setup.effects);
    character.hp = maxHp;
    character.mp = getEffectiveMaxMp(character, setup.gear, setup.effects);
    useGameStore.setState({
      character, equippedGear: setup.gear, inventory: [],
      skills: setup.skills.map(s => (s.type === 'heal' ? { ...s, power: healPower(s) } : { ...s })),
      bagItems: [makeBagItem(POTION_CONFIG.orange.itemId, ORANGE_POTIONS)!], combatLogs: [],
      activeEffects: setup.effects.map(e => ({ ...e })),
      lastPotionUsedAt: -1e9,
      regenActive: true, persistentLoopActive: true,
      statistics: { ...useGameStore.getState().statistics, deathCount: 0 },
    });
    useTalentStore.setState({ slots: setup.slots });
    instance.monsterInstances.set('reaper', reaper);
    defaultSession.combat.engine.monsters.set('reaper', {
      instance: reaper, mapMonster: mm, combatCtx: createMonsterCombatContext(),
      attackConfig: { attackType: reaper.attackType, attackRange: reaper.attackRange, attackInterval: reaper.attackInterval },
    });

    const r: FightResult = {
      won: false, died: false, ms: 0, minHpPercent: 100, damageTaken: 0, potionsUsed: 0,
      dodges: 0, manaShieldAbsorbed: 0, counters: 0, lifesteal: 0, actions: {}, lowMpRatio: 0, damageBy: {},
    };
    const reaperHpBefore = () => reaper.currentHp;
    const maxMp = getEffectiveMaxMp(character, setup.gear, setup.effects);
    let lowMpTicks = 0;
    const trace: string[] = [];
    while (r.ms < FIGHT_TIMEOUT_MS) {
      useGameStore.setState({ combatLogs: [] });
      const hpBefore = reaperHpBefore();
      const visuals: CombatVisual[] = tickWorld(TICK_MS, [defaultSession], [instance], f => { throw f.error; })
        .get(defaultSession) ?? [];
      r.ms += TICK_MS;
      let direct = 0;
      for (const v of visuals) {
        if (v.kind === 'player_attack') {
          const name = v.result.skillUsed?.name ?? '普攻';
          r.actions[name] = (r.actions[name] ?? 0) + 1;
          const dealt = v.result.damages.filter(d => d.targetId === 'reaper' && !d.isMiss).reduce((sum, d) => sum + d.damage, 0);
          r.damageBy[name] = (r.damageBy[name] ?? 0) + dealt;
          direct += dealt;
        }
        if (v.kind === 'dot' && v.target === 'monster' && v.monsterId === 'reaper') {
          const name = `DoT:${v.tags[0] ?? ''}`;
          r.damageBy[name] = (r.damageBy[name] ?? 0) + v.damage;
          direct += v.damage;
        }
        if (v.kind !== 'monster_attack') continue;
        if (v.isDodged) r.dodges++;
        else r.damageTaken += v.damage;
      }
      const lost = Math.max(0, hpBefore - Math.max(0, reaper.currentHp));
      if (lost > direct) r.damageBy['DoT／其他'] = (r.damageBy['DoT／其他'] ?? 0) + (lost - direct);
      for (const log of useGameStore.getState().combatLogs) {
        const shield = MANA_SHIELD_LOG.exec(log.text);
        if (shield) r.manaShieldAbsorbed += Number(shield[1]);
        const steal = LIFESTEAL_LOG.exec(log.text);
        if (steal) r.lifesteal += Number(steal[1]);
        if (log.text === '閃避反擊！') r.counters++;
        if (TRACE_DEATHS) {
          trace.push(`${(r.ms / 1000).toFixed(1)}s HP ${useGameStore.getState().character!.hp} MP ${useGameStore.getState().character!.mp}｜${log.text}`);
          if (trace.length > TRACE_LOG_LINES) trace.shift();
        }
      }
      const gs = useGameStore.getState();
      if (gs.statistics.deathCount > 0) {
        r.died = true;
        r.minHpPercent = 0;
        if (TRACE_DEATHS) r.deathLog = trace;
        break;
      }
      r.minHpPercent = Math.min(r.minHpPercent, (gs.character!.hp / maxHp) * 100);
      if (gs.character!.mp < maxMp * 0.1) lowMpTicks++;
      if (reaper.currentHp <= 0) {
        r.won = true;
        break;
      }
    }
    r.potionsUsed = ORANGE_POTIONS - getPotionCount(useGameStore.getState().bagItems, 'orange');
    r.lowMpRatio = lowMpTicks / Math.max(1, r.ms / TICK_MS);
    return r;
  });
}

// ---------------------------------------------------------------- 重播

/** `--replay=<json>` 的一個職業：武器、副手、武器詞綴（依序，第 5 條為封印）、獨有詞綴、隨機技能、防具攻擊詞綴排名、手套獨有詞綴 */
interface ReplayEntry {
  weapon: string;
  offhand?: string;
  affixes: AffixType[];
  unique?: UniqueAffixType;
  ability?: AbilityType;
  ranking: AffixType[];
  glovesUnique?: UniqueAffixType;
}

/** `--replay=<json>`：照檔案重建配裝（數值依現行模板與階級表），不做配裝搜尋 */
const REPLAY_ARG = process.argv.find(a => a.startsWith('--replay='))?.split('=')[1];
const REPLAY: Partial<Record<ClassName, ReplayEntry>> = REPLAY_ARG ? JSON.parse(readFileSync(REPLAY_ARG, 'utf8')) : {};

function replayLoadout(cn: ClassName): { loadouts: Loadout[]; plan: SupportPlan } | null {
  const r = REPLAY[cn];
  if (!r) return null;
  const tplOf = (name: string) => {
    const t = EQUIPMENT_SEEDS.find(x => x.name === name);
    if (!t) throw new Error(`重播：找不到模板 ${name}`);
    return t;
  };
  const weapon = tplOf(r.weapon);
  const offhand = r.offhand ? tplOf(r.offhand) : null;
  const plan: SupportPlan = { cn, ranking: r.ranking, glovesUnique: null };
  const label = `${weapon.name}+9${offhand ? ` ＋ ${offhand.name}` : '（雙手）'}｜${r.affixes.join('+')}（重播）`;
  const weaponAffixes = rankedWeaponAffixes(cn, r.affixes.length) ?? r.affixes;
  const unique = PROBE_UNIQUE ?? rankedWeaponUnique(cn) ?? r.unique ?? null;
  let lo = buildLoadout(label, weapon, offhand, weaponAffixes, buildSupportGear(plan), unique,
    r.ability ? bestAbility(r.ability, weapon) : null, plan);
  if (r.glovesUnique) lo = withGlovesUnique(lo, r.glovesUnique);
  if (PROBE_REMOVE) {
    const p = removeAffixGear(lo.gear, lo.weapon, PROBE_REMOVE);
    lo = { ...lo, gear: p.gear, weapon: p.weapon, label: `${lo.label}｜移除 ${PROBE_REMOVE}×${p.removed}` };
  }
  for (const [type, target] of [[PROBE_ARMOR, 'armor'], [PROBE_WEAPON, 'weapon']] as const) {
    if (!type) continue;
    const ctx = { element: BIS_BRAND_ELEMENT, erosionDamage: erosionRollValue(getWeaponBaseDamage(lo.weapon)), mainStat: MAIN_STAT[cn] };
    const p = probeAffixGear(lo.gear, lo.weapon, type, BIS_AFFIX_TIER, ctx, target);
    lo = { ...lo, gear: p.gear, weapon: p.weapon, label: `${lo.label}｜量測 ${type}×${p.added}` };
  }
  const weaponT = tweakWeapon(lo.weapon);
  if (weaponT !== lo.weapon) lo = { ...lo, weapon: weaponT, gear: lo.gear.map(g => (g === lo.weapon ? weaponT : g)) };
  return { loadouts: [lo], plan };
}

// ---------------------------------------------------------------- 執行


const t0 = performance.now();
console.log(`# Lv.75 滿裝 vs 會攻擊的百柱死神 — ${RUNS.toLocaleString()} 場／職業`);
console.log(`目標：${REAPER_SEED.name} Lv.${REAPER_SEED.level} HP ${REAPER_SEED.hp} 攻擊 ${REAPER_SEED.attackMin}~${REAPER_SEED.attackMax} 防禦 ${REAPER_SEED.defense}`);
console.log(`背包：橙色藥水 ${ORANGE_POTIONS} 瓶｜騎士 HP 維持 ${KNIGHT_HP_TARGET}%｜單場上限 ${FIGHT_TIMEOUT_MS / 1000}s`
  + `${HEAL_SCALE !== 1 ? `｜補血技能威力 ×${HEAL_SCALE}` : ''}\n`);

interface Row {
  className: ClassName;
  /** 表格裡的職業欄（含策略） */
  name: string;
  label: string;
  setup: FightSetup;
  results: FightResult[];
  ranking: string[];
  gear: (EquipmentInstance | null)[];
}
/** 星盤配法的篩選場數 */
const STAR_SELECT_RUNS = 100;
/** `--star-override=<json>`：分析用，`{ 職業: 節點 id[] }` 直接指定星盤 */
const STAR_OVERRIDE_ARG = process.argv.find(a => a.startsWith('--star-override='))?.split('=')[1];
const STAR_OVERRIDE: Partial<Record<ClassName, string[]>> = STAR_OVERRIDE_ARG ? JSON.parse(readFileSync(STAR_OVERRIDE_ARG, 'utf8')) : {};
for (const [cn, chart] of Object.entries(STAR_OVERRIDE)) setStarOverride(cn as ClassName, chart);
const rows: Row[] = [];
const starNotes: string[] = [];
let seed = 20261101;
for (const cn of TARGET_CLASSES) {
  /** 擊殺中位（勝率不足 100% 的配法排在後面） */
  const score = (rs: FightResult[]) => {
    const wins = rs.filter(r => r.won).map(r => r.ms).sort((a, b) => a - b);
    return (rs.length - wins.length) * 1e9 + (wins.length ? percentile(wins, 0.5) : 0);
  };
  let best: { policy: StarPolicy; loadout: Loadout; plan: SupportPlan; score: number } | null = null;
  const tried: string[] = [];
  for (const starPolicy of starPolicyCandidates(cn, CHAR_LEVEL)) {
    setStarPolicy(cn, starPolicy);
    const { loadouts: found, plan } = replayLoadout(cn) ?? searchBis(cn);
    const loadout = NO_ABILITY
      ? { ...found[0], ability: null, weapon: { ...found[0].weapon, ability: undefined }, gear: found[0].gear.map(g => (g === found[0].weapon ? { ...g, ability: undefined } : g)) }
      : found[0];
    let sc = 0;
    if (starPolicyCandidates(cn, CHAR_LEVEL).length > 1) {
      for (const policy of manaShieldPolicies(cn)) {
        const setup = buildSetup(cn, loadout, seed, policy);
        sc += score(Array.from({ length: STAR_SELECT_RUNS }, (_, i) => fightOnce(setup, seed * 1000 + i)));
      }
      tried.push(`${STAR_POLICY_LABEL[starPolicy]} ${fmt(sc / manaShieldPolicies(cn).length / 1000, 2)}s`);
    }
    if (!best || sc < best.score) best = { policy: starPolicy, loadout, plan, score: sc };
  }
  setStarPolicy(cn, best!.policy);
  starNotes.push(`- ${CLASS_NAMES_ZH[cn]}：${STAR_POLICY_LABEL[best!.policy]}（${starSummary(cn, getSkillPlan(cn).starChart)}）`
    + (tried.length ? `；篩選 ${STAR_SELECT_RUNS} 場擊殺中位：${tried.join('、')}` : ''));
  for (const policy of manaShieldPolicies(cn)) {
    const setup = buildSetup(cn, best!.loadout, seed, policy);
    const results: FightResult[] = [];
    for (let i = 0; i < RUNS; i++) results.push(fightOnce(setup, seed * 1000 + i));
    const suffix = manaShieldPolicies(cn).length > 1 ? (policy === 'always' ? '（魔力護盾常駐）' : '（魔力護盾危險時）') : '';
    rows.push({ className: cn, name: `${CLASS_NAMES_ZH[cn]}${suffix}`, label: best!.loadout.label, setup, results, ranking: best!.plan.ranking, gear: best!.loadout.gear });
  }
  seed++;
}

function manaShieldPolicies(cn: ClassName): ManaShieldPolicy[] {
  // 魔力護盾依 MP 比例減傷、不扣 MP（`23-class-magic.md` § 23.5）：一律常駐
  void cn;
  return ['always'];
}

console.log('| 職業 | 勝率 | 死亡率 | 擊殺中位 | P10 | P90 | 最低 HP 中位 | MP<10% 時間 | 受到傷害/場 | 藥水/場 | 迴避/場 | 魔力護盾承擔/場 | 閃避反擊/場 | 吸血/場 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  const n = row.results.length;
  const wins = row.results.filter(r => r.won);
  const times = wins.map(r => r.ms / 1000).sort((a, b) => a - b);
  const minHp = row.results.map(r => r.minHpPercent).sort((a, b) => a - b);
  const avg = (f: (r: FightResult) => number) => row.results.reduce((s, r) => s + f(r), 0) / n;
  console.log(`| ${row.name} | ${fmt((wins.length / n) * 100)}% | ${fmt((row.results.filter(r => r.died).length / n) * 100)}% `
    + `| ${times.length ? `${fmt(percentile(times, 0.5), 2)}s` : '—'} | ${times.length ? `${fmt(percentile(times, 0.1), 2)}s` : '—'} `
    + `| ${times.length ? `${fmt(percentile(times, 0.9), 2)}s` : '—'} | ${fmt(percentile(minHp, 0.5))}% `
    + `| ${fmt(avg(r => r.lowMpRatio) * 100)}% `
    + `| ${fmt(avg(r => r.damageTaken), 0)} | ${fmt(avg(r => r.potionsUsed))} | ${fmt(avg(r => r.dodges))} `
    + `| ${fmt(avg(r => r.manaShieldAbsorbed), 0)} | ${fmt(avg(r => r.counters))} | ${fmt(avg(r => r.lifesteal), 0)} |`);
}

console.log('\n## 星盤配法\n');
for (const line of starNotes) console.log(line);

console.log('\n## 各職業設定與行動分佈\n');
for (const row of rows) {
  console.log(`### ${row.name} — ${row.label}`);
  const totals: Record<string, number> = {};
  for (const r of row.results) for (const [k, v] of Object.entries(r.actions)) totals[k] = (totals[k] ?? 0) + v;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  console.log(`- 行動分佈：${Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt((v / sum) * 100)}%`).join('、')}`);
  const dmg: Record<string, number> = {};
  for (const r of row.results) for (const [k, v] of Object.entries(r.damageBy)) {
    const group = k === '普攻' || k === 'DoT／其他' ? k : k.startsWith('DoT:') ? (DOT_GROUP[k.slice(4)] ?? 'DoT／其他')
      : CLASS_SKILL_NAMES.has(k) ? '職業技能' : '基礎魔法';
    dmg[group] = (dmg[group] ?? 0) + v;
  }
  const dmgSum = Object.values(dmg).reduce((a, b) => a + b, 0) || 1;
  const winMs = row.results.filter(r => r.won).map(r => r.ms);
  console.log(`- 擊殺平均：${fmt(winMs.reduce((a, b) => a + b, 0) / Math.max(1, winMs.length) / 1000, 3)}s`);
  console.log(`- 傷害來源：${['普攻', '職業技能', '基礎魔法', 'DoT／其他'].map(k => `${k} ${fmt(((dmg[k] ?? 0) / dmgSum) * 100)}%`).join('、')}`
    + `${Object.values(DOT_GROUP).filter(k => dmg[k]).map(k => `、${k} ${fmt((dmg[k] / dmgSum) * 100)}%`).join('')}`);
  console.log(`- 非武器部位攻擊詞綴排名：${row.ranking.join(' > ') || '（無）'}`);
  for (const g of row.gear) {
    if (!g) continue;
    const affixes = (g.affixes ?? []).map(a => formatAffixDisplay(a, g.quality ?? 0)).join('、');
    console.log(`  - ${g.name}+${g.enhancement ?? 0}：${affixes}${g.uniqueAffix ? `｜(獨)${g.uniqueAffix.type} ${g.uniqueAffix.value}` : ''}`);
  }
  for (const rule of row.setup.rules) console.log(`- ${rule}`);
  console.log('');
}
if (TRACE_DEATHS) {
  console.log('## 落敗場次\n');
  for (const row of rows) {
    row.results.forEach((r, i) => {
      if (!r.died) return;
      console.log(`### ${row.name} 第 ${i} 場（${(r.ms / 1000).toFixed(1)}s）`);
      for (const line of r.deathLog ?? []) console.log(`- ${line}`);
      console.log('');
    });
  }
}
console.log(`總耗時 ${fmt((performance.now() - t0) / 1000)}s`);
