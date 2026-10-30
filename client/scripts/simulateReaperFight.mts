/**
 * Lv.75 滿裝角色 vs 會攻擊的百柱死神（實戰模擬，`44-dps-prediction.md` § 44.12）。
 *
 * 直接驅動遊戲的 `tickWorld()`（server 同一套，每 tick `TICK_MS`）：死神走過來攻擊、詠唱、上負面狀態，
 * 角色依戰鬥天賦出手、依常駐天賦補血／喝藥／補 buff。傷害、迴避、護盾、反擊、位移全走遊戲本身的程式。
 * 配裝（木樁 BiS 第一名）、技能盤點與輪替排序共用 `reaperShared.mts`。
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
 * 用法：npx vite-node scripts/simulateReaperFight.mts [--class=a,b] [--runs=N] [--proxy-samples=N]
 */
import { tickWorld } from '../src/systems/worldTick';
import { createMapInstance, attachInstance } from '../src/systems/mapInstance';
import { createMonsterFromTemplate } from '../src/systems/monsterSpawn';
import { createMonsterCombatContext } from '../src/systems/monsterCombatFSM';
import { calculateHealAmount, getTotalDefense } from '../src/systems/combat';
import { defaultSession } from '../src/stores/session';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, POTION_CONFIG, getPotionCount } from '../src/stores/gameStore';
import { useMapControlStore } from '../src/stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../src/stores/mapMonsterStore';
import { useTalentStore } from '../src/stores/talentStore';
import { setGameNow, TICK_MS } from '../src/core/clock';
import { makeBagItem } from '../src/models/bagItem';
import { TileType, type MapData } from '../src/models/mapControl';
import { CLASS_NAMES_ZH, type Character, type ClassName } from '../src/models/character';
import type { TalentSlot, TalentSlotEntry } from '../src/models/talent';
import type { MonsterTemplate } from '../src/models/monster';
import type { EquipmentInstance, EquippedGear, EquipSlot } from '../src/models/equipment';
import type { ActiveEffect } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import type { CombatVisual } from '../src/systems/combatLoop';
import {
  buildCharacter, buildRotation, calibrate, designEffectiveInt, getSkillPlan, percentile, preCombatBuffs,
  resolveLoadout, searchBis, setProxySamples, withSeed, REAPER_SEED, RUNS, TARGET_CLASSES,
  type Loadout, type RotationEntry,
} from './reaperShared.mts';
import { TALENT_INSTALL_MAX } from '../src/models/talent';
import { MemoryRepository } from '../src/db/memoryRepository';

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
setProxySamples(Number.isFinite(PROXY_SAMPLES_ARG) && PROXY_SAMPLES_ARG > 0 ? PROXY_SAMPLES_ARG : 200);

const ORANGE_POTIONS = 20;
const KNIGHT_HP_TARGET = 50;
/** 技能補血與高耗魔防守技的門檻：HP 低於這個百分比才放（藥水不花 MP，另依可補量喝） */
const DANGER_HP = 50;
/** 高耗魔、持續短的防守技：只在危險時放 */
const DANGER_ONLY_CATEGORIES = new Set(['invincible', 'sanctuary']);
const MANA_SHIELD_CATEGORY = 'mana-shield';

/** 魔力護盾的施放策略：常駐（到期重放）或危險時才開 */
type ManaShieldPolicy = 'always' | 'danger';
/** 單場上限：超過算未擊殺 */
const FIGHT_TIMEOUT_MS = 180_000;
/** 防守／續航類 buff：效果結束就由常駐天賦重放 */
const SUSTAIN_BUFF_CATEGORIES = new Set([
  'mana-shield', 'mana-spring', 'defense-buff', 'protect-shield', 'holy-shield', 'sanctuary', 'evasion', 'invincible',
]);

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

// ---------------------------------------------------------------- 天賦格

let slotSeq = 0;

function entry(ruleId: string, params: Record<string, unknown> | null = null): TalentSlotEntry {
  return { ruleId, params } as TalentSlotEntry;
}

function slot(type: 'combat' | 'persistent', action: TalentSlotEntry, conditions: TalentSlotEntry[] = []): TalentSlot {
  slotSeq++;
  return {
    id: slotSeq, characterId: 1, tier: 3, assignedType: type, templateId: 'default', order: slotSeq, enabled: true,
    conditions: [...conditions, null, null, null].slice(0, 3), action,
  } as TalentSlot;
}

/** 缺血量 ≥ 補量才補 → 「HP 低於 (1 − 補量／上限)」 */
function refillThreshold(amount: number, maxHp: number): number {
  return Math.max(1, Math.floor((1 - amount / maxHp) * 100));
}

interface FightSetup {
  className: ClassName;
  loadout: Loadout;
  character: Character;
  gear: EquippedGear;
  skills: Skill[];
  effects: ActiveEffect[];
  slots: TalentSlot[];
  rules: string[];
}

function toEquipped(gear: (EquipmentInstance | null)[]): EquippedGear {
  const out: EquippedGear = {};
  gear.forEach((g, i) => {
    if (!g) return;
    const item = { ...g, id: i + 1 };
    const slotKey = (g.slot === ('ring' as EquipSlot) ? 'ring1' : g.slot) as EquipSlot;
    out[slotKey] = item;
  });
  return out;
}

function buildSetup(className: ClassName, raw: Loadout, seed: number, manaShield: ManaShieldPolicy = 'always'): FightSetup {
  slotSeq = 0;
  const plan = getSkillPlan(className);
  const effects = [...preCombatBuffs(className), plan.speed.effect];
  const character = { ...buildCharacter(className), id: 1 };
  const loadout = resolveLoadout(character, effects, raw);
  const effInt = designEffectiveInt(className, loadout.gear);
  const { order } = calibrate(character, loadout, buildRotation(className, loadout.weapon), effects, effInt, seed);

  const learned = plan.items.filter(i => i.handling !== 'over_budget').map(i => i.skill);
  const skills: Skill[] = learned.map(s => ({ ...s, lastUsedAt: -1e9 }) as Skill);
  const gear = toEquipped(loadout.gear);
  const maxHp = getEffectiveMaxHp(character, gear, effects);
  const rules: string[] = [
    `有效最大 HP ${maxHp}／MP ${getEffectiveMaxMp(character, gear, effects)}／裝備防禦 ${getTotalDefense(loadout.gear)}`,
  ];
  const isKnight = className === 'knight';

  // 戰鬥：輪替（攻擊技能依校準排序）→ 普攻
  const combat: TalentSlot[] = [];
  const persistent: TalentSlot[] = [];
  const attackEntries = order.filter((e: RotationEntry) => e.kind !== 'self_buff');
  for (const e of attackEntries.slice(0, TALENT_INSTALL_MAX - 1)) {
    const selfHpCost = learned.find(x => x.id === e.id)?.selfHpCostPercent;
    const conds = isKnight && selfHpCost ? [entry('hp_above', { value: KNIGHT_HP_TARGET })] : [];
    combat.push(slot('combat', entry('skill', { skillId: e.id }), conds));
  }
  // 位移、控場、只上毒、自扣血的技能，價值不在直接傷害（木樁校準會篩掉），實戰照樣施放
  for (const s of learned) {
    if (s.type !== 'attack' || combat.length >= TALENT_INSTALL_MAX - 1) continue;
    if (!(s.dash || s.retreat || s.applyDebuff?.root || s.dotOnly || s.selfHpCostPercent)) continue;
    if (combat.some(c => (c.action?.params as { skillId?: string })?.skillId === s.id)) continue;
    const conds = isKnight && s.selfHpCostPercent ? [entry('hp_above', { value: KNIGHT_HP_TARGET })] : [];
    combat.push(slot('combat', entry('skill', { skillId: s.id }), conds));
  }
  combat.push(slot('combat', entry('normal_attack')));
  const nameOf = (id: string | undefined) => (id ? learned.find(s => s.id === id)?.name ?? id : '普攻');
  rules.push(`戰鬥：${combat.map(c => nameOf((c.action?.params as { skillId?: string } | null)?.skillId)).join(' → ')}`);

  // 常駐：補血（危險時、每點 MP 補最多的一招）→ 藥水 → 回魔 → 防守／續航 buff → 輸出 buff
  const heal = learned
    .filter(s => s.type === 'heal' && s.power > 0)
    .map(s => ({ s, amount: calculateHealAmount(character, s.power, loadout.gear, effects) }))
    .sort((a, b) => b.amount / Math.max(1, b.s.mpCost) - a.amount / Math.max(1, a.s.mpCost) || b.amount - a.amount)[0];
  if (heal) {
    persistent.push(slot('persistent', entry('heal_skill', { skillId: heal.s.id }), [entry('hp_below', { value: DANGER_HP })]));
    rules.push(`${heal.s.name}（每 MP 補 ${fmt(heal.amount / Math.max(1, heal.s.mpCost))}）：HP 低於 ${DANGER_HP}%`);
  }
  const potionThreshold = isKnight ? KNIGHT_HP_TARGET : refillThreshold(POTION_CONFIG.orange.healMax, maxHp);
  persistent.push(slot('persistent', entry('potion', { potionType: 'orange' }), [entry('hp_below', { value: potionThreshold })]));
  rules.push(`橙色藥水：HP 低於 ${potionThreshold}%`);

  // 同 category 的 buff 互相覆蓋（`24-buff-debuff.md` § 24.3.1），只放等級最高的那個
  const bestOfCategory = new Map<string, Skill>();
  for (const s of learned) {
    if (s.type !== 'buff' || !s.buffCategory) continue;
    const cur = bestOfCategory.get(s.buffCategory);
    if (!cur || s.level > cur.level) bestOfCategory.set(s.buffCategory, s as Skill);
  }
  for (const s of learned) {
    if (s.type !== 'buff') continue;
    if (s.buffCategory && bestOfCategory.get(s.buffCategory)?.id !== s.id) continue;
    if (s.mpRestorePercent) {
      const mpThreshold = Math.floor(100 - s.mpRestorePercent);
      persistent.push(slot('persistent', entry('buff_skill', { skillId: s.id }),
        [entry('mp_below', { value: mpThreshold }), entry('hp_above', { value: 50 })]));
      rules.push(`${s.name}：MP 低於 ${mpThreshold}% 且 HP 高於 50%`);
      continue;
    }
    const isSustain = SUSTAIN_BUFF_CATEGORIES.has(s.buffCategory ?? '');
    const isRotationBuff = order.some((e: RotationEntry) => e.kind === 'self_buff' && e.id === s.id);
    if (!isSustain && !isRotationBuff) continue;
    const dangerOnly = DANGER_ONLY_CATEGORIES.has(s.buffCategory ?? '')
      || (s.buffCategory === MANA_SHIELD_CATEGORY && manaShield === 'danger');
    const conds = [entry('buff_not_active', { skillId: s.id })];
    if (dangerOnly) conds.unshift(entry('hp_below', { value: DANGER_HP }));
    persistent.push(slot('persistent', entry('buff_skill', { skillId: s.id }), conds));
    rules.push(dangerOnly ? `${s.name}：HP 低於 ${DANGER_HP}% 且效果不在時` : `${s.name}：效果結束就重放`);
  }

  return { className, loadout, character, gear, skills, effects, slots: [...combat, ...persistent], rules };
}

// ---------------------------------------------------------------- 單場

interface FightResult {
  won: boolean;
  died: boolean;
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
    useGameStore.setState({
      character, skills: setup.skills.map(s => ({ ...s })), equippedGear: setup.gear, inventory: [],
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
      dodges: 0, manaShieldAbsorbed: 0, counters: 0, lifesteal: 0, actions: {}, lowMpRatio: 0,
    };
    const maxMp = getEffectiveMaxMp(character, setup.gear, setup.effects);
    let lowMpTicks = 0;
    while (r.ms < FIGHT_TIMEOUT_MS) {
      useGameStore.setState({ combatLogs: [] });
      const visuals: CombatVisual[] = tickWorld(TICK_MS, [defaultSession], [instance], f => { throw f.error; })
        .get(defaultSession) ?? [];
      r.ms += TICK_MS;
      for (const v of visuals) {
        if (v.kind === 'player_attack') {
          const name = v.result.skillUsed?.name ?? '普攻';
          r.actions[name] = (r.actions[name] ?? 0) + 1;
        }
        if (v.kind !== 'monster_attack') continue;
        if (v.isDodged) r.dodges++;
        else r.damageTaken += v.damage;
      }
      for (const log of useGameStore.getState().combatLogs) {
        const shield = MANA_SHIELD_LOG.exec(log.text);
        if (shield) r.manaShieldAbsorbed += Number(shield[1]);
        const steal = LIFESTEAL_LOG.exec(log.text);
        if (steal) r.lifesteal += Number(steal[1]);
        if (log.text === '閃避反擊！') r.counters++;
      }
      const gs = useGameStore.getState();
      if (gs.statistics.deathCount > 0) {
        r.died = true;
        r.minHpPercent = 0;
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

// ---------------------------------------------------------------- 執行


const t0 = performance.now();
console.log(`# Lv.75 滿裝 vs 會攻擊的百柱死神 — ${RUNS.toLocaleString()} 場／職業`);
console.log(`目標：${REAPER_SEED.name} Lv.${REAPER_SEED.level} HP ${REAPER_SEED.hp} 攻擊 ${REAPER_SEED.attackMin}~${REAPER_SEED.attackMax} 防禦 ${REAPER_SEED.defense}`);
console.log(`背包：橙色藥水 ${ORANGE_POTIONS} 瓶｜騎士 HP 維持 ${KNIGHT_HP_TARGET}%｜單場上限 ${FIGHT_TIMEOUT_MS / 1000}s\n`);

interface Row {
  className: ClassName;
  /** 表格裡的職業欄（含策略） */
  name: string;
  label: string;
  setup: FightSetup;
  results: FightResult[];
}
const rows: Row[] = [];
let seed = 20261101;
for (const cn of TARGET_CLASSES) {
  const { loadouts } = searchBis(cn);
  const hasManaShield = getSkillPlan(cn).items.some(i => i.handling !== 'over_budget' && i.skill.buffCategory === MANA_SHIELD_CATEGORY);
  const policies: ManaShieldPolicy[] = hasManaShield ? ['always', 'danger'] : ['always'];
  for (const policy of policies) {
    const setup = buildSetup(cn, loadouts[0], seed, policy);
    const results: FightResult[] = [];
    for (let i = 0; i < RUNS; i++) results.push(fightOnce(setup, seed * 1000 + i));
    const suffix = hasManaShield ? (policy === 'always' ? '（魔力護盾常駐）' : '（魔力護盾危險時）') : '';
    rows.push({ className: cn, name: `${CLASS_NAMES_ZH[cn]}${suffix}`, label: loadouts[0].label, setup, results });
  }
  seed++;
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

console.log('\n## 各職業設定與行動分佈\n');
for (const row of rows) {
  console.log(`### ${row.name} — ${row.label}`);
  const totals: Record<string, number> = {};
  for (const r of row.results) for (const [k, v] of Object.entries(r.actions)) totals[k] = (totals[k] ?? 0) + v;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  console.log(`- 行動分佈：${Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt((v / sum) * 100)}%`).join('、')}`);
  for (const rule of row.setup.rules) console.log(`- ${rule}`);
  console.log('');
}
console.log(`總耗時 ${fmt((performance.now() - t0) / 1000)}s`);
