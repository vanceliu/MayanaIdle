/**
 * 獨特魔物生成（`26-spawn-pressure.md` § 26.4.1）。
 *
 * - `random`：佔 Boss 名額，由 `mapMonsterStore.spawnTick` 判定；區域旗標由 `hasRandomUniqueInPool` 決定
 * - `every10min`／`halfHourGroup`：server 每 tick 以 wall clock 的前後兩個時刻呼叫 `tickTimedUniqueSpawns`
 */
import type { MonsterTemplate, UniqueSpawnMode } from '../models/monster';
import { crossedGameSlot } from '../models/gameClock';
import { random } from '../core/rng';
import { getTimedUniqueSpawnChance } from './globalRates';
import { presentMembers, type MapInstance } from './mapInstance';

export type TimedUniqueSpawnMode = Exclude<UniqueSpawnMode, 'random'>;

/** 判定時刻：遊戲時間（UTC+8）分鐘數整除此值、秒為 0 */
export const TIMED_UNIQUE_SLOT_MINUTES: Readonly<Record<TimedUniqueSpawnMode, number>> = {
  every10min: 10,
  halfHourGroup: 30,
};

const TIMED_MODES: readonly TimedUniqueSpawnMode[] = ['every10min', 'halfHourGroup'];

/** 區域模板含 `random` 獨特魔物 */
export function hasRandomUnique(templates: readonly MonsterTemplate[]): boolean {
  return templates.some(t => t.isUnique && (t.spawnMode ?? 'random') === 'random');
}

/** 該地圖（樓層）的定時名單：區域模板中該出現方式的獨特魔物 */
export function timedUniqueRoster(templates: readonly MonsterTemplate[], mode: TimedUniqueSpawnMode): MonsterTemplate[] {
  return templates.filter(t => t.isUnique && t.spawnMode === mode);
}

/** `(prevMs, nowMs]` 之間經過判定時刻的出現方式 */
export function dueTimedUniqueModes(prevMs: number, nowMs: number): TimedUniqueSpawnMode[] {
  return TIMED_MODES.filter(mode => crossedGameSlot(prevMs, nowMs, TIMED_UNIQUE_SLOT_MINUTES[mode]));
}

/**
 * 一個隊伍實例的一次判定：機率 `getTimedUniqueSpawnChance`；
 * 命中時 `every10min` 從名單均等抽 1 隻，`halfHourGroup` 名單全部。回傳要生成的模板 id
 */
export function rollTimedUniqueSpawn(
  roster: readonly MonsterTemplate[],
  mode: TimedUniqueSpawnMode,
  globalRate?: number,
): number[] {
  if (roster.length === 0) return [];
  if (!(random() < getTimedUniqueSpawnChance(globalRate))) return [];
  if (mode === 'every10min') return [roster[Math.floor(random() * roster.length)].id!];
  return roster.map(t => t.id!);
}

/**
 * 定時出現的判定：`(prevMs, nowMs]` 經過判定時刻時，名單非空且有 ≥ 1 位成員在場的每個實例各擲一次。
 * 單一實例出錯交給 `onFault`，其他實例照常
 */
export function tickTimedUniqueSpawns(
  instances: Iterable<MapInstance>,
  prevMs: number,
  nowMs: number,
  onFault: (instance: MapInstance, error: unknown) => void = (_i, error) => { throw error; },
): void {
  const modes = dueTimedUniqueModes(prevMs, nowMs);
  if (modes.length === 0) return;
  for (const instance of instances) {
    try {
      spawnForInstance(instance, modes);
    } catch (error) {
      onFault(instance, error);
    }
  }
}

function spawnForInstance(instance: MapInstance, modes: readonly TimedUniqueSpawnMode[]): void {
  if (instance.arena) return;
  const members = presentMembers(instance);
  if (members.length === 0) return;
  const map = members[0].mapControl.getState().currentMap;
  if (!map) return;
  const anchors = members.map(m => m.mapControl.getState().playerPosition);
  for (const mode of modes) {
    const ids = rollTimedUniqueSpawn(timedUniqueRoster(instance.areaTemplates, mode), mode);
    if (ids.length > 0) instance.mapMonster.getState().spawnTimedUniques(map, ids, anchors);
  }
}
