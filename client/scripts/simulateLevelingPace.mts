/**
 * 升級節奏模擬 —— 量測「DPS 是否兌現成擊殺速率」與 Lv1→60 的實際時數。
 *
 * 用法：
 *   cd client
 *   npx vite-node scripts/simulateLevelingPace.mts              # 全部四段 A/B/C/D
 *   npx vite-node scripts/simulateLevelingPace.mts --section=A  # 只跑其中一段
 *   npx vite-node scripts/simulateLevelingPace.mts --minutes=240 # A 段的模擬時長
 *   npx vite-node scripts/simulateLevelingPace.mts --despawn=25  # 用文件版脫離距離
 *   npx vite-node scripts/simulateLevelingPace.mts --section=B --curve=both  # 新舊經驗表對照
 *   npx vite-node scripts/simulateLevelingPace.mts --section=B --curve=old --old-ref=<git ref>
 *   npx vite-node scripts/simulateLevelingPace.mts --section=E --e-minutes=30  # 前期生存與換階金幣
 *   npx vite-node scripts/simulateLevelingPace.mts --section=F                  # 任務收入與 T2 換裝門檻
 *
 * ── 真實邏輯（直接 import，不重寫）────────────────────────────────
 *  - `mapMonsterStore.spawnTick`：判定間隔、BASE_SPAWN_CHANCE、清場補位、
 *    生成隻數分布、MIN_SPAWN_DISTANCE、20 次嘗試上限
 *  - `pressure.calculatePressure` / `getPressureDropMultiplier`
 *  - `pathfinding.getRandomWalkablePosition`（由 spawnTick 內部呼叫，走真實地圖 JSON）
 *  - `levelUp.getExpToNextLevel`（`04-character.md` § 4.9 曲線）
 *  - `src/data/maps/*.json` 真實地圖（尺寸、可生成格分布）
 *  - `dropSeeds.DROP_TABLE_SEEDS` 真實掉落值
 *  - 怪物基礎經驗：直接解析 `monsterSeeds.ts` 的 `exp` 欄（`--curve=old` 走 git ref 的舊版），
 *    同級多筆取中位數、缺級等比內插；結算 ×3（`28-monster-stats.md` § 28.1）
 *
 * ── 近似（不是真實邏輯）───────────────────────────────────────────
 *  1. 怪物移動走**直線逼近**，不跑 A*／貪婪一步走，也不做地格佔用互擋。
 *     速度用真實的 MONSTER_SPEED = 1 格/秒。真實地圖有障礙，實際走時間略長於本模擬。
 *  2. 玩家自動移動：無戰鬥時朝最近怪物直線前進（moveSpeed = 2 格/秒），
 *     重新選目標有 500~1500ms 延遲（同 `mapControlStore.tick`）。無怪時停在原地
 *     （真實行為是隨機遊走，會改變生成點分布，本模擬不含）。
 *  3. 脫離距離取 `gameLoop.moveMonstersSafe` 的實作值 15 格（`--despawn` 可改）。
 *  4. 戰鬥為**逐隻循序擊殺**，每隻固定耗時 TTK 秒。真實 ARPG 有 AOE 與多目標，
 *     因此本模擬在高 Pressure（場上 7~10 隻）下**低估**擊殺速率。
 *  5. A/B/C/D 段不模擬 HP/MP 門檻暫停、死亡、Boss、任務、背包滿。
 *     **E 段模擬 HP 門檻暫停與死亡**（見下）；Boss／任務／背包仍不模擬。
 *  6. TTK 取自 `calibrateTTK.mts`（見下方 TTK 表的取得指令），跨職業取平均，
 *     模擬期間視為常數，不隨等級內的裝備微調變動。
 *
 * ── E 段（前期 Pressure 生存）的戰鬥處理 ─────────────────────────────
 *  - 怪物對玩家的每一次出手都走真實的 `combat.ts` calculateMonsterAttack：
 *    **迴避、防禦減傷、格擋、傷害隨機區間全部由它決定**，本腳本不另外套命中率或減傷。
 *  - 玩家迴避＝該函式內的 `基礎迴避 + AGI/3 + 防禦溢出`（§ 21.6），未加任何 buff。
 *  - 怪物出手間隔 1200ms（`PixiGame.createMonsterFromTemplate` 對無 attackType 模板的預設），
 *    射程 1.5 格、近戰；前期四張圖的 seed 都沒有 attackType，與實作一致。
 *  - 進入射程時各怪的出手時點隨機打散，避免同幀齊射造成的假尖峰。
 *  - HP 回復走真實的 `regen.getHpRegen`（每 5s，戰鬥中減半）。
 *  - HP 門檻暫停與死亡照 `gameLoop.ts`：HP ≤ 30% 且身邊無怪 → 停止生成且不再主動貼怪，
 *    ≥ 60% 恢復；死亡則 areaKills 歸零、場上清空、滿血重來。
 *  - 玩家對怪物的輸出仍以固定 TTK 表示（同上第 4 點），因此高 Pressure 下的清怪速度偏保守。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { useMapMonsterStore } from '../src/stores/mapMonsterStore';
import { calculatePressure, getPressureDropMultiplier, PRESSURE_DROP_CAP } from '../src/systems/pressure';
import { getExpToNextLevel } from '../src/systems/levelUp';
import { DROP_TABLE_SEEDS } from '../src/db/seed/dropSeeds';
import { RESTED_EXP_CAP_MS, RESTED_EXP_MULTIPLIER } from '../src/systems/restedExp';
import { getItemById } from '../src/models/items';
import { calculateMonsterAttack, getAffixBonusesFromGear, getTotalDefense } from '../src/systems/combat';
import { getHpRegen, HP_REGEN_INTERVAL_MS } from '../src/systems/regen';
import { INITIAL_HP, INITIAL_MP, tryLevelUp } from '../src/systems/levelUp';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';

import { GOLD_RATE_MULTIPLIER } from '../src/config';
import {
  generateSingleQuest, acceptQuest, abandonQuest as abandonAdvQuest,
  updateQuestProgress as updateAdvQuestProgress,
  updateCollectQuestProgress as updateAdvCollectProgress,
  rollCollectMaterialDrop as rollAdvCollectDrop,
  completeQuest as completeAdvQuest,
} from '../src/systems/adventurerQuestSystem';
import { MAX_ACTIVE_ADVENTURER_QUESTS } from '../src/models/adventurerQuest';
import type { AdventurerQuest, GuildProgress, QuestReward } from '../src/models/adventurerQuest';
import { getItemSellPrice } from '../src/systems/shop';
import type { Attributes, Character, ClassName } from '../src/models/character';
import type { EquipmentInstance, EquipmentTemplate, EquipSlot } from '../src/models/equipment';
import type { MonsterInstance, MonsterTemplate } from '../src/models/monster';
import type { MapData, Position } from '../src/models/mapControl';

// ---------------------------------------------------------------- RNG

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 參數

function argOf(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
}

const SECTION = (argOf('section') ?? 'ABCD').toUpperCase();
/**
 * B 段的怪物經驗表：
 *  - `new`（預設）＝工作區的 `monsterSeeds.ts`（等比化後）
 *  - `old`      ＝ `--old-ref` 指向的 git 版本（改動前）
 *  - `both`     ＝ 兩者各跑一次並輸出對照表
 * 兩次模擬只換這一個變數，其餘（spawnTick / calculatePressure / TTK / 地圖 / 亂數種子）完全相同。
 */
const CURVE = (argOf('curve') ?? 'new') as 'new' | 'old' | 'both';
const OLD_REF = argOf('old-ref') ?? 'HEAD';
const A_MINUTES = Number(argOf('minutes') ?? 240);
/** `gameLoop.moveMonstersSafe` 的實作值是 15；`26-spawn-pressure.md` § 26.8 寫 25 */
const DESPAWN_DISTANCE = Number(argOf('despawn') ?? 15);
const TICK_MS = 50;

const MONSTER_SPEED = 1;
const PLAYER_SPEED = 2;
const STOP_DISTANCE = 1.5;
/** 逼近到停止距離即進入戰鬥；加一個浮點餘裕，否則剛好停在 1.5 的怪永遠判不進戰鬥 */
const ENGAGE_DISTANCE = STOP_DISTANCE + 1e-6;
const REPICK_MIN_MS = 500;
const REPICK_RANGE_MS = 1000;

// ---------------------------------------------------------------- TTK 表
//
// 取自：npx vite-node scripts/calibrateTTK.mts --profile=base --runs=200
//       npx vite-node scripts/calibrateTTK.mts --profile=base --runs=200 --fixed=16-20
// 五職業（騎士/妖精/元素師/牧師/盜賊）平均，單位秒。

/** 固定目標（Lv16~20 一般怪 HP90/防7）—— 純 DPS 階梯，A 段用 */
const TTK_FIXED_TARGET: Record<string, number> = {
  'shop-low': 8.86,
  'shop-mid': 3.72,
  'shop-high': 1.82,
  'craft-entry': 1.16,
  'craft-mid': 0.82,
  'craft-top': 0.48,
};

/** 同級怪（該階梯的農怪帶）—— 實際升級情境，B/C 段用 */
const TTK_SAME_LEVEL: Record<string, number> = {
  'shop-low': 1.44,
  'shop-mid': 3.72,
  'shop-high': 8.08,
  'craft-entry': 8.92,
  'craft-mid': 10.92,
  'craft-top': 12.92,
};

interface Stage {
  id: string;
  label: string;
  level: number;
  /** 該階梯的代表地圖（B/C 段用該階梯農怪帶的實際地圖） */
  map: string;
}

const STAGES: Stage[] = [
  { id: 'shop-low', label: '商店低階', level: 8, map: 'green-valley' },
  { id: 'shop-mid', label: '商店中階', level: 18, map: 'misty-swamp' },
  { id: 'shop-high', label: '商店高階', level: 28, map: 'trial-highlands-top' },
  { id: 'craft-entry', label: '製作入門', level: 38, map: 'demon-altar' },
  { id: 'craft-mid', label: '製作進階', level: 50, map: 'misty-cave-3f' },
  { id: 'craft-top', label: '製作頂級', level: 60, map: 'ancient-dungeon-7f' },
];

/** A 段的固定舞台：固定怪 = Lv16~20，對應迷霧沼澤 */
const A_MAP = 'misty-swamp';
/** A 段的對照舞台（較大地圖），用來看地圖尺寸對生成效率的影響 */
const A_MAP_LARGE = 'trial-highlands-top';

/** Lv1→60 的地圖動線（`mapData.ts` 的等級帶）。切圖 = areaKills 歸零 */
const LEVEL_PATH: { maxLevel: number; map: string }[] = [
  { maxLevel: 5, map: 'dawn-plains' },
  { maxLevel: 10, map: 'green-valley' },
  { maxLevel: 15, map: 'wind-woods' },
  { maxLevel: 20, map: 'misty-swamp' },
  { maxLevel: 25, map: 'trial-highlands' },
  { maxLevel: 30, map: 'trial-highlands-top' },
  { maxLevel: 33, map: 'snow-field' },
  { maxLevel: 36, map: 'rotleaf-path' },
  { maxLevel: 40, map: 'demon-altar' },
  { maxLevel: 43, map: 'misty-cave-1f' },
  { maxLevel: 46, map: 'misty-cave-2f' },
  { maxLevel: 50, map: 'misty-cave-3f' },
  { maxLevel: 55, map: 'ancient-dungeon-4f' },
  { maxLevel: 60, map: 'ancient-dungeon-7f' },
];

// ---------------------------------------------------------------- 工具

const mapCache = new Map<string, MapData>();
function loadMap(id: string): MapData {
  const cached = mapCache.get(id);
  if (cached) return cached;
  const map = JSON.parse(readFileSync(`src/data/maps/${id}.json`, 'utf8')) as MapData;
  mapCache.set(id, map);
  return map;
}

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

/** `28-monster-stats.md` § 28.1 基礎經驗公式；擊殺結算 ×3 */
function monsterBaseExp(level: number): number {
  return Math.round(2 * Math.pow(1.1302, Math.min(60, level) - 1));
}

/** 擊殺結算倍率（新舊表共用，`28-monster-stats.md` § 28.1；HEAD 版的 gameStore 已是 ×3） */
const EXP_SETTLE_MULTIPLIER = 3;

/**
 * 從 seed 原始碼取出「等級 → 一般怪基礎經驗」。新舊表用同一套解析與內插，
 * 差異因此只來自 seed 數值本身。同級多筆取中位數；缺級以等比內插；兩端夾住。
 */
function buildExpTable(source: 'new' | 'old'): (level: number) => number {
  const text = source === 'new'
    ? readFileSync('src/db/seed/monsterSeeds.ts', 'utf8')
    // `git show <ref>:<repo 相對路徑>` 與呼叫端的子目錄無關，不需要調整 cwd
    : execFileSync('git', ['show', `${OLD_REF}:client/src/db/seed/monsterSeeds.ts`], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });

  const byLevel = new Map<number, number[]>();
  for (const line of text.split('\n')) {
    if (!line.includes('isBoss: false')) continue;
    const level = Number(/level:\s*(\d+)/.exec(line)?.[1]);
    const exp = Number(/\bexp:\s*(\d+)/.exec(line)?.[1]);
    if (!Number.isFinite(level) || !Number.isFinite(exp)) continue;
    (byLevel.get(level) ?? byLevel.set(level, []).get(level)!).push(exp);
  }
  if (byLevel.size === 0) throw new Error(`${source}: 解析不到任何一般怪經驗值`);

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const table = new Map(levels.map(l => [l, median(byLevel.get(l)!)]));

  return (level: number): number => {
    const l = Math.min(levels[levels.length - 1], Math.max(levels[0], level));
    const exact = table.get(l);
    if (exact != null) return exact;
    let lo = levels[0];
    let hi = levels[levels.length - 1];
    for (const k of levels) {
      if (k < l) lo = k;
      if (k > l) { hi = k; break; }
    }
    const a = table.get(lo)!;
    const b = table.get(hi)!;
    return Math.round(a * Math.pow(b / a, (l - lo) / (hi - lo)));
  };
}

/** 同級怪 TTK 對等級的分段線性內插（節點取 STAGES 的等級） */
function ttkAtLevel(level: number): number {
  const pts = STAGES.map(s => [s.level, TTK_SAME_LEVEL[s.id]] as const);
  if (level <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (level <= pts[i][0]) {
      const [l0, t0] = pts[i - 1];
      const [l1, t1] = pts[i];
      return t0 + ((t1 - t0) * (level - l0)) / (l1 - l0);
    }
  }
  return pts[pts.length - 1][1];
}

function mapForLevel(level: number): string {
  return (LEVEL_PATH.find(p => level <= p.maxLevel) ?? LEVEL_PATH[LEVEL_PATH.length - 1]).map;
}

function pad(s: string, n: number): string {
  let w = 0;
  for (const ch of s) w += /[一-鿿＀-￯（）]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

function hhmm(ms: number): string {
  const totalMin = ms / 60000;
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin - h * 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------- 模擬核心

interface SimStats {
  kills: number;
  elapsedMs: number;
  /** 生成後因超出脫離距離立刻被移除的隻數 */
  wastedSpawns: number;
  spawned: number;
  /** 玩家「沒有怪可打」的空轉時間 */
  idleMs: number;
  /** 各 Pressure 值的停留時間（ms） */
  pressureTimeMs: Map<number, number>;
  /** 抵達各 Pressure 門檻的時間（ms） */
  pressureReachedAt: Map<number, number>;
  /** 每分鐘擊殺數的時間序列（每 10 分鐘一格） */
  kpmSeries: number[];
  /** 每次擊殺發生的時間戳（ms），用來反查「第 N 隻在第幾分鐘」 */
  killTimesMs: number[];
  // --- 以下只在 input.survival 存在時有值 ---
  deaths: number;
  /** 第一次死亡的時間戳；未死為 null */
  firstDeathMs: number | null;
  damageTaken: number;
  healed: number;
  /** `gameLoop` 的 HP 門檻暫停累計時間（暫停期間不生怪） */
  pausedMs: number;
  /** 每 tick 在攻擊距離內的怪物數量總和，用來算平均圍毆人數 */
  attackerTicks: number;
  ticks: number;
}

/** E 段的生存模型輸入（`21-combat-formula.md` § 21.5／`29-regen.md`） */
interface SurvivalSpec {
  char: Character;
  gear: (EquipmentInstance | null)[];
  monster: MonsterInstance;
  maxHp: number;
  /** `gameStore` 預設值：30 / 60 */
  pausePct: number;
  resumePct: number;
}

interface SimInput {
  mapId: string;
  /** 常數 TTK，或依當前等級變動 */
  ttkSec: number | (() => number);
  seed: number;
  /** 終止條件：時間到 */
  maxMs?: number;
  /** 終止條件：累積擊殺數到 */
  maxKills?: number;
  /** 每次擊殺的回呼；回傳 'switch-map' 表示切圖（areaKills 歸零） */
  onKill?: (elapsedMs: number) => 'continue' | 'switch-map' | 'stop';
  /** 切圖時取得新地圖 id */
  nextMap?: () => string;
  startAreaKills?: number;
  /** 鎖定 Pressure（受控對照用），不隨 areaKills 變動 */
  pressureOverride?: number;
  /** 帶入時啟用生存模型（E 段）；不帶時完全不影響 A/B/C 的行為 */
  survival?: SurvivalSpec;
}

function simulate(input: SimInput): SimStats {
  const store = useMapMonsterStore.getState();
  const nativeRandom = Math.random;
  Math.random = mulberry32(input.seed);

  const stats: SimStats = {
    kills: 0,
    elapsedMs: 0,
    wastedSpawns: 0,
    spawned: 0,
    idleMs: 0,
    pressureTimeMs: new Map(),
    pressureReachedAt: new Map(),
    kpmSeries: [],
    killTimesMs: [],
    deaths: 0,
    firstDeathMs: null,
    damageTaken: 0,
    healed: 0,
    pausedMs: 0,
    attackerTicks: 0,
    ticks: 0,
  };

  try {
    let mapId = input.mapId;
    let map = loadMap(mapId);
    let player: Position = { ...map.spawnPoint };
    let areaKills = input.startAreaKills ?? 0;
    let areaEnteredAt = 0;
    let t = 0;
    let engagedId: string | null = null;
    let engageEndsAt = 0;
    let repickAt = 0;
    let bucketStart = 0;
    let bucketKills = 0;
    const BUCKET_MS = 10 * 60 * 1000;

    // --- 生存模型狀態 ---
    const sv = input.survival;
    let hp = sv?.maxHp ?? 0;
    let paused = false;
    let nextRegenAt = HP_REGEN_INTERVAL_MS;
    /** 每隻怪的下次出手時間；`PixiGame` 建實例時 attackInterval 預設 1200ms */
    const MONSTER_ATTACK_INTERVAL_MS = 1200;
    const nextAttackAt = new Map<string, number>();

    store.clearAll();
    store.setPaused(false);
    store.setHasBossInPool(false);

    const resetArea = (next: string) => {
      mapId = next;
      map = loadMap(mapId);
      player = { ...map.spawnPoint };
      areaKills = 0;
      areaEnteredAt = t;
      engagedId = null;
      useMapMonsterStore.getState().clearAll();
    };

    for (;;) {
      if (input.maxMs != null && t >= input.maxMs) break;
      if (input.maxKills != null && stats.kills >= input.maxKills) break;

      const { pressure, maxMonsters } = input.pressureOverride != null
        ? calculatePressure(480 + input.pressureOverride * 160)
        : calculatePressure(areaKills);
      stats.pressureTimeMs.set(pressure, (stats.pressureTimeMs.get(pressure) ?? 0) + TICK_MS);
      if (!stats.pressureReachedAt.has(pressure)) stats.pressureReachedAt.set(pressure, t);

      const s = useMapMonsterStore.getState();
      s.setMaxMonsters(maxMonsters);
      const before = useMapMonsterStore.getState().monsters.length;
      // `gameLoop.ts`：HP 門檻暫停期間停止生成（怪物照樣移動、照樣打人）
      if (!paused) s.spawnTick(TICK_MS, map, player, pressure, (t - areaEnteredAt) / 60000);
      const afterSpawn = useMapMonsterStore.getState().monsters;
      stats.spawned += Math.max(0, afterSpawn.length - before);

      // --- 怪物移動（直線逼近）＋ 脫離距離移除 ---
      const kept: typeof afterSpawn = [];
      for (const m of afterSpawn) {
        const d = dist(m.position, player);
        if (d > DESPAWN_DISTANCE) {
          // 剛生成就超出脫離距離 = 這次生成完全浪費
          if (m.path.length === 0 && m.pathRecalcTimer === 0 && d > DESPAWN_DISTANCE) stats.wastedSpawns++;
          continue;
        }
        if (m.id === engagedId || d <= STOP_DISTANCE) {
          kept.push(m);
          continue;
        }
        const step = Math.min((MONSTER_SPEED * TICK_MS) / 1000, d - STOP_DISTANCE);
        const nx = m.position.x + ((player.x - m.position.x) / d) * step;
        const ny = m.position.y + ((player.y - m.position.y) / d) * step;
        kept.push({ ...m, position: { x: nx, y: ny }, pathRecalcTimer: m.pathRecalcTimer + TICK_MS });
      }
      if (kept.length !== afterSpawn.length || kept.some((m, i) => m !== afterSpawn[i])) {
        useMapMonsterStore.setState({ monsters: kept });
      }

      // --- 玩家：戰鬥 / 逼近 / 空轉 ---
      if (engagedId != null) {
        if (t >= engageEndsAt) {
          const rest = useMapMonsterStore.getState().monsters.filter(m => m.id !== engagedId);
          useMapMonsterStore.setState({ monsters: rest });
          engagedId = null;
          areaKills++;
          stats.kills++;
          stats.killTimesMs.push(t);
          bucketKills++;
          repickAt = t + REPICK_MIN_MS + Math.random() * REPICK_RANGE_MS;
          const verdict = input.onKill?.(t) ?? 'continue';
          if (verdict === 'stop') { t += TICK_MS; break; }
          if (verdict === 'switch-map') resetArea(input.nextMap?.() ?? mapId);
        }
      } else {
        const monsters = useMapMonsterStore.getState().monsters;
        if (monsters.length === 0) {
          stats.idleMs += TICK_MS;
        } else {
          let nearest = monsters[0];
          let nd = dist(nearest.position, player);
          for (const m of monsters) {
            const d = dist(m.position, player);
            if (d < nd) { nd = d; nearest = m; }
          }
          if (nd <= ENGAGE_DISTANCE) {
            engagedId = nearest.id;
            const ttk = typeof input.ttkSec === 'number' ? input.ttkSec : input.ttkSec();
            engageEndsAt = t + ttk * 1000;
          } else {
            stats.idleMs += TICK_MS;
            // 暫停期間 `gameLoop` 會關掉 autoMove，玩家不再主動貼上去
            if (t >= repickAt && !paused) {
              const step = Math.min((PLAYER_SPEED * TICK_MS) / 1000, nd - STOP_DISTANCE);
              player = {
                x: player.x + ((nearest.position.x - player.x) / nd) * step,
                y: player.y + ((nearest.position.y - player.y) / nd) * step,
              };
            }
          }
        }
      }

      // --- 生存模型（`21-combat-formula.md` § 21.5、§ 21.6、`29-regen.md`）---
      if (sv) {
        stats.ticks++;
        const onField = useMapMonsterStore.getState().monsters;
        let attackers = 0;
        for (const m of onField) {
          // 近戰射程 1.5 格：`PixiGame.createMonsterFromTemplate` 對無 attackType 的模板的預設值
          if (dist(m.position, player) > STOP_DISTANCE + 1e-6) continue;
          attackers++;
          const next = nextAttackAt.get(m.id);
          if (next == null) {
            // 進入射程後才開始計時，並打散各怪的節奏避免同幀齊射
            nextAttackAt.set(m.id, t + Math.random() * MONSTER_ATTACK_INTERVAL_MS);
            continue;
          }
          if (t < next) continue;
          const res = calculateMonsterAttack(sv.monster, sv.char, sv.gear, [], 0);
          if (res.hit) {
            hp -= res.damage;
            stats.damageTaken += res.damage;
          }
          nextAttackAt.set(m.id, t + MONSTER_ATTACK_INTERVAL_MS);
        }
        stats.attackerTicks += attackers;
        for (const id of [...nextAttackAt.keys()]) {
          if (!onField.some(m => m.id === id)) nextAttackAt.delete(id);
        }

        if (t >= nextRegenAt) {
          const regen = getHpRegen(sv.char, engagedId != null, sv.gear, []);
          const before2 = hp;
          hp = Math.min(sv.maxHp, hp + regen);
          stats.healed += hp - before2;
          nextRegenAt += HP_REGEN_INTERVAL_MS;
        }

        if (hp <= 0) {
          stats.deaths++;
          if (stats.firstDeathMs == null) stats.firstDeathMs = t;
          // 死亡 = 回城復活：離開地圖使 areaKills 歸零（§ 26.3），場上怪物清空
          hp = sv.maxHp;
          paused = false;
          engagedId = null;
          nextAttackAt.clear();
          areaKills = input.pressureOverride != null ? areaKills : 0;
          useMapMonsterStore.getState().clearAll();
        } else {
          // `gameLoop`：HP ≤ 門檻且身邊無怪 → 暫停；回到 resume 門檻才恢復
          const hpPct = (hp / sv.maxHp) * 100;
          if (!paused && hpPct <= sv.pausePct && attackers === 0) paused = true;
          else if (paused && hpPct >= sv.resumePct) paused = false;
          if (paused) stats.pausedMs += TICK_MS;
        }
      }

      t += TICK_MS;
      if (t - bucketStart >= BUCKET_MS) {
        stats.kpmSeries.push(bucketKills / (BUCKET_MS / 60000));
        bucketStart = t;
        bucketKills = 0;
      }
    }

    stats.elapsedMs = t;
  } finally {
    Math.random = nativeRandom;
    useMapMonsterStore.getState().clearAll();
  }

  return stats;
}

// ---------------------------------------------------------------- A. DPS → 擊殺速率

function sectionA(): void {
  console.log('='.repeat(112));
  console.log('## A. DPS 是否兌現成擊殺速率');
  console.log(`   固定對照怪 Lv16~20（HP90/防7），六個裝備階梯各掛機 ${A_MINUTES} 分鐘，areaKills 從 0 起算`);
  console.log(`   舞台：${A_MAP}（${loadMap(A_MAP).width}×${loadMap(A_MAP).height}）　脫離距離 ${DESPAWN_DISTANCE} 格`);
  console.log('='.repeat(112));

  const run = (mapId: string) => {
    const rows: { stage: Stage; ttk: number; kpm: number; stats: SimStats }[] = [];
    for (const stage of STAGES) {
      const ttk = TTK_FIXED_TARGET[stage.id];
      const stats = simulate({
        mapId,
        ttkSec: ttk,
        seed: 7000 + stage.level,
        maxMs: A_MINUTES * 60 * 1000,
      });
      rows.push({ stage, ttk, kpm: stats.kills / (stats.elapsedMs / 60000), stats });
    }
    return rows;
  };

  const report = (rows: ReturnType<typeof run>, title: string) => {
    console.log(`\n### ${title}`);
    console.log(`   ${pad('階梯', 12)}${pad('TTK', 8)}${pad('理論DPS上限', 14)}${pad('實測擊殺/分', 14)}`
      + `${pad('vs最慢', 10)}${pad('空轉佔比', 10)}${pad('生成浪費', 12)}${pad('末段Pressure', 14)}`);
    const slowest = rows[0].kpm;
    for (const r of rows) {
      const theoretical = 60 / r.ttk;
      const idlePct = (r.stats.idleMs / r.stats.elapsedMs) * 100;
      const wastePct = r.stats.spawned > 0 ? (r.stats.wastedSpawns / r.stats.spawned) * 100 : 0;
      const finalPressure = calculatePressure(r.stats.kills).pressure;
      console.log(
        `   ${pad(r.stage.label, 12)}${pad(`${r.ttk.toFixed(2)}s`, 8)}${pad(theoretical.toFixed(1), 14)}`
        + `${pad(r.kpm.toFixed(2), 14)}${pad(`×${(r.kpm / slowest).toFixed(2)}`, 10)}`
        + `${pad(`${idlePct.toFixed(1)}%`, 10)}${pad(`${wastePct.toFixed(1)}%`, 12)}${pad(String(finalPressure), 14)}`,
      );
    }
    let monotone = true;
    for (let i = 1; i < rows.length; i++) if (rows[i].kpm <= rows[i - 1].kpm) monotone = false;
    console.log(`   驗收（六階梯擊殺/分單調上升）：${monotone ? '通過' : '不通過'}`
      + `　最快/最慢 = ×${(rows[rows.length - 1].kpm / rows[0].kpm).toFixed(2)}`);
    return rows;
  };

  const small = report(run(A_MAP), `${A_MAP}（${loadMap(A_MAP).width}×${loadMap(A_MAP).height}）`);
  const large = report(run(A_MAP_LARGE), `${A_MAP_LARGE}（${loadMap(A_MAP_LARGE).width}×${loadMap(A_MAP_LARGE).height}）對照`);

  console.log('\n   前 10 分鐘 vs 穩態（擊殺/分，10 分鐘一格）：');
  for (const r of small) {
    const head = r.stats.kpmSeries.slice(0, 1).map(v => v.toFixed(1)).join('');
    const tail = r.stats.kpmSeries.slice(-3);
    const tailAvg = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
    console.log(`   ${pad(r.stage.label, 12)}首格 ${pad(head, 8)}末三格平均 ${tailAvg.toFixed(1)}`);
  }
  void large;
}

// ---------------------------------------------------------------- B. Lv1→60

interface LevelRow {
  level: number;
  kills: number;
  ms: number;
  map: string;
  ttk: number;
  expPerKill: number;
}

function sectionB(curve: 'new' | 'old'): LevelRow[] {
  const expOf = buildExpTable(curve);
  const curveLabel = curve === 'new' ? '新表（等比化）' : `舊表（${OLD_REF} 版 monsterSeeds）`;
  console.log(`\n${'='.repeat(112)}`);
  console.log(`## B. Lv1→60 的實際時數與分佈　—　怪物經驗表：${curveLabel}`);
  console.log('   接上 A 的動態擊殺速率；升級跨區時 areaKills 歸零（切圖 = Pressure 重置）');
  console.log(`   取樣：Lv1/10/20/30/40/50/60 每隻基礎經驗 = `
    + [1, 10, 20, 30, 40, 50, 60].map(l => expOf(l)).join(' / '));
  console.log('='.repeat(112));

  const rows: LevelRow[] = [];
  let level = 1;
  let exp = 0;
  let currentMap = mapForLevel(1);
  let levelStartMs = 0;
  let killsThisLevel = 0;
  let mapSwitches = 0;

  const stats = simulate({
    mapId: currentMap,
    ttkSec: () => ttkAtLevel(level),
    seed: 424242,
    maxMs: 60 * 3600 * 1000,
    nextMap: () => currentMap,
    onKill: (elapsedMs) => {
      exp += expOf(level) * EXP_SETTLE_MULTIPLIER;
      killsThisLevel++;
      let leveled = false;
      while (exp >= getExpToNextLevel(level) && level < 60) {
        exp -= getExpToNextLevel(level);
        rows.push({
          level,
          kills: killsThisLevel,
          ms: elapsedMs - levelStartMs,
          map: currentMap,
          ttk: ttkAtLevel(level),
          expPerKill: expOf(level) * EXP_SETTLE_MULTIPLIER,
        });
        levelStartMs = elapsedMs;
        killsThisLevel = 0;
        level++;
        leveled = true;
      }
      if (level >= 60) return 'stop';
      if (leveled) {
        const next = mapForLevel(level);
        if (next !== currentMap) {
          currentMap = next;
          mapSwitches++;
          return 'switch-map';
        }
      }
      return 'continue';
    },
  });

  const totalMs = rows.reduce((a, r) => a + r.ms, 0);
  const totalKills = rows.reduce((a, r) => a + r.kills, 0);
  void mapSwitches;

  const seg = (lo: number, hi: number) => {
    const sub = rows.filter(r => r.level >= lo && r.level < hi);
    return {
      kills: sub.reduce((a, r) => a + r.kills, 0),
      ms: sub.reduce((a, r) => a + r.ms, 0),
    };
  };
  const segments: [string, number, number, number][] = [
    ['Lv1→20', 1, 20, 12],
    ['Lv20→40', 20, 40, 28],
    ['Lv40→50', 40, 50, 24],
    ['Lv50→60', 50, 60, 36],
  ];

  console.log(`\n   總擊殺數 ${totalKills}　總時數 ${hhmm(totalMs)}（${(totalMs / 3600000).toFixed(2)} 小時）`);
  console.log(`   設計預期：約 3,790 隻 / 純理論 5.3 小時（固定 12 隻/分）`);
  console.log(`\n   ${pad('分段', 12)}${pad('擊殺數', 10)}${pad('擊殺佔比', 12)}${pad('時數', 10)}`
    + `${pad('時數佔比', 12)}${pad('設計預期', 12)}${pad('平均擊殺/分', 14)}`);
  for (const [label, lo, hi, expected] of segments) {
    const s = seg(lo, hi);
    console.log(
      `   ${pad(label, 12)}${pad(String(s.kills), 10)}${pad(`${((s.kills / totalKills) * 100).toFixed(1)}%`, 12)}`
      + `${pad(hhmm(s.ms), 10)}${pad(`${((s.ms / totalMs) * 100).toFixed(1)}%`, 12)}${pad(`${expected}%`, 12)}`
      + `${pad((s.kills / (s.ms / 60000)).toFixed(2), 14)}`,
    );
  }

  const p1to20 = (seg(1, 20).ms / totalMs) * 100;
  const p50to60 = (seg(50, 60).ms / totalMs) * 100;
  console.log(`\n   驗收 1：Lv1→20 不低於總時數 10% → 實測 ${p1to20.toFixed(1)}%　${p1to20 >= 10 ? '通過' : `不通過（差 ${(10 - p1to20).toFixed(1)} 個百分點）`}`);
  console.log(`   驗收 2：Lv50→60 不超過總時數 45% → 實測 ${p50to60.toFixed(1)}%　${p50to60 <= 45 ? '通過' : `不通過（超出 ${(p50to60 - 45).toFixed(1)} 個百分點）`}`);

  console.log('\n   逐 10 級明細：');
  console.log(`   ${pad('等級帶', 12)}${pad('擊殺數', 10)}${pad('時數', 10)}${pad('擊殺/分', 12)}${pad('TTK', 10)}${pad('每隻經驗', 12)}`);
  for (let lo = 1; lo < 60; lo += 10) {
    const hi = Math.min(60, lo + 10);
    const sub = rows.filter(r => r.level >= lo && r.level < hi);
    const k = sub.reduce((a, r) => a + r.kills, 0);
    const ms = sub.reduce((a, r) => a + r.ms, 0);
    console.log(`   ${pad(`Lv${lo}~${hi - 1}`, 12)}${pad(String(k), 10)}${pad(hhmm(ms), 10)}`
      + `${pad((k / (ms / 60000)).toFixed(2), 12)}${pad(`${ttkAtLevel(lo).toFixed(1)}s`, 10)}`
      + `${pad(String(expOf(lo) * EXP_SETTLE_MULTIPLIER), 12)}`);
  }
  console.log('\n   Lv1→60 全程的 Pressure 停留分布（升級跨區歸零）：');
  const totalPressureMs = [...stats.pressureTimeMs.values()].reduce((a, b) => a + b, 0);
  const buckets: [string, (p: number) => boolean][] = [
    ['P0', p => p === 0],
    ['P1~3', p => p >= 1 && p <= 3],
    ['P4~6', p => p >= 4 && p <= 6],
    ['P7+', p => p >= 7],
  ];
  for (const [label, test] of buckets) {
    let ms = 0;
    for (const [p, v] of stats.pressureTimeMs) if (test(p)) ms += v;
    console.log(`   ${pad(label, 10)}${pad(hhmm(ms), 10)}${pad(`${((ms / totalPressureMs) * 100).toFixed(1)}%`, 10)}`);
  }
  console.log(`   模擬中出現過的最高 Pressure：P${Math.max(...stats.pressureTimeMs.keys())}`);
  return rows;
}

// ---------------------------------------------------------------- C. Pressure 與掉落

function sectionC(): void {
  console.log(`\n${'='.repeat(112)}`);
  console.log('## C. Pressure 推進與掉落膨脹');
  console.log('   每階梯在該階梯的農怪地圖上連續掛機（不切圖），量抵達 Pressure 1/4/7 的時間');
  console.log('='.repeat(112));

  console.log(`\n   ${pad('階梯', 12)}${pad('地圖', 22)}${pad('TTK', 8)}${pad('擊殺/分', 10)}`
    + `${pad('→P1(640殺)', 14)}${pad('→P4(1120殺)', 14)}${pad('→P7(1600殺)', 14)}`);

  for (const stage of STAGES) {
    const ttk = TTK_SAME_LEVEL[stage.id];
    const stats = simulate({
      mapId: stage.map,
      ttkSec: ttk,
      seed: 9100 + stage.level,
      maxKills: 1600,
      maxMs: 12 * 3600 * 1000,
    });
    const kpm = stats.kills / (stats.elapsedMs / 60000);
    const at = (k: number) => (stats.killTimesMs.length >= k ? hhmm(stats.killTimesMs[k - 1]) : '未達');
    console.log(
      `   ${pad(stage.label, 12)}${pad(stage.map, 22)}${pad(`${ttk.toFixed(1)}s`, 8)}${pad(kpm.toFixed(2), 10)}`
      + `${pad(at(640), 14)}${pad(at(1120), 14)}${pad(at(1600), 14)}`,
    );
  }

  // 一次連線時長內的 Pressure 分布
  console.log('\n   一次連線（不切圖）內的 Pressure 停留分布：');
  console.log(`   ${pad('階梯', 12)}${pad('1 小時後', 12)}${pad('2 小時後', 12)}${pad('4 小時後', 12)}${pad('8 小時後', 12)}`);
  for (const stage of STAGES) {
    const ttk = TTK_SAME_LEVEL[stage.id];
    const stats = simulate({
      mapId: stage.map,
      ttkSec: ttk,
      seed: 9300 + stage.level,
      maxMs: 8 * 3600 * 1000,
    });
    const killsBy = (h: number) => {
      const limit = h * 3600 * 1000;
      let n = 0;
      for (const ts of stats.killTimesMs) { if (ts > limit) break; n++; }
      return n;
    };
    const pAt = (h: number) => calculatePressure(killsBy(h)).pressure;
    console.log(`   ${pad(stage.label, 12)}${pad(`P${pAt(1)}（${killsBy(1)}殺）`, 12)}${pad(`P${pAt(2)}（${killsBy(2)}殺）`, 12)}`
      + `${pad(`P${pAt(4)}（${killsBy(4)}殺）`, 12)}${pad(`P${pAt(8)}（${killsBy(8)}殺）`, 12)}`);
  }

  // 產出膨脹 = 擊殺速率倍率 × 掉落倍率（受控對照：鎖 Pressure 0 vs 鎖 Pressure 7）
  console.log('\n   鎖定 Pressure 的受控對照（各 60 分鐘）：金幣／素材產出膨脹 = 擊殺速率倍率 × 掉落倍率');
  console.log(`   ${pad('階梯', 12)}${pad('P0 擊殺/分', 12)}${pad('P7 擊殺/分', 12)}${pad('速率倍率', 12)}`
    + `${pad('掉落倍率', 12)}${pad('總產出膨脹', 12)}`);
  for (const stage of STAGES) {
    const ttk = TTK_SAME_LEVEL[stage.id];
    const run = (p: number) => {
      const s = simulate({
        mapId: stage.map, ttkSec: ttk, seed: 9500 + stage.level + p,
        maxMs: 60 * 60 * 1000, pressureOverride: p,
      });
      return s.kills / (s.elapsedMs / 60000);
    };
    const k0 = run(0);
    const k7 = run(7);
    const dropMult = getPressureDropMultiplier(7);
    console.log(`   ${pad(stage.label, 12)}${pad(k0.toFixed(2), 12)}${pad(k7.toFixed(2), 12)}`
      + `${pad(`×${(k7 / k0).toFixed(2)}`, 12)}${pad(`×${dropMult.toFixed(1)}`, 12)}`
      + `${pad(`×${((k7 / k0) * dropMult).toFixed(2)}`, 12)}`);
  }

  // § 27.7 三條明文約束在 Pressure 7 的實際值
  const mult = getPressureDropMultiplier(PRESSURE_DROP_CAP);
  console.log(`\n   Pressure ${PRESSURE_DROP_CAP} 掉落倍率 ×${mult.toFixed(1)}　對 27-drop-table.md § 27.7 三條約束的實際值：`);

  const rate = (dropValue: number) => Math.min(dropValue * mult, 1000) / 10;
  console.log(`\n   [1] 素材掉落率上限 10~12%（§ 27.7 第 12 條）`);
  const materialAreas = ['trial-highlands-top', 'demon-altar', 'misty-cave-3f', 'hundred-pillar-61-70f'];
  console.log(`       ${pad('區域', 24)}${pad('素材', 20)}${pad('基礎', 10)}${pad(`×${mult.toFixed(1)}`, 10)}${pad('突破', 10)}`);
  for (const area of materialAreas) {
    const entries = DROP_TABLE_SEEDS.filter(e => {
      if (e.area !== area || e.itemType !== 'item' || e.itemTemplateId == null) return false;
      return getItemById(e.itemTemplateId)?.category === 'material';
    }).sort((a, b) => b.dropValue - a.dropValue).slice(0, 2);
    for (const e of entries) {
      const base = e.dropValue / 10;
      const boosted = rate(e.dropValue);
      console.log(`       ${pad(area, 24)}${pad(getItemById(e.itemTemplateId!)?.name ?? '?', 20)}`
        + `${pad(`${base.toFixed(1)}%`, 10)}${pad(`${boosted.toFixed(1)}%`, 10)}`
        + `${pad(boosted > 12 ? `+${(boosted - 12).toFixed(1)}pp` : '—', 10)}`);
    }
  }

  console.log(`\n   [2] 金幣單次掉落上限 500（§ 27.7 第 8 條、§ 27.1）`);
  console.log(`       ${pad('區域', 24)}${pad('基礎區間', 16)}${pad(`×${mult.toFixed(1)}`, 16)}${pad('突破', 12)}`);
  for (const area of ['trial-highlands-top', 'demon-altar', 'misty-cave-3f', 'hundred-pillar-61-70f']) {
    const g = DROP_TABLE_SEEDS.find(e => e.area === area && e.itemType === 'gold');
    if (!g) continue;
    const lo = Math.floor((g.minAmount ?? 1) * mult);
    const hi = Math.floor((g.maxAmount ?? 1) * mult);
    console.log(`       ${pad(area, 24)}${pad(`${g.minAmount}~${g.maxAmount}`, 16)}${pad(`${lo}~${hi}`, 16)}`
      + `${pad(hi > 500 ? `+${hi - 500}（×${(hi / 500).toFixed(2)}）` : '—', 12)}`);
  }

  console.log(`\n   [3] 百柱塔通行卷軸上限 10%（§ 27.7 第 10 條、§ 27.3 的 min(100,…) 夾限）`);
  console.log(`       ${pad('區域', 24)}${pad('卷軸', 22)}${pad('基礎', 10)}${pad('等級縮放後', 12)}${pad(`×${mult.toFixed(1)}`, 10)}${pad('突破', 10)}`);
  for (const e of DROP_TABLE_SEEDS) {
    if (!e.area.startsWith('hundred-pillar') || e.itemType !== 'item' || e.itemTemplateId == null) continue;
    const item = getItemById(e.itemTemplateId);
    if (item?.category !== 'dungeon') continue;
    const scaled = Math.min(100, Math.floor(e.dropValue * 2)); // levelProgress = 1（該區最高等級怪）
    const boosted = Math.min(scaled * mult, 1000) / 10;
    console.log(`       ${pad(e.area, 24)}${pad(item.name, 22)}${pad(`${(e.dropValue / 10).toFixed(1)}%`, 10)}`
      + `${pad(`${(scaled / 10).toFixed(1)}%`, 12)}${pad(`${boosted.toFixed(1)}%`, 10)}`
      + `${pad(boosted > 10 ? `+${(boosted - 10).toFixed(1)}pp` : '—', 10)}`);
  }
}

// ---------------------------------------------------------------- D. 回鍋經驗加倍

function sectionD(): void {
  console.log(`\n${'='.repeat(112)}`);
  console.log('## D. 回鍋經驗加倍的實際影響');
  console.log(`   存量上限 ${RESTED_EXP_CAP_MS / 3600000} 小時，存量 > 0 時經驗 ×${RESTED_EXP_MULTIPLIER}`);
  console.log('='.repeat(112));

  console.log('\n   每日「離線 8 小時 → 上線遊玩 X 小時」，連續 14 天的存量收斂：');
  console.log(`   ${pad('每日遊玩', 12)}${pad('第1天覆蓋', 12)}${pad('第7天覆蓋', 12)}${pad('第14天覆蓋', 12)}`
    + `${pad('第14天存量', 14)}${pad('收斂狀態', 16)}`);

  for (const playHours of [1, 2, 3, 4, 6, 8, 10, 12, 16]) {
    const offlineHours = Math.max(0, 24 - playHours);
    let stockH = 0;
    const coverage: number[] = [];
    for (let day = 1; day <= 14; day++) {
      stockH = Math.min(24, stockH + Math.min(offlineHours, 24));
      const covered = Math.min(stockH, playHours);
      coverage.push(covered / playHours);
      stockH -= covered;
    }
    const state = stockH >= 23.9 ? '存量長期滿倉（浪費）'
      : stockH > 0 ? '存量長期為正（等同常駐×2）'
      : '每日用完';
    console.log(
      `   ${pad(`${playHours}h`, 12)}${pad(`${(coverage[0] * 100).toFixed(0)}%`, 12)}`
      + `${pad(`${(coverage[6] * 100).toFixed(0)}%`, 12)}${pad(`${(coverage[13] * 100).toFixed(0)}%`, 12)}`
      + `${pad(`${stockH.toFixed(1)}h`, 14)}${pad(state, 16)}`,
    );
  }

  console.log('\n   註：題目的「離線 8 小時」＝每日只離線 8 小時（遊玩 16 小時）為上表最後一列；');
  console.log('       一般玩家（每日遊玩 ≤ 12 小時）離線累積 > 遊玩消耗，存量必然長期為正。');

  console.log('\n   單次離線時長對存量的轉換（1:1、上限 24h、超出捨棄）：');
  console.log(`   ${pad('離線時長', 12)}${pad('入帳存量', 12)}${pad('捨棄', 12)}${pad('可覆蓋遊玩', 14)}`);
  for (const h of [1, 4, 8, 12, 24, 36, 72, 168]) {
    const gained = Math.min(24, h);
    console.log(`   ${pad(`${h}h`, 12)}${pad(`${gained}h`, 12)}${pad(`${Math.max(0, h - 24)}h`, 12)}${pad(`${gained}h`, 14)}`);
  }
}

// ---------------------------------------------------------------- E. 前期 Pressure 生存與換階金幣
//
// 角色與裝備的建法沿用 `calibrateTTK.mts`（同一組 CREATION_ATTRIBUTES、同一套挑裝規則、
// 防具詞綴取 T3 上緣、強化 +0），因此下面的 TTK 表與這裡的防禦/HP 是同一個 build。

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const CLASS_ZH: Record<ClassName, string> = {
  knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊',
};

/** `44-dps-prediction.md` § 44.4：建角 80 點 */
const CREATION_ATTRIBUTES: Record<ClassName, Attributes> = {
  knight: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
  elf: { STR: 18, AGI: 16, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
  elementalist: { STR: 8, AGI: 8, VIT: 18, SPI: 16, INT: 18, CHA: 12 },
  priest: { STR: 6, AGI: 8, VIT: 18, SPI: 15, INT: 18, CHA: 15 },
  thief: { STR: 18, AGI: 18, VIT: 12, SPI: 10, INT: 12, CHA: 10 },
};

const ZERO_ATTRS: Attributes = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

/** 用真實的 `tryLevelUp()` 從 Lv.1 練到目標等級，取得實際 maxHp（Lv.51 前無自由點） */
function levelUpTo(base: Attributes, target: number): { maxHp: number; maxMp: number } {
  let char = {
    name: 'sim', className: 'knight', level: 1, exp: 0, expToNext: getExpToNextLevel(1),
    hp: INITIAL_HP, maxHp: INITIAL_HP, mp: INITIAL_MP, maxMp: INITIAL_MP,
    baseAttributes: base, bonusAttributes: { ...ZERO_ATTRS },
    gold: 0, currentArea: '', currentZone: '', currentRegion: '', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as unknown as Character;
  while (char.level < target) char = tryLevelUp({ ...char, exp: char.expToNext });
  return { maxHp: char.maxHp, maxMp: char.maxMp };
}

function buildCharacter(className: ClassName, level: number): Character {
  const base = CREATION_ATTRIBUTES[className];
  const nativeRandom = Math.random;
  Math.random = mulberry32(1234);
  const { maxHp, maxMp } = levelUpTo(base, level);
  Math.random = nativeRandom;
  return {
    name: `Lv${level}-${className}`, className, level, exp: 0, expToNext: 1,
    hp: maxHp, maxHp, mp: maxMp, maxMp,
    baseAttributes: base, bonusAttributes: { ...ZERO_ATTRS },
    gold: 0, currentArea: '', currentZone: '', currentRegion: '', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as unknown as Character;
}

/** `07-affix.md` § 7.3 通用表的 Tier 上緣；商店裝詞綴上限 T3 */
const AFFIX_TIER_MAX: Record<number, number> = { 1: 5, 2: 8, 3: 11, 4: 13, 5: 15, 6: 18, 7: 20 };
const ARMOR_AFFIXES = ['defense', 'max_hp', 'max_mp'] as const;

function makeItem(tpl: EquipmentTemplate, affixTier: number): EquipmentInstance {
  return {
    ...tpl,
    templateId: tpl.id!,
    quality: 0,
    enhancement: 0,
    affixes: ARMOR_AFFIXES.map(type => ({ type, tier: affixTier, value: AFFIX_TIER_MAX[affixTier] })),
    ownerId: 1,
    equipped: true,
  } as unknown as EquipmentInstance;
}

const canUse = (t: EquipmentTemplate, c: ClassName) => !t.requiredClass || t.requiredClass.includes(c);
const ARMOR_SLOTS: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace', 'ring1', 'ring2'];

/** 該 tier 的商店整套（主手 + 副手 + 八件防具），挑法與 `calibrateTTK.mts` 相同 */
function buildShopLoadout(className: ClassName, tier: number): { gear: (EquipmentInstance | null)[]; price: number } {
  const gear: (EquipmentInstance | null)[] = [];
  let price = 0;
  const pick = (slot: EquipSlot, key: (t: EquipmentTemplate) => number) => {
    const cands = EQUIPMENT_SEEDS.filter(t => t.slot === slot && t.tier === tier && canUse(t, className));
    if (cands.length === 0) return null;
    return cands.sort((a, b) => key(b) - key(a))[0];
  };
  const weapon = pick('rightHand', t => ((t.smallMonsterDamage ?? 0) + (t.largeMonsterDamage ?? 0)) / 2 + (t.extraAttack ?? 0));
  if (weapon) { gear.push(makeItem(weapon, 3)); price += weapon.buyPrice ?? 0; }
  if (weapon && !weapon.isTwoHanded) {
    const off = pick('leftHand', t => (t.defense ?? 0));
    if (off) { gear.push(makeItem(off, 3)); price += off.buyPrice ?? 0; }
  }
  for (const slot of ARMOR_SLOTS) {
    const tpl = pick(slot, t => (t.defense ?? 0) + (t.bonusHp ?? 0) / 10);
    if (tpl) { gear.push(makeItem(tpl, 3)); price += tpl.buyPrice ?? 0; }
  }
  return { gear, price };
}

/** 有效最大 HP，公式同 `gameStore.getEffectiveMaxHp` */
function effectiveMaxHp(char: Character, gear: (EquipmentInstance | null)[]): number {
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = getAffixBonusesFromGear(items);
  const flatHp = items.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0);
  return Math.floor((char.maxHp + flatHp) * (1 + bonuses.max_hp / 100));
}

function toInstance(t: MonsterTemplate): MonsterInstance {
  return {
    templateId: t.id!, name: t.name, level: t.level, currentHp: t.hp, maxHp: t.hp,
    attackMin: t.attackMin, attackMax: t.attackMax, defense: t.defense, exp: t.exp,
    race: t.race, size: t.size, element: t.element, isBoss: t.isBoss,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200, debuffs: t.debuffs,
  } as MonsterInstance;
}

/** 該區一般怪的中位代表（HP／攻／防各取中位數，避免被單一極端怪帶偏） */
function representativeMonster(area: string): MonsterInstance {
  const pool = MONSTER_SEEDS.filter(m => !m.isBoss && m.area === area);
  if (pool.length === 0) throw new Error(`${area}: 找不到一般怪`);
  const median = (f: (m: MonsterTemplate) => number) => {
    const s = pool.map(f).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return {
    ...toInstance(pool[Math.floor(pool.length / 2)]),
    name: `${area} 一般怪(中位)`,
    currentHp: median(m => m.hp), maxHp: median(m => m.hp), defense: median(m => m.defense),
    attackMin: median(m => m.attackMin), attackMax: median(m => m.attackMax),
  };
}

/** 前期四張圖：地圖 id / 等級帶中位 / 對應的 TTK（見下方 TTK_EARLY） */
const EARLY_MAPS: { map: string; label: string; level: number; band: string }[] = [
  { map: 'dawn-plains', label: '曙光草原', level: 3, band: '1-5' },
  { map: 'green-valley', label: '翠綠谷地', level: 8, band: '6-10' },
  { map: 'wind-woods', label: '風語林地', level: 13, band: '11-15' },
  { map: 'misty-swamp', label: '迷霧沼澤', level: 18, band: '16-20' },
];

/**
 * 前期 TTK（秒）。取得指令：
 *   npx vite-node scripts/calibrateTTK.mts --profile=base --runs=150 --stage=shop-low --fixed=<band>
 *   npx vite-node scripts/calibrateTTK.mts --profile=base --runs=150 --stage=shop-mid --fixed=<band>
 * calibrateTTK 的角色等級固定在該階梯的 level（T1=Lv8、T2=Lv18），
 * 本段的角色等級改成地圖帶中位 —— 等級較高時實際輸出更好，故此處的 TTK 偏保守。
 */
const TTK_EARLY: Record<number, Record<string, Record<ClassName, number>>> = {
  1: {
    '1-5': { knight: 0.2, elf: 0.2, elementalist: 0.5, priest: 1.1, thief: 0.05 },
    '6-10': { knight: 1.5, elf: 1.4, elementalist: 1.9, priest: 2.2, thief: 0.3 },
    '11-15': { knight: 5.3, elf: 4.0, elementalist: 8.1, priest: 6.3, thief: 2.4 },
    '16-20': { knight: 8.5, elf: 6.9, elementalist: 14.5, priest: 10.4, thief: 3.9 },
  },
  2: {
    '1-5': { knight: 0.1, elf: 0.05, elementalist: 0.05, priest: 0.3, thief: 0.05 },
    '6-10': { knight: 1.1, elf: 0.1, elementalist: 0.1, priest: 0.5, thief: 0.2 },
    '11-15': { knight: 2.2, elf: 1.9, elementalist: 1.3, priest: 1.9, thief: 1.9 },
    '16-20': { knight: 3.3, elf: 2.6, elementalist: 4.9, priest: 5.2, thief: 2.7 },
  },
};

const E_PRESSURES = [0, 1, 2, 4, 7];
const E_MINUTES = Number(argOf('e-minutes') ?? 60);

interface SurvivalRow {
  pressure: number;
  maxMonsters: number;
  avgAttackers: number;
  incomingDps: number;
  regenPerSec: number;
  maxHp: number;
  deaths: number;
  firstDeathMs: number | null;
  pausedPct: number;
}

function measureSurvival(
  className: ClassName, tier: number, entry: typeof EARLY_MAPS[number], pressure: number,
): SurvivalRow {
  const char = buildCharacter(className, entry.level);
  const { gear } = buildShopLoadout(className, tier);
  const maxHp = effectiveMaxHp(char, gear);
  const monster = representativeMonster(entry.map);
  const stats = simulate({
    mapId: entry.map,
    ttkSec: TTK_EARLY[tier][entry.band][className],
    seed: 31_000 + entry.level * 31 + pressure,
    maxMs: E_MINUTES * 60 * 1000,
    pressureOverride: pressure,
    survival: { char, gear, monster, maxHp, pausePct: 30, resumePct: 60 },
  });
  const sec = stats.elapsedMs / 1000;
  return {
    pressure,
    maxMonsters: calculatePressure(480 + pressure * 160).maxMonsters,
    avgAttackers: stats.ticks > 0 ? stats.attackerTicks / stats.ticks : 0,
    incomingDps: stats.damageTaken / sec,
    regenPerSec: stats.healed / sec,
    maxHp,
    deaths: stats.deaths,
    firstDeathMs: stats.firstDeathMs,
    pausedPct: (stats.pausedMs / stats.elapsedMs) * 100,
  };
}

function sectionE1(): Map<string, number | null> {
  console.log(`\n${'='.repeat(112)}`);
  console.log('## E1. 前期 Pressure 的生存壓力');
  console.log(`   商店低階裝（T1，強化 +0，防具詞綴 T3 上緣），單圖鎖定 Pressure 掛機 ${E_MINUTES} 分鐘`);
  console.log('   已納入 HP 門檻暫停（≤30% 且身邊無怪 → 停止生成，≥60% 恢復）與死亡歸零');
  console.log('   命中／迴避／格擋／減傷全部走 `combat.ts` 的 calculateMonsterAttack，未做任何簡化');
  console.log('='.repeat(112));

  /** 每張圖「開始撐不住」的 Pressure（第一個會死人的階段）；null = 全程不死 */
  const dangerAt = new Map<string, number | null>();

  for (const entry of EARLY_MAPS) {
    const m = representativeMonster(entry.map);
    const char = buildCharacter('knight', entry.level);
    const { gear } = buildShopLoadout('knight', 1);
    console.log(`\n### ${entry.label}（${entry.map}）　騎士 Lv.${entry.level} T1　`
      + `裝備防禦 ${getTotalDefense(gear)}　有效HP ${effectiveMaxHp(char, gear)}　`
      + `對照怪 HP${m.maxHp}/攻${m.attackMin}~${m.attackMax}　TTK ${TTK_EARLY[1][entry.band].knight}s`);
    console.log(`   ${pad('Pressure', 10)}${pad('場上上限', 10)}${pad('平均圍毆', 10)}${pad('承受DPS', 10)}`
      + `${pad('回復/秒', 10)}${pad('淨流失/秒', 12)}${pad('撐多久', 12)}${pad('每小時死亡', 12)}${pad('暫停佔比', 10)}`);
    let danger: number | null = null;
    for (const p of E_PRESSURES) {
      const r = measureSurvival('knight', 1, entry, p);
      const net = r.incomingDps - r.regenPerSec;
      const survive = r.deaths === 0
        ? '不死'
        : `${(r.firstDeathMs! / 1000).toFixed(0)}s`;
      if (danger === null && r.deaths > 0) danger = p;
      console.log(
        `   ${pad(`P${p}`, 10)}${pad(String(r.maxMonsters), 10)}${pad(r.avgAttackers.toFixed(2), 10)}`
        + `${pad(r.incomingDps.toFixed(2), 10)}${pad(r.regenPerSec.toFixed(2), 10)}`
        + `${pad(net > 0 ? `+${net.toFixed(2)}` : net.toFixed(2), 12)}${pad(survive, 12)}`
        + `${pad((r.deaths / (E_MINUTES / 60)).toFixed(1), 12)}${pad(`${r.pausedPct.toFixed(0)}%`, 10)}`,
      );
    }
    dangerAt.set(entry.map, danger);
  }

  // 職業差異：取最吃緊的一張圖
  const worst = EARLY_MAPS[EARLY_MAPS.length - 1];
  console.log(`\n### 職業差異（${worst.label}，T1，各 ${E_MINUTES} 分鐘）`);
  console.log(`   ${pad('職業', 10)}${pad('有效HP', 10)}${pad('裝備防禦', 10)}${pad('TTK', 8)}`
    + E_PRESSURES.map(p => pad(`P${p} 撐多久`, 14)).join(''));
  for (const c of CLASSES) {
    const char = buildCharacter(c, worst.level);
    const { gear } = buildShopLoadout(c, 1);
    const cells = E_PRESSURES.map(p => {
      const r = measureSurvival(c, 1, worst, p);
      return pad(r.deaths === 0 ? '不死' : `${(r.firstDeathMs! / 1000).toFixed(0)}s`, 14);
    });
    console.log(`   ${pad(CLASS_ZH[c], 10)}${pad(String(effectiveMaxHp(char, gear)), 10)}`
      + `${pad(String(getTotalDefense(gear)), 10)}${pad(`${TTK_EARLY[1][worst.band][c]}s`, 8)}${cells.join('')}`);
  }

  // 換上 T2 之後的同一張圖
  console.log(`\n### 對照：同一張圖換上商店中階裝（T2）`);
  console.log(`   ${pad('地圖', 14)}${pad('有效HP', 10)}${pad('裝備防禦', 10)}`
    + E_PRESSURES.map(p => pad(`P${p} 撐多久`, 14)).join(''));
  for (const entry of EARLY_MAPS.slice(2)) {
    const char = buildCharacter('knight', entry.level);
    const { gear } = buildShopLoadout('knight', 2);
    const cells = E_PRESSURES.map(p => {
      const r = measureSurvival('knight', 2, entry, p);
      return pad(r.deaths === 0 ? '不死' : `${(r.firstDeathMs! / 1000).toFixed(0)}s`, 14);
    });
    console.log(`   ${pad(entry.label, 14)}${pad(String(effectiveMaxHp(char, gear)), 10)}`
      + `${pad(String(getTotalDefense(gear)), 10)}${cells.join('')}`);
  }

  console.log('\n   Pressure 門檻換算（`26-spawn-pressure.md` § 26.3：P = floor((擊殺數-480)/160)）：');
  console.log(`   ${pad('地圖', 14)}${pad('撐不住的 Pressure', 20)}${pad('對應累積擊殺', 16)}${pad('TTK 下的最短耗時', 20)}`);
  for (const entry of EARLY_MAPS) {
    const p = dangerAt.get(entry.map) ?? null;
    if (p == null) {
      console.log(`   ${pad(entry.label, 14)}${pad('全程不死', 20)}${pad('—', 16)}${pad('—', 20)}`);
      continue;
    }
    const kills = 480 + p * 160;
    const stats = simulate({
      mapId: entry.map,
      ttkSec: TTK_EARLY[1][entry.band].knight,
      seed: 33_000 + entry.level,
      maxKills: kills,
      maxMs: 12 * 3600 * 1000,
    });
    console.log(`   ${pad(entry.label, 14)}${pad(`P${p}`, 20)}${pad(String(kills), 16)}`
      + `${pad(hhmm(stats.elapsedMs), 20)}`);
  }

  return dangerAt;
}

function sectionE2(dangerAt: Map<string, number | null>): void {
  console.log(`\n${'='.repeat(112)}`);
  console.log('## E2. 前期換階的金幣門檻');
  console.log('   金幣已排除 Pressure 倍率（工作區版 `drops.ts` 的 getGoldRateMultiplier）');
  console.log(`   全域金幣倍率 GOLD_RATE_MULTIPLIER = ${GOLD_RATE_MULTIPLIER}`);
  console.log('='.repeat(112));

  console.log('\n   商店整套售價（主手＋副手＋八件防具，各槽取該 tier 防禦/傷害最佳者的 buyPrice）：');
  console.log(`   ${pad('職業', 10)}${pad('T1 起始裝', 14)}${pad('T2 商店中階', 16)}${pad('T3 商店高階', 16)}`);
  const setPrice: Record<number, number[]> = { 1: [], 2: [], 3: [] };
  for (const c of CLASSES) {
    const p1 = buildShopLoadout(c, 1).price;
    const p2 = buildShopLoadout(c, 2).price;
    const p3 = buildShopLoadout(c, 3).price;
    setPrice[1].push(p1); setPrice[2].push(p2); setPrice[3].push(p3);
    console.log(`   ${pad(CLASS_ZH[c], 10)}${pad(p1.toLocaleString(), 14)}`
      + `${pad(p2.toLocaleString(), 16)}${pad(p3.toLocaleString(), 16)}`);
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const t2Price = avg(setPrice[2]);
  const t3Price = avg(setPrice[3]);
  console.log(`   ${pad('平均', 10)}${pad(avg(setPrice[1]).toLocaleString(), 14)}`
    + `${pad(t2Price.toLocaleString(), 16)}${pad(t3Price.toLocaleString(), 16)}`);

  console.log('\n   前期各圖的每殺收益（金幣 100% 掉落；素材依 dropValue × sellPrice 計期望值）：');
  console.log(`   ${pad('地圖', 14)}${pad('金幣/殺', 12)}${pad('素材/殺', 12)}${pad('合計/殺', 12)}${pad('擊殺/分', 12)}${pad('收益/小時', 14)}`);
  const income = new Map<string, { perKill: number; kpm: number }>();
  for (const entry of EARLY_MAPS) {
    const g = DROP_TABLE_SEEDS.find(e => e.area === entry.map && e.itemType === 'gold');
    const goldPerKill = g ? (((g.minAmount ?? 1) + (g.maxAmount ?? 1)) / 2) * GOLD_RATE_MULTIPLIER : 0;
    let matPerKill = 0;
    for (const e of DROP_TABLE_SEEDS) {
      if (e.area !== entry.map || e.itemType !== 'item' || e.itemTemplateId == null) continue;
      const item = getItemById(e.itemTemplateId);
      if (item?.category !== 'material') continue;
      matPerKill += (e.dropValue / 1000) * (item.sellPrice ?? 0);
    }
    const stats = simulate({
      mapId: entry.map,
      ttkSec: TTK_EARLY[1][entry.band].knight,
      seed: 35_000 + entry.level,
      maxMs: 60 * 60 * 1000,
    });
    const kpm = stats.kills / (stats.elapsedMs / 60000);
    income.set(entry.map, { perKill: goldPerKill + matPerKill, kpm });
    console.log(`   ${pad(entry.label, 14)}${pad(goldPerKill.toFixed(1), 12)}${pad(matPerKill.toFixed(1), 12)}`
      + `${pad((goldPerKill + matPerKill).toFixed(1), 12)}${pad(kpm.toFixed(2), 12)}`
      + `${pad(Math.round((goldPerKill + matPerKill) * kpm * 60).toLocaleString(), 14)}`);
  }

  console.log(`\n   湊齊 T2 整套（${t2Price.toLocaleString()} 金）所需的擊殺數與時間，對比「撐不住」門檻：`);
  console.log(`   ${pad('地圖', 14)}${pad('換階擊殺數', 14)}${pad('換階耗時', 12)}`
    + `${pad('危險擊殺數', 14)}${pad('哪個先到', 14)}${pad('安全邊際', 12)}`);
  for (const entry of EARLY_MAPS) {
    const inc = income.get(entry.map)!;
    const killsNeeded = Math.ceil(t2Price / inc.perKill);
    const hours = killsNeeded / inc.kpm / 60;
    const p = dangerAt.get(entry.map) ?? null;
    const dangerKills = p == null ? null : 480 + p * 160;
    const verdict = dangerKills == null
      ? '不會被壓死'
      : killsNeeded <= dangerKills ? '先湊到錢' : '先被壓死';
    const margin = dangerKills == null ? '—' : `×${(dangerKills / killsNeeded).toFixed(2)}`;
    console.log(`   ${pad(entry.label, 14)}${pad(killsNeeded.toLocaleString(), 14)}`
      + `${pad(hhmm(hours * 3600000), 12)}${pad(dangerKills?.toLocaleString() ?? '—', 14)}`
      + `${pad(verdict, 14)}${pad(margin, 12)}`);
  }

  console.log('\n   註：換階擊殺數是「只靠該圖收益、從 0 金起算」的上界估計，未計任務獎勵與撿到的裝備變現；');
  console.log('       危險擊殺數是同一張圖不切圖、不死的連續累積值，死一次即歸零重算。');

  // 正常升級動線（不定點farm）下的累積金幣與各圖的 areaKills 峰值
  console.log('\n   對照：照 B 段的正常升級動線走（Lv1→20，升級即換圖）');
  const expOf = buildExpTable('new');
  const goldPerKillOf = (mapId: string): number => {
    const g = DROP_TABLE_SEEDS.find(e => e.area === mapId && e.itemType === 'gold');
    const gold = g ? (((g.minAmount ?? 1) + (g.maxAmount ?? 1)) / 2) * GOLD_RATE_MULTIPLIER : 0;
    let mat = 0;
    for (const e of DROP_TABLE_SEEDS) {
      if (e.area !== mapId || e.itemType !== 'item' || e.itemTemplateId == null) continue;
      const item = getItemById(e.itemTemplateId);
      if (item?.category !== 'material') continue;
      mat += (e.dropValue / 1000) * (item.sellPrice ?? 0);
    }
    return gold + mat;
  };

  let level = 1;
  let exp = 0;
  let currentMap = mapForLevel(1);
  let gold = 0;
  let areaKillsHere = 0;
  const perMap = new Map<string, { kills: number; gold: number; peakAreaKills: number }>();
  const bump = (m: string, g: number, ak: number) => {
    const rec = perMap.get(m) ?? { kills: 0, gold: 0, peakAreaKills: 0 };
    rec.kills++; rec.gold += g; rec.peakAreaKills = Math.max(rec.peakAreaKills, ak);
    perMap.set(m, rec);
  };
  let affordAtLevel: number | null = null;

  simulate({
    mapId: currentMap,
    ttkSec: () => {
      const band = EARLY_MAPS.find(e => e.map === currentMap)?.band;
      return band ? TTK_EARLY[1][band].knight : ttkAtLevel(level);
    },
    seed: 424242,
    maxMs: 24 * 3600 * 1000,
    nextMap: () => currentMap,
    onKill: () => {
      areaKillsHere++;
      const g = goldPerKillOf(currentMap);
      gold += g;
      bump(currentMap, g, areaKillsHere);
      if (affordAtLevel == null && gold >= t2Price) affordAtLevel = level;
      exp += expOf(level) * EXP_SETTLE_MULTIPLIER;
      let leveled = false;
      while (exp >= getExpToNextLevel(level) && level < 20) {
        exp -= getExpToNextLevel(level);
        level++;
        leveled = true;
      }
      if (level >= 20) return 'stop';
      if (leveled) {
        const next = mapForLevel(level);
        if (next !== currentMap) { currentMap = next; areaKillsHere = 0; return 'switch-map'; }
      }
      return 'continue';
    },
  });

  console.log(`   ${pad('地圖', 14)}${pad('該圖擊殺', 12)}${pad('該圖金幣', 14)}`
    + `${pad('areaKills 峰值', 16)}${pad('峰值 Pressure', 14)}`);
  let cum = 0;
  for (const entry of EARLY_MAPS) {
    const rec = perMap.get(entry.map);
    if (!rec) continue;
    cum += rec.gold;
    console.log(`   ${pad(entry.label, 14)}${pad(String(rec.kills), 12)}${pad(Math.round(rec.gold).toLocaleString(), 14)}`
      + `${pad(String(rec.peakAreaKills), 16)}${pad(`P${calculatePressure(rec.peakAreaKills).pressure}`, 14)}`);
  }
  console.log(`   ${pad('合計', 14)}${pad(String([...perMap.values()].reduce((a, r) => a + r.kills, 0)), 12)}`
    + `${pad(Math.round(cum).toLocaleString(), 14)}`);
  console.log(`   Lv1→20 累積金幣 ${Math.round(cum).toLocaleString()} vs T2 整套 ${t2Price.toLocaleString()}`
    + `　→ ${cum >= t2Price ? `Lv.${affordAtLevel} 就買得起` : `差 ${Math.round(t2Price - cum).toLocaleString()}（只有 ${((cum / t2Price) * 100).toFixed(0)}%）`}`);
}

// ---------------------------------------------------------------- F. 任務收入與換階門檻

/**
 * F 段模擬 Lv1→20 的冒險者工會任務，全部走真實函式：
 * `generateSingleQuest` / `acceptQuest` / `updateQuestProgress` /
 * `updateCollectQuestProgress` / `rollCollectMaterialDrop` / `completeQuest` / `abandonQuest`，
 * 等階由 `getRankForPoints` 依累積貢獻推進，獎勵權重直接吃 `REWARD_WEIGHTS[rank]`。
 *
 * 玩家行為的建模（實作沒有這一層，是本腳本的假設，已在報告中標明）：
 *  - 只逛薄暮村的 D／C 兩個分頁（B/A 分頁的目標區域都在 Lv26+，前期接了做不到）
 *  - 只接「目標在當前所在地圖」做得到的任務；一個分頁 5~8 個offer 都不合用就空著欄位
 *  - 回城交任務時順手補欄位，等同於欄位刷新（§ 36.6.3）
 *  - 升級換圖時，目標停留在舊地圖的任務視為做不到 → 退出（依 § 36.6.4 扣等量貢獻）
 */
const QUEST_TOWN = 'neutral-town' as const;
const QUEST_TABS = ['D', 'C'] as const;

/** 道具換現金：走真實的 `shop.getItemSellPrice`（basePrice × 0.5） */
function itemCash(itemId: number, amount: number): number {
  return getItemSellPrice(itemId) * amount;
}

/** 道具的替代購買價值：省下的雜貨店買價，沒有買價就退回 sellPrice */
function itemSubstitutionValue(itemId: number, amount: number): number {
  const def = getItemById(itemId);
  return ((def?.buyPrice ?? def?.sellPrice ?? 0)) * amount;
}

interface QuestRunResult {
  completed: number;
  abandoned: number;
  emptySlotKills: number;
  byType: Map<string, number>;
  byReward: Map<string, { count: number; cash: number; sub: number }>;
  cash: number;
  sub: number;
  finalRank: string;
  finalPoints: number;
  /** 每一隻擊殺後的累積現金（掉落 + 任務） */
  cumulativeCash: number[];
  dropCash: number;
  perMapKills: Map<string, number>;
}

function runEarlyGameWithQuests(withQuests: boolean, seed: number): QuestRunResult {
  const expOf = buildExpTable('new');
  const monstersOf = (mapId: string) => MONSTER_SEEDS.filter(m => !m.isBoss && m.area === mapId);

  /** 掉落現金：金幣中值 + 素材期望值（素材走真實回收價 = sellPrice × 0.5） */
  const dropCashPerKill = (mapId: string): number => {
    const g = DROP_TABLE_SEEDS.find(e => e.area === mapId && e.itemType === 'gold');
    let cash = g ? (((g.minAmount ?? 1) + (g.maxAmount ?? 1)) / 2) * GOLD_RATE_MULTIPLIER : 0;
    for (const e of DROP_TABLE_SEEDS) {
      if (e.area !== mapId || e.itemType !== 'item' || e.itemTemplateId == null) continue;
      const item = getItemById(e.itemTemplateId);
      if (item?.category !== 'material') continue;
      cash += (e.dropValue / 1000) * getItemSellPrice(e.itemTemplateId);
    }
    return cash;
  };

  const res: QuestRunResult = {
    completed: 0, abandoned: 0, emptySlotKills: 0,
    byType: new Map(), byReward: new Map(),
    cash: 0, sub: 0, finalRank: 'F', finalPoints: 0,
    cumulativeCash: [], dropCash: 0, perMapKills: new Map(),
  };

  let level = 1;
  let exp = 0;
  let currentMap = mapForLevel(1);
  let guild: GuildProgress = { rank: 'F', points: 0 };
  let active: AdventurerQuest[] = [];
  let cash = 0;

  const doable = (q: AdventurerQuest, mapId: string): boolean => {
    if (q.type === 'errand' || q.type === 'endurance') return q.targetArea === mapId;
    if (q.type === 'collect') return monstersOf(mapId).some(m => m.name === q.targetMonster);
    return false;
  };

  /** 回城補欄位：D／C 兩個分頁各生一份 offer，挑做得到的接滿 3 個 */
  const refillSlots = (mapId: string) => {
    for (const tab of QUEST_TABS) {
      for (let i = 0; i < 8 && active.length < MAX_ACTIVE_ADVENTURER_QUESTS; i++) {
        const offer = generateSingleQuest(tab, guild.rank, i, QUEST_TOWN);
        if (!doable(offer, mapId)) continue;
        const next = acceptQuest(active, offer);
        if (next) active = next;
      }
    }
  };

  const collectReward = (reward: QuestReward | null) => {
    if (!reward) return;
    const c = reward.type === 'gold' ? reward.amount : itemCash(reward.itemId!, reward.amount);
    const s = reward.type === 'gold' ? reward.amount : itemSubstitutionValue(reward.itemId!, reward.amount);
    cash += c;
    res.cash += c;
    res.sub += s;
    const rec = res.byReward.get(reward.type) ?? { count: 0, cash: 0, sub: 0 };
    rec.count++; rec.cash += c; rec.sub += s;
    res.byReward.set(reward.type, rec);
  };

  const nativeRandom = Math.random;
  Math.random = mulberry32(seed);
  if (withQuests) refillSlots(currentMap);
  Math.random = nativeRandom;

  simulate({
    mapId: currentMap,
    ttkSec: () => {
      const band = EARLY_MAPS.find(e => e.map === currentMap)?.band;
      return band ? TTK_EARLY[1][band].knight : ttkAtLevel(level);
    },
    seed,
    maxMs: 24 * 3600 * 1000,
    nextMap: () => currentMap,
    onKill: () => {
      res.perMapKills.set(currentMap, (res.perMapKills.get(currentMap) ?? 0) + 1);
      const d = dropCashPerKill(currentMap);
      cash += d;
      res.dropCash += d;

      if (withQuests) {
        const pool = monstersOf(currentMap);
        const monsterName = pool[Math.floor(Math.random() * pool.length)]?.name ?? '';
        active = updateAdvQuestProgress(active, currentMap, monsterName, 1);
        if (rollAdvCollectDrop(active, monsterName)) {
          active = updateAdvCollectProgress(active, monsterName, 1);
        }
        for (const q of active.filter(x => x.status === 'completable')) {
          const out = completeAdvQuest(active, q.id, guild);
          active = out.activeQuests;
          guild = out.guildProgress;
          res.completed++;
          res.byType.set(q.type, (res.byType.get(q.type) ?? 0) + 1);
          collectReward(out.reward);
        }
        if (active.length < MAX_ACTIVE_ADVENTURER_QUESTS) {
          refillSlots(currentMap);
          if (active.length < MAX_ACTIVE_ADVENTURER_QUESTS) res.emptySlotKills++;
        }
      }

      res.cumulativeCash.push(cash);

      exp += expOf(level) * EXP_SETTLE_MULTIPLIER;
      let leveled = false;
      while (exp >= getExpToNextLevel(level) && level < 20) {
        exp -= getExpToNextLevel(level);
        level++;
        leveled = true;
      }
      if (level >= 20) return 'stop';
      if (leveled) {
        const next = mapForLevel(level);
        if (next !== currentMap) {
          currentMap = next;
          if (withQuests) {
            // 換圖後做不到的任務退出（§ 36.6.4 扣等量貢獻）
            for (const q of [...active]) {
              if (doable(q, currentMap)) continue;
              const out = abandonAdvQuest(active, q.id, guild);
              active = out.activeQuests;
              guild = out.guildProgress;
              res.abandoned++;
            }
            refillSlots(currentMap);
          }
          return 'switch-map';
        }
      }
      return 'continue';
    },
  });

  res.finalRank = guild.rank;
  res.finalPoints = guild.points;
  return res;
}

/** T2 分段採購門檻：主手 / 主手+胸甲 / 主手+胸甲+頭盔+鞋子 */
function t2Milestones(className: ClassName): { label: string; price: number }[] {
  const priceOf = (slot: EquipSlot, key: (t: EquipmentTemplate) => number) => {
    const cands = EQUIPMENT_SEEDS.filter(t => t.slot === slot && t.tier === 2 && canUse(t, className));
    if (cands.length === 0) return 0;
    return cands.sort((a, b) => key(b) - key(a))[0].buyPrice ?? 0;
  };
  const dmg = (t: EquipmentTemplate) => ((t.smallMonsterDamage ?? 0) + (t.largeMonsterDamage ?? 0)) / 2 + (t.extraAttack ?? 0);
  const def = (t: EquipmentTemplate) => (t.defense ?? 0) + (t.bonusHp ?? 0) / 10;
  const weapon = priceOf('rightHand', dmg);
  const chest = priceOf('chest', def);
  const helmet = priceOf('helmet', def);
  const boots = priceOf('boots', def);
  return [
    { label: '只換主手武器', price: weapon },
    { label: '武器＋胸甲', price: weapon + chest },
    { label: '武器＋胸甲＋頭盔＋鞋子', price: weapon + chest + helmet + boots },
    { label: 'T2 整套（十件）', price: buildShopLoadout(className, 2).price },
  ];
}

function sectionF(): void {
  console.log(`\n${'='.repeat(112)}`);
  console.log('## F. 冒險者工會任務收入與 T2 換裝門檻（Lv1→20）');
  console.log('   任務生成／接取／進度／交付／退出全部走 `adventurerQuestSystem.ts` 真實函式');
  console.log('   等階由累積貢獻推進，獎勵權重吃 REWARD_WEIGHTS[rank]；分頁只逛薄暮村 D／C');
  console.log('   道具換現金走 `shop.getItemSellPrice`（basePrice × 0.5）；替代購買價值另計');
  console.log('='.repeat(112));

  const F_SEED = Number(argOf('f-seed') ?? 515151);
  const withQ = runEarlyGameWithQuests(true, F_SEED);
  const noQ = runEarlyGameWithQuests(false, F_SEED);

  const totalKills = [...withQ.perMapKills.values()].reduce((a, b) => a + b, 0);
  console.log(`\n### F1. 正常動線上實際完成的任務（合計 ${totalKills} 隻擊殺）`);
  console.log(`   完成任務 ${withQ.completed} 個　因換圖退出 ${withQ.abandoned} 個　`
    + `欄位補不滿的擊殺數 ${withQ.emptySlotKills}／${totalKills}`);
  console.log(`   最終等階 ${withQ.finalRank}（累積貢獻 ${withQ.finalPoints}）`);

  console.log(`\n   ${pad('任務類型', 14)}${pad('完成數', 10)}`);
  const typeZh: Record<string, string> = { errand: '殲滅', collect: '素材收集', endurance: '持續戰鬥' };
  for (const [type, n] of [...withQ.byType].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${pad(typeZh[type] ?? type, 14)}${pad(String(n), 10)}`);
  }

  console.log(`\n   ${pad('獎勵類型', 16)}${pad('次數', 8)}${pad('佔比', 10)}${pad('現金價值', 12)}${pad('替代購買價值', 14)}`);
  const rewardZh: Record<string, string> = {
    gold: '金幣', potion: '藥水', 'quality-stone': '工藝印記', 'enhancement-stone': '精鍊印記',
    'weapon-scroll': '武器強化卷軸', 'armor-scroll': '防具強化卷軸', 'crafting-material': '製作素材',
  };
  for (const [type, rec] of [...withQ.byReward].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`   ${pad(rewardZh[type] ?? type, 16)}${pad(String(rec.count), 8)}`
      + `${pad(`${((rec.count / withQ.completed) * 100).toFixed(0)}%`, 10)}`
      + `${pad(Math.round(rec.cash).toLocaleString(), 12)}${pad(Math.round(rec.sub).toLocaleString(), 14)}`);
  }
  console.log(`   ${pad('合計', 16)}${pad(String(withQ.completed), 8)}${pad('100%', 10)}`
    + `${pad(Math.round(withQ.cash).toLocaleString(), 12)}${pad(Math.round(withQ.sub).toLocaleString(), 14)}`);

  const t2Price = buildShopLoadout('knight', 2).price;
  console.log(`\n### F2. 加上任務後，換 T2 夠不夠`);
  console.log(`   ${pad('來源', 26)}${pad('現金', 14)}${pad('（含替代購買價值）', 20)}`);
  console.log(`   ${pad('掉落收入（金幣＋素材回收）', 26)}${pad(Math.round(noQ.dropCash).toLocaleString(), 14)}${pad('—', 20)}`);
  console.log(`   ${pad('任務收入', 26)}${pad(Math.round(withQ.cash).toLocaleString(), 14)}${pad(Math.round(withQ.sub).toLocaleString(), 20)}`);
  console.log(`   ${pad('合計', 26)}${pad(Math.round(withQ.dropCash + withQ.cash).toLocaleString(), 14)}`
    + `${pad(Math.round(withQ.dropCash + withQ.sub).toLocaleString(), 20)}`);
  console.log(`   ${pad('T2 整套（騎士）', 26)}${pad(t2Price.toLocaleString(), 14)}`);
  const total = withQ.dropCash + withQ.cash;
  console.log(`   → ${total >= t2Price ? `夠，多 ${Math.round(total - t2Price).toLocaleString()}` : `不夠，差 ${Math.round(t2Price - total).toLocaleString()}（只有 ${((total / t2Price) * 100).toFixed(0)}%）`}`);

  console.log(`\n   分段採購門檻（騎士 T2，各槽取該 tier 最佳者的 buyPrice）：`);
  console.log(`   ${pad('採購階段', 26)}${pad('金額', 12)}${pad('有任務：第幾隻', 16)}${pad('無任務：第幾隻', 16)}${pad('差額', 12)}`);
  const firstKillAt = (cum: number[], price: number): string => {
    const idx = cum.findIndex(v => v >= price);
    return idx < 0 ? `未達（止於 ${Math.round(cum[cum.length - 1]).toLocaleString()}）` : `第 ${idx + 1} 隻`;
  };
  for (const ms of t2Milestones('knight')) {
    const withIdx = firstKillAt(withQ.cumulativeCash, ms.price);
    const noIdx = firstKillAt(noQ.cumulativeCash, ms.price);
    const gap = noQ.cumulativeCash[noQ.cumulativeCash.length - 1] - ms.price;
    console.log(`   ${pad(ms.label, 26)}${pad(ms.price.toLocaleString(), 12)}${pad(withIdx, 16)}${pad(noIdx, 16)}`
      + `${pad(gap >= 0 ? '—' : `差 ${Math.round(-gap).toLocaleString()}`, 12)}`);
  }

  console.log(`\n### F3. 完全不做任務的缺口`);
  console.log(`   純掉落現金 ${Math.round(noQ.dropCash).toLocaleString()}　vs　T2 整套 ${t2Price.toLocaleString()}`
    + `　→ ${noQ.dropCash >= t2Price ? '足夠' : `差 ${Math.round(t2Price - noQ.dropCash).toLocaleString()}（只有 ${((noQ.dropCash / t2Price) * 100).toFixed(0)}%）`}`);
  console.log(`   任務收入佔前期總現金的 ${((withQ.cash / total) * 100).toFixed(0)}%；`
    + `平均每個任務 ${Math.round(withQ.cash / Math.max(1, withQ.completed)).toLocaleString()} 現金`);
  const needQuests = Math.max(0, Math.ceil((t2Price - noQ.dropCash) / (withQ.cash / Math.max(1, withQ.completed))));
  console.log(`   要靠任務補平整套缺口需完成約 ${needQuests} 個任務（實際只完成得了 ${withQ.completed} 個）`);
}

// ---------------------------------------------------------------- 主流程

/** 新舊經驗表的對照表：只換 monsterSeeds 的 exp 欄，其餘變數完全相同 */
function compareCurves(oldRows: LevelRow[], newRows: LevelRow[]): void {
  const sum = (rows: LevelRow[], lo: number, hi: number) => {
    const sub = rows.filter(r => r.level >= lo && r.level < hi);
    return {
      kills: sub.reduce((a, r) => a + r.kills, 0),
      ms: sub.reduce((a, r) => a + r.ms, 0),
    };
  };
  const oldTotal = sum(oldRows, 1, 60);
  const newTotal = sum(newRows, 1, 60);
  const segments: [string, number, number][] = [
    ['Lv1→20', 1, 20],
    ['Lv20→40', 20, 40],
    ['Lv40→50', 40, 50],
    ['Lv50→60', 50, 60],
  ];

  console.log(`\n${'='.repeat(112)}`);
  console.log(`## B-對照．舊表（${OLD_REF}）vs 新表（工作區），同一模擬器、同一組 TTK、同一批地圖、同一亂數種子`);
  console.log('='.repeat(112));
  console.log(`\n   ${pad('分段', 12)}${pad('舊表擊殺', 12)}${pad('舊表時數', 12)}${pad('舊表佔比', 12)}`
    + `${pad('新表擊殺', 12)}${pad('新表時數', 12)}${pad('新表佔比', 12)}${pad('時數變化', 14)}`);
  for (const [label, lo, hi] of segments) {
    const o = sum(oldRows, lo, hi);
    const n = sum(newRows, lo, hi);
    console.log(
      `   ${pad(label, 12)}${pad(String(o.kills), 12)}${pad(hhmm(o.ms), 12)}${pad(`${((o.ms / oldTotal.ms) * 100).toFixed(1)}%`, 12)}`
      + `${pad(String(n.kills), 12)}${pad(hhmm(n.ms), 12)}${pad(`${((n.ms / newTotal.ms) * 100).toFixed(1)}%`, 12)}`
      + `${pad(`×${(n.ms / o.ms).toFixed(2)}`, 14)}`,
    );
  }
  console.log(
    `   ${pad('合計', 12)}${pad(String(oldTotal.kills), 12)}${pad(hhmm(oldTotal.ms), 12)}${pad('100%', 12)}`
    + `${pad(String(newTotal.kills), 12)}${pad(hhmm(newTotal.ms), 12)}${pad('100%', 12)}`
    + `${pad(`×${(newTotal.ms / oldTotal.ms).toFixed(2)}`, 14)}`,
  );

  const share = (rows: LevelRow[], lo: number, hi: number, total: number) => (sum(rows, lo, hi).ms / total) * 100;
  const oEarly = share(oldRows, 1, 20, oldTotal.ms);
  const nEarly = share(newRows, 1, 20, newTotal.ms);
  const oLate = share(oldRows, 50, 60, oldTotal.ms);
  const nLate = share(newRows, 50, 60, newTotal.ms);
  console.log(`\n   1. 前期（Lv1→20）：${hhmm(sum(oldRows, 1, 20).ms)} → ${hhmm(sum(newRows, 1, 20).ms)}`
    + `　佔比 ${oEarly.toFixed(1)}% → ${nEarly.toFixed(1)}%（${(nEarly - oEarly >= 0 ? '+' : '')}${(nEarly - oEarly).toFixed(1)}pp）`
    + `　${nEarly > oEarly ? '被墊高' : '未被墊高'}`);
  console.log(`   2. 後期（Lv50→60）：${hhmm(sum(oldRows, 50, 60).ms)} → ${hhmm(sum(newRows, 50, 60).ms)}`
    + `　佔比 ${oLate.toFixed(1)}% → ${nLate.toFixed(1)}%（${(nLate - oLate >= 0 ? '+' : '')}${(nLate - oLate).toFixed(1)}pp）`
    + `　${nLate < oLate ? '被壓平' : '未被壓平'}`);
  console.log(`   3. 總時數：${hhmm(oldTotal.ms)} → ${hhmm(newTotal.ms)}　×${(newTotal.ms / oldTotal.ms).toFixed(2)}`);
}

if (SECTION.includes('A')) sectionA();
let bRows: LevelRow[] = [];
if (SECTION.includes('B')) {
  if (CURVE === 'both') {
    const oldRows = sectionB('old');
    const newRows = sectionB('new');
    compareCurves(oldRows, newRows);
    bRows = newRows;
  } else {
    bRows = sectionB(CURVE);
  }
}
if (SECTION.includes('C')) sectionC();
if (SECTION.includes('D')) sectionD();
if (SECTION.includes('E')) sectionE2(sectionE1());
if (SECTION.includes('F')) sectionF();

if (bRows.length > 0) {
  const totalMs = bRows.reduce((a, r) => a + r.ms, 0);
  console.log(`\n   D 段換算：全程處於加倍狀態時，Lv1→60 由 ${hhmm(totalMs)} 降為 ${hhmm(totalMs / 2)}（B 的一半為理論下限）`);
}
